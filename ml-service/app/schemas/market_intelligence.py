from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MarketAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    crop: str = Field(min_length=2, max_length=40)
    market_key: str = Field(alias="marketKey", min_length=3, max_length=100)
    quantity_quintals: float = Field(gt=0, le=1_000_000, alias="quantityQuintals")
    expected_sale_price: float = Field(
        gt=0,
        le=100_000_000,
        alias="expectedSalePrice",
    )
    transport_cost: float = Field(
        default=0,
        ge=0,
        le=100_000_000,
        alias="transportCost",
    )
    storage_cost: float = Field(
        default=0,
        ge=0,
        le=100_000_000,
        alias="storageCost",
    )
    other_cost: float = Field(
        default=0,
        ge=0,
        le=100_000_000,
        alias="otherCost",
    )


class MarketSelection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    market_key: str = Field(serialization_alias="marketKey")
    crop: str
    commodity: str
    market: str
    district: str
    state: str
    variety: str
    unit: Literal["INR/quintal"]


class PriceObservation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    observed_date: date = Field(serialization_alias="observedDate")
    minimum_price: float = Field(gt=0, serialization_alias="minimumPrice")
    maximum_price: float = Field(gt=0, serialization_alias="maximumPrice")
    modal_price: float = Field(gt=0, serialization_alias="modalPrice")


class HistoricalSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    observation_count: int = Field(gt=0, serialization_alias="observationCount")
    date_from: date = Field(serialization_alias="dateFrom")
    date_through: date = Field(serialization_alias="dateThrough")
    returned_observations: int = Field(gt=0, serialization_alias="returnedObservations")


class MarketTrend(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    direction: Literal["Rising", "Stable", "Falling"]
    percentage_change: float = Field(serialization_alias="percentageChange")
    recent_average: float = Field(gt=0, serialization_alias="recentAverage")
    previous_average: float = Field(gt=0, serialization_alias="previousAverage")
    observations_per_window: int = Field(
        gt=0,
        serialization_alias="observationsPerWindow",
    )
    rule: str


class ForecastStatus(BaseModel):
    available: Literal[False]
    status: Literal["UNAVAILABLE"]
    reason: str


class EnteredCosts(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    transport_cost: float = Field(ge=0, serialization_alias="transportCost")
    storage_cost: float = Field(ge=0, serialization_alias="storageCost")
    other_cost: float = Field(ge=0, serialization_alias="otherCost")


class ProfitAnalysis(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["MANUAL_SCENARIO"]
    quantity_quintals: float = Field(gt=0, serialization_alias="quantityQuintals")
    expected_sale_price: float = Field(gt=0, serialization_alias="expectedSalePrice")
    gross_sale_value: float = Field(serialization_alias="grossSaleValue")
    entered_costs: EnteredCosts = Field(serialization_alias="enteredCosts")
    total_entered_costs: float = Field(ge=0, serialization_alias="totalEnteredCosts")
    estimated_net_return: float = Field(serialization_alias="estimatedNetReturn")
    formula: str
    includes_cultivation_cost: Literal[False] = Field(
        serialization_alias="includesCultivationCost"
    )


class DataProvenance(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["HISTORICAL"]
    freshness_status: Literal["STALE_HISTORICAL"] = Field(
        serialization_alias="freshnessStatus"
    )
    data_age_days: int = Field(ge=0, serialization_alias="dataAgeDays")
    source: str
    source_type: str = Field(serialization_alias="sourceType")
    official_catalog_url: str = Field(serialization_alias="officialCatalogUrl")
    public_archive_url: str = Field(serialization_alias="publicArchiveUrl")
    archive_retrieved_on: date = Field(serialization_alias="archiveRetrievedOn")
    price_type: Literal["Modal price"] = Field(serialization_alias="priceType")
    unit: Literal["INR/quintal"]
    license_note: str = Field(serialization_alias="licenseNote")


class SupportedSelection(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    market_key: str = Field(serialization_alias="marketKey")
    crop: str
    market: str
    district: str
    state: str
    variety: str
    date_from: date = Field(serialization_alias="dateFrom")
    date_through: date = Field(serialization_alias="dateThrough")
    observation_count: int = Field(gt=0, serialization_alias="observationCount")


class MarketAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["ok"]
    analysis_version: Literal["market-v1"] = Field(
        serialization_alias="analysisVersion"
    )
    selection: MarketSelection
    reference_price: PriceObservation = Field(serialization_alias="referencePrice")
    historical_summary: HistoricalSummary = Field(
        serialization_alias="historicalSummary"
    )
    trend: MarketTrend
    history: list[PriceObservation] = Field(min_length=1, max_length=20)
    forecast: ForecastStatus
    profit_analysis: ProfitAnalysis = Field(serialization_alias="profitAnalysis")
    data_provenance: DataProvenance = Field(serialization_alias="dataProvenance")
    supported_selections: list[SupportedSelection] = Field(
        min_length=1,
        serialization_alias="supportedSelections",
    )
    disclaimer: str
