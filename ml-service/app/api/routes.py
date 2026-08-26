from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.core.config import Settings, get_settings
from app.schemas.crop_recommendation import CropPredictionRequest, CropPredictionResponse
from app.schemas.disease_detection import DiseasePredictionResponse
from app.schemas.health import HealthResponse
from app.schemas.irrigation import (
    IrrigationPredictionRequest,
    IrrigationPredictionResponse,
)
from app.schemas.market_intelligence import (
    MarketAnalysisRequest,
    MarketAnalysisResponse,
)
from app.services.crop_recommender import (
    ModelUnavailableError,
    PredictionError,
    crop_model_service,
)
from app.services.disease_detector import (
    DiseaseModelUnavailableError,
    DiseasePredictionError,
    InvalidDiseaseImageError,
    disease_model_service,
)
from app.services.irrigation_advisor import (
    IrrigationCalculationError,
    IrrigationEngineUnavailableError,
    irrigation_advisor_service,
)
from app.services.market_analyzer import (
    MarketAnalysisError,
    MarketDataUnavailableError,
    UnsupportedMarketSelectionError,
    market_analyzer_service,
)

MAX_DISEASE_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_DISEASE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/octet-stream",
}

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
def get_health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.service_name,
    )


@router.post(
    "/predict/crop",
    response_model=CropPredictionResponse,
    tags=["Crop Recommendation"],
)
def predict_crop(payload: CropPredictionRequest) -> CropPredictionResponse:
    try:
        return crop_model_service.predict(payload)
    except ModelUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Crop recommendation model is unavailable",
        ) from error
    except PredictionError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Crop recommendation prediction failed",
        ) from error


@router.post(
    "/predict/disease",
    response_model=DiseasePredictionResponse,
    tags=["Leaf Disease Detection"],
)
async def predict_disease(
    image: Annotated[UploadFile, File(description="JPEG, PNG, or WEBP leaf image")],
) -> DiseasePredictionResponse:
    try:
        if image.content_type not in ALLOWED_DISEASE_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Only JPEG, PNG, and WEBP leaf images are supported",
            )

        image_bytes = await image.read(MAX_DISEASE_IMAGE_BYTES + 1)
        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Leaf image is empty",
            )
        if len(image_bytes) > MAX_DISEASE_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="Leaf image must not exceed 5 MB",
            )

        return disease_model_service.predict(image_bytes)
    except InvalidDiseaseImageError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except DiseaseModelUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Disease detection model is unavailable",
        ) from error
    except DiseasePredictionError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disease detection prediction failed",
        ) from error
    finally:
        await image.close()


@router.post(
    "/predict/irrigation",
    response_model=IrrigationPredictionResponse,
    tags=["Smart Irrigation"],
)
def predict_irrigation(
    payload: IrrigationPredictionRequest,
) -> IrrigationPredictionResponse:
    try:
        return irrigation_advisor_service.predict(payload)
    except IrrigationEngineUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Irrigation advisor is unavailable",
        ) from error
    except IrrigationCalculationError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Irrigation advice calculation failed",
        ) from error


@router.post(
    "/analyze/market",
    response_model=MarketAnalysisResponse,
    tags=["Market Intelligence"],
)
def analyze_market(payload: MarketAnalysisRequest) -> MarketAnalysisResponse:
    try:
        return market_analyzer_service.analyze(payload)
    except UnsupportedMarketSelectionError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error
    except MarketDataUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Historical market data is currently unavailable",
        ) from error
    except MarketAnalysisError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Market analysis calculation failed",
        ) from error
