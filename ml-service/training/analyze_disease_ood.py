"""Read-only model/guard diagnostics. No fitting or candidate selection in this step."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import sklearn
import torch
from PIL import Image

from app.services.disease_ood import DiseaseOODGuard, extract_embedding, file_sha256, normalize_embeddings
from training.calibrate_disease_ood import GUARD_PATH, MODEL_PATH, ROOT, collect_features, load_classifier
from training.train_disease_model import load_and_validate_manifest

REPORT_PATH = ROOT / "model_artifacts/disease_ood_hardening.json"


def diagnostics(features, probabilities, labels, guard):
    distances = np.clip(1 - normalize_embeddings(features) @ guard.centroids.T, 0, 2)
    rows = []
    for distance, scores in zip(distances, probabilities):
        order = np.argsort(-scores, kind="stable")
        nearest = int(distance.argmin())
        entropy = float(-np.sum(scores.astype(np.float64) * np.log(np.clip(scores, 1e-15, 1))))
        rows.append({
            "nearestCentroidClass": labels[nearest], "distance": float(distance[nearest]),
            "topClass": labels[int(order[0])], "confidence": float(scores[order[0]]),
            "top2Class": labels[int(order[1])], "top2Confidence": float(scores[order[1]]),
            "margin": float(scores[order[0]] - scores[order[1]]), "entropyNats": entropy,
            "normalizedEntropy": entropy / float(np.log(len(labels))),
            "status": "CLASSIFIED" if guard.accepts_score(float(distance[nearest]), float(scores[order[0]])) else "UNSUPPORTED_IMAGE",
        })
    return rows


def distribution(rows):
    return {
        field: {f"p{int(q * 100)}": float(np.quantile([row[field] for row in rows], q))
                for q in [0, .01, .02, .05, .1, .5, .75, .9, .95, .98, .99, 1]}
        for field in ["distance", "confidence", "margin", "entropyNats"]
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ood-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()
    torch.manual_seed(42)
    torch.set_num_threads(4)
    model, transform, metadata, labels = load_classifier()
    guard = DiseaseOODGuard.load(GUARD_PATH, MODEL_PATH, labels, metadata["preprocessing"])
    before = {"classifier": file_sha256(MODEL_PATH), "guard": file_sha256(GUARD_PATH)}
    root = ROOT / "data/plant_disease"
    _, splits = load_and_validate_manifest(root)
    if file_sha256(root / "dataset_manifest.json") != guard.metadata["manifestSha256"]:
        raise ValueError("Dataset split manifest changed.")
    report = {
        "measuredAt": datetime.now(timezone.utc).isoformat(), "hashes": before,
        "existingThreshold": guard.threshold, "classifierVersion": "disease-v1",
        "guardVersion": guard.metadata["guardVersion"], "guardRule": guard.metadata,
        "entropyDefinition": "-sum(p * ln(p)), nats; normalized entropy divides by ln(15)",
        "stage": "diagnostics_only_no_candidate_selected", "splits": {}, "distributions": {},
    }
    for split in ["validation", "test"]:
        print(f"Measuring {split}: {len(splits[split])} images", flush=True)
        for record in splits[split]:
            if file_sha256(root / record["localPath"]).lower() != record["sha256"].lower():
                raise ValueError("Image bytes changed since original evaluation.")
        features, _, scores = collect_features(model, transform, root, splits[split])
        report["splits"][split] = [
            {"path": record["localPath"], "sha256": record["sha256"].lower(), "actualClass": record["classLabel"], **row}
            for record, row in zip(splits[split], diagnostics(features, scores, labels, guard))
        ]
        report["distributions"][split] = distribution(report["splits"][split])
    original = json.loads((ROOT / "model_artifacts/disease_ood_evaluation.json").read_text(encoding="utf-8"))
    ood_rows = []
    sample_root = Path(sklearn.__file__).parent / "datasets/images"
    for source in original["ood"]["samples"]:
        path = (sample_root if source["file"] in ["china.jpg", "flower.jpg"] else args.ood_dir) / source["file"]
        if file_sha256(path) != source["sha256"]:
            raise ValueError(f"OOD fixture changed: {source['file']}")
        with Image.open(path) as image, torch.inference_mode():
            features = extract_embedding(model, transform(image.convert("RGB")).unsqueeze(0))
            scores = torch.softmax(model.classifier(features), dim=1).numpy()
        row = diagnostics(features.numpy(), scores, labels, guard)[0]
        ood_rows.append({"file": source["file"], "localPath": str(path.resolve()), "sha256": source["sha256"],
                         "source": source["source"], "license": source["license"], **row})
    report["splits"]["ood"] = ood_rows
    report["falseAcceptComparisons"] = [
        {"file": row["file"], **{
            split: {field + "Percentile": float(np.mean([r[field] <= row[field] for r in report["splits"][split]]) * 100)
                    for field in ["distance", "confidence", "margin", "entropyNats"]}
            for split in ["validation", "test"]
        }} for row in ood_rows if row["status"] == "CLASSIFIED"
    ]
    if before != {"classifier": file_sha256(MODEL_PATH), "guard": file_sha256(GUARD_PATH)}:
        raise RuntimeError("Classifier/guard changed during diagnostics.")
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ood": ood_rows, "distributions": report["distributions"], "comparisons": report["falseAcceptComparisons"]}, indent=2))


if __name__ == "__main__":
    main()
