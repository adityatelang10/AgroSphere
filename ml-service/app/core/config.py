from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "agrosphere-ai"
    service_host: str = "127.0.0.1"
    service_port: int = 8000
    service_reload: bool = False
    crop_model_path: Path = Path("model_artifacts/crop_model.joblib")
    crop_model_metadata_path: Path = Path("model_artifacts/crop_model_metadata.json")
    disease_model_path: Path = Path("model_artifacts/disease_model.pt")
    disease_classes_path: Path = Path("model_artifacts/disease_classes.json")
    disease_model_metadata_path: Path = Path(
        "model_artifacts/disease_model_metadata.json"
    )
    irrigation_config_path: Path = Path("app/data/irrigation_config.json")
    market_data_path: Path = Path(
        "data/market_intelligence/agmarknet_historical.csv"
    )
    market_data_metadata_path: Path = Path(
        "data/market_intelligence/market_data_metadata.json"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
