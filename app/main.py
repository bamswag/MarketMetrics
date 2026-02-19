from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, simulation, movers
from app.routers.auth import router as auth_router

from app.core.database import Base, engine
from app.db_models.user import UserDB  # noqa: F401
from app.db_models.simulation_history import SimulationHistoryDB  # noqa: F401

app = FastAPI(title="Market Metrics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["Health"])
app.include_router(simulation.router)
app.include_router(movers.router)
app.include_router(auth_router)

# Create tables
Base.metadata.create_all(bind=engine)

# Optional: root route so / isn't 404
@app.get("/")
def root():
    return {"message": "MarketMetrics API is running. Visit /docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)