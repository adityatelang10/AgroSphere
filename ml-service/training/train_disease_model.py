import argparse
import json
import random
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms
from torchvision.models import MobileNet_V2_Weights

from training.disease_config import (
    CLASS_LABELS,
    IMAGENET_MEAN,
    IMAGENET_STD,
    INPUT_SIZE,
    MODEL_VERSION,
    RANDOM_SEED,
    RESIZE_SIZE,
    SUPPORTED_CLASSES,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_ROOT = SERVICE_ROOT / "data" / "plant_disease"
DEFAULT_MODEL_PATH = SERVICE_ROOT / "model_artifacts" / "disease_model.pt"
DEFAULT_CLASSES_PATH = SERVICE_ROOT / "model_artifacts" / "disease_classes.json"
DEFAULT_METADATA_PATH = SERVICE_ROOT / "model_artifacts" / "disease_model_metadata.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train the AgroSphere MobileNetV2 leaf disease classifier."
    )
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--model-output", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--classes-output", type=Path, default=DEFAULT_CLASSES_PATH)
    parser.add_argument("--metadata-output", type=Path, default=DEFAULT_METADATA_PATH)
    parser.add_argument("--head-epochs", type=int, default=3)
    parser.add_argument("--fine-tune-epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=32)
    return parser.parse_args()


def set_reproducible_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def load_and_validate_manifest(dataset_root: Path) -> tuple[dict, dict[str, list[dict]]]:
    manifest_path = dataset_root / "dataset_manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(
            f"Dataset manifest not found: {manifest_path}. Run prepare_disease_dataset first."
        )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("supportedClasses") != CLASS_LABELS:
        raise ValueError("Dataset class order does not match disease_config.py.")

    records_by_split = {"train": [], "validation": [], "test": []}
    seen_paths = set()

    for record in manifest.get("records", []):
        split_name = record.get("split")
        if split_name not in records_by_split:
            raise ValueError(f"Unexpected dataset split: {split_name}")
        if record.get("classLabel") not in CLASS_LABELS:
            raise ValueError(f"Unexpected disease class: {record.get('classLabel')}")

        local_path = dataset_root / record["localPath"]
        if local_path in seen_paths:
            raise ValueError(f"Duplicate manifest path: {local_path}")
        if not local_path.is_file():
            raise FileNotFoundError(f"Dataset image is missing: {local_path}")

        try:
            with Image.open(local_path) as image:
                image.verify()
        except (UnidentifiedImageError, OSError) as error:
            raise ValueError(f"Dataset image cannot be decoded: {local_path}") from error

        seen_paths.add(local_path)
        records_by_split[split_name].append(record)

    if any(not records for records in records_by_split.values()):
        raise ValueError("Training, validation, and test splits must all be non-empty.")

    train_groups = {record["leafGroup"] for record in records_by_split["train"]}
    validation_groups = {
        record["leafGroup"] for record in records_by_split["validation"]
    }
    test_groups = {record["leafGroup"] for record in records_by_split["test"]}

    if train_groups & validation_groups or train_groups & test_groups or validation_groups & test_groups:
        raise ValueError("Leaf-group leakage detected across dataset splits.")

    split_hashes = {
        split_name: {record["sha256"] for record in records}
        for split_name, records in records_by_split.items()
    }
    if (
        split_hashes["train"] & split_hashes["validation"]
        or split_hashes["train"] & split_hashes["test"]
        or split_hashes["validation"] & split_hashes["test"]
    ):
        raise ValueError("Exact duplicate-image leakage detected across dataset splits.")

    return manifest, records_by_split


class ManifestImageDataset(Dataset):
    def __init__(self, dataset_root: Path, records: list[dict], transform) -> None:
        self.dataset_root = dataset_root
        self.records = records
        self.transform = transform

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int):
        record = self.records[index]
        image_path = self.dataset_root / record["localPath"]
        with Image.open(image_path) as image:
            rgb_image = image.convert("RGB")
        return self.transform(rgb_image), int(record["classIndex"]), record["localPath"]


