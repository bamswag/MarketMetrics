from __future__ import annotations

from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class InstrumentRange(str, Enum):
    one_week = "1W"
    one_month = "1M"
    three_months = "3M"
    six_months = "6M"
    one_year = "1Y"
    five_years = "5Y"
    max_range = "MAX"


class InstrumentQuoteOut(BaseModel):
    price: float
    change: Optional[float] = None
    changePercent: Optional[str] = None
    latestTradingDay: Optional[str] = None
    source: Optional[str] = None


class InstrumentPricePoint(BaseModel):
    date: str  # ISO date "YYYY-MM-DD" or ISO datetime "YYYY-MM-DDTHH:MM:SS" for intraday
    close: float


class InstrumentDetailResponse(BaseModel):
    symbol: str
    companyName: str
    assetCategory: Optional[str] = None
    exchange: Optional[str] = None
    range: InstrumentRange = Field(default=InstrumentRange.six_months)
    availableRanges: List[InstrumentRange] = Field(default_factory=list)
    earliestAvailableDate: Optional[date] = None
    latestQuote: InstrumentQuoteOut
    historicalSeries: List[InstrumentPricePoint]
