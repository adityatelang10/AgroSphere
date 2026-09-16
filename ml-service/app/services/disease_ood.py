"""Small, calibrated supported-domain guard; not a universal leaf detector."""

import hashlib
import json
from pathlib import Path

import numpy as np
import torch

GUARD_VERSION = "disease-ood-v1.1"
FEATURE_LAYER = "features -> adaptive_avg_pool2d(1,1) -> flatten (1280)"
METRIC = "nearest_class_centroid_cosine"


def file_sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def extract_embedding(model, images):
    # Exactly MobileNetV2._forward_impl up to (but not including) classifier.
    return torch.flatten(torch.nn.functional.adaptive_avg_pool2d(model.features(images), (1, 1)), 1)


def normalize_embeddings(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float64)
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    if not np.isfinite(values).all() or np.any(norms <= 1e-12):
        raise ValueError("Invalid disease feature vector.")
    return values / norms


def centroid_distances(embeddings: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    return np.clip(1.0 - normalize_embeddings(embeddings) @ centroids.T, 0.0, 2.0).min(axis=1)


class DiseaseOODGuard:
    def __init__(self, centroids: np.ndarray, metadata: dict):
        self.centroids = centroids
        self.metadata = metadata
        self.threshold = float(metadata["threshold"])
        self.secondary_threshold = float(metadata["secondaryDistanceThreshold"])
        self.confidence_threshold = float(metadata["confidenceThreshold"])

    @classmethod
    def load(cls, path: Path, model_path: Path, class_labels: list[str], preprocessing: dict):
        # No pickle/object arrays; bind the calibration to exact weights and preprocessing.
        with np.load(path, allow_pickle=False) as artifact:
            centroids = artifact["centroids"].astype(np.float64)
            metadata = json.loads(str(artifact["metadata"].item()))
        if (
            metadata.get("guardVersion") != GUARD_VERSION
            or metadata.get("rule") != "distance_or_gated_low_confidence"
            or metadata.get("metric") != METRIC
            or metadata.get("featureLayer") != FEATURE_LAYER
            or metadata.get("modelSha256") != file_sha256(model_path)
            or metadata.get("classLabels") != class_labels
            or metadata.get("preprocessing") != preprocessing
            or centroids.shape != (len(class_labels), 1280)
            or not np.isfinite(centroids).all()
            or not np.allclose(np.linalg.norm(centroids, axis=1), 1.0, atol=1e-6)
        ):
            raise ValueError("Disease guard is invalid or does not match the classifier.")
        threshold = metadata.get("threshold")
        if isinstance(threshold, bool) or not isinstance(threshold, (float, int)) or not 0 < threshold < 2:
            raise ValueError("Invalid disease guard threshold.")
        secondary = metadata.get("secondaryDistanceThreshold")
        confidence = metadata.get("confidenceThreshold")
        if (
            isinstance(secondary, bool) or not isinstance(secondary, (float, int))
            or not 0 < secondary < threshold
            or isinstance(confidence, bool) or not isinstance(confidence, (float, int))
            or not 0 < confidence < 1
        ):
            raise ValueError("Invalid disease guard auxiliary thresholds.")
        return cls(centroids, metadata)

    def accepts_distance(self, distance: float) -> bool:
        return bool(np.isfinite(distance) and 0 <= distance <= self.threshold)

    def accepts_score(self, distance: float, confidence: float) -> bool:
        if not self.accepts_distance(distance) or not np.isfinite(confidence) or not 0 <= confidence <= 1:
            return False
        return bool(distance <= self.secondary_threshold or confidence >= self.confidence_threshold)

    def accepts(self, embedding: torch.Tensor, confidence: float) -> bool:
        distance = float(centroid_distances(embedding.cpu().numpy(), self.centroids)[0])
        return self.accepts_score(distance, confidence)
