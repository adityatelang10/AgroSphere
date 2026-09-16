"""Two-stage, frozen-parameter kNN experiment; never trains or installs a guard."""

import argparse
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import numpy as np
import sklearn
import torch
from PIL import Image

from app.services.disease_ood import (
    DiseaseOODGuard, FEATURE_LAYER, centroid_distances, extract_embedding,
    file_sha256, normalize_embeddings,
)
from training.calibrate_disease_ood import GUARD_PATH, MODEL_PATH, ROOT, collect_features, load_classifier
from training.evaluate_disease_ood import OOD_SOURCES, FETCHERS

K_VALUES = (1, 3, 5)
TARGETS = (.99, .98)
SCORE = "mean_cosine_distance_to_k_nearest_training_embeddings"
# Predetermined before test/OOD evaluation: several neighbors, conservative leaf retention.
ADOPTION_CANDIDATE = "knn-k5-q99"
REFERENCE = ROOT / "model_artifacts/disease_ood_reference.npz"
FROZEN = ROOT / "model_artifacts/disease_ood_knn_candidates.json"
COMPARISON = ROOT / "model_artifacts/disease_ood_comparison.json"


def knn_scores(embeddings, normalized_reference, k):
    if isinstance(k, bool) or not isinstance(k, int) or not 1 <= k <= len(normalized_reference):
        raise ValueError("k must be an integer within the reference count.")
    queries = normalize_embeddings(embeddings)
    reference = np.asarray(normalized_reference, dtype=np.float64)
    if reference.ndim != 2 or reference.shape[1] != queries.shape[1] or not np.isfinite(reference).all():
        raise ValueError("Invalid kNN reference.")
    # Bound memory for evaluation batches; 1,500 reference vectors, no external index/package.
    results = []
    for start in range(0, len(queries), 32):
        distances = np.clip(1 - queries[start:start + 32] @ reference.T, 0, 2)
        nearest = np.partition(distances, k - 1, axis=1)[:, :k]
        results.append(np.sort(nearest, axis=1).mean(axis=1))
    return np.concatenate(results)


def calibrate(scores, target):
    scores = np.asarray(scores, dtype=np.float64)
    if scores.ndim != 1 or not len(scores) or not np.isfinite(scores).all() or not 0 < target < 1:
        raise ValueError("Invalid validation calibration inputs.")
    index = math.ceil(target * (len(scores) - 1))
    threshold = float(np.sort(scores)[index])
    accepted = int((scores <= threshold).sum())
    return {"target": target, "threshold": threshold, "orderStatisticOneBased": index + 1,
            "validationAccepted": accepted, "validationTotal": len(scores),
            "validationAcceptanceRate": accepted / len(scores)}


def manifest_splits(root):
    # Inspect split metadata, not test image bytes/features, during calibration.
    manifest = json.loads((root / "dataset_manifest.json").read_text(encoding="utf-8"))
    splits = {key: [r for r in manifest["records"] if r["split"] == key]
              for key in ("train", "validation", "test")}
    if [len(splits[k]) for k in splits] != [1500, 300, 300]:
        raise ValueError("Expected the unchanged 1,500/300/300 dataset splits.")
    for field in ("localPath", "leafGroup", "sha256"):
        sets = [set(str(r[field]).lower() for r in records) for records in splits.values()]
        if any(sets[i] & sets[j] for i, j in ((0, 1), (0, 2), (1, 2))):
            raise ValueError(f"Cross-split leakage: {field}")
    return manifest, splits


def verify_records(root, records, labels):
    for record in records:
        path = (root / record["localPath"]).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError("Dataset image is outside its root.")
        if labels[record["classIndex"]] != record["classLabel"] or file_sha256(path) != record["sha256"].lower():
            raise ValueError(f"Dataset class/hash mismatch: {record['localPath']}")


