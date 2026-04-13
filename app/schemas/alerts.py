from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator


class AlertCondition(str, Enum):
    above = "above"
    below = "below"


class AlertStatus(str, Enum):
    active = "active"
    paused = "paused"
    triggered = "triggered"


class PriceAlertCreate(BaseModel):
    symbol: str = Field(..., example="AAPL")
    condition: AlertCondition = Field(..., example="above")
    targetPrice: float = Field(..., gt=0, example=250.0)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        symbol = value.strip().upper()
        if not symbol:
            raise ValueError("Symbol is required")
        return symbol


class PriceAlertUpdate(BaseModel):
    isActive: Optional[bool] = None
    resetTriggered: bool = False
    targetPrice: Optional[float] = Field(default=None, gt=0)
    condition: Optional[AlertCondition] = None


class AlertHistoryOut(BaseModel):
    createdAt: datetime
    updatedAt: datetime
    lastEvaluatedAt: Optional[datetime] = None
    triggeredAt: Optional[datetime] = None


class PriceAlertOut(BaseModel):
    id: str
    userID: str
    symbol: str
    condition: AlertCondition
    targetPrice: float
    isActive: bool
    createdAt: datetime
    updatedAt: datetime
    lastEvaluatedAt: Optional[datetime] = None
    triggeredAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def status(self) -> AlertStatus:
        if self.isActive:
            return AlertStatus.active
        if self.triggeredAt is not None:
            return AlertStatus.triggered
        return AlertStatus.paused

    @computed_field
    @property
    def history(self) -> AlertHistoryOut:
        return AlertHistoryOut(
            createdAt=self.createdAt,
            updatedAt=self.updatedAt,
            lastEvaluatedAt=self.lastEvaluatedAt,
            triggeredAt=self.triggeredAt,
        )


class TriggeredAlertOut(BaseModel):
    id: str
    symbol: str
    condition: AlertCondition
    targetPrice: float
    triggeredAt: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AlertListResponse(BaseModel):
    activeAlerts: list[PriceAlertOut]
    pausedAlerts: list[PriceAlertOut]
    triggeredAlerts: list[PriceAlertOut]
    totalCount: int
    activeCount: int
    pausedCount: int
    triggeredCount: int
