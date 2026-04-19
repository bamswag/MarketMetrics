from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth_dependencies import get_current_user
from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.growth_projections import (
    LongTermProjectionRequest,
    LongTermProjectionResponse,
)

router = APIRouter(prefix="/project", tags=["Projection"])


@router.post("/long-term", response_model=LongTermProjectionResponse)
async def project_long_term_growth(
    payload: LongTermProjectionRequest,
    user=Depends(get_current_user),
):
    # Import projection dependencies lazily. The route is authenticated and
    # infrequent, so normal dashboard/movers traffic should not pay this memory
    # cost at startup.
    from app.projections.engine import LongTermProjectionError, project_long_term

    try:
        return await project_long_term(payload)
    except AlpacaMarketDataError as exc:
        detail = str(exc)
        status_code = 400 if "No historical bar data" in detail else 502
        raise HTTPException(status_code=status_code, detail=detail)
    except LongTermProjectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
