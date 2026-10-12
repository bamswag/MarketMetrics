from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from app.schemas.instruments import InstrumentRange


class WatchlistCreate(BaseModel):
    symbol: str = Field(..., example="AAPL")


class WatchlistItemOut(BaseModel):
    id: str
    userID: str
    symbol: str
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


class WatchlistQuoteOut(BaseModel):
    price: Optional[float] = None
    change: Optional[float] = None
    changePercent: Optional[str] = None
    latestTradingDay: Optional[str] = None
    source: Optional[str] = None
    unavailableReason: Optional[str] = None


class WatchlistAlertSummaryOut(BaseModel):
    totalAlerts: int
    activeAlerts: int
    triggeredAlerts: int


class WatchlistItemDetailedOut(WatchlistItemOut):
    assetCategory: Optional[str] = None
    latestQuote: Optional[WatchlistQuoteOut] = None
    alerts: WatchlistAlertSummaryOut
    chartReady: bool = False
    availableRanges: list[InstrumentRange] = Field(default_factory=list)
    defaultRange: Optional[InstrumentRange] = None
    historyPointCount: int = 0
    historyStart: Optional[str] = None
    historyEnd: Optional[str] = None
    unavailableReason: Optional[str] = None
