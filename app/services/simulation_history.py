from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import uuid4

from sqlalchemy.orm import Session

from app.orm_models.simulation_history import SimulationHistoryDB
from app.schemas.simulations import SimulationRequest, SimulationResult


def save_simulation_history(
    db: Session,
    user_id: str,
    request: SimulationRequest,
    result: SimulationResult,
) -> SimulationHistoryDB:
    record = SimulationHistoryDB(
        simulationId=str(uuid4()),
        userID=user_id,
        assetSymbol=result.assetSymbol,
        assetName=result.companyName,
        strategy=result.selectedStrategy.value,
        startDate=request.startDate.isoformat(),
        endDate=request.endDate.isoformat(),
        initialAmount=request.initialAmount,
        recurringContribution=request.recurringContribution,
        contributionFrequency=request.contributionFrequency.value,
        investedAmount=result.investedAmount,
        finalValue=result.finalValue,
        totalReturnPct=result.totalReturnPct,
        annualizedReturnPct=result.annualizedReturnPct,
        volatilityPct=result.volatilityPct,
        maxDrawdownPct=result.maxDrawdownPct,
        notes=None,
        createdAt=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_simulation_history(db: Session, user_id: str) -> List[SimulationHistoryDB]:
    return (
        db.query(SimulationHistoryDB)
        .filter(SimulationHistoryDB.userID == user_id)
        .order_by(SimulationHistoryDB.createdAt.desc())
        .all()
    )
