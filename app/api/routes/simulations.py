from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_dependencies import get_current_user
from app.core.db_dependencies import get_db
from app.orm_models.user import UserDB
from app.schemas.simulation_history import SimulationHistoryNoteUpdate, SimulationHistoryOut
from app.schemas.simulations import SimulationRequest, SimulationResult
from app.services.simulation_history import (
    clear_simulation_history,
    delete_simulation_history_item,
    list_simulation_history,
    update_simulation_history_notes,
)
from app.services.simulations import run_simulation

router = APIRouter(prefix="/simulate", tags=["Simulation"])


@router.post("/", response_model=SimulationResult)
async def simulate(
    payload: SimulationRequest,
    user: UserDB = Depends(get_current_user),
):
    return await run_simulation(payload)


@router.get("/history", response_model=list[SimulationHistoryOut])
def get_simulation_history(
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    return list_simulation_history(db, user.userID)


@router.delete("/history", status_code=204)
def delete_all_simulation_history(
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    clear_simulation_history(db, user.userID)


@router.delete("/history/{simulation_id}", status_code=204)
def delete_simulation_history_entry(
    simulation_id: str,
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    deleted = delete_simulation_history_item(db, simulation_id, user.userID)
    if not deleted:
        raise HTTPException(status_code=404, detail="Simulation history entry not found")


@router.patch("/history/{simulation_id}", response_model=SimulationHistoryOut)
def patch_simulation_history_notes(
    simulation_id: str,
    payload: SimulationHistoryNoteUpdate,
    db: Session = Depends(get_db),
    user: UserDB = Depends(get_current_user),
):
    record = update_simulation_history_notes(db, simulation_id, user.userID, payload.notes)
    if record is None:
        raise HTTPException(status_code=404, detail="Simulation history entry not found")
    return record
