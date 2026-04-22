from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.instruments import (
    InstrumentDetailResponse,
    InstrumentRange,
    SimilarInstrumentsResponse,
)
from app.services.instruments import get_instrument_detail, get_similar_instruments

router = APIRouter(prefix="/instruments", tags=["instruments"])


@router.get("/similar/{symbol:path}", response_model=SimilarInstrumentsResponse)
async def similar_instruments(
    symbol: str,
    limit: int = Query(default=8, ge=1, le=12),
):
    try:
        return await get_similar_instruments(symbol, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{symbol:path}", response_model=InstrumentDetailResponse)
async def instrument_detail(
    symbol: str,
    range_value: InstrumentRange = Query(default=InstrumentRange.six_months, alias="range"),
):
    try:
        return await get_instrument_detail(symbol, range_value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except AlpacaMarketDataError as exc:
        detail = str(exc)
        if (
            "No historical bar data" in detail
            or "No quote data" in detail
        ):
            raise HTTPException(status_code=400, detail=detail)
        raise HTTPException(status_code=502, detail=detail)
