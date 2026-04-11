from typing import Optional

from pydantic import BaseModel


class CompanySearchResult(BaseModel):
    symbol: str
    name: str
    type: Optional[str] = None
    exchange: Optional[str] = None
    region: Optional[str] = None
    marketOpen: Optional[str] = None
    marketClose: Optional[str] = None
    timezone: Optional[str] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    tradable: Optional[bool] = None
    matchScore: Optional[float] = None


class CompanySearchResponse(BaseModel):
    query: str
    results: list[CompanySearchResult]
