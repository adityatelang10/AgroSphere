import json
import math
from pathlib import Path

from app.schemas.irrigation import (
    IrrigationPredictionRequest,
    IrrigationPredictionResponse,
)

SERVICE_ROOT = Path(__file__).resolve().parents[2]
SOLAR_CONSTANT = 0.0820
RADIATION_TO_EVAPORATION = 0.408


class IrrigationEngineUnavailableError(RuntimeError):
    """Raised when the irrigation configuration cannot be loaded or used."""


class IrrigationCalculationError(RuntimeError):
    """Raised when validated inputs cannot produce irrigation advice."""


def resolve_service_path(path: Path) -> Path:
    return path if path.is_absolute() else SERVICE_ROOT / path


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def calculate_extraterrestrial_radiation(latitude: float, day_of_year: int) -> float:
    latitude_radians = math.radians(latitude)
    inverse_distance = 1 + 0.033 * math.cos(2 * math.pi * day_of_year / 365)
    solar_declination = 0.409 * math.sin(
        2 * math.pi * day_of_year / 365 - 1.39
    )
    sunset_argument = -math.tan(latitude_radians) * math.tan(solar_declination)
    sunset_hour_angle = math.acos(clamp(sunset_argument, -1.0, 1.0))
    radiation_mj = (
        (24 * 60 / math.pi)
        * SOLAR_CONSTANT
        * inverse_distance
        * (
            sunset_hour_angle
            * math.sin(latitude_radians)
            * math.sin(solar_declination)
            + math.cos(latitude_radians)
            * math.cos(solar_declination)
            * math.sin(sunset_hour_angle)
        )
    )
    return radiation_mj * RADIATION_TO_EVAPORATION


def calculate_hargreaves_eto(payload: IrrigationPredictionRequest) -> float:
    mean_temperature = (
        payload.minimum_temperature + payload.maximum_temperature
    ) / 2
    temperature_range = payload.maximum_temperature - payload.minimum_temperature
    radiation_mm = calculate_extraterrestrial_radiation(
        payload.latitude,
        payload.observation_date.timetuple().tm_yday,
    )
    return (
        0.0023
        * (mean_temperature + 17.8)
        * math.sqrt(temperature_range)
        * radiation_mm
    )