def build_transforms():
    training_transform = transforms.Compose(
        [
            transforms.RandomResizedCrop(INPUT_SIZE, scale=(0.80, 1.0)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=10),
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
    evaluation_transform = transforms.Compose(
        [
            transforms.Resize(RESIZE_SIZE),
            transforms.CenterCrop(INPUT_SIZE),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )
    return training_transform, evaluation_transform


def build_model() -> nn.Module:
    model = models.mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
    classifier_input_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.2),
        nn.Linear(classifier_input_features, len(CLASS_LABELS)),
    )

    for parameter in model.features.parameters():
        parameter.requires_grad = False

    return model


def run_training_epoch(model, loader, loss_function, optimizer, device) -> dict:
    model.train()
    total_loss = 0.0
    correct = 0
    sample_count = 0

    for images, labels, _ in loader:
        images = images.to(device)
        labels = labels.to(device)
        optimizer.zero_grad(set_to_none=True)
        logits = model(images)
        loss = loss_function(logits, labels)
        loss.backward()
        optimizer.step()
        total_loss += float(loss.item()) * labels.size(0)
        correct += int((logits.argmax(dim=1) == labels).sum().item())
        sample_count += labels.size(0)

    return {
        "loss": total_loss / sample_count,
        "accuracy": correct / sample_count,
    }


def evaluate(model, loader, loss_function, device) -> dict:
    model.eval()
    total_loss = 0.0
    targets = []
    predictions = []
    paths = []

    with torch.inference_mode():
        for images, labels, batch_paths in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            loss = loss_function(logits, labels)
            total_loss += float(loss.item()) * labels.size(0)
            targets.extend(labels.cpu().tolist())
            predictions.extend(logits.argmax(dim=1).cpu().tolist())
            paths.extend(batch_paths)

    precision, recall, f1, _ = precision_recall_fscore_support(
        targets,
        predictions,
        average="weighted",
        zero_division=0,
    )
    return {
        "loss": total_loss / len(targets),
        "accuracy": float(accuracy_score(targets, predictions)),
        "precisionWeighted": float(precision),
        "recallWeighted": float(recall),
        "f1Weighted": float(f1),
        "targets": targets,
        "predictions": predictions,
        "paths": paths,
    }


def metrics_without_predictions(metrics: dict) -> dict:
    return {
        key: value
        for key, value in metrics.items()
        if key not in {"targets", "predictions", "paths"}
    }


def state_dict_on_cpu(model: nn.Module) -> dict[str, torch.Tensor]:
    return {
        key: value.detach().cpu().clone()
        for key, value in model.state_dict().items()
    }


def train(args: argparse.Namespace) -> dict:
    set_reproducible_seed(RANDOM_SEED)
    dataset_root = args.dataset_root.resolve()
    manifest, records_by_split = load_and_validate_manifest(dataset_root)
    training_transform, evaluation_transform = build_transforms()
    datasets = {
        "train": ManifestImageDataset(
            dataset_root, records_by_split["train"], training_transform
        ),
        "validation": ManifestImageDataset(
            dataset_root, records_by_split["validation"], evaluation_transform
        ),
        "test": ManifestImageDataset(
            dataset_root, records_by_split["test"], evaluation_transform
        ),
    }
    generator = torch.Generator().manual_seed(RANDOM_SEED)
    loaders = {
        "train": DataLoader(
            datasets["train"],
            batch_size=args.batch_size,
            shuffle=True,
            num_workers=0,
            generator=generator,
        ),
        "validation": DataLoader(
            datasets["validation"],
            batch_size=args.batch_size,
            shuffle=False,
            num_workers=0,
        ),
        "test": DataLoader(
            datasets["test"],
            batch_size=args.batch_size,
            shuffle=False,
            num_workers=0,
        ),
    }
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model().to(device)
    loss_function = nn.CrossEntropyLoss()
    history = []
    best_validation_accuracy = -1.0
    best_state = None
    best_epoch = None

    phases = [
        {
            "name": "classifier_head",
            "epochs": args.head_epochs,
            "learningRate": 0.001,
            "before": lambda: None,
        },
        {
            "name": "final_feature_blocks",
            "epochs": args.fine_tune_epochs,
            "learningRate": 0.0001,
            "before": lambda: [
                parameter.requires_grad_(True)
                for parameter in model.features[-2:].parameters()
            ],
        },
    ]
    epoch_number = 0

    for phase in phases:
        phase["before"]()
        optimizer = torch.optim.AdamW(
            [parameter for parameter in model.parameters() if parameter.requires_grad],
            lr=phase["learningRate"],
            weight_decay=1e-4,
        )

        for _ in range(phase["epochs"]):
            epoch_number += 1
            training_metrics = run_training_epoch(
                model, loaders["train"], loss_function, optimizer, device
            )
            validation_metrics = evaluate(
                model, loaders["validation"], loss_function, device
            )
            epoch_result = {
                "epoch": epoch_number,
                "phase": phase["name"],
                "learningRate": phase["learningRate"],
                "training": training_metrics,
                "validation": metrics_without_predictions(validation_metrics),
            }
            history.append(epoch_result)
            print(json.dumps(epoch_result))

            if validation_metrics["accuracy"] > best_validation_accuracy:
                best_validation_accuracy = validation_metrics["accuracy"]
                best_state = state_dict_on_cpu(model)
                best_epoch = epoch_number

    if best_state is None:
        raise RuntimeError("Training did not produce a model state.")

    model.load_state_dict(best_state)
    model.to(device)
    test_metrics = evaluate(model, loaders["test"], loss_function, device)
    class_indices = list(range(len(CLASS_LABELS)))
    matrix = confusion_matrix(
        test_metrics["targets"], test_metrics["predictions"], labels=class_indices
    )
    per_class_precision, per_class_recall, per_class_f1, per_class_support = (
        precision_recall_fscore_support(
            test_metrics["targets"],
            test_metrics["predictions"],
            labels=class_indices,
            zero_division=0,
        )
    )
    per_class_metrics = [
        {
            "classIndex": index,
            "classLabel": CLASS_LABELS[index],
            "precision": float(per_class_precision[index]),
            "recall": float(per_class_recall[index]),
            "f1": float(per_class_f1[index]),
            "support": int(per_class_support[index]),
            "correct": int(matrix[index][index]),
        }
        for index in class_indices
    ]
    misclassified_examples = [
        {
            "localPath": path,
            "actualClass": CLASS_LABELS[actual],
            "predictedClass": CLASS_LABELS[predicted],
        }
        for path, actual, predicted in zip(
            test_metrics["paths"],
            test_metrics["targets"],
            test_metrics["predictions"],
        )
        if actual != predicted
    ]
    classes_document = {
        "modelVersion": MODEL_VERSION,
        "classes": [
            {"index": index, **class_details}
            for index, class_details in enumerate(SUPPORTED_CLASSES)
        ],
    }
    metadata = {
        "modelName": "MobileNetV2 leaf disease classifier",
        "modelVersion": MODEL_VERSION,
        "baseArchitecture": "MobileNetV2",
        "pretrainedWeights": "Torchvision MobileNet_V2_Weights.IMAGENET1K_V1",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "deviceUsed": str(device),
        "dataset": {
            "name": manifest["datasetName"],
            "source": manifest["source"],
            "datasetHub": manifest["datasetHub"],
            "license": manifest["license"],
            "sourceReportedImageCount": manifest["sourceReportedImageCount"],
            "officialSplitFileCount": manifest["officialSplitFileCount"],
            "selectedImageCount": manifest["selectedImageCount"],
            "leafGrouped": manifest["leafGrouped"],
            "selectionSeed": manifest["selectionSeed"],
            "availableSelectedClassDistribution": manifest[
                "availableSelectedClassDistribution"
            ],
            "selectedSplitDistribution": manifest["selectedSplitDistribution"],
        },
        "supportedClasses": classes_document["classes"],
        "classCount": len(CLASS_LABELS),
        "split": {
            "trainingImages": len(records_by_split["train"]),
            "validationImages": len(records_by_split["validation"]),
            "testImages": len(records_by_split["test"]),
            "testUsedForTraining": False,
        },
        "preprocessing": {
            "inputWidth": INPUT_SIZE,
            "inputHeight": INPUT_SIZE,
            "channels": "RGB",
            "evaluationResize": RESIZE_SIZE,
            "evaluationCrop": "center",
            "normalizationMean": IMAGENET_MEAN,
            "normalizationStd": IMAGENET_STD,
            "method": "ImageNet normalization after RGB conversion, resize, and center crop",
        },
        "augmentation": {
            "trainingOnly": True,
            "operations": [
                "RandomResizedCrop(scale=0.80..1.0)",
                "RandomHorizontalFlip(p=0.5)",
                "RandomRotation(10 degrees)",
                "ColorJitter(0.15 brightness/contrast/saturation)",
            ],
        },
        "training": {
            "randomSeed": RANDOM_SEED,
            "optimizer": "AdamW",
            "loss": "CrossEntropyLoss",
            "batchSize": args.batch_size,
            "headEpochs": args.head_epochs,
            "fineTuneEpochs": args.fine_tune_epochs,
            "headLearningRate": 0.001,
            "fineTuneLearningRate": 0.0001,
            "weightDecay": 0.0001,
            "initiallyFrozen": "All MobileNetV2 feature layers",
            "fineTuned": "Final two MobileNetV2 feature blocks plus classifier",
            "bestEpoch": best_epoch,
            "bestValidationAccuracy": best_validation_accuracy,
            "history": history,
        },
        "testEvaluation": {
            **metrics_without_predictions(test_metrics),
            "confusionMatrix": {
                "labels": CLASS_LABELS,
                "matrix": matrix.tolist(),
            },
            "perClass": per_class_metrics,
            "misclassifiedCount": len(misclassified_examples),
            "misclassifiedExamples": misclassified_examples,
        },
        "confidenceInterpretation": (
            "Confidence is the model softmax score for one supported output class, not "
            "overall model accuracy or guaranteed diagnostic correctness."
        ),
    }
    artifact = {
        "modelVersion": MODEL_VERSION,
        "architecture": "mobilenet_v2",
        "classLabels": CLASS_LABELS,
        "inputSize": INPUT_SIZE,
        "stateDict": best_state,
    }
    args.model_output.parent.mkdir(parents=True, exist_ok=True)
    args.classes_output.parent.mkdir(parents=True, exist_ok=True)
    args.metadata_output.parent.mkdir(parents=True, exist_ok=True)
    torch.save(artifact, args.model_output)
    args.classes_output.write_text(
        json.dumps(classes_document, indent=2) + "\n", encoding="utf-8"
    )
    args.metadata_output.write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "modelArtifact": str(args.model_output.resolve()),
        "classesArtifact": str(args.classes_output.resolve()),
        "metadataArtifact": str(args.metadata_output.resolve()),
        "bestEpoch": best_epoch,
        "testEvaluation": metadata["testEvaluation"],
    }


def main() -> None:
    args = parse_args()
    print(json.dumps(train(args), indent=2))


if __name__ == "__main__":
    main()
