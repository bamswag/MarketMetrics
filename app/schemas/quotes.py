from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class PublicQuoteOut(BaseModel):
    symbol: str
    price: Optional[float] = None
    change: Optional[float] = None
    changePercent: Optional[str] = None
    latestTradingDay: Optional[str] = None
    source: Optional[str] = None
    unavailableReason: Optional[str] = None


class PublicQuotesResponse(BaseModel):
    quotes: List[PublicQuoteOut]