def checked_feature(model, transform, image):
    with torch.inference_mode():
        tensor = transform(image.convert("RGB")).unsqueeze(0)
        feature = extract_embedding(model, tensor)
        logits = model.classifier(feature)
        torch.testing.assert_close(logits, model(tensor), rtol=0, atol=0)
        probabilities = torch.softmax(logits, dim=1).numpy()
    return feature.numpy(), probabilities


def freeze(args):
    if args.frozen.exists() or args.reference.exists():
        raise FileExistsError("Refusing to overwrite frozen candidates/reference; use separate experiment paths.")
    model, transform, metadata, labels = load_classifier()
    manifest, splits = manifest_splits(args.dataset_root)
    if labels != manifest["supportedClasses"]:
        raise ValueError("Classifier/dataset class order mismatch.")
    for split in ("train", "validation"):
        verify_records(args.dataset_root, splits[split], labels)
    with Image.open(args.dataset_root / splits["train"][0]["localPath"]) as image:
        checked_feature(model, transform, image)
    print("Extracting training reference; no test or OOD images are opened...", flush=True)
    train, class_ids, _ = collect_features(model, transform, args.dataset_root, splits["train"])
    # Store float32 for size; re-normalize the serialized vectors in float64 on load/score.
    stored_reference = normalize_embeddings(train).astype(np.float32)
    reference = normalize_embeddings(stored_reference)
    print("Calibrating only on 300 validation embeddings...", flush=True)
    validation, _, _ = collect_features(model, transform, args.dataset_root, splits["validation"])
    candidates, validation_scores = [], {}
    for k in K_VALUES:
        scores = knn_scores(validation, reference, k)
        validation_scores[str(k)] = scores.tolist()
        for target in TARGETS:
            candidates.append({"id": f"knn-k{k}-q{round(target * 100)}", "k": k,
                               "score": SCORE, **calibrate(scores, target)})
    metadata = {
        "artifactVersion": "disease-ood-knn-reference-v1", "classifierVersion": "disease-v1",
        "modelSha256": file_sha256(MODEL_PATH), "featureLayer": FEATURE_LAYER,
        "preprocessing": metadata["preprocessing"], "classLabels": labels,
        "manifestSha256": file_sha256(args.dataset_root / "dataset_manifest.json"),
        "trainingImages": len(train), "embeddingDimensions": 1280, "seed": 42,
        "storage": "L2-normalized float32; re-normalize to float64 before cosine scores",
        "containsRawImages": False,
    }
    args.reference.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.reference, embeddings=stored_reference, class_ids=class_ids.astype(np.int16),
                        metadata=np.array(json.dumps(metadata)))
    report = {
        "frozenAt": datetime.now(timezone.utc).isoformat(), "phase": "frozen_before_test_ood_evaluation",
        "score": SCORE, "kValues": list(K_VALUES), "targets": list(TARGETS),
        "quantileMethod": "higher; sorted[ceil(target * (n - 1))]; equality accepted",
        "preselectedAdoptionCandidate": ADOPTION_CANDIDATE,
        "preselectionReason": "Fixed before evaluation: average five neighbors rather than rely on one; 99% target favors supported-leaf retention.",
        "adoptionGate": "Adopt only this preselected candidate if validation >=294/300, test >=289/300, real OOD rejection >7/8; otherwise retain v1.1. Do not select another k/threshold using evaluation outcomes.",
        "metadata": metadata, "referenceSha256": file_sha256(args.reference),
        "referenceBytes": args.reference.stat().st_size,
        "centroidGuardSha256": file_sha256(GUARD_PATH),
        "calibrationImages": {"train": 1500, "validation": 300, "test": 0, "ood": 0},
        "candidates": candidates, "validationScores": validation_scores,
        "exactSplitLogitsVerified": True,
    }
    args.frozen.parent.mkdir(parents=True, exist_ok=True)
    args.frozen.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("frozenAt", "preselectedAdoptionCandidate", "referenceBytes", "candidates")}, indent=2), flush=True)
    print(f"Frozen report SHA256: {file_sha256(args.frozen)}", flush=True)


