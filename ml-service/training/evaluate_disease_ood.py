"""Evaluate a FROZEN disease guard. Never changes its threshold or classifier."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import sklearn
import torch
from PIL import Image

from app.services.disease_ood import DiseaseOODGuard, centroid_distances, extract_embedding, file_sha256
from training.calibrate_disease_ood import GUARD_PATH, MODEL_PATH, ROOT, collect_features, load_classifier
from training.train_disease_model import load_and_validate_manifest

FETCHERS = "https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/_fetchers.py"
OOD_SOURCES = {
    "coffee.png": ("coffee cup / container", "CC0; Rachel Michetti"),
    "brick.png": ("brick wall texture", "CC0; CC0Textures"),
    "text.png": ("printed document", "Public domain; Wikipedia Corner.png"),
    "rocket.jpg": ("rocket / sky", "Public domain; SpaceX"),
    "chelsea.png": ("cat", "CC0; Stefan van der Walt"),
    "hubble_deep_field.jpg": ("space / stars", "Public domain; NASA"),
}


def image_result(model, transform, guard, image, labels):
    with torch.inference_mode():
        tensor = transform(image.convert("RGB")).unsqueeze(0)
        embedding = extract_embedding(model, tensor)
        # Regression: splitting the feature extractor from the head preserves logits.
        torch.testing.assert_close(model.classifier(embedding), model(tensor), rtol=0, atol=0)
        scores = torch.softmax(model.classifier(embedding), dim=1)[0].numpy()
    distance = float(centroid_distances(embedding.numpy(), guard.centroids)[0])
    accepted = guard.accepts_score(distance, float(scores.max()))
    return {
        "distance": distance, "accepted": accepted,
        "unguardedClass": labels[int(scores.argmax())], "unguardedConfidence": float(scores.max()),
        "guardedStatus": "CLASSIFIED" if accepted else "UNSUPPORTED_IMAGE",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "data/plant_disease")
    parser.add_argument("--ood-dir", type=Path, required=True, help="Temporary evaluation-only folder outside Git containing the six documented licensed samples.")
    parser.add_argument("--output", type=Path, default=ROOT / "model_artifacts/disease_ood_evaluation.json")
    args = parser.parse_args()
    if args.ood_dir.resolve().is_relative_to(ROOT.parent):
        raise ValueError("Keep evaluation-only OOD downloads outside the repository.")
    torch.manual_seed(42)
    torch.set_num_threads(4)
    model, transform, metadata, labels = load_classifier()
    guard_hash = file_sha256(GUARD_PATH)
    guard = DiseaseOODGuard.load(GUARD_PATH, MODEL_PATH, labels, metadata["preprocessing"])
    _, splits = load_and_validate_manifest(args.dataset_root)
    if guard.metadata["manifestSha256"] != file_sha256(args.dataset_root / "dataset_manifest.json"):
        raise ValueError("Evaluation split manifest differs from calibration manifest.")
    for record in splits["test"]:
        if file_sha256(args.dataset_root / record["localPath"]).lower() != record["sha256"].lower():
            raise ValueError(f"Changed test image: {record['localPath']}")
    features, targets, probabilities = collect_features(model, transform, args.dataset_root, splits["test"])
    distances = centroid_distances(features, guard.centroids)
    accepted = np.array([guard.accepts_score(d, float(p.max())) for d, p in zip(distances, probabilities)])
    correct = probabilities.argmax(axis=1) == targets
    examples = [
        {"path": r["localPath"], "actualClass": r["classLabel"], "predictedClass": labels[int(p.argmax())],
         "confidence": float(p.max()), "distance": float(d), "accepted": bool(a)}
        for r, p, d, a in zip(splits["test"], probabilities, distances, accepted)
    ]
    early_blight = min(
        (row for row in examples if row["actualClass"] == row["predictedClass"] == "Tomato___Early_blight"),
        key=lambda row: abs(row["confidence"] - .59),
    )
    demo = {"moderateEarlyBlight": early_blight}
    for name, label in [("healthyTomato", "Tomato___healthy"), ("potato", "Potato___Early_blight"), ("pepper", "Pepper,_bell___Bacterial_spot")]:
        demo[name] = next(row for row in examples if row["actualClass"] == row["predictedClass"] == label)
    ood = []
    # Predefined set: do not discard false accepts or select only rejected samples.
    for name, (category, license_name) in OOD_SOURCES.items():
        path = args.ood_dir / name
        with Image.open(path) as image:
            result = image_result(model, transform, guard, image, labels)
        ood.append({"file": name, "category": category, "license": license_name, "licenseSource": FETCHERS,
                    "source": f"https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/{name}",
                    "sha256": file_sha256(path), **result})
    sample_root = Path(sklearn.__file__).parent / "datasets/images"
    for name, category in [("china.jpg", "building"), ("flower.jpg", "unsupported flower")]:
        path = sample_root / name
        with Image.open(path) as image:
            result = image_result(model, transform, guard, image, labels)
        ood.append({"file": name, "category": category, "license": "CC BY 2.0; see installed sklearn/datasets/images/README.txt",
                    "source": "scikit-learn bundled sample images", "sha256": file_sha256(path), **result})
    synthetic = []
    for name, image in [
        ("solid_black", Image.new("RGB", (256, 256), "black")),
        ("solid_white", Image.new("RGB", (256, 256), "white")),
        ("solid_green", Image.new("RGB", (256, 256), "green")),
        ("noise_seed_42", Image.fromarray(np.random.default_rng(42).integers(0, 256, (256, 256, 3), dtype=np.uint8))),
    ]:
        synthetic.append({"name": name, **image_result(model, transform, guard, image, labels)})
    report = {
        "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        "modelSha256": file_sha256(MODEL_PATH), "guardSha256": guard_hash,
        "thresholdFrozenBeforeEvaluation": guard.threshold,
        "calibration": guard.metadata,
        "knownTest": {
            "total": len(targets), "originalCorrect": int(correct.sum()), "originalAccuracy": float(correct.mean()),
            "accepted": int(accepted.sum()), "acceptanceRate": float(accepted.mean()),
            "acceptedCorrect": int((accepted & correct).sum()),
            "acceptedAccuracy": float(correct[accepted].mean()) if accepted.any() else None,
            "falseRejections": int((~accepted).sum()),
            "rejectedExamples": [row for row in examples if not row["accepted"]],
            "perClass": [{"label": label, "total": int((targets == index).sum()),
                          "accepted": int((accepted & (targets == index)).sum()),
                          "originalCorrect": int((correct & (targets == index)).sum())} for index, label in enumerate(labels)],
        },
        "demoSamples": demo,
        "ood": {"total": len(ood), "rejected": sum(not row["accepted"] for row in ood),
                "incorrectlyAccepted": sum(row["accepted"] for row in ood),
                "rejectionRate": sum(not row["accepted"] for row in ood) / len(ood), "samples": ood},
        "syntheticSupplement": synthetic,
        "limitations": "Small convenience sample, not a representative OOD benchmark. Numeric thresholds are validation-only; rule-family selection reused these test/OOD sets and is exploratory. No universal rejection guarantee.",
    }
    if file_sha256(GUARD_PATH) != guard_hash:
        raise RuntimeError("Guard changed during evaluation.")
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ["knownTest", "demoSamples", "ood", "syntheticSupplement"]}, indent=2))


if __name__ == "__main__":
    main()
