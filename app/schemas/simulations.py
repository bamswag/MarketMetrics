from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


class SimulationStrategy(str, Enum):
    buy_and_hold = "buy_and_hold"
    dollar_cost_averaging = "dollar_cost_averaging"


class ContributionFrequency(str, Enum):
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"


class SimulationRequest(BaseModel):
    assetSymbol: str = Field(..., example="AAPL")
    initialAmount: float = Field(..., gt=0, example=1000.0)
    startDate: date = Field(..., example="2023-01-01")
    endDate: date = Field(..., example="2023-12-31")
    strategy: SimulationStrategy = Field(default=SimulationStrategy.buy_and_hold)
    recurringContribution: float = Field(default=0.0, ge=0, example=200.0)
    contributionFrequency: ContributionFrequency = Field(default=ContributionFrequency.monthly)

    @model_validator(mode="after")
    def validate_strategy_inputs(self) -> "SimulationRequest":
        if self.endDate <= self.startDate:
            raise ValueError("endDate must be after startDate.")
        if (
            self.strategy == SimulationStrategy.dollar_cost_averaging
            and self.recurringContribution <= 0
        ):
            raise ValueError(
                "recurringContribution must be greater than 0 when using dollar_cost_averaging."
            )
        return self


class StrategyPerformance(BaseModel):
    strategy: SimulationStrategy
    investedAmount: float
    finalValue: float
    profit: float
    totalReturnPct: float
    annualizedReturnPct: float
    volatilityPct: float
    maxDrawdownPct: float
    bestDayReturnPct: float
    worstDayReturnPct: float
    contributionCount: int


class SimulationChartPoint(BaseModel):
    date: date
    buyAndHoldValue: float
    buyAndHoldInvestedCapital: float
    dollarCostAveragingValue: Optional[float] = None
    dollarCostAveragingInvestedCapital: Optional[float] = None
    contributionAmount: Optional[float] = None
    contributionOccurred: bool = False


class ComparisonSummary(BaseModel):
    bestStrategy: SimulationStrategy
    bestFinalValue: float
    bestReturnPct: float
    finalValueGap: float
    returnGapPct: float


class SimulationResult(BaseModel):
    assetSymbol: str
    startDate: date
    endDate: date
    initialAmount: float
    selectedStrategy: SimulationStrategy
    recurringContribution: float
    contributionFrequency: ContributionFrequency
    investedAmount: float
    finalValue: float
    profit: float
    totalReturnPct: float
    annualizedReturnPct: float
    volatilityPct: float
    maxDrawdownPct: float
    companyName: Optional[str] = None
    comparison: List[StrategyPerformance]
    comparisonSummary: ComparisonSummary
    chartData: List[SimulationChartPoint]
