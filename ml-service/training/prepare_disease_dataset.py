import argparse
import hashlib
import json
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path, PurePosixPath
from urllib.parse import quote
from urllib.request import Request, urlopen

from PIL import Image, UnidentifiedImageError

from training.disease_config import (
    CLASS_LABELS,
    RANDOM_SEED,
    TEST_IMAGES_PER_CLASS,
    TRAIN_IMAGES_PER_CLASS,
    VALIDATION_IMAGES_PER_CLASS,
)

DATASET_NAME = "PlantVillage Dataset (original RGB/color images)"
DATASET_SOURCE = "https://github.com/spMohanty/PlantVillage-Dataset"
DATASET_HUB = "https://huggingface.co/datasets/mohanty/PlantVillage"
DATASET_LICENSE = "CC BY-SA 3.0"
SOURCE_REPORTED_IMAGE_COUNT = 54_306
SPLIT_BASE_URL = f"{DATASET_HUB}/resolve/main"
TRAIN_SPLIT_URL = f"{SPLIT_BASE_URL}/splits/color_train.txt"
TEST_SPLIT_URL = f"{SPLIT_BASE_URL}/splits/color_test.txt"
LEAF_MAP_URL = f"{SPLIT_BASE_URL}/leaf_grouping/leaf-map.json"
RAW_IMAGE_BASE_URL = (
    "https://raw.githubusercontent.com/spMohanty/PlantVillage-Dataset/master"
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_ROOT = SERVICE_ROOT / "data" / "plant_disease"
USER_AGENT = "AgroSphere-Disease-Dataset-Preparation/1.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare the deterministic AgroSphere PlantVillage disease subset."
    )
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--workers", type=int, default=12)
    return parser.parse_args()


def fetch_bytes(url: str, attempts: int = 4) -> bytes:
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=90) as response:
                return response.read()
        except Exception as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt)

    raise RuntimeError(f"Failed to download {url}: {last_error}") from last_error


def fetch_lines(url: str) -> list[str]:
    return [
        line.strip()
        for line in fetch_bytes(url).decode("utf-8").splitlines()
        if line.strip()
    ]


def class_from_path(source_path: str) -> str:
    parts = PurePosixPath(source_path).parts
    if len(parts) < 4 or parts[0:2] != ("raw", "color"):
        raise ValueError(f"Unexpected PlantVillage path: {source_path}")
    return parts[2]


def leaf_group_for_path(source_path: str, leaf_map: dict[str, list[str]]) -> str:
    class_label = class_from_path(source_path)
    filename = PurePosixPath(source_path).name
    identifier = filename.replace("_final_masked", "")

    if "___" in identifier:
        identifier = identifier.split("___")[-1]

    identifier = identifier.split("copy")[0]
    identifier = Path(identifier).stem.strip()
    suggestions = leaf_map.get(identifier.lower(), [])

    if len(suggestions) == 1:
        return suggestions[0]

    for suggestion in suggestions:
        if class_label in suggestion:
            return suggestion

    return f"fallback:{class_label}:{identifier.lower()}"


def group_by_class(paths: list[str]) -> dict[str, list[str]]:
    grouped = {label: [] for label in CLASS_LABELS}

    for source_path in paths:
        label = class_from_path(source_path)
        if label in grouped:
            grouped[label].append(source_path)

    return grouped


def choose_records(
    train_paths: list[str],
    test_paths: list[str],
    leaf_map: dict[str, list[str]],
) -> tuple[list[dict], dict[str, dict[str, int]]]:
    train_by_class = group_by_class(train_paths)
    test_by_class = group_by_class(test_paths)
    records = []
    available_distribution = {}

    for class_index, class_label in enumerate(CLASS_LABELS):
        class_seed = RANDOM_SEED + class_index * 1_003
        rng = random.Random(class_seed)
        class_train_paths = sorted(train_by_class[class_label])
        class_test_paths = sorted(test_by_class[class_label])
        available_distribution[class_label] = {
            "officialTrain": len(class_train_paths),
            "officialTest": len(class_test_paths),
            "total": len(class_train_paths) + len(class_test_paths),
        }

        leaf_groups: dict[str, list[str]] = {}
        for source_path in class_train_paths:
            leaf_group = leaf_group_for_path(source_path, leaf_map)
            leaf_groups.setdefault(leaf_group, []).append(source_path)

        group_ids = sorted(leaf_groups)
        rng.shuffle(group_ids)
        validation_group_ids = []
        validation_candidates = []

        for group_id in group_ids:
            if len(validation_candidates) >= VALIDATION_IMAGES_PER_CLASS:
                break
            validation_group_ids.append(group_id)
            group_paths = sorted(leaf_groups[group_id])
            rng.shuffle(group_paths)
            validation_candidates.extend(group_paths)

        validation_group_set = set(validation_group_ids)
        validation_selection = validation_candidates[:VALIDATION_IMAGES_PER_CLASS]
        training_candidates = [
            source_path
            for group_id, group_paths in leaf_groups.items()
            if group_id not in validation_group_set
            for source_path in group_paths
        ]
        rng.shuffle(training_candidates)
        rng.shuffle(class_test_paths)
        training_selection = training_candidates[:TRAIN_IMAGES_PER_CLASS]
        test_selection = class_test_paths[:TEST_IMAGES_PER_CLASS]

        required_counts = {
            "train": (training_selection, TRAIN_IMAGES_PER_CLASS),
            "validation": (validation_selection, VALIDATION_IMAGES_PER_CLASS),
            "test": (test_selection, TEST_IMAGES_PER_CLASS),
        }

        for split_name, (selection, required_count) in required_counts.items():
            if len(selection) != required_count:
                raise ValueError(
                    f"{class_label} has only {len(selection)} usable {split_name} images; "
                    f"{required_count} are required."
                )

            for source_path in selection:
                records.append(
                    {
                        "split": split_name,
                        "classLabel": class_label,
                        "classIndex": class_index,
                        "sourcePath": source_path,
                        "leafGroup": leaf_group_for_path(source_path, leaf_map),
                    }
                )

    return records, available_distribution


