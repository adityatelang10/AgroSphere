import unittest
from datetime import date
from pathlib import Path

from app.schemas.irrigation import IrrigationPredictionRequest
from app.services.irrigation_advisor import IrrigationAdvisorService

SERVICE_ROOT = Path(__file__).resolve().parents[1]


class IrrigationEngineScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = IrrigationAdvisorService()
        cls.service.load(SERVICE_ROOT / "app" / "data" / "irrigation_config.json")

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

    def test_dry_field_requires_irrigation(self):
        result = self.service.predict(self.build_request())
        self.assertTrue(result.irrigation_required)
        self.assertEqual(result.decision_code, "irrigate_tomorrow")
        self.assertEqual(result.water_stress, "Medium")

    def test_expected_rain_delays_irrigation(self):
        result = self.service.predict(self.build_request(forecastRainfall=20))
        self.assertFalse(result.irrigation_required)
        self.assertEqual(result.decision_code, "delay_for_rain")

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


if __name__ == "__main__":
    unittest.main()
