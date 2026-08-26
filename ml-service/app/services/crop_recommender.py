import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from app.schemas.crop_recommendation import (
    CropPredictionRequest,
    CropPredictionResponse,
    CropRecommendationItem,
)

FEATURE_INPUT_MAP = {
    "N": "nitrogen",
    "P": "phosphorus",
    "K": "potassium",
    "temperature": "temperature",
    "humidity": "humidity",
    "ph": "ph",
    "rainfall": "rainfall",
}
FEATURE_DISPLAY_NAMES = {
    "N": "Nitrogen",
    "P": "Phosphorus",
    "K": "Potassium",
    "temperature": "Temperature",
    "humidity": "Humidity",
    "ph": "pH",
    "rainfall": "Rainfall",
}
SERVICE_ROOT = Path(__file__).resolve().parents[2]


class ModelUnavailableError(RuntimeError):
    """Raised when the saved crop model cannot be loaded or used."""


class PredictionError(RuntimeError):
    """Raised when a loaded crop model cannot complete inference."""


def resolve_service_path(path: Path) -> Path:
    return path if path.is_absolute() else SERVICE_ROOT / path


def format_crop_name(value: object) -> str:
    return str(value).replace("_", " ").strip().title()


class CropModelService:
    def __init__(self) -> None:
        self._model = None
        self._feature_order = None
        self._metadata = None
        self._load_error = None

    def load(self, model_path: Path, metadata_path: Path) -> None:
        resolved_model_path = resolve_service_path(model_path)
        resolved_metadata_path = resolve_service_path(metadata_path)

        try:
            if not resolved_model_path.is_file():
                raise FileNotFoundError(f"Model artifact not found: {resolved_model_path}")

            if not resolved_metadata_path.is_file():
                raise FileNotFoundError(f"Model metadata not found: {resolved_metadata_path}")

            artifact = joblib.load(resolved_model_path)
            metadata = json.loads(resolved_metadata_path.read_text(encoding="utf-8"))
            model = artifact.get("model")
            feature_order = artifact.get("featureOrder")

            if model is None or not hasattr(model, "predict"):
                raise ValueError("Model artifact does not contain a valid estimator.")

            if not hasattr(model, "predict_proba"):
                raise ValueError("Crop model must support predict_proba for ranked recommendations.")

            if feature_order != list(FEATURE_INPUT_MAP):
                raise ValueError("Model feature order does not match the inference contract.")

            if metadata.get("modelVersion") != artifact.get("modelVersion"):
                raise ValueError("Model and metadata versions do not match.")

            self._model = model
            self._feature_order = feature_order
            self._metadata = metadata
            self._load_error = None
        except Exception as error:
            self._model = None
            self._feature_order = None
            self._metadata = None
            self._load_error = error
            raise ModelUnavailableError(str(error)) from error

    def predict(self, payload: CropPredictionRequest) -> CropPredictionResponse:
        if self._model is None or self._metadata is None or self._feature_order is None:
            detail = str(self._load_error) if self._load_error else "Model has not been loaded."
            raise ModelUnavailableError(detail)

        try:
            payload_values = payload.model_dump()
            feature_row = {
                feature: payload_values[input_name]
                for feature, input_name in FEATURE_INPUT_MAP.items()
            }
            frame = pd.DataFrame([feature_row], columns=self._feature_order)
            probabilities = self._model.predict_proba(frame)[0]
            classes = np.asarray(self._model.classes_)

            if len(probabilities) != len(classes):
                raise ValueError("Model probability output does not match its crop classes.")

            top_indices = np.argsort(probabilities)[::-1][:3]
            recommendations = [
                CropRecommendationItem(
                    crop=format_crop_name(classes[index]),
                    score=round(float(probabilities[index]), 6),
                )
                for index in top_indices
            ]
            feature_ranges = self._metadata.get("featureRanges", {})
            warnings = []

            for feature, value in feature_row.items():
                observed_range = feature_ranges.get(feature)
                if not observed_range:
                    continue

                minimum = observed_range.get("min")
                maximum = observed_range.get("max")

                if minimum is not None and maximum is not None and not minimum <= value <= maximum:
                    warnings.append(
                        f"{FEATURE_DISPLAY_NAMES[feature]} is outside the model's training-data "
                        f"range ({minimum:.2f} to {maximum:.2f}); confidence may be less reliable."
                    )

            return CropPredictionResponse(
                status="ok",
                model_version=self._metadata["modelVersion"],
                recommended_crop=recommendations[0].crop,
                recommendations=recommendations,
                warnings=warnings,
            )
        except ModelUnavailableError:
            raise
        except Exception as error:
            raise PredictionError(str(error)) from error


crop_model_service = CropModelService()
