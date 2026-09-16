import json
from io import BytesIO
from pathlib import Path

import torch
from PIL import Image, UnidentifiedImageError
from torch import nn
from torchvision import models, transforms

from app.schemas.disease_detection import DiseasePredictionResponse
from app.services.disease_ood import DiseaseOODGuard, GUARD_VERSION, extract_embedding

SERVICE_ROOT = Path(__file__).resolve().parents[2]
MAX_IMAGE_PIXELS = 25_000_000
SUPPORTED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


class DiseaseModelUnavailableError(RuntimeError):
    """Raised when the saved disease model cannot be loaded or used."""


class InvalidDiseaseImageError(ValueError):
    """Raised when uploaded bytes are not a supported decodable image."""


class DiseasePredictionError(RuntimeError):
    """Raised when a loaded disease model cannot complete inference."""


def resolve_service_path(path: Path) -> Path:
    return path if path.is_absolute() else SERVICE_ROOT / path


class DiseaseModelService:
    def __init__(self) -> None:
        self._model = None
        self._classes = None
        self._metadata = None
        self._transform = None
        self._guard = None
        self._load_error = None

    def load(
        self, model_path: Path, classes_path: Path, metadata_path: Path,
        ood_path: Path = Path("model_artifacts/disease_ood_metadata.npz"),
    ) -> None:
        resolved_model_path = resolve_service_path(model_path)
        resolved_classes_path = resolve_service_path(classes_path)
        resolved_metadata_path = resolve_service_path(metadata_path)

        try:
            for artifact_path in (
                resolved_model_path,
                resolved_classes_path,
                resolved_metadata_path,
            ):
                if not artifact_path.is_file():
                    raise FileNotFoundError(f"Disease artifact not found: {artifact_path}")

            artifact = torch.load(
                resolved_model_path,
                map_location="cpu",
                weights_only=False,
            )
            classes_document = json.loads(
                resolved_classes_path.read_text(encoding="utf-8")
            )
            metadata = json.loads(resolved_metadata_path.read_text(encoding="utf-8"))
            class_details = classes_document.get("classes")
            class_labels = artifact.get("classLabels")

            if artifact.get("architecture") != "mobilenet_v2":
                raise ValueError("Unsupported disease model architecture.")
            if not isinstance(class_details, list) or not class_details:
                raise ValueError("Disease class mapping is empty or invalid.")
            if class_labels != [item.get("label") for item in class_details]:
                raise ValueError("Disease artifact and class mapping order do not match.")
            if not all(item.get("index") == index for index, item in enumerate(class_details)):
                raise ValueError("Disease class mapping indices are invalid.")

            model_version = artifact.get("modelVersion")
            if (
                model_version != classes_document.get("modelVersion")
                or model_version != metadata.get("modelVersion")
            ):
                raise ValueError("Disease artifact versions do not match.")

            input_size = artifact.get("inputSize")
            preprocessing = metadata.get("preprocessing", {})
            if input_size != preprocessing.get("inputWidth") or input_size != preprocessing.get(
                "inputHeight"
            ):
                raise ValueError("Disease input dimensions do not match metadata.")

            model = models.mobilenet_v2(weights=None)
            classifier_input_features = model.classifier[1].in_features
            model.classifier = nn.Sequential(
                nn.Dropout(p=0.2),
                nn.Linear(classifier_input_features, len(class_details)),
            )
            model.load_state_dict(artifact["stateDict"], strict=True)
            model.eval()
            self._guard = DiseaseOODGuard.load(
                resolve_service_path(ood_path), resolved_model_path, class_labels, preprocessing,
            )
            self._transform = transforms.Compose(
                [
                    transforms.Resize(preprocessing["evaluationResize"]),
                    transforms.CenterCrop(input_size),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=preprocessing["normalizationMean"],
                        std=preprocessing["normalizationStd"],
                    ),
                ]
            )
            self._model = model
            self._classes = class_details
            self._metadata = metadata
            self._load_error = None
        except Exception as error:
            self._model = None
            self._classes = None
            self._metadata = None
            self._transform = None
            self._guard = None
            self._load_error = error
            raise DiseaseModelUnavailableError(str(error)) from error

    def _decode_image(self, image_bytes: bytes) -> Image.Image:
        try:
            with Image.open(BytesIO(image_bytes)) as image:
                image.load()
                image_format = image.format
                width, height = image.size

                if image_format not in SUPPORTED_IMAGE_FORMATS:
                    raise InvalidDiseaseImageError(
                        "Only decodable JPEG, PNG, and WEBP images are supported."
                    )
                if width <= 0 or height <= 0:
                    raise InvalidDiseaseImageError("The image has invalid dimensions.")
                if width * height > MAX_IMAGE_PIXELS:
                    raise InvalidDiseaseImageError("The image dimensions are too large.")

                return image.convert("RGB")
        except InvalidDiseaseImageError:
            raise
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as error:
            raise InvalidDiseaseImageError(
                "The uploaded file is corrupted or is not a decodable image."
            ) from error

    def predict(self, image_bytes: bytes) -> DiseasePredictionResponse:
        if (
            self._model is None
            or self._classes is None
            or self._metadata is None
            or self._transform is None
            or self._guard is None
        ):
            detail = str(self._load_error) if self._load_error else "Model has not been loaded."
            raise DiseaseModelUnavailableError(detail)

        image = self._decode_image(image_bytes)

        try:
            image_tensor = self._transform(image).unsqueeze(0)
            supported_crops = list(dict.fromkeys(item["crop"] for item in self._classes))
            with torch.inference_mode():
                embedding = extract_embedding(self._model, image_tensor)
                # The auxiliary score is internal only: rejected responses still have no diagnosis.
                logits = self._model.classifier(embedding)
                probabilities = torch.softmax(logits, dim=1)[0]
                confidence_tensor, class_index_tensor = torch.max(probabilities, dim=0)
                if not self._guard.accepts(embedding, float(confidence_tensor.item())):
                    return DiseasePredictionResponse(
                        status="UNSUPPORTED_IMAGE",
                        model_version=self._metadata["modelVersion"], guard_version=GUARD_VERSION,
                        predicted_class=None, crop=None, condition=None, is_healthy=None,
                        confidence=None, supported_class=False,
                        supported_class_count=len(self._classes), supported_crops=supported_crops,
                        guidance=None,
                        message="This image does not appear sufficiently similar to the supported "
                        "Bell Pepper, Potato, or Tomato leaf images. Upload one clear leaf image.",
                    )

            class_index = int(class_index_tensor.item())
            confidence = float(confidence_tensor.item())
            class_details = self._classes[class_index]
            guidance = (
                "No supported disease condition was selected. Continue monitoring the leaf "
                "and compare any changing symptoms with local agricultural guidance."
                if class_details["isHealthy"]
                else "Inspect nearby leaves for similar symptoms and consider consulting a "
                "local agricultural expert before treatment."
            )
            return DiseasePredictionResponse(
                status="CLASSIFIED",
                model_version=self._metadata["modelVersion"],
                guard_version=GUARD_VERSION,
                predicted_class=class_details["label"],
                crop=class_details["crop"],
                condition=class_details["condition"],
                is_healthy=class_details["isHealthy"],
                confidence=round(confidence, 6),
                supported_class=True,
                supported_class_count=len(self._classes),
                supported_crops=supported_crops,
                guidance=guidance,
            )
        except DiseaseModelUnavailableError:
            raise
        except Exception as error:
            raise DiseasePredictionError(str(error)) from error


disease_model_service = DiseaseModelService()
