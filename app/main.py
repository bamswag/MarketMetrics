from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ws_quotes, health, simulation, movers
from app.routers import alerts
from app.routers import search
from app.routers.auth import router as auth_router
from app.routers import watchlist

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
app.include_router(search.router)
app.include_router(auth_router)
app.include_router(ws_quotes.router)
app.include_router(watchlist.router)
app.include_router(alerts.router)

# Optional: root route so / isn't 404
@app.get("/")
def root():
    return {"message": "MarketMetrics API is running. Visit /docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
