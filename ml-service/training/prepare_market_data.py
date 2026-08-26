"""Prepare the small, documented AGMARKNET subset used by market-v1.

The input CSV is the public historical archive documented in
data/market_intelligence/README.md. The raw archive is deliberately not stored in
the repository because it contains more than 900,000 rows; this script makes the
selection and cleaning steps reproducible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    SERVICE_ROOT / "data" / "market_intelligence" / "agmarknet_historical.csv"
)
DEFAULT_METADATA_OUTPUT = (
    SERVICE_ROOT / "data" / "market_intelligence" / "market_data_metadata.json"
)

OFFICIAL_CATALOG_URL = (
    "https://www.data.gov.in/catalog/"
    "current-daily-price-various-commodities-various-markets-mandi"
)
PUBLIC_ARCHIVE_URL = (
    "https://github.com/vardhaman-rp/"
    "AGMARKNET_Commodity_price_ETL_POSTGRES/blob/main/Data.zip"
)

REQUIRED_COLUMNS = {
    "timestamp",
    "state",
    "district",
    "market",
    "commodity",
    "variety",
    "arrival_date",
    "min_price",
    "max_price",
    "modal_price",
}

SELECTIONS = (
    {
        "marketKey": "tomato-pune-local",
        "commodity": "Tomato",
        "state": "Maharashtra",
        "district": "Pune",
        "market": "Pune",
        "variety": "Local",
    },
    {
        "marketKey": "maize-pune-deshi-red",
        "commodity": "Maize",
        "state": "Maharashtra",
        "district": "Pune",
        "market": "Pune",
        "variety": "Deshi Red",
    },
    {
        "marketKey": "groundnut-laxmeshwar-balli-habbu",
        "commodity": "Groundnut",
        "state": "Karnataka",
        "district": "Gadag",
        "market": "Laxmeshwar",
        "variety": "Balli/Habbu",
    },
)


def parse_arrival_dates(values: pd.Series) -> pd.Series:
    """Parse the two date formats present in this historical archive.

    Earlier API snapshots use MM/DD/YY H:MM. Later records use DD/MM/YY.
    Parsing them separately prevents ambiguous day/month interpretation.
    """

    normalized = values.astype("string").str.strip()
    has_time = normalized.str.contains(r"\s", na=False)
    parsed = pd.Series(pd.NaT, index=values.index, dtype="datetime64[ns]")
    parsed.loc[has_time] = pd.to_datetime(
        normalized.loc[has_time],
        format="%m/%d/%y %H:%M",
        errors="coerce",
    )
    parsed.loc[~has_time] = pd.to_datetime(
        normalized.loc[~has_time],
        format="%d/%m/%y",
        errors="coerce",
    )
    return parsed


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare(raw_csv_path: Path, output_path: Path, metadata_path: Path) -> None:
    if not raw_csv_path.is_file():
        raise FileNotFoundError(f"Raw market CSV not found: {raw_csv_path}")

    raw = pd.read_csv(raw_csv_path, low_memory=False)
    missing_columns = sorted(REQUIRED_COLUMNS.difference(raw.columns))
    if missing_columns:
        raise ValueError(f"Raw market CSV is missing columns: {missing_columns}")

    raw["parsed_date"] = parse_arrival_dates(raw["arrival_date"])
    for column in ("min_price", "max_price", "modal_price"):
        raw[column] = pd.to_numeric(raw[column], errors="coerce")

    prepared_frames: list[pd.DataFrame] = []
    selection_stats: list[dict] = []

    for selection in SELECTIONS:
        selected = raw[
            (raw["commodity"] == selection["commodity"])
            & (raw["state"] == selection["state"])
            & (raw["district"] == selection["district"])
            & (raw["market"] == selection["market"])
            & (raw["variety"] == selection["variety"])
        ].copy()

        raw_selected_count = len(selected)
        invalid_date_count = int(selected["parsed_date"].isna().sum())
        invalid_numeric_count = int(
            selected[["min_price", "max_price", "modal_price"]]
            .isna()
            .any(axis=1)
            .sum()
        )

        selected = selected.dropna(
            subset=["parsed_date", "min_price", "max_price", "modal_price"]
        )
        nonpositive_mask = (
            selected[["min_price", "max_price", "modal_price"]] <= 0
        ).any(axis=1)
        nonpositive_count = int(nonpositive_mask.sum())
        selected = selected.loc[~nonpositive_mask]

        invalid_order_mask = (selected["min_price"] > selected["modal_price"]) | (
            selected["modal_price"] > selected["max_price"]
        )
        invalid_order_count = int(invalid_order_mask.sum())
        selected = selected.loc[~invalid_order_mask]

        valid_before_deduplication = len(selected)
        deduplication_columns = [
            "state",
            "district",
            "market",
            "commodity",
            "variety",
            "parsed_date",
            "min_price",
            "max_price",
            "modal_price",
        ]
        selected = (
            selected.sort_values(["parsed_date", "timestamp"])
            .drop_duplicates(subset=deduplication_columns, keep="last")
            .sort_values("parsed_date")
        )

        if selected["parsed_date"].duplicated().any():
            raise ValueError(
                f"{selection['marketKey']} has conflicting records for one date."
            )

        prepared = pd.DataFrame(
            {
                "market_key": selection["marketKey"],
                "commodity": selection["commodity"],
                "market": selection["market"],
                "district": selection["district"],
                "state": selection["state"],
                "variety": selection["variety"],
                "observed_date": selected["parsed_date"].dt.strftime("%Y-%m-%d"),
                "minimum_price": selected["min_price"],
                "maximum_price": selected["max_price"],
                "modal_price": selected["modal_price"],
                "unit": "INR/quintal",
                "source": "AGMARKNET / Directorate of Marketing and Inspection",
            }
        )
        prepared_frames.append(prepared)
        selection_stats.append(
            {
                **selection,
                "rawSelectedRows": raw_selected_count,
                "invalidDateRowsRemoved": invalid_date_count,
                "invalidNumericRowsRemoved": invalid_numeric_count,
                "nonpositivePriceRowsRemoved": nonpositive_count,
                "invalidPriceOrderRowsRemoved": invalid_order_count,
                "duplicateRowsRemoved": valid_before_deduplication - len(prepared),
                "preparedRows": len(prepared),
                "dateFrom": prepared["observed_date"].min(),
                "dateThrough": prepared["observed_date"].max(),
            }
        )

    curated = pd.concat(prepared_frames, ignore_index=True).sort_values(
        ["market_key", "observed_date"]
    )
    if curated.empty:
        raise ValueError("No usable records were selected.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    curated.to_csv(output_path, index=False, lineterminator="\n")

    metadata = {
        "datasetVersion": "market-data-v1",
        "analysisVersion": "market-v1",
        "datasetName": "Curated historical AGMARKNET mandi price observations",
        "sourceType": "Public historical archive of AGMARKNET-origin records",
        "officialSource": "AGMARKNET / Directorate of Marketing and Inspection",
        "officialCatalogUrl": OFFICIAL_CATALOG_URL,
        "publicArchiveUrl": PUBLIC_ARCHIVE_URL,
        "publicArchiveRetrievedOn": "2026-08-25",
        "rawSourceSha256": file_sha256(raw_csv_path),
        "license": (
            "Underlying Government of India data is published under the Government "
            "Open Data License - India (OGDL). The public archive repository does not "
            "publish a separate license."
        ),
        "unit": "INR/quintal",
        "priceFields": ["minimum_price", "maximum_price", "modal_price"],
        "primaryReferencePrice": "modal_price",
        "rawColumns": list(raw.columns.drop("parsed_date")),
        "rawArchiveRows": len(raw),
        "rawSelectedRows": sum(item["rawSelectedRows"] for item in selection_stats),
        "preparedRows": len(curated),
        "dateFrom": curated["observed_date"].min(),
        "dateThrough": curated["observed_date"].max(),
        "freshnessStatus": "STALE_HISTORICAL",
        "dateParsing": {
            "withTime": "MM/DD/YY H:MM",
            "withoutTime": "DD/MM/YY",
        },
        "cleaning": {
            "requiredColumnsValidated": True,
            "numericFieldsValidated": [
                "min_price",
                "max_price",
                "modal_price",
            ],
            "priceRule": "0 < minimum_price <= modal_price <= maximum_price",
            "exactDuplicatesRemoved": sum(
                item["duplicateRowsRemoved"] for item in selection_stats
            ),
            "invalidDateRowsRemoved": sum(
                item["invalidDateRowsRemoved"] for item in selection_stats
            ),
            "invalidNumericRowsRemoved": sum(
                item["invalidNumericRowsRemoved"] for item in selection_stats
            ),
            "nonpositivePriceRowsRemoved": sum(
                item["nonpositivePriceRowsRemoved"] for item in selection_stats
            ),
            "invalidPriceOrderRowsRemoved": sum(
                item["invalidPriceOrderRowsRemoved"] for item in selection_stats
            ),
        },
        "supportedSelections": selection_stats,
        "limitations": [
            "The observations are historical and end on 2021-06-30; they are not current mandi quotes.",
            "Only three exact commodity-market-variety combinations are supported.",
            "The archive contains irregular trading-day observations rather than a continuous daily series.",
            "The source archive is a public mirror of AGMARKNET-origin records because the official APIs were inaccessible during implementation.",
            "These observations do not include buyer-specific quality premiums, negotiation, fees, or logistics.",
        ],
    }
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        f"Prepared {len(curated)} observations from {len(raw)} raw rows "
        f"into {output_path}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-path",
        type=Path,
        required=True,
        help="Path to the extracted historical Data/data.csv file.",
    )
    parser.add_argument("--output-path", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--metadata-output-path",
        type=Path,
        default=DEFAULT_METADATA_OUTPUT,
    )
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    prepare(
        arguments.source_path.resolve(),
        arguments.output_path.resolve(),
        arguments.metadata_output_path.resolve(),
    )
