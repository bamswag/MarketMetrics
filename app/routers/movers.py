from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.models.movers import MoversResponse, Mover
from app.services.alpha_vantage import AlphaVantageError, fetch_top_movers

router = APIRouter(prefix="/movers", tags=["Movers"])


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except Exception:
        return None


def _to_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except Exception:
        return None


def _parse_movers(items: List[Dict[str, Any]]) -> List[Mover]:
    result: List[Mover] = []
    for item in items:
        result.append(
            Mover(
                symbol=item.get("ticker") or item.get("symbol") or "",
                name=item.get("name"),
                price=_to_float(item.get("price")),
                change_amount=_to_float(item.get("change_amount")),
                change_percent=item.get("change_percentage") or item.get("change_percent"),
                volume=_to_int(item.get("volume")),
            )
        )
    return [m for m in result if m.symbol]


@router.get("/", response_model=MoversResponse)
async def get_movers(user: dict = Depends(get_current_user)):
    """
    Get top market gainers and losers (authenticated users only).
    """
    try:
        data = await fetch_top_movers()
        gainers_raw = data.get("top_gainers") or []
        losers_raw = data.get("top_losers") or []

        return MoversResponse(
            gainers=_parse_movers(gainers_raw),
            losers=_parse_movers(losers_raw),
        )

    except AlphaVantageError as e:
        raise HTTPException(status_code=502, detail=f"Alpha Vantage error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