class IrrigationAdvisorService:
    def __init__(self) -> None:
        self._config = None
        self._load_error = None

    def load(self, config_path: Path) -> None:
        resolved_path = resolve_service_path(config_path)

        try:
            if not resolved_path.is_file():
                raise FileNotFoundError(
                    f"Irrigation configuration not found: {resolved_path}"
                )

            config = json.loads(resolved_path.read_text(encoding="utf-8"))
            if config.get("engineVersion") != "irrigation-v1":
                raise ValueError("Unsupported irrigation engine version.")
            if not 0 < config.get("effectiveRainfallFraction", 0) <= 1:
                raise ValueError("Effective rainfall fraction must be between 0 and 1.")

            stages = config.get("growthStages")
            crops = config.get("crops")
            soils = config.get("soils")
            if not isinstance(stages, list) or not stages:
                raise ValueError("Irrigation growth stages are missing.")
            if not isinstance(crops, dict) or not crops:
                raise ValueError("Irrigation crop configuration is missing.")
            if not isinstance(soils, dict) or not soils:
                raise ValueError("Irrigation soil configuration is missing.")

            for crop_name, crop in crops.items():
                coefficients = crop.get("stageCoefficients", {})
                if any(stage not in coefficients for stage in stages):
                    raise ValueError(f"{crop_name} is missing a growth-stage coefficient.")
                if not 0 < crop.get("depletionFraction", 0) < 1:
                    raise ValueError(f"{crop_name} has an invalid depletion fraction.")

            for soil_name, soil in soils.items():
                field_capacity = soil.get("fieldCapacity")
                wilting_point = soil.get("wiltingPoint")
                if not 0 < wilting_point < field_capacity < 1:
                    raise ValueError(f"{soil_name} has invalid soil-water values.")

            self._config = config
            self._load_error = None
        except Exception as error:
            self._config = None
            self._load_error = error
            raise IrrigationEngineUnavailableError(str(error)) from error

    def predict(
        self, payload: IrrigationPredictionRequest
    ) -> IrrigationPredictionResponse:
        if self._config is None:
            detail = (
                str(self._load_error)
                if self._load_error
                else "Irrigation engine has not been loaded."
            )
            raise IrrigationEngineUnavailableError(detail)

        try:
            crop = self._config["crops"][payload.crop]
            soil = self._config["soils"][payload.soil_type]
            stage_name = self._config["stageDisplayNames"][payload.growth_stage]
            crop_coefficient = float(
                crop["stageCoefficients"][payload.growth_stage]
            )
            reference_et = calculate_hargreaves_eto(payload)
            crop_water_requirement = reference_et * crop_coefficient

            field_capacity = float(soil["fieldCapacity"])
            wilting_point = float(soil["wiltingPoint"])
            current_moisture = payload.soil_moisture / 100
            depletion_fraction = clamp(
                (field_capacity - current_moisture)
                / (field_capacity - wilting_point),
                0,
                1,
            )
            base_depletion = float(crop["depletionFraction"])
            allowable_depletion = clamp(
                base_depletion + 0.04 * (5 - crop_water_requirement),
                0.1,
                0.8,
            )

            if current_moisture > field_capacity:
                moisture_status = "High"
            elif depletion_fraction >= allowable_depletion:
                moisture_status = "Low"
            elif depletion_fraction >= allowable_depletion * 0.5:
                moisture_status = "Moderate"
            else:
                moisture_status = "Adequate"

            if current_moisture <= wilting_point or depletion_fraction >= 0.85:
                water_stress = "High"
            elif depletion_fraction >= allowable_depletion:
                water_stress = "Medium"
            else:
                water_stress = "Low"

            rainfall_fraction = float(self._config["effectiveRainfallFraction"])
            effective_recent = payload.recent_rainfall * rainfall_fraction
            effective_forecast = payload.forecast_rainfall * rainfall_fraction
            climatic_shortfall = max(
                0,
                crop_water_requirement - effective_recent - effective_forecast,
            )
            recent_rain_covers_demand = effective_recent >= crop_water_requirement
            forecast_covers_demand = effective_forecast >= crop_water_requirement

            if water_stress == "High" and not recent_rain_covers_demand:
                irrigation_required = True
                decision_code = "irrigate_today"
                recommended_timing = "Irrigate today, preferably early morning"
            elif water_stress in {"High", "Medium"} and (
                recent_rain_covers_demand or forecast_covers_demand
            ):
                irrigation_required = False
                decision_code = "delay_for_rain"
                recommended_timing = (
                    "Delay irrigation and reassess soil moisture after rainfall"
                )
            elif water_stress == "Medium" and payload.days_since_last_irrigation == 0:
                irrigation_required = False
                decision_code = "reassess_after_irrigation"
                recommended_timing = (
                    "Reassess soil moisture tomorrow morning before further irrigation"
                )
            elif water_stress == "Medium":
                irrigation_required = True
                decision_code = "irrigate_tomorrow"
                recommended_timing = "Irrigate tomorrow morning"
            else:
                irrigation_required = False
                decision_code = "no_irrigation"
                recommended_timing = "No irrigation currently required"

            estimated_need = climatic_shortfall if irrigation_required else 0

            reasons = [
                (
                    f"{crop['displayName']} in the {stage_name.lower()} stage uses a crop "
                    f"coefficient of {crop_coefficient:.3f}."
                ),
                (
                    f"Current soil moisture is {moisture_status.lower()} for the selected "
                    f"{soil['displayName'].lower()} reference profile."
                ),
            ]

            if recent_rain_covers_demand:
                reasons.append(
                    "Effective rainfall since the moisture reading can cover the estimated daily crop demand."
                )
            elif forecast_covers_demand:
                reasons.append(
                    "Expected effective rainfall can cover the estimated daily crop demand, so reassessment is safer than immediate irrigation."
                )
            elif climatic_shortfall > 0 and irrigation_required:
                reasons.append(
                    f"Rainfall leaves an estimated next-day net water shortfall of {climatic_shortfall:.1f} mm."
                )
            elif climatic_shortfall > 0 and water_stress == "Low":
                reasons.append(
                    f"Current soil moisture can buffer the estimated {climatic_shortfall:.1f} mm next-day climatic shortfall, so immediate irrigation is not advised."
                )
            elif climatic_shortfall > 0:
                reasons.append(
                    "A next-day water shortfall remains, but recent irrigation should be allowed to redistribute before another application."
                )
            else:
                reasons.append(
                    "Recent and forecast effective rainfall cover the estimated next-day crop demand."
                )

            if payload.days_since_last_irrigation == 0:
                reasons.append(
                    "Irrigation was recorded today, so another application should wait unless current stress is high."
                )
            else:
                reasons.append(
                    f"The last irrigation was reported {payload.days_since_last_irrigation} day(s) ago."
                )

            warnings = []
            temperature_range = (
                payload.maximum_temperature - payload.minimum_temperature
            )
            if temperature_range < 3:
                warnings.append(
                    "The daily temperature range is very small; Hargreaves ETo may be less reliable."
                )
            if payload.maximum_temperature > 45 or payload.minimum_temperature < 0:
                warnings.append(
                    "Temperature is outside the normal planning range used for this simplified advisor."
                )
            if abs(payload.latitude) > 40:
                warnings.append(
                    "High-latitude estimates are more season-sensitive; verify ETo with local weather data."
                )
            if current_moisture <= wilting_point:
                warnings.append(
                    "Entered soil moisture is at or below the representative permanent wilting point."
                )
            elif current_moisture > field_capacity:
                warnings.append(
                    "Entered soil moisture is above representative field capacity; inspect drainage or recheck the measurement."
                )
            if payload.days_since_last_irrigation == 0 and water_stress == "High":
                warnings.append(
                    "High stress immediately after irrigation may indicate uneven application or an unrepresentative moisture reading."
                )
            if payload.recent_rainfall + payload.forecast_rainfall > 100:
                warnings.append(
                    "Heavy rainfall can create runoff or drainage losses that this simple effective-rainfall factor cannot model."
                )

            assumptions = [
                "Reference ETo uses the FAO-documented Hargreaves equation because radiation, wind and full humidity observations are unavailable.",
                "Crop coefficients represent standard, non-stressed, well-managed crops; development and late-stage values are coarse midpoint estimates.",
                "Soil moisture is treated as a volumetric percentage representative of the active root zone.",
                "Recent rainfall means rain since the soil-moisture reading; enter zero if moisture was measured after that rain.",
                "Eighty percent of entered rainfall is treated as effective for planning; actual runoff, evaporation and deep drainage vary by field.",
                "Estimated irrigation need is a next-24-hour net depth before irrigation-system efficiency and field application losses."
            ]

            return IrrigationPredictionResponse(
                status="ok",
                engine_version=self._config["engineVersion"],
                method=self._config["methodName"],
                irrigation_required=irrigation_required,
                decision_code=decision_code,
                recommended_timing=recommended_timing,
                water_stress=water_stress,
                soil_moisture_status=moisture_status,
                reference_et=round(reference_et, 2),
                crop_coefficient=round(crop_coefficient, 3),
                crop_water_requirement=round(crop_water_requirement, 2),
                effective_recent_rainfall=round(effective_recent, 2),
                effective_forecast_rainfall=round(effective_forecast, 2),
                estimated_irrigation_need=round(estimated_need, 2),
                depletion_fraction=round(depletion_fraction, 4),
                allowable_depletion_fraction=round(allowable_depletion, 4),
                reasons=reasons,
                assumptions=assumptions,
                warnings=warnings,
                units={
                    "referenceET": "mm/day",
                    "cropWaterRequirement": "mm/day",
                    "effectiveRainfall": "mm",
                    "estimatedIrrigationNeed": "mm net depth over next 24 hours",
                    "soilMoisture": "% volumetric water content",
                },
                supported_crops=[
                    item["displayName"]
                    for item in self._config["crops"].values()
                ],
                supported_stages=[
                    self._config["stageDisplayNames"][stage]
                    for stage in self._config["growthStages"]
                ],
            )
        except IrrigationEngineUnavailableError:
            raise
        except Exception as error:
            raise IrrigationCalculationError(str(error)) from error


irrigation_advisor_service = IrrigationAdvisorService()
