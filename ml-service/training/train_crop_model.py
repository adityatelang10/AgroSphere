import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

FEATURE_COLUMNS = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
TARGET_COLUMN = "label"
MODEL_VERSION = "crop-v1"
RANDOM_SEED = 42
TEST_SIZE = 0.20
DATASET_NAME = "Crop Recommendation Dataset"
DATASET_SOURCE = "https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset"
DATASET_LICENSE = "Apache 2.0"

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_PATH = SERVICE_ROOT / "data" / "crop_recommendation.csv"
DEFAULT_MODEL_PATH = SERVICE_ROOT / "model_artifacts" / "crop_model.joblib"
DEFAULT_METADATA_PATH = SERVICE_ROOT / "model_artifacts" / "crop_model_metadata.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the AgroSphere crop recommendation model.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--model-output", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--metadata-output", type=Path, default=DEFAULT_METADATA_PATH)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for block in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def load_and_validate_dataset(path: Path) -> tuple[pd.DataFrame, int]:
    if not path.is_file():
        raise FileNotFoundError(f"Dataset not found: {path}")

    data = pd.read_csv(path)
    required_columns = FEATURE_COLUMNS + [TARGET_COLUMN]
    missing_columns = [column for column in required_columns if column not in data.columns]

    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing_columns)}")

    data = data[required_columns].copy()

    for column in FEATURE_COLUMNS:
        data[column] = pd.to_numeric(data[column], errors="raise")

    data[TARGET_COLUMN] = data[TARGET_COLUMN].astype(str).str.strip().str.lower()

    if data.isna().any().any():
        raise ValueError("Dataset contains missing values.")

    if not np.isfinite(data[FEATURE_COLUMNS].to_numpy(dtype=float)).all():
        raise ValueError("Dataset contains non-finite numeric values.")

    if (data[TARGET_COLUMN] == "").any():
        raise ValueError("Dataset contains empty crop labels.")

    invalid_conditions = {
        "N": data["N"] < 0,
        "P": data["P"] < 0,
        "K": data["K"] < 0,
        "humidity": (data["humidity"] < 0) | (data["humidity"] > 100),
        "ph": (data["ph"] < 0) | (data["ph"] > 14),
        "rainfall": data["rainfall"] < 0,
    }

    invalid_columns = [name for name, invalid in invalid_conditions.items() if invalid.any()]
    if invalid_columns:
        raise ValueError(
            "Dataset contains values outside basic physical bounds for: "
            + ", ".join(invalid_columns)
        )

    original_size = len(data)
    data = data.drop_duplicates().reset_index(drop=True)
    removed_duplicates = original_size - len(data)

    class_counts = data[TARGET_COLUMN].value_counts()
    if len(class_counts) < 2:
        raise ValueError("Dataset must contain at least two crop classes.")

    if class_counts.min() < 2:
        raise ValueError("Every crop class must contain at least two rows for stratification.")

    return data, removed_duplicates


def build_candidate_models() -> dict[str, object]:
    return {
        "RandomForestClassifier": RandomForestClassifier(
            n_estimators=300,
            random_state=RANDOM_SEED,
            n_jobs=1,
        ),
        "DecisionTreeClassifier": DecisionTreeClassifier(random_state=RANDOM_SEED),
        "KNeighborsClassifier": Pipeline(
            steps=[
                ("scaler", StandardScaler()),
                ("classifier", KNeighborsClassifier(n_neighbors=5)),
            ]
        ),
        "LogisticRegression": Pipeline(
            steps=[
                ("scaler", StandardScaler()),
                (
                    "classifier",
                    LogisticRegression(
                        max_iter=5000,
                        random_state=RANDOM_SEED,
                    ),
                ),
            ]
        ),
    }


def evaluate_model(model: object, features: pd.DataFrame, target: pd.Series) -> dict:
    predictions = model.predict(features)
    precision, recall, f1, _ = precision_recall_fscore_support(
        target,
        predictions,
        average="weighted",
        zero_division=0,
    )

    return {
        "accuracy": float(accuracy_score(target, predictions)),
        "precisionWeighted": float(precision),
        "recallWeighted": float(recall),
        "f1Weighted": float(f1),
        "predictions": predictions,
    }


def train(dataset_path: Path, model_path: Path, metadata_path: Path) -> dict:
    data, removed_duplicates = load_and_validate_dataset(dataset_path)
    features = data[FEATURE_COLUMNS]
    target = data[TARGET_COLUMN]

    train_features, test_features, train_target, test_target = train_test_split(
        features,
        target,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        stratify=target,
    )

    fitted_models = {}
    candidate_metrics = {}

    for model_name, model in build_candidate_models().items():
        model.fit(train_features, train_target)
        metrics = evaluate_model(model, test_features, test_target)
        candidate_metrics[model_name] = {
            key: value for key, value in metrics.items() if key != "predictions"
        }
        fitted_models[model_name] = model

    selected_model_name = max(
        candidate_metrics,
        key=lambda name: (
            candidate_metrics[name]["accuracy"],
            candidate_metrics[name]["f1Weighted"],
        ),
    )
    selected_model = fitted_models[selected_model_name]
    selected_evaluation = evaluate_model(selected_model, test_features, test_target)
    class_labels = [str(label) for label in selected_model.classes_]
    matrix = confusion_matrix(
        test_target,
        selected_evaluation["predictions"],
        labels=class_labels,
    )

    feature_ranges = {
        column: {
            "min": float(data[column].min()),
            "max": float(data[column].max()),
        }
        for column in FEATURE_COLUMNS
    }

    artifact = {
        "model": selected_model,
        "featureOrder": FEATURE_COLUMNS,
        "cropClasses": class_labels,
        "modelVersion": MODEL_VERSION,
    }

    metadata = {
        "modelName": selected_model_name,
        "modelVersion": MODEL_VERSION,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "name": DATASET_NAME,
            "source": DATASET_SOURCE,
            "license": DATASET_LICENSE,
            "file": dataset_path.name,
            "sha256": sha256_file(dataset_path),
            "recordsAfterCleaning": int(len(data)),
            "duplicatesRemoved": int(removed_duplicates),
        },
        "featureOrder": FEATURE_COLUMNS,
        "featureRanges": feature_ranges,
        "cropClasses": class_labels,
        "classCount": len(class_labels),
        "training": {
            "randomSeed": RANDOM_SEED,
            "testFraction": TEST_SIZE,
            "stratified": True,
            "trainingRecords": int(len(train_features)),
            "testRecords": int(len(test_features)),
        },
        "evaluation": {
            "accuracy": selected_evaluation["accuracy"],
            "precisionWeighted": selected_evaluation["precisionWeighted"],
            "recallWeighted": selected_evaluation["recallWeighted"],
            "f1Weighted": selected_evaluation["f1Weighted"],
            "candidateModels": candidate_metrics,
            "confusionMatrix": {
                "labels": class_labels,
                "matrix": matrix.tolist(),
            },
        },
        "scoreInterpretation": (
            "Scores are model class-confidence estimates from predict_proba, not the "
            "probability of agronomic success or guaranteed yield."
        ),
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    summary = {
        "modelArtifact": str(model_path.resolve()),
        "metadataArtifact": str(metadata_path.resolve()),
        "selectedModel": selected_model_name,
        "trainingRecords": len(train_features),
        "testRecords": len(test_features),
        "classCount": len(class_labels),
        "evaluation": metadata["evaluation"],
    }
    return summary


def main() -> None:
    args = parse_args()
    summary = train(args.dataset, args.model_output, args.metadata_output)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
