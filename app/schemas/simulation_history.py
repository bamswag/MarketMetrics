from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SimulationHistoryOut(BaseModel):
    simulationId: str
    userID: str
    assetSymbol: str
    assetName: Optional[str] = None
    strategy: str
    startDate: str
    endDate: str
    initialAmount: float
    recurringContribution: float
    contributionFrequency: Optional[str] = None
    investedAmount: float
    finalValue: float
    totalReturnPct: float
    annualizedReturnPct: Optional[float] = None
    volatilityPct: Optional[float] = None
    maxDrawdownPct: Optional[float] = None
    notes: Optional[str] = None
    createdAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
