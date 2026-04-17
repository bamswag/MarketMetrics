from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.integrations.alpaca.client import AlpacaMarketDataError
from app.schemas.movers import (
    FeaturedMoverAsset,
    FeaturedMoverDirection,
    FeaturedMoverPeriod,
    FeaturedMoverResponse,
    MoversResponse,
)
from app.services.market_overview import get_featured_mover, get_market_movers

router = APIRouter(prefix="/movers", tags=["Movers"])


@router.get("/featured", response_model=FeaturedMoverResponse)
async def get_featured_mover_route(
    period: FeaturedMoverPeriod = Query(default=FeaturedMoverPeriod.week),
    direction: FeaturedMoverDirection = Query(default=FeaturedMoverDirection.gainer),
    asset: FeaturedMoverAsset = Query(default=FeaturedMoverAsset.all),
):
    try:
        return await get_featured_mover(
            period=period,
            direction=direction,
            asset=asset,
        )
    except AlpacaMarketDataError as exc:
        raise HTTPException(status_code=502, detail=f"Alpaca error: {str(exc)}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Server error: {str(exc)}")


@router.get("/", response_model=MoversResponse)
async def get_movers(limit: int = Query(default=5, ge=1, le=10)):
    try:
        return await get_market_movers(limit)
    except AlpacaMarketDataError as exc:
        raise HTTPException(status_code=502, detail=f"Alpaca error: {str(exc)}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Server error: {str(exc)}")
