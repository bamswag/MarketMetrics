from __future__ import annotations

from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ProjectionContributionFrequency(str, Enum):
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"


class LongTermProjectionRequest(BaseModel):
    symbol: str = Field(..., example="MSFT")
    years: int = Field(..., example=10)
    initialAmount: float = Field(..., example=1000.0)
    recurringContribution: float = Field(default=0.0, example=200.0)
    contributionFrequency: ProjectionContributionFrequency = Field(
        default=ProjectionContributionFrequency.monthly
    )
    expectedAnnualReturn: Optional[float] = Field(
        default=None,
        example=0.08,
        description="Decimal annual return assumption, e.g. 0.08 for 8%",
    )
    annualVolatility: Optional[float] = Field(
        default=None,
        example=0.18,
        description="Decimal annual volatility assumption, e.g. 0.18 for 18%",
    )
    inflationRate: float = Field(
        default=0.0,
        example=0.02,
        description="Decimal annual inflation assumption, e.g. 0.02 for 2%",
    )
    simulationRuns: int = Field(default=1000, example=1000)


class ProjectionAssumptionsOut(BaseModel):
    source: str
    expectedAnnualReturn: float
    annualVolatility: float
    inflationRate: float
    historyWindowYearsUsed: float


class MonthlyProjectionPoint(BaseModel):
    date: date
    investedCapital: float
    pessimisticValue: float
    baselineValue: float
    optimisticValue: float
    monteCarloP10: float
    monteCarloP50: float
    monteCarloP90: float


class DeterministicScenarioOut(BaseModel):
    annualReturnUsed: float
    projectedEndValue: float
    projectedGrowthPct: float


class DeterministicScenariosOut(BaseModel):
    pessimistic: DeterministicScenarioOut
    baseline: DeterministicScenarioOut
    optimistic: DeterministicScenarioOut


class MonteCarloSummaryOut(BaseModel):
    runs: int
    p10EndValue: float
    p50EndValue: float
    p90EndValue: float
    probabilityOfProfit: float
    bestCaseEndValue: float
    worstCaseEndValue: float


class ProjectionEndValuesOut(BaseModel):
    pessimistic: float
    baseline: float
    optimistic: float
    monteCarloP10: float
    monteCarloP50: float
    monteCarloP90: float


class LongTermProjectionResponse(BaseModel):
    symbol: str
    companyName: Optional[str] = None
    lastActualClose: float
    projectionYears: int
    projectionMonths: int
    assumptionsUsed: ProjectionAssumptionsOut
    monthlyChartData: List[MonthlyProjectionPoint]
    deterministicScenarios: DeterministicScenariosOut
    monteCarloSummary: MonteCarloSummaryOut
    projectedContributionTotal: float
    initialAmount: float
    totalInvested: float
    nominalEndValues: ProjectionEndValuesOut
    nominalProfitGain: ProjectionEndValuesOut
    nominalGrowthPct: ProjectionEndValuesOut
    realEndValues: Optional[ProjectionEndValuesOut] = None
    realProfitGain: Optional[ProjectionEndValuesOut] = None
    realGrowthPct: Optional[ProjectionEndValuesOut] = None
