from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class MoverSparklinePoint(BaseModel):
    date: date
    close: float


class Mover(BaseModel):
    symbol: str
    name: Optional[str] = None
    price: Optional[float] = None
    change_amount: Optional[float] = None
    change_percent: Optional[str] = None
    volume: Optional[int] = None
    sparklineSeries: List[MoverSparklinePoint] = Field(default_factory=list)


class MoverCategoryBuckets(BaseModel):
    stocks: List[Mover] = Field(default_factory=list)
    crypto: List[Mover] = Field(default_factory=list)
    etfs: List[Mover] = Field(default_factory=list)


class MoversResponse(BaseModel):
    gainers: List[Mover]
    losers: List[Mover]
    gainersByCategory: MoverCategoryBuckets = Field(default_factory=MoverCategoryBuckets)
    losersByCategory: MoverCategoryBuckets = Field(default_factory=MoverCategoryBuckets)
    source: str = "alpaca"


class FeaturedMoverPeriod(str, Enum):
    day = "day"
    week = "week"
    month = "month"


class FeaturedMoverDirection(str, Enum):
    gainer = "gainer"
    loser = "loser"


class FeaturedMoverAsset(str, Enum):
    all = "all"
    stocks = "stocks"
    crypto = "crypto"
    etfs = "etfs"


class FeaturedMoverSeriesPoint(BaseModel):
    date: datetime
    close: float


class FeaturedMoverResponse(BaseModel):
    period: FeaturedMoverPeriod
    direction: FeaturedMoverDirection
    asset: FeaturedMoverAsset
    title: str
    mover: Optional[Mover] = None
    historicalSeries: List[FeaturedMoverSeriesPoint] = Field(default_factory=list)
    source: str = "alpaca"
