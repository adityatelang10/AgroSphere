import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from app.schemas.market_intelligence import (
    DataProvenance,
    EnteredCosts,
    ForecastStatus,
    HistoricalSummary,
    MarketAnalysisRequest,
    MarketAnalysisResponse,
    MarketSelection,
    MarketTrend,
    PriceObservation,
    ProfitAnalysis,
    SupportedSelection,
)


SERVICE_ROOT = Path(__file__).resolve().parents[2]
REQUIRED_COLUMNS = {
    "market_key",
    "commodity",
    "market",
    "district",
    "state",
    "variety",
    "observed_date",
    "minimum_price",
    "maximum_price",
    "modal_price",
    "unit",
    "source",
}
TREND_WINDOW_SIZE = 5
TREND_THRESHOLD_PERCENT = 3
HISTORY_RESPONSE_LIMIT = 12


class MarketDataUnavailableError(RuntimeError):
    """Raised when the curated historical market dataset cannot be loaded."""


class UnsupportedMarketSelectionError(ValueError):
    """Raised when a requested crop/market pair is outside market-v1 scope."""


class MarketAnalysisError(RuntimeError):
    """Raised when validated market inputs cannot be analyzed."""


def resolve_service_path(path: Path) -> Path:
    return path if path.is_absolute() else SERVICE_ROOT / path


def round_money(value: float) -> float:
    return round(value + 0.0, 2)


