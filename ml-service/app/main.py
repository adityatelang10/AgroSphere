import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.services.crop_recommender import ModelUnavailableError, crop_model_service
from app.services.disease_detector import (
    DiseaseModelUnavailableError,
    disease_model_service,
)
from app.services.irrigation_advisor import (
    IrrigationEngineUnavailableError,
    irrigation_advisor_service,
)
from app.services.market_analyzer import (
    MarketDataUnavailableError,
    market_analyzer_service,
)

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        crop_model_service.load(
            model_path=settings.crop_model_path,
            metadata_path=settings.crop_model_metadata_path,
        )
    except ModelUnavailableError as error:
        logger.error("Crop recommendation model is unavailable at startup: %s", error)

    try:
        disease_model_service.load(
            model_path=settings.disease_model_path,
            classes_path=settings.disease_classes_path,
            metadata_path=settings.disease_model_metadata_path,
        )
    except DiseaseModelUnavailableError as error:
        logger.error("Disease detection model is unavailable at startup: %s", error)

    try:
        irrigation_advisor_service.load(settings.irrigation_config_path)
    except IrrigationEngineUnavailableError as error:
        logger.error("Irrigation engine is unavailable at startup: %s", error)

    try:
        market_analyzer_service.load(
            data_path=settings.market_data_path,
            metadata_path=settings.market_data_metadata_path,
        )
    except MarketDataUnavailableError as error:
        logger.error("Market intelligence data is unavailable at startup: %s", error)

    yield

app = FastAPI(
    title=settings.service_name,
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(api_router)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.service_host,
        port=settings.service_port,
        reload=settings.service_reload,
    )
