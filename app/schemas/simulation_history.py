from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SimulationHistoryOut(BaseModel):
    simulationId: str
    userID: str
    assetSymbol: str
    assetName: Optional[str] = None

    projectionYears: int
    initialAmount: float
    monthlyContribution: float
    inflationRate: float

    totalInvested: float
    baselineEndValue: float
    pessimisticEndValue: float
    optimisticEndValue: float
    baselineGrowthPct: float
    probabilityOfProfit: float

    notes: Optional[str] = None
    createdAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SimulationHistoryNoteUpdate(BaseModel):
    notes: Optional[str] = None
