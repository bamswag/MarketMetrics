from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from app.orm_models.simulation_history import SimulationHistoryDB
from app.schemas.growth_projections import LongTermProjectionRequest, LongTermProjectionResponse


def save_growth_projection_history(
    db: Session,
    user_id: str,
    request: LongTermProjectionRequest,
    result: LongTermProjectionResponse,
) -> SimulationHistoryDB:
    record = SimulationHistoryDB(
        simulationId=str(uuid4()),
        userID=user_id,
        assetSymbol=result.symbol,
        assetName=result.companyName,
        projectionYears=request.years,
        initialAmount=request.initialAmount,
        monthlyContribution=request.recurringContribution,
        inflationRate=request.inflationRate,
        totalInvested=result.totalInvested,
        baselineEndValue=result.nominalEndValues.baseline,
        pessimisticEndValue=result.nominalEndValues.pessimistic,
        optimisticEndValue=result.nominalEndValues.optimistic,
        baselineGrowthPct=result.nominalGrowthPct.baseline,
        probabilityOfProfit=result.monteCarloSummary.probabilityOfProfit,
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


def delete_simulation_history_item(
    db: Session, simulation_id: str, user_id: str
) -> bool:
    deleted_count = (
        db.query(SimulationHistoryDB)
        .filter(
            SimulationHistoryDB.simulationId == simulation_id,
            SimulationHistoryDB.userID == user_id,
        )
        .delete()
    )
    db.commit()
    return deleted_count > 0


def clear_simulation_history(db: Session, user_id: str) -> int:
    deleted_count = (
        db.query(SimulationHistoryDB)
        .filter(SimulationHistoryDB.userID == user_id)
        .delete()
    )
    db.commit()
    return deleted_count


def update_simulation_history_notes(
    db: Session,
    simulation_id: str,
    user_id: str,
    notes: Optional[str],
) -> Optional[SimulationHistoryDB]:
    record = (
        db.query(SimulationHistoryDB)
        .filter(
            SimulationHistoryDB.simulationId == simulation_id,
            SimulationHistoryDB.userID == user_id,
        )
        .first()
    )
    if record is None:
        return None
    record.notes = notes
    db.commit()
    db.refresh(record)
    return record
