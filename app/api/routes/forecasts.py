from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth_dependencies import get_current_user
from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.forecasts import PredictionRequest, PredictionResponse

router = APIRouter(prefix="/predict", tags=["Prediction"])


@router.post("/forecast", response_model=PredictionResponse)
async def forecast_prices(
    payload: PredictionRequest,
    user=Depends(get_current_user),
):
    # Import the ML stack lazily so normal web traffic does not load pandas,
    # sklearn, or serialized models into the 512 MB Render web process.
    from app.forecasting.inference import PredictionModelError, predict_forecast

    try:
        return await predict_forecast(payload)
    except AlpacaMarketDataError as exc:
        detail = str(exc)
        status_code = 400 if "No historical bar data" in detail else 502
        raise HTTPException(status_code=status_code, detail=detail)
    except PredictionModelError as exc:
        detail = str(exc)
        if "No trained forecasting model" in detail or "artifacts are missing" in detail:
            raise HTTPException(status_code=503, detail=detail)
        raise HTTPException(status_code=400, detail=detail)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
