from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DiseasePredictionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["ok"]
    model_version: str = Field(serialization_alias="modelVersion")
    predicted_class: str = Field(serialization_alias="predictedClass")
    crop: str
    condition: str
    is_healthy: bool = Field(serialization_alias="isHealthy")
    confidence: float = Field(ge=0, le=1)
    supported_class: bool = Field(serialization_alias="supportedClass")
    supported_class_count: int = Field(ge=1, serialization_alias="supportedClassCount")
    supported_crops: list[str] = Field(
        min_length=1, serialization_alias="supportedCrops"
    )
    guidance: str
