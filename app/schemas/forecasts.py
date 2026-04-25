from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class PredictionRequest(BaseModel):
    symbol: str = Field(..., example="MSFT")
    horizonDays: int = Field(..., ge=1, le=90, example=5)
    initialAmount: Optional[float] = Field(default=None, gt=0, example=1000)
    historyWindowDays: int = Field(default=365, ge=252, le=2000)
    modelVersion: Optional[str] = None


class PriceSeriesPoint(BaseModel):
    date: date
    close: float


class ForecastSeriesPoint(BaseModel):
    date: date
    predictedClose: float
    predictedReturnPct: float
    predictedCloseLow: Optional[float] = None
    predictedCloseHigh: Optional[float] = None


class ProjectedPortfolioPoint(BaseModel):
    date: date
    projectedValue: float


class PredictionMetrics(BaseModel):
    maePrice: float
    rmsePrice: float
    maeReturn: float
    directionalAccuracy: float
    rmseReturn: Optional[float] = None
    returnCorrelation: Optional[float] = None
    upDayHitRate: Optional[float] = None
    downDayHitRate: Optional[float] = None
    signalStrategyReturn: Optional[float] = None
    buyAndHoldReturn: Optional[float] = None
    naiveMaePrice: Optional[float] = None


class FeatureImportancePoint(BaseModel):
    feature: str
    importance: float


class PredictionResponse(BaseModel):
    symbol: str
    lastActualClose: float
    predictedNextDayReturn: float
    predictedNextDayClose: float
    forecastHorizonDays: int
    historicalSeries: List[PriceSeriesPoint]
    forecastSeries: List[ForecastSeriesPoint]
    predictedReturnPctOverHorizon: float
    metrics: PredictionMetrics
    featureImportances: List[FeatureImportancePoint]
    modelVersion: str
    trainedThroughDate: date
    projectedPortfolioSeries: Optional[List[ProjectedPortfolioPoint]] = None
    projectedEndValue: Optional[float] = None
    projectedGrowthPct: Optional[float] = None
    modelType: Optional[str] = None
    forecastMethodUsed: Optional[str] = None
    supportedDirectHorizons: List[int] = Field(default_factory=list)
    predictionIntervalLevel: Optional[float] = None
    intervalSource: Optional[str] = None