def validate_image_bytes(data: bytes, source_path: str) -> tuple[str, int, int]:
    try:
        with Image.open(BytesIO(data)) as image:
            image.load()
            image_format = image.format
            width, height = image.size
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError(f"Downloaded file is not a decodable image: {source_path}") from error

    if image_format not in {"JPEG", "PNG"}:
        raise ValueError(f"Unexpected image format {image_format}: {source_path}")

    if width <= 0 or height <= 0:
        raise ValueError(f"Image has invalid dimensions: {source_path}")

    return image_format, width, height


def download_record(record: dict, output_root: Path) -> dict:
    encoded_path = quote(record["sourcePath"], safe="/(),_-.")
    url = f"{RAW_IMAGE_BASE_URL}/{encoded_path}"
    destination = (
        output_root
        / record["split"]
        / record["classLabel"]
        / PurePosixPath(record["sourcePath"]).name
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    data = destination.read_bytes() if destination.is_file() else fetch_bytes(url)
    image_format, width, height = validate_image_bytes(data, record["sourcePath"])

    if not destination.is_file():
        destination.write_bytes(data)

    return {
        **record,
        "localPath": destination.relative_to(output_root).as_posix(),
        "sourceUrl": url,
        "sha256": hashlib.sha256(data).hexdigest().upper(),
        "bytes": len(data),
        "format": image_format,
        "width": width,
        "height": height,
    }


def ensure_no_cross_split_duplicates(records: list[dict]) -> None:
    hashes: dict[str, dict] = {}

    for record in records:
        previous = hashes.get(record["sha256"])
        if previous and previous["split"] != record["split"]:
            raise ValueError(
                "Exact duplicate image appears across splits: "
                f"{previous['localPath']} and {record['localPath']}"
            )
        hashes[record["sha256"]] = record


def main() -> None:
    args = parse_args()
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    train_paths = fetch_lines(TRAIN_SPLIT_URL)
    test_paths = fetch_lines(TEST_SPLIT_URL)
    leaf_map = json.loads(fetch_bytes(LEAF_MAP_URL).decode("utf-8"))
    selected_records, available_distribution = choose_records(
        train_paths=train_paths,
        test_paths=test_paths,
        leaf_map=leaf_map,
    )

    completed_records = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        future_map = {
            executor.submit(download_record, record, output_root): record
            for record in selected_records
        }

        for completed_count, future in enumerate(as_completed(future_map), start=1):
            completed_records.append(future.result())
            if completed_count % 100 == 0 or completed_count == len(selected_records):
                print(f"Downloaded and validated {completed_count}/{len(selected_records)} images")

    completed_records.sort(
        key=lambda item: (item["split"], item["classIndex"], item["localPath"])
    )
    ensure_no_cross_split_duplicates(completed_records)
    split_distribution = {
        split_name: {
            class_label: sum(
                1
                for record in completed_records
                if record["split"] == split_name and record["classLabel"] == class_label
            )
            for class_label in CLASS_LABELS
        }
        for split_name in ("train", "validation", "test")
    }
    manifest = {
        "datasetName": DATASET_NAME,
        "source": DATASET_SOURCE,
        "datasetHub": DATASET_HUB,
        "license": DATASET_LICENSE,
        "sourceReportedImageCount": SOURCE_REPORTED_IMAGE_COUNT,
        "officialSplitFileCount": len(train_paths) + len(test_paths),
        "officialTrainFileCount": len(train_paths),
        "officialTestFileCount": len(test_paths),
        "selectionSeed": RANDOM_SEED,
        "leafGrouped": True,
        "selectedImageCount": len(completed_records),
        "supportedClasses": CLASS_LABELS,
        "availableSelectedClassDistribution": available_distribution,
        "selectedSplitDistribution": split_distribution,
        "records": completed_records,
    }
    manifest_path = output_root / "dataset_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in manifest.items() if key != "records"}, indent=2))
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
