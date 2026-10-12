from typing import List, Optional

from app.schemas.instruments import InstrumentRange

from pydantic import BaseModel, Field


class CompanySearchResult(BaseModel):
    symbol: str
    name: str
    type: Optional[str] = None
    assetCategory: Optional[str] = None
    exchange: Optional[str] = None
    region: Optional[str] = None
    marketOpen: Optional[str] = None
    marketClose: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    tradable: Optional[bool] = None
    matchScore: Optional[float] = None
    chartReady: bool = True
    availableRanges: List[InstrumentRange] = Field(default_factory=list)
    defaultRange: Optional[InstrumentRange] = None
    historyPointCount: int = 0
    historyStart: Optional[str] = None
    historyEnd: Optional[str] = None


class CompanySearchResponse(BaseModel):
    query: str
    results: list[CompanySearchResult]
