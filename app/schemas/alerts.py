from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator


class AlertCondition(str, Enum):
    above = "above"
    below = "below"


class AlertStatus(str, Enum):
    active = "active"
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
        return AlertStatus.active if self.isActive else AlertStatus.triggered

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
    triggeredAlerts: list[PriceAlertOut]
    totalCount: int
    activeCount: int
    triggeredCount: int
