from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime
from app.core.database import Base

class SimulationHistoryDB(Base):
    __tablename__ = "simulation_history"

    simulationId = Column(String, primary_key=True, index=True)
    userID = Column(String, index=True, nullable=False)

    assetSymbol = Column(String, nullable=False)
    assetName = Column(String, nullable=True)
    strategy = Column(String, nullable=False)

    startDate = Column(String, nullable=False)  # keep as ISO string for simplicity now
    endDate = Column(String, nullable=False)

    initialAmount = Column(Float, nullable=False)
    finalValue = Column(Float, nullable=False)
    totalReturnPct = Column(Float, nullable=False)
    maxDrawdownPct = Column(Float, nullable=True)

    notes = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
