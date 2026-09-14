import json
import unittest
from datetime import date
from pathlib import Path

from app.schemas.irrigation import IrrigationPredictionRequest
from app.services.irrigation_advisor import (
    IrrigationAdvisorService,
    calculate_hargreaves_eto,
)

SERVICE_ROOT = Path(__file__).resolve().parents[1]


class IrrigationEngineScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = IrrigationAdvisorService()
        config_path = SERVICE_ROOT / "app" / "data" / "irrigation_config.json"
        cls.service.load(config_path)
        cls.config = json.loads(config_path.read_text(encoding="utf-8"))

    def build_request(self, **overrides):
        values = {
            "crop": "tomato",
            "growthStage": "mid_season",
            "soilType": "silt",
            "soilMoisture": 25,
            "minimumTemperature": 24,
            "maximumTemperature": 36,
            "latitude": 20.5937,
            "observationDate": date(2026, 8, 25),
            "recentRainfall": 0,
            "forecastRainfall": 0,
            "daysSinceLastIrrigation": 4,
        }
        values.update(overrides)
        return IrrigationPredictionRequest.model_validate(values)

    def build_urgent_request(self, **overrides):
        values = {
            "crop": "maize",
            "soilType": "loamy_sand",
            "soilMoisture": 5,
            "minimumTemperature": 27,
            "maximumTemperature": 42,
            "daysSinceLastIrrigation": 7,
        }
        values.update(overrides)
        return self.build_request(**values)

    def assert_consistent(self, result):
        applying_water = {"irrigate_today", "irrigate_tomorrow"}
        waiting = {"delay_for_rain", "reassess_after_irrigation", "no_irrigation"}
        self.assertIn(result.decision_code, applying_water | waiting)
        self.assertEqual(result.irrigation_required, result.decision_code in applying_water)
        if result.irrigation_required:
            self.assertGreater(result.estimated_irrigation_need, 0)
            timing = "today" if result.decision_code == "irrigate_today" else "tomorrow morning"
            reasons = " ".join(result.reasons)
            self.assertIn(f"irrigation {timing}", reasons)
            self.assertIn(f"{result.estimated_irrigation_need:.2f} mm", reasons)
            self.assertNotIn("may cover", reasons)
            self.assertNotIn("reassessment is safer than immediate irrigation", reasons)
        else:
            self.assertEqual(result.estimated_irrigation_need, 0)
        if result.estimated_irrigation_need == 0:
            self.assertIn(result.decision_code, waiting)
        if result.water_stress == "High" and not result.irrigation_required:
            self.assertTrue(any("High soil-water stress remains" in item for item in result.warnings))
        self.assertTrue(any("not a full soil-profile refill depth" in item for item in result.assumptions))

    def test_dry_field_requires_irrigation(self):
        result = self.service.predict(self.build_request())
        self.assertTrue(result.irrigation_required)
        self.assertEqual(result.decision_code, "irrigate_tomorrow")
        self.assertEqual(result.water_stress, "Medium")
        self.assertEqual(result.estimated_irrigation_need, result.crop_water_requirement)
        self.assert_consistent(result)

    def test_expected_rain_delays_irrigation(self):
        result = self.service.predict(self.build_request(forecastRainfall=20))
        self.assertFalse(result.irrigation_required)
        self.assertEqual(result.decision_code, "delay_for_rain")
        self.assert_consistent(result)

    def test_adequate_moisture_needs_no_irrigation(self):
        result = self.service.predict(
            self.build_request(
                soilMoisture=31,
                recentRainfall=5,
                daysSinceLastIrrigation=1,
            )
        )
        self.assertFalse(result.irrigation_required)
        self.assertEqual(result.decision_code, "no_irrigation")
        self.assertEqual(result.water_stress, "Low")
        self.assert_consistent(result)

    def test_very_low_moisture_is_high_stress(self):
        result = self.service.predict(
            self.build_request(
                crop="maize",
                soilType="loamy_sand",
                soilMoisture=5,
                minimumTemperature=27,
                maximumTemperature=42,
                daysSinceLastIrrigation=7,
            )
        )
        self.assertTrue(result.irrigation_required)
        self.assertEqual(result.decision_code, "irrigate_today")
        self.assertEqual(result.water_stress, "High")
        # Fixed 2026-08-25 fixture: these are measured pre-fix demo values,
        # not outputs hard-coded into the engine.
        self.assertEqual(result.reference_et, 7.16)
        self.assertEqual(result.crop_coefficient, 1.2)
        self.assertEqual(result.crop_water_requirement, 8.59)
        self.assertEqual(result.estimated_irrigation_need, 8.59)
        self.assert_consistent(result)

    def test_audit_high_stress_with_20_mm_forecast_delays_without_hiding_stress(self):
        # Uses the existing fixture's latitude, date and zero recent rainfall.
        result = self.service.predict(self.build_urgent_request(forecastRainfall=20))
        self.assertEqual(result.decision_code, "delay_for_rain")
        self.assertFalse(result.irrigation_required)
        self.assertEqual(result.estimated_irrigation_need, 0)
        self.assertEqual(result.water_stress, "High")
        self.assertEqual(result.soil_moisture_status, "Low")
        self.assertEqual(result.effective_forecast_rainfall, 16)
        self.assertIn("may cover", " ".join(result.reasons))
        self.assertIn("reassess", result.recommended_timing)
        self.assertIn("Forecast rainfall is uncertain", " ".join(result.warnings))
        self.assert_consistent(result)

    def test_high_stress_with_partial_forecast_retains_positive_urgent_depth(self):
        result = self.service.predict(self.build_urgent_request(forecastRainfall=5))
        self.assertEqual(result.decision_code, "irrigate_today")
        self.assertEqual(result.water_stress, "High")
        self.assertEqual(result.effective_forecast_rainfall, 4)
        self.assertEqual(result.estimated_irrigation_need, 4.59)
        self.assertIn("Forecast rainfall is uncertain", " ".join(result.warnings))
        self.assert_consistent(result)

    def test_combined_recent_and_forecast_credit_can_cover_demand(self):
        for request in (
            self.build_urgent_request(recentRainfall=6, forecastRainfall=6),
            self.build_request(recentRainfall=5, forecastRainfall=5),
        ):
            with self.subTest(crop=request.crop):
                result = self.service.predict(request)
                self.assertLess(result.effective_recent_rainfall, result.crop_water_requirement)
                self.assertLess(result.effective_forecast_rainfall, result.crop_water_requirement)
                self.assertGreater(
                    result.effective_recent_rainfall + result.effective_forecast_rainfall,
                    result.crop_water_requirement,
                )
                self.assertEqual(result.decision_code, "delay_for_rain")
                self.assertIn("together with any recent rainfall", " ".join(result.reasons))
                self.assert_consistent(result)

    def test_low_stress_with_strong_forecast_still_needs_no_irrigation(self):
        result = self.service.predict(self.build_request(soilMoisture=31, forecastRainfall=20))
        self.assertEqual(result.water_stress, "Low")
        self.assertEqual(result.decision_code, "no_irrigation")
        self.assertIn("may cover", " ".join(result.reasons))
        self.assert_consistent(result)

    def test_recent_rain_covering_demand_requires_reassessment_not_more_water(self):
        for request in (
            self.build_urgent_request(recentRainfall=20),
            self.build_request(recentRainfall=20),
        ):
            with self.subTest(crop=request.crop):
                result = self.service.predict(request)
                self.assertEqual(result.decision_code, "delay_for_rain")
                self.assertIn("reported rainfall", result.recommended_timing)
                self.assertNotIn("Forecast rainfall is uncertain", " ".join(result.warnings))
                self.assert_consistent(result)

    def test_recent_irrigation_reassessment_retains_consistent_zero_application(self):
        result = self.service.predict(self.build_request(daysSinceLastIrrigation=0))
        self.assertEqual(result.decision_code, "reassess_after_irrigation")
        self.assertEqual(result.water_stress, "Medium")
        self.assertIn("redistribute", " ".join(result.reasons))
        self.assert_consistent(result)

    def test_rounding_boundary_cannot_turn_positive_action_into_zero_depth(self):
        for builder in (self.build_urgent_request, self.build_request):
            request = builder()
            coefficient = self.config["crops"][request.crop]["stageCoefficients"][request.growth_stage]
            demand = calculate_hargreaves_eto(request) * coefficient
            for remaining in (0.004, 0.006):
                with self.subTest(crop=request.crop, shortfall=remaining):
                    forecast = (demand - remaining) / self.config["effectiveRainfallFraction"]
                    result = self.service.predict(builder(forecastRainfall=forecast))
                    self.assertEqual(result.estimated_irrigation_need, round(remaining, 2))
                    if remaining == 0.004:
                        self.assertEqual(result.decision_code, "no_irrigation")
                        self.assertIn("reporting precision", " ".join(result.reasons))
                        self.assertNotIn("may cover", " ".join(result.reasons))
                    else:
                        self.assertTrue(result.irrigation_required)
                    self.assert_consistent(result)

    def test_decision_depth_invariants_across_supported_configs_and_rainfall(self):
        # 4 crops x 4 stages x 3 soils x 3 moisture levels x 6 rain cases
        # x 2 irrigation recencies = 1,728 deterministic combinations.
        for crop_name in self.config["crops"]:
            for stage in self.config["growthStages"]:
                for soil_name, soil in self.config["soils"].items():
                    for depletion in (0, 0.7, 1):
                        moisture = 100 * (soil["fieldCapacity"] - depletion * (
                            soil["fieldCapacity"] - soil["wiltingPoint"]
                        ))
                        inputs = dict(crop=crop_name, growthStage=stage, soilType=soil_name, soilMoisture=moisture)
                        baseline = self.service.predict(self.build_request(**inputs))
                        demand = calculate_hargreaves_eto(self.build_request(**inputs)) * baseline.crop_coefficient
                        rain_equivalent = demand / self.config["effectiveRainfallFraction"]
                        for recent, forecast in ((0, 0), (0, 0.5), (0, 2), (2, 0), (0.6, 0.6), (0.2, 0.2)):
                            for days in (0, 7):
                                with self.subTest(**inputs, recent=recent, forecast=forecast, days=days):
                                    result = self.service.predict(self.build_request(
                                        **inputs,
                                        recentRainfall=recent * rain_equivalent,
                                        forecastRainfall=forecast * rain_equivalent,
                                        daysSinceLastIrrigation=days,
                                    ))
                                    self.assertEqual(result.water_stress, baseline.water_stress)
                                    self.assertEqual(result.depletion_fraction, baseline.depletion_fraction)
                                    self.assertEqual(result.reference_et, baseline.reference_et)
                                    self.assertEqual(result.crop_coefficient, baseline.crop_coefficient)
                                    self.assertEqual(result.crop_water_requirement, baseline.crop_water_requirement)
                                    self.assert_consistent(result)

    def test_combined_warnings_stay_within_existing_response_schema(self):
        result = self.service.predict(self.build_urgent_request(
            minimumTemperature=47, maximumTemperature=48, latitude=50,
            recentRainfall=150, forecastRainfall=150, daysSinceLastIrrigation=0,
        ))
        self.assertEqual(len(result.warnings), 8)
        self.assertLessEqual(len(result.assumptions), 8)
        self.assert_consistent(result)


if __name__ == "__main__":
    unittest.main()
