from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.orm_models.user import UserDB
from app.schemas.simulation_history import SimulationHistoryOut
from app.schemas.simulations import SimulationRequest, SimulationResult
from app.services.simulation_history import (
    list_simulation_history,
    save_simulation_history,
)
from app.services.simulations import run_simulation

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
