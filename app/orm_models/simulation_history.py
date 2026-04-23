from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from app.core.database import Base


class SimulationHistoryDB(Base):
    __tablename__ = "simulation_history"

    simulationId = Column(String, primary_key=True, index=True)
    userID = Column(String, index=True, nullable=False)

    assetSymbol = Column(String, nullable=False)
    assetName = Column(String, nullable=True)

    # Growth-projection request params (stored for re-run)
    projectionYears = Column(Integer, nullable=False)
    initialAmount = Column(Float, nullable=False)
    monthlyContribution = Column(Float, nullable=False, default=0.0)
    inflationRate = Column(Float, nullable=False, default=0.0)

    # Key result metrics (stored for display)
    totalInvested = Column(Float, nullable=False)
    baselineEndValue = Column(Float, nullable=False)
    pessimisticEndValue = Column(Float, nullable=False)
    optimisticEndValue = Column(Float, nullable=False)
    baselineGrowthPct = Column(Float, nullable=False)
    probabilityOfProfit = Column(Float, nullable=False)

    notes = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
