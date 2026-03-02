from pydantic import BaseModel, Field
from typing import Optional
from datetime import date


class SimulationRequest(BaseModel):
    assetSymbol: str = Field(..., example="AAPL")
    initialAmount: float = Field(..., gt=0, example=1000.0)
    startDate: date = Field(..., example="2023-01-01")
    endDate: date = Field(..., example="2023-12-31")
    strategy: str = Field("buy_and_hold", example="buy_and_hold")
    frequency: Optional[str] = Field("daily", example="daily")


class SimulationResult(BaseModel):
    assetSymbol: str
    startDate: date
    endDate: date
    initialAmount: float
    finalValue: float
    profit: float
    totalReturnPct: float
    maxDrawdownPct: float
    companyName: Optional[str] = None