def metrics(mask, correct):
    return {"total": len(mask), "accepted": int(mask.sum()), "acceptanceRate": float(mask.mean()),
            "falseRejections": int((~mask).sum()), "acceptedCorrect": int((mask & correct).sum()),
            "acceptedClassificationAccuracy": float(correct[mask].mean()) if mask.any() else None}


def benchmark(function, repeats=100):
    for _ in range(10):
        function()
    elapsed = []
    for _ in range(repeats):
        start = perf_counter()
        function()
        elapsed.append((perf_counter() - start) * 1000)
    return {"repeats": repeats, "medianMs": float(np.median(elapsed)),
            "p95Ms": float(np.quantile(elapsed, .95))}


def evaluate(args):
    if args.ood_dir is None or args.ood_dir.resolve().is_relative_to(ROOT.parent):
        raise ValueError("Specify the existing evaluation-only OOD folder outside Git.")
    frozen_hash = file_sha256(args.frozen)
    frozen = json.loads(args.frozen.read_text(encoding="utf-8"))
    initial = None
    if args.confirm_final and args.output.is_file():
        initial = json.loads(args.output.read_text(encoding="utf-8"))
        if initial["frozenReportSha256"] != frozen_hash:
            raise ValueError("Initial comparison used different frozen candidates.")
    if frozen["referenceSha256"] != file_sha256(args.reference) or frozen["centroidGuardSha256"] != file_sha256(GUARD_PATH):
        raise ValueError("Frozen reference or baseline guard changed.")
    model, transform, metadata, labels = load_classifier()
    if frozen["metadata"]["modelSha256"] != file_sha256(MODEL_PATH):
        raise ValueError("Classifier changed since freeze.")
    if frozen["metadata"]["preprocessing"] != metadata["preprocessing"]:
        raise ValueError("Preprocessing changed since freeze.")
    _, splits = manifest_splits(args.dataset_root)
    if frozen["metadata"]["manifestSha256"] != file_sha256(args.dataset_root / "dataset_manifest.json"):
        raise ValueError("Dataset split manifest changed since freeze.")
    with np.load(args.reference, allow_pickle=False) as artifact:
        reference = normalize_embeddings(artifact["embeddings"])
    guard = DiseaseOODGuard.load(GUARD_PATH, MODEL_PATH, labels, metadata["preprocessing"])
    features, probabilities, targets = {}, {}, {}
    for split in ("validation", "test"):
        print(f"Evaluating frozen candidates on {split}: 300 leaves...", flush=True)
        verify_records(args.dataset_root, splits[split], labels)
        features[split], targets[split], probabilities[split] = collect_features(model, transform, args.dataset_root, splits[split])
        with Image.open(args.dataset_root / splits[split][0]["localPath"]) as image:
            checked_feature(model, transform, image)
    # Fixed eight fixtures, all included and hash-checked against the prior evaluation.
    previous = json.loads((ROOT / "model_artifacts/disease_ood_evaluation.json").read_text(encoding="utf-8"))
    expected_hashes = {row["file"]: row["sha256"] for row in previous["ood"]["samples"]}
    sample_root = Path(sklearn.__file__).parent / "datasets/images"
    fixtures = [(args.ood_dir / name, category, license_name) for name, (category, license_name) in OOD_SOURCES.items()]
    fixtures += [(sample_root / "china.jpg", "building", "CC BY 2.0; sklearn sample README"),
                 (sample_root / "flower.jpg", "unsupported flower", "CC BY 2.0; sklearn sample README")]
    ood, ood_features, ood_probs = [], [], []
    for path, category, license_name in fixtures:
        if file_sha256(path) != expected_hashes[path.name]:
            raise ValueError(f"OOD fixture changed: {path.name}")
        with Image.open(path) as image:
            feature, probs = checked_feature(model, transform, image)
        ood_features.append(feature)
        ood_probs.append(probs)
        ood.append({"file": path.name, "category": category, "path": str(path),
                    "sha256": file_sha256(path), "license": license_name,
                    "source": FETCHERS if path.parent == args.ood_dir else "sklearn/datasets/images/README.txt"})
    features["ood"], probabilities["ood"] = np.concatenate(ood_features), np.concatenate(ood_probs)
    synthetic, synthetic_features, synthetic_probs = [], [], []
    for name, image in [("solid_black", Image.new("RGB", (256, 256), "black")),
                        ("solid_white", Image.new("RGB", (256, 256), "white")),
                        ("solid_green", Image.new("RGB", (256, 256), "green")),
                        ("noise_seed_42", Image.fromarray(np.random.default_rng(42).integers(0, 256, (256, 256, 3), dtype=np.uint8)))]:
        feature, probs = checked_feature(model, transform, image)
        synthetic_features.append(feature)
        synthetic_probs.append(probs)
        synthetic.append({"name": name})
    features["synthetic"], probabilities["synthetic"] = np.concatenate(synthetic_features), np.concatenate(synthetic_probs)
    methods = [{"id": "centroid-v1", "threshold": guard.threshold},
               {"id": "centroid-confidence-v1.1", "threshold": guard.threshold,
                "secondaryDistanceThreshold": guard.secondary_threshold, "confidenceThreshold": guard.confidence_threshold}]
    methods += frozen["candidates"]
    rows, detailed = [], {}
    for method in methods:
        scores, masks = {}, {}
        for split, embedding in features.items():
            if "k" in method:
                scores[split] = knn_scores(embedding, reference, method["k"])
                masks[split] = scores[split] <= method["threshold"]
            else:
                scores[split] = centroid_distances(embedding, guard.centroids)
                masks[split] = scores[split] <= guard.threshold
                if method["id"] == "centroid-confidence-v1.1":
                    masks[split] &= (scores[split] <= guard.secondary_threshold) | (probabilities[split].max(axis=1) >= guard.confidence_threshold)
                    # Verify the comparison formula agrees with the deployed guard.
                    actual = [guard.accepts_score(float(d), float(p.max()))
                              for d, p in zip(scores[split], probabilities[split])]
                    np.testing.assert_array_equal(masks[split], actual)
        row = {"method": method["id"], "parameters": method}
        for split in ("validation", "test"):
            row[split] = metrics(masks[split], probabilities[split].argmax(axis=1) == targets[split])
        if "k" in method:
            if row["validation"]["accepted"] != method["validationAccepted"]:
                raise ValueError("Validation acceptance differs from frozen calibration.")
        row["oodRejected"] = int((~masks["ood"]).sum())
        row["ood"] = [{**item, "rejected": bool(not accepted), "score": float(score)}
                      for item, accepted, score in zip(ood, masks["ood"], scores["ood"])]
        row["synthetic"] = [{**item, "rejected": bool(not accepted), "score": float(score)}
                            for item, accepted, score in zip(synthetic, masks["synthetic"], scores["synthetic"])]
        detailed[method["id"]] = {split: [
            {"path": record["localPath"], "actualClass": record["classLabel"],
             "predictedClass": labels[int(probs.argmax())], "confidence": float(probs.max()),
             "score": float(score), "accepted": bool(accepted)}
            for record, probs, score, accepted in zip(splits[split], probabilities[split], scores[split], masks[split])
        ] for split in ("validation", "test")}
        demo_path = previous["demoSamples"]["moderateEarlyBlight"]["path"]
        row["moderateEarlyBlight"] = next(item for item in detailed[method["id"]]["test"] if item["path"] == demo_path)
        rows.append(row)
    candidate = next(row for row in rows if row["method"] == frozen["preselectedAdoptionCandidate"])
    baseline = rows[1]
    adopt = (candidate["validation"]["accepted"] >= 294 and candidate["test"]["accepted"] >= baseline["test"]["accepted"]
             and candidate["oodRejected"] > baseline["oodRejected"])
    selection = {"adoptKnn": adopt, "method": candidate["method"] if adopt else baseline["method"],
                 "guardVersion": "disease-ood-v2" if adopt else "disease-ood-v1.1",
                 "reason": "Apply frozen adoption gate only; other kNN candidates are descriptive, not eligible for post-test parameter selection."}
    if args.confirm_final and selection["guardVersion"] != args.confirm_final:
        raise ValueError("Final rerun does not support the specified selection.")
    if initial and (initial["comparison"] != rows or initial["selection"] != selection):
        raise ValueError("Fresh final evaluation differs from the initial frozen comparison.")
    one = features["validation"][:1]
    with Image.open(args.dataset_root / splits["validation"][0]["localPath"]) as image:
        tensor = transform(image.convert("RGB")).unsqueeze(0)
    with torch.inference_mode():
        timing = {"processor": platform.processor(), "torchThreads": torch.get_num_threads(),
                  "classifierForward": benchmark(lambda: model(tensor)),
                  "centroidScore": benchmark(lambda: centroid_distances(one, guard.centroids)),
                  "knnScore": benchmark(lambda: knn_scores(one, reference, 5)),
                  "scope": "CPU warm single-image scoring; reference already normalized/loaded; excludes image decoding, network and database. Both scores include query normalization. No end-to-end latency guarantee."}
    report = {"evaluatedAt": datetime.now(timezone.utc).isoformat(), "finalRerun": bool(args.confirm_final),
              "frozenReportSha256": frozen_hash, "frozenAt": frozen["frozenAt"],
              "modelSha256": file_sha256(MODEL_PATH), "referenceSha256": file_sha256(args.reference),
              "referenceBytes": args.reference.stat().st_size, "classifierAccuracy": float((probabilities["test"].argmax(axis=1) == targets["test"]).mean()),
              "originalCorrect": int((probabilities["test"].argmax(axis=1) == targets["test"]).sum()),
              "exactSplitLogitsVerified": True, "comparison": rows, "selection": selection,
              "timing": timing, "leafResults": detailed,
              "limitations": "Exploratory method-adoption evidence on reused test and eight convenience OOD fixtures, not independent generalization evidence. No k, aggregation or numerical threshold changed after freeze. Validation also selected original classifier checkpoint."}
    if initial:
        report["initialEvaluation"] = initial.get("initialEvaluation", {
            "evaluatedAt": initial["evaluatedAt"], "selection": initial["selection"],
            "timing": initial["timing"],
        })
        report["freshRerunMatchesInitialComparisonExactly"] = True
    if (frozen_hash != file_sha256(args.frozen)
            or frozen["centroidGuardSha256"] != file_sha256(GUARD_PATH)
            or frozen["referenceSha256"] != file_sha256(args.reference)
            or frozen["metadata"]["modelSha256"] != file_sha256(MODEL_PATH)):
        raise RuntimeError("Frozen candidates, reference, classifier or deployed guard changed during evaluation.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"comparison": [{"method": row["method"], "validationAccepted": row["validation"]["accepted"],
                                      "test": row["test"], "oodRejected": row["oodRejected"],
                                      "oodFalseAccepts": [s["file"] for s in row["ood"] if not s["rejected"]],
                                      "syntheticFalseAccepts": [s["name"] for s in row["synthetic"] if not s["rejected"]]}
                                     for row in rows],
                      "selection": selection, "timing": timing}, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("freeze", "evaluate"))
    parser.add_argument("--dataset-root", type=Path, default=ROOT / "data/plant_disease")
    parser.add_argument("--reference", type=Path, default=REFERENCE)
    parser.add_argument("--frozen", type=Path, default=FROZEN)
    parser.add_argument("--output", type=Path, default=COMPARISON)
    parser.add_argument("--ood-dir", type=Path)
    parser.add_argument("--confirm-final", choices=("disease-ood-v1.1", "disease-ood-v2"))
    args = parser.parse_args()
    torch.manual_seed(42)
    torch.set_num_threads(4)
    freeze(args) if args.phase == "freeze" else evaluate(args)


if __name__ == "__main__":
    main()
