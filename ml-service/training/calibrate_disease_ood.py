"""Offline calibration only. Does not update classifier weights or use test features."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader
from torchvision import models, transforms

from app.services.disease_ood import (
    FEATURE_LAYER, GUARD_VERSION, METRIC, centroid_distances,
    extract_embedding, file_sha256, normalize_embeddings,
)
from training.train_disease_model import ManifestImageDataset, load_and_validate_manifest
from training.compare_disease_ood_rules import accepts, calibrate_candidate

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "model_artifacts/disease_model.pt"
METADATA_PATH = ROOT / "model_artifacts/disease_model_metadata.json"
GUARD_PATH = ROOT / "model_artifacts/disease_ood_metadata.npz"


def load_classifier():
    artifact = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    classes = json.loads((ROOT / "model_artifacts/disease_classes.json").read_text(encoding="utf-8"))
    if artifact["architecture"] != "mobilenet_v2" or artifact["classLabels"] != [c["label"] for c in classes["classes"]]:
        raise ValueError("Classifier architecture/class order mismatch.")
    model = models.mobilenet_v2(weights=None, num_classes=len(artifact["classLabels"]))
    model.load_state_dict(artifact["stateDict"], strict=True)
    model.eval()
    p = metadata["preprocessing"]
    if artifact["inputSize"] != p["inputWidth"] or p["inputWidth"] != p["inputHeight"]:
        raise ValueError("Classifier preprocessing mismatch.")
    transform = transforms.Compose([
        transforms.Resize(p["evaluationResize"]), transforms.CenterCrop(p["inputWidth"]),
        transforms.ToTensor(), transforms.Normalize(p["normalizationMean"], p["normalizationStd"]),
    ])
    return model, transform, metadata, artifact["classLabels"]


def collect_features(model, transform, root, records, batch_size=32):
    loader = DataLoader(ManifestImageDataset(root, records, transform), batch_size=batch_size, shuffle=False, num_workers=0)
    features, labels, probabilities = [], [], []
    with torch.inference_mode():
        for images, targets, _ in loader:
            embeddings = extract_embedding(model, images)
            features.append(embeddings.numpy())
            labels.append(targets.numpy())
            probabilities.append(torch.softmax(model.classifier(embeddings), dim=1).numpy())
    return np.concatenate(features), np.concatenate(labels), np.concatenate(probabilities)


def summary(values):
    return {name: float(np.quantile(values, q)) for name, q in [
        ("min", 0), ("median", .5), ("p95", .95), ("p97", .97), ("p99", .99), ("max", 1),
    ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "data/plant_disease")
    parser.add_argument("--output", type=Path, default=GUARD_PATH)
    parser.add_argument("--inspect-only", action="store_true", help="Measure train/validation features without writing the guard.")
    args = parser.parse_args()
    torch.manual_seed(42)
    torch.set_num_threads(4)
    model, transform, model_metadata, labels = load_classifier()
    manifest, splits = load_and_validate_manifest(args.dataset_root)
    if manifest["supportedClasses"] != labels:
        raise ValueError("Dataset and classifier class order mismatch.")
    # Verify bytes, not just manifest claims. No split modifications/augmentation.
    for split in ("train", "validation"):
        for record in splits[split]:
            if file_sha256(args.dataset_root / record["localPath"]).lower() != record["sha256"].lower():
                raise ValueError(f"Changed calibration image: {record['localPath']}")
            if labels[record["classIndex"]] != record["classLabel"]:
                raise ValueError("Invalid calibration class index.")
    print("Extracting 1,500 training embeddings (CPU, no augmentation)...", flush=True)
    train, train_labels, _ = collect_features(model, transform, args.dataset_root, splits["train"])
    normalized_train = normalize_embeddings(train)
    centroids = normalize_embeddings(np.stack([
        normalized_train[train_labels == index].mean(axis=0) for index in range(len(labels))
    ]))
    print("Extracting 300 validation embeddings (no test features used)...", flush=True)
    validation, _, scores = collect_features(model, transform, args.dataset_root, splits["validation"])
    train_distances = centroid_distances(train, centroids)
    distances = centroid_distances(validation, centroids)
    # Predeclared conservative target; select an observed order statistic, inclusive boundary.
    threshold = float(np.quantile(distances, .99, method="higher"))
    validation_rows = [
        {"distance": float(distance), "confidence": float(probabilities.max())}
        for distance, probabilities in zip(distances, scores)
    ]
    # Hardening experiment selected this simple family, not OOD-derived cutoffs.
    # Reproduction still derives both auxiliary cutoffs using validation only.
    rule = calibrate_candidate(validation_rows, threshold, .97, "confidence")
    accepted_count = sum(accepts(row, rule) for row in validation_rows)
    metadata = {
        "guardVersion": GUARD_VERSION, "classifierVersion": model_metadata["modelVersion"],
        "modelSha256": file_sha256(MODEL_PATH), "classLabels": labels,
        "featureLayer": FEATURE_LAYER, "metric": METRIC,
        "normalization": "L2-normalize each embedding; mean by training class; L2-normalize centroids",
        "preprocessing": model_metadata["preprocessing"],
        "threshold": threshold,
        "rule": "distance_or_gated_low_confidence",
        "secondaryDistanceThreshold": rule["secondaryDistanceThreshold"],
        "confidenceThreshold": rule["auxiliaryThreshold"],
        "acceptRule": "distance <= threshold AND (distance <= secondaryDistanceThreshold OR confidence >= confidenceThreshold)",
        "calibratedAt": datetime.now(timezone.utc).isoformat(),
        "manifestSha256": file_sha256(args.dataset_root / "dataset_manifest.json"),
        "seed": 42, "targetValidationRetention": .98, "baseTargetValidationRetention": .99, "quantileMethod": "higher",
        "auxiliaryCalibration": rule,
        "selectionProvenance": "Compared confidence/margin/entropy at validation p90/p95/p97 distance gates. Selected confidence@p97: tied 7/8 OOD, 289/300 test; 294/300 validation. Same small OOD/test sets reused: exploratory, not independent generalization evidence.",
        "trainingImages": len(train), "validationImages": len(validation), "testImagesUsedForCalibration": 0,
        "trainingEmbeddingNorms": summary(np.linalg.norm(train, axis=1)),
        "validationEmbeddingNorms": summary(np.linalg.norm(validation, axis=1)),
        "trainingDistances": summary(train_distances), "validationDistances": summary(distances),
        "baseValidationAccepted": int((distances <= threshold).sum()),
        "validationAccepted": accepted_count,
        "validationAcceptanceRate": accepted_count / len(validation),
        "candidateRetention": [
            {"quantile": q, "threshold": float(np.quantile(distances, q, method="higher")),
             "accepted": int((distances <= np.quantile(distances, q, method="higher")).sum())}
            for q in [.95, .97, .99]
        ],
        "normalizedEuclideanEquivalenceMaxError": float(np.max(np.abs(
            np.linalg.norm(normalize_embeddings(validation)[:, None, :] - centroids[None, :, :], axis=2).min(axis=1)
            - np.sqrt(2 * distances)
        ))),
    }
    print(json.dumps(metadata, indent=2), flush=True)
    if not args.inspect_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(args.output, centroids=centroids, metadata=np.array(json.dumps(metadata)))
        print(f"Saved {args.output} ({args.output.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    main()
