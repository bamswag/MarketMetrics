from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator


class AlertCondition(str, Enum):
    above = "above"
    below = "below"
    percent_change = "percent_change"
    range_exit = "range_exit"


class AlertStatus(str, Enum):
    active = "active"
    paused = "paused"
    triggered = "triggered"


class AlertSeverity(str, Enum):
    normal = "normal"
    urgent = "urgent"


class PriceAlertCreate(BaseModel):
    symbol: str = Field(..., example="AAPL")
    condition: AlertCondition = Field(..., example="above")
    targetPrice: Optional[float] = Field(default=None, gt=0, example=250.0)
    referencePrice: Optional[float] = Field(default=None, gt=0)
    lowerBound: Optional[float] = Field(default=None, gt=0)
    upperBound: Optional[float] = Field(default=None, gt=0)
    severity: AlertSeverity = AlertSeverity.normal
    expiresAt: Optional[datetime] = None

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        symbol = value.strip().upper()
        if not symbol:
            raise ValueError("Symbol is required")
        return symbol

    @model_validator(mode="after")
    def validate_condition_fields(self) -> "PriceAlertCreate":
        if self.condition in (AlertCondition.above, AlertCondition.below):
            if self.targetPrice is None:
                raise ValueError("targetPrice is required for above/below conditions")
            if self.referencePrice is not None:
                raise ValueError("referencePrice is not used for above/below conditions")
            if self.lowerBound is not None or self.upperBound is not None:
                raise ValueError("lowerBound/upperBound are not used for above/below conditions")
        elif self.condition == AlertCondition.percent_change:
            if self.targetPrice is None:
                raise ValueError("targetPrice (percent threshold) is required for percent_change")
            if self.referencePrice is None:
                raise ValueError("referencePrice is required for percent_change condition")
            if self.lowerBound is not None or self.upperBound is not None:
                raise ValueError("lowerBound/upperBound are not used for percent_change")
        elif self.condition == AlertCondition.range_exit:
            if self.lowerBound is None or self.upperBound is None:
                raise ValueError("lowerBound and upperBound are required for range_exit")
            if self.lowerBound >= self.upperBound:
                raise ValueError("lowerBound must be less than upperBound")
            if self.referencePrice is not None:
                raise ValueError("referencePrice is not used for range_exit")
        return self


class PriceAlertUpdate(BaseModel):
    isActive: Optional[bool] = None
    resetTriggered: bool = False
    targetPrice: Optional[float] = Field(default=None, gt=0)
    condition: Optional[AlertCondition] = None
    severity: Optional[AlertSeverity] = None
    expiresAt: Optional[datetime] = None


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
    targetPrice: Optional[float] = None
    referencePrice: Optional[float] = None
    lowerBound: Optional[float] = None
    upperBound: Optional[float] = None
    severity: Optional[str] = "normal"
    expiresAt: Optional[datetime] = None
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
    targetPrice: Optional[float] = None
    severity: Optional[str] = "normal"
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


# --- Feature 8: Alert history log ---

class AlertEventOut(BaseModel):
    id: str
    alertID: str
    symbol: str
    condition: str
    targetPrice: Optional[float] = None
    triggerPrice: float
    triggeredAt: datetime
    createdAt: datetime

    model_config = ConfigDict(from_attributes=True)


class AlertHistoryListResponse(BaseModel):
    events: list[AlertEventOut]
    totalCount: int


# --- Feature 10: Bulk management ---

class BulkAlertAction(BaseModel):
    alertIds: list[str] = Field(..., min_length=1)
    action: Literal["delete", "pause", "resume", "reset"]
