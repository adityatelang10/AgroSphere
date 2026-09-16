from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class DiseasePredictionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["CLASSIFIED", "UNSUPPORTED_IMAGE"]
    model_version: str = Field(serialization_alias="modelVersion")
    guard_version: str = Field(serialization_alias="guardVersion")
    predicted_class: str | None = Field(serialization_alias="predictedClass")
    crop: str | None
    condition: str | None
    is_healthy: bool | None = Field(serialization_alias="isHealthy")
    confidence: float | None = Field(ge=0, le=1, allow_inf_nan=False)
    supported_class: bool = Field(serialization_alias="supportedClass")
    supported_class_count: int = Field(ge=1, serialization_alias="supportedClassCount")
    supported_crops: list[str] = Field(
        min_length=1, serialization_alias="supportedCrops"
    )
    guidance: str | None
    message: str | None = None

    @model_validator(mode="after")
    def validate_analysis_status(self):
        diagnosis = (self.predicted_class, self.crop, self.condition, self.is_healthy, self.confidence, self.guidance)
        if self.status == "UNSUPPORTED_IMAGE":
            if any(value is not None for value in diagnosis) or self.supported_class or not self.message:
                raise ValueError("An unsupported image must not contain a diagnosis or treatment guidance.")
        elif any(value is None for value in diagnosis) or not self.supported_class:
            raise ValueError("A classified image must contain the complete disease result.")
        return self
