from datetime import date
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


class MoversResponse(BaseModel):
    gainers: List[Mover]
    losers: List[Mover]
    source: str = "alpaca"
