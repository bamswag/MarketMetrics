from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user
from app.models.simulation import SimulationRequest, SimulationResult
from app.services.simulation_service import run_simulation

router = APIRouter(prefix="/simulate",tags=["Simulation"],)


@router.post("/", response_model=SimulationResult)
async def simulate(payload: SimulationRequest, user=Depends(get_current_user)):
    return await run_simulation(payload)
