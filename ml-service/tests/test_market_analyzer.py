import unittest
from pathlib import Path

from pydantic import ValidationError

from app.schemas.market_intelligence import MarketAnalysisRequest
from app.services.market_analyzer import (
    MarketAnalyzerService,
    MarketDataUnavailableError,
    UnsupportedMarketSelectionError,
)


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = SERVICE_ROOT / "data" / "market_intelligence" / "agmarknet_historical.csv"
METADATA_PATH = (
    SERVICE_ROOT / "data" / "market_intelligence" / "market_data_metadata.json"
)


class MarketAnalyzerScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = MarketAnalyzerService()
        cls.service.load(DATA_PATH, METADATA_PATH)

    def build_request(self, **overrides):
        values = {
            "crop": "tomato",
            "marketKey": "tomato-pune-local",
            "quantityQuintals": 10,
            "expectedSalePrice": 700,
            "transportCost": 500,
            "storageCost": 200,
            "otherCost": 300,
        }
        values.update(overrides)
        return MarketAnalysisRequest.model_validate(values)

    def test_historical_tomato_trend_uses_two_five_observation_windows(self):
        result = self.service.analyze(self.build_request())

        self.assertEqual(result.reference_price.observed_date.isoformat(), "2021-06-30")
        self.assertEqual(result.reference_price.modal_price, 700)
        self.assertEqual(result.historical_summary.observation_count, 78)
        self.assertEqual(result.trend.direction, "Rising")
        self.assertEqual(result.trend.previous_average, 660)
        self.assertEqual(result.trend.recent_average, 680)
        self.assertEqual(result.trend.percentage_change, 3.03)

    def test_manual_net_return_arithmetic(self):
        result = self.service.analyze(self.build_request())

        self.assertEqual(result.profit_analysis.gross_sale_value, 7000)
        self.assertEqual(result.profit_analysis.total_entered_costs, 1000)
        self.assertEqual(result.profit_analysis.estimated_net_return, 6000)
        self.assertFalse(result.profit_analysis.includes_cultivation_cost)

    def test_forecast_is_explicitly_unavailable(self):
        result = self.service.analyze(self.build_request())

        self.assertFalse(result.forecast.available)
        self.assertEqual(result.forecast.status, "UNAVAILABLE")

    def test_crop_and_market_mismatch_is_rejected(self):
        with self.assertRaises(UnsupportedMarketSelectionError):
            self.service.analyze(self.build_request(crop="maize"))

    def test_unknown_market_is_rejected(self):
        with self.assertRaises(UnsupportedMarketSelectionError):
            self.service.analyze(self.build_request(marketKey="unknown-market"))

    def test_negative_quantity_is_rejected_by_schema(self):
        with self.assertRaises(ValidationError):
            self.build_request(quantityQuintals=-1)

    def test_missing_dataset_is_isolated_as_unavailable(self):
        unavailable_service = MarketAnalyzerService()
        with self.assertRaises(MarketDataUnavailableError):
            unavailable_service.load(
                SERVICE_ROOT / "data" / "market_intelligence" / "missing.csv",
                METADATA_PATH,
            )
        with self.assertRaises(MarketDataUnavailableError):
            unavailable_service.analyze(self.build_request())


if __name__ == "__main__":
    unittest.main()
