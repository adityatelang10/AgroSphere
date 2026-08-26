from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CropPredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nitrogen: float = Field(strict=True, ge=0, le=300)
    phosphorus: float = Field(strict=True, ge=0, le=300)
    potassium: float = Field(strict=True, ge=0, le=300)
    temperature: float = Field(strict=True, ge=-10, le=60)
    humidity: float = Field(strict=True, ge=0, le=100)
    ph: float = Field(strict=True, ge=0, le=14)
    rainfall: float = Field(strict=True, ge=0, le=5000)


class CropRecommendationItem(BaseModel):
    crop: str
    score: float = Field(ge=0, le=1)


class CropPredictionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["ok"]
    model_version: str = Field(serialization_alias="modelVersion")
    recommended_crop: str = Field(serialization_alias="recommendedCrop")
    recommendations: list[CropRecommendationItem] = Field(min_length=1, max_length=3)
    warnings: list[str] = Field(default_factory=list, max_length=7)
