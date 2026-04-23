from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_dependencies import get_optional_current_user
from app.core.db_dependencies import get_db
from app.integrations.alpaca.client import AlpacaMarketDataError
from app.orm_models.user import UserDB
from app.schemas.growth_projections import (
    LongTermProjectionRequest,
    LongTermProjectionResponse,
)
from app.services.simulation_history import save_growth_projection_history

router = APIRouter(prefix="/project", tags=["Projection"])


@router.post("/long-term", response_model=LongTermProjectionResponse)
async def project_long_term_growth(
    payload: LongTermProjectionRequest,
    db: Session = Depends(get_db),
    user: Optional[UserDB] = Depends(get_optional_current_user),
):
    from app.projections.engine import LongTermProjectionError, project_long_term

    try:
        result = await project_long_term(payload)
        if user is not None:
            save_growth_projection_history(db, user.userID, payload, result)
        return result
    except AlpacaMarketDataError as exc:
        detail = str(exc)
        status_code = 400 if "No historical bar data" in detail else 502
        raise HTTPException(status_code=status_code, detail=detail)
    except LongTermProjectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
