from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CropName = Literal["tomato", "maize", "cotton", "groundnut"]
GrowthStage = Literal["initial", "development", "mid_season", "late_season"]
SoilType = Literal["loamy_sand", "silt", "silty_clay"]
WaterStress = Literal["Low", "Medium", "High"]
SoilMoistureStatus = Literal["Low", "Moderate", "Adequate", "High"]


class IrrigationPredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    crop: CropName
    growth_stage: GrowthStage = Field(alias="growthStage")
    soil_type: SoilType = Field(alias="soilType")
    soil_moisture: float = Field(ge=0, le=100, alias="soilMoisture")
    minimum_temperature: float = Field(ge=-20, le=55, alias="minimumTemperature")
    maximum_temperature: float = Field(ge=-15, le=60, alias="maximumTemperature")
    latitude: float = Field(ge=-55, le=55)
    observation_date: date = Field(alias="observationDate")
    recent_rainfall: float = Field(ge=0, le=300, alias="recentRainfall")
    forecast_rainfall: float = Field(ge=0, le=300, alias="forecastRainfall")
    days_since_last_irrigation: int = Field(
        ge=0, le=60, alias="daysSinceLastIrrigation"
    )

    @model_validator(mode="after")
    def validate_temperature_range(self):
        if self.maximum_temperature <= self.minimum_temperature:
            raise ValueError("maximumTemperature must be greater than minimumTemperature")
        return self


class IrrigationPredictionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["ok"]
    engine_version: str = Field(serialization_alias="engineVersion")
    method: str
    irrigation_required: bool = Field(serialization_alias="irrigationRequired")
    decision_code: str = Field(serialization_alias="decisionCode")
    recommended_timing: str = Field(serialization_alias="recommendedTiming")
    water_stress: WaterStress = Field(serialization_alias="waterStress")
    soil_moisture_status: SoilMoistureStatus = Field(
        serialization_alias="soilMoistureStatus"
    )
    reference_et: float = Field(ge=0, serialization_alias="referenceET")
    crop_coefficient: float = Field(gt=0, serialization_alias="cropCoefficient")
    crop_water_requirement: float = Field(
        ge=0, serialization_alias="cropWaterRequirement"
    )
    effective_recent_rainfall: float = Field(
        ge=0, serialization_alias="effectiveRecentRainfall"
    )
    effective_forecast_rainfall: float = Field(
        ge=0, serialization_alias="effectiveForecastRainfall"
    )
    estimated_irrigation_need: float = Field(
        ge=0, serialization_alias="estimatedIrrigationNeed"
    )
    depletion_fraction: float = Field(
        ge=0, le=1, serialization_alias="depletionFraction"
    )
    allowable_depletion_fraction: float = Field(
        ge=0, le=1, serialization_alias="allowableDepletionFraction"
    )
    reasons: list[str] = Field(min_length=1, max_length=8)
    assumptions: list[str] = Field(min_length=1, max_length=8)
    warnings: list[str] = Field(default_factory=list, max_length=8)
    units: dict[str, str]
    supported_crops: list[str] = Field(
        min_length=1, serialization_alias="supportedCrops"
    )
    supported_stages: list[str] = Field(
        min_length=1, serialization_alias="supportedStages"
    )