class MarketAnalyzerService:
    def __init__(self) -> None:
        self._records: dict[str, list[dict]] = {}
        self._metadata: dict | None = None
        self._load_error: Exception | None = None

    @property
    def available(self) -> bool:
        return bool(self._records and self._metadata)

    def load(self, data_path: Path, metadata_path: Path) -> None:
        resolved_data_path = resolve_service_path(data_path)
        resolved_metadata_path = resolve_service_path(metadata_path)

        try:
            if not resolved_data_path.is_file():
                raise FileNotFoundError(
                    f"Historical market dataset not found: {resolved_data_path}"
                )
            if not resolved_metadata_path.is_file():
                raise FileNotFoundError(
                    f"Market metadata not found: {resolved_metadata_path}"
                )

            metadata = json.loads(
                resolved_metadata_path.read_text(encoding="utf-8")
            )
            if metadata.get("analysisVersion") != "market-v1":
                raise ValueError("Unsupported market analysis metadata version.")
            if metadata.get("freshnessStatus") != "STALE_HISTORICAL":
                raise ValueError("Market metadata must declare historical freshness.")

            grouped: dict[str, list[dict]] = defaultdict(list)
            with resolved_data_path.open("r", encoding="utf-8", newline="") as csv_file:
                reader = csv.DictReader(csv_file)
                missing_columns = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
                if missing_columns:
                    raise ValueError(
                        f"Historical market dataset is missing columns: {sorted(missing_columns)}"
                    )

                for row_number, row in enumerate(reader, start=2):
                    observed_date = date.fromisoformat(row["observed_date"])
                    minimum_price = float(row["minimum_price"])
                    maximum_price = float(row["maximum_price"])
                    modal_price = float(row["modal_price"])
                    if not 0 < minimum_price <= modal_price <= maximum_price:
                        raise ValueError(
                            f"Invalid market price ordering on CSV row {row_number}."
                        )
                    if row["unit"] != "INR/quintal":
                        raise ValueError(
                            f"Unsupported market price unit on CSV row {row_number}."
                        )

                    grouped[row["market_key"]].append(
                        {
                            "market_key": row["market_key"],
                            "commodity": row["commodity"],
                            "market": row["market"],
                            "district": row["district"],
                            "state": row["state"],
                            "variety": row["variety"],
                            "observed_date": observed_date,
                            "minimum_price": minimum_price,
                            "maximum_price": maximum_price,
                            "modal_price": modal_price,
                            "unit": row["unit"],
                            "source": row["source"],
                        }
                    )

            if not grouped:
                raise ValueError("Historical market dataset contains no observations.")

            expected_counts = {
                item["marketKey"]: int(item["preparedRows"])
                for item in metadata.get("supportedSelections", [])
            }
            if set(grouped) != set(expected_counts):
                raise ValueError("Market CSV selections do not match metadata.")

            for market_key, records in grouped.items():
                records.sort(key=lambda record: record["observed_date"])
                if len(records) != expected_counts[market_key]:
                    raise ValueError(
                        f"Market row count does not match metadata for {market_key}."
                    )
                if len(records) < TREND_WINDOW_SIZE * 2:
                    raise ValueError(
                        f"Insufficient trend observations for {market_key}."
                    )
                dates = [record["observed_date"] for record in records]
                if len(dates) != len(set(dates)):
                    raise ValueError(f"Duplicate market dates found for {market_key}.")

            self._records = dict(grouped)
            self._metadata = metadata
            self._load_error = None
        except Exception as error:
            self._records = {}
            self._metadata = None
            self._load_error = error
            raise MarketDataUnavailableError(str(error)) from error

    def _require_data(self) -> tuple[dict[str, list[dict]], dict]:
        if not self.available:
            detail = (
                str(self._load_error)
                if self._load_error
                else "Historical market data has not been loaded."
            )
            raise MarketDataUnavailableError(detail)
        return self._records, self._metadata

    def supported_selections(self) -> list[SupportedSelection]:
        records_by_key, metadata = self._require_data()
        selections = []
        for item in metadata["supportedSelections"]:
            records = records_by_key[item["marketKey"]]
            selections.append(
                SupportedSelection(
                    market_key=item["marketKey"],
                    crop=item["commodity"].lower(),
                    market=item["market"],
                    district=item["district"],
                    state=item["state"],
                    variety=item["variety"],
                    date_from=records[0]["observed_date"],
                    date_through=records[-1]["observed_date"],
                    observation_count=len(records),
                )
            )
        return selections

    def analyze(self, payload: MarketAnalysisRequest) -> MarketAnalysisResponse:
        records_by_key, metadata = self._require_data()
        records = records_by_key.get(payload.market_key)
        if not records:
            raise UnsupportedMarketSelectionError(
                "This crop and market combination is not supported by market-v1."
            )

        actual_crop = records[0]["commodity"].lower()
        if payload.crop.lower() != actual_crop:
            raise UnsupportedMarketSelectionError(
                "The selected market does not support the requested crop."
            )

        try:
            previous_window = records[-(TREND_WINDOW_SIZE * 2) : -TREND_WINDOW_SIZE]
            recent_window = records[-TREND_WINDOW_SIZE:]
            previous_average = sum(
                record["modal_price"] for record in previous_window
            ) / TREND_WINDOW_SIZE
            recent_average = sum(
                record["modal_price"] for record in recent_window
            ) / TREND_WINDOW_SIZE
            percentage_change = (
                (recent_average - previous_average) / previous_average * 100
            )
            if percentage_change > TREND_THRESHOLD_PERCENT:
                direction = "Rising"
            elif percentage_change < -TREND_THRESHOLD_PERCENT:
                direction = "Falling"
            else:
                direction = "Stable"

            transport_cost = payload.transport_cost
            storage_cost = payload.storage_cost
            other_cost = payload.other_cost
            gross_sale_value = (
                payload.quantity_quintals * payload.expected_sale_price
            )
            total_costs = transport_cost + storage_cost + other_cost
            estimated_net_return = gross_sale_value - total_costs
            latest = records[-1]
            history_records = records[-HISTORY_RESPONSE_LIMIT:]
            archive_retrieved_on = date.fromisoformat(
                metadata["publicArchiveRetrievedOn"]
            )

            return MarketAnalysisResponse(
                status="ok",
                analysis_version="market-v1",
                selection=MarketSelection(
                    market_key=latest["market_key"],
                    crop=actual_crop,
                    commodity=latest["commodity"],
                    market=latest["market"],
                    district=latest["district"],
                    state=latest["state"],
                    variety=latest["variety"],
                    unit=latest["unit"],
                ),
                reference_price=PriceObservation(
                    observed_date=latest["observed_date"],
                    minimum_price=latest["minimum_price"],
                    maximum_price=latest["maximum_price"],
                    modal_price=latest["modal_price"],
                ),
                historical_summary=HistoricalSummary(
                    observation_count=len(records),
                    date_from=records[0]["observed_date"],
                    date_through=records[-1]["observed_date"],
                    returned_observations=len(history_records),
                ),
                trend=MarketTrend(
                    direction=direction,
                    percentage_change=round(percentage_change, 2),
                    recent_average=round_money(recent_average),
                    previous_average=round_money(previous_average),
                    observations_per_window=TREND_WINDOW_SIZE,
                    rule=(
                        "Compare the average modal price of the latest 5 observations "
                        "with the previous 5: above +3% is Rising, below -3% is "
                        "Falling, otherwise Stable."
                    ),
                ),
                history=[
                    PriceObservation(
                        observed_date=record["observed_date"],
                        minimum_price=record["minimum_price"],
                        maximum_price=record["maximum_price"],
                        modal_price=record["modal_price"],
                    )
                    for record in history_records
                ],
                forecast=ForecastStatus(
                    available=False,
                    status="UNAVAILABLE",
                    reason=(
                        "The supported data is a short, historical 2021 window with "
                        "irregular observations, so market-v1 does not produce a "
                        "defensible current or future price forecast."
                    ),
                ),
                profit_analysis=ProfitAnalysis(
                    status="MANUAL_SCENARIO",
                    quantity_quintals=payload.quantity_quintals,
                    expected_sale_price=payload.expected_sale_price,
                    gross_sale_value=round_money(gross_sale_value),
                    entered_costs=EnteredCosts(
                        transport_cost=transport_cost,
                        storage_cost=storage_cost,
                        other_cost=other_cost,
                    ),
                    total_entered_costs=round_money(total_costs),
                    estimated_net_return=round_money(estimated_net_return),
                    formula=(
                        "quantityQuintals × expectedSalePrice − transportCost − "
                        "storageCost − otherCost"
                    ),
                    includes_cultivation_cost=False,
                ),
                data_provenance=DataProvenance(
                    status="HISTORICAL",
                    freshness_status="STALE_HISTORICAL",
                    data_age_days=(date.today() - latest["observed_date"]).days,
                    source=metadata["officialSource"],
                    source_type=metadata["sourceType"],
                    official_catalog_url=metadata["officialCatalogUrl"],
                    public_archive_url=metadata["publicArchiveUrl"],
                    archive_retrieved_on=archive_retrieved_on,
                    price_type="Modal price",
                    unit=metadata["unit"],
                    license_note=metadata["license"],
                ),
                supported_selections=self.supported_selections(),
                disclaimer=(
                    "Historical mandi observations and manual arithmetic are decision "
                    "support only. Actual sale values can differ by quality, timing, "
                    "buyer negotiation, fees, logistics, and market conditions. The "
                    "estimated net return includes only the costs entered here."
                ),
            )
        except (MarketDataUnavailableError, UnsupportedMarketSelectionError):
            raise
        except Exception as error:
            raise MarketAnalysisError(str(error)) from error


market_analyzer_service = MarketAnalyzerService()
