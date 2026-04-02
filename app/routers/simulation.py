from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db_deps import get_db
from app.core.dependencies import get_current_user
from app.db_models.user import UserDB
from app.models.simulation import SimulationHistoryOut, SimulationRequest, SimulationResult
from app.services.simulation_service import run_simulation
from app.services.simulation_history_service import (
    list_simulation_history,
    save_simulation_history,
)

router = APIRouter(prefix="/simulate", tags=["Simulation"])


@router.post("/", response_model=SimulationResult)
async def simulate(
    payload: SimulationRequest,
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    result = await run_simulation(payload)
    save_simulation_history(db, user.userID, payload, result)
    return result


@router.get("/history", response_model=list[SimulationHistoryOut])
def get_simulation_history(
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    return list_simulation_history(db, user.userID)
