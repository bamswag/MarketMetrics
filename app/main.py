import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.routes import alerts, forecasts, growth_projections, health, instruments, movers, search
from app.api.routes import simulations, watchlists, websocket_quotes
from app.api.routes.auth import router as auth_router
from app.core.config import settings

logging.basicConfig(
    level=getattr(logging, settings.app_log_level, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title="Market Metrics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, tags=["Health"])
app.include_router(simulations.router)
app.include_router(movers.router)
app.include_router(search.router)
app.include_router(instruments.router)
app.include_router(forecasts.router)
app.include_router(growth_projections.router)
app.include_router(auth_router)
app.include_router(websocket_quotes.router)
app.include_router(watchlists.router)
app.include_router(alerts.router)

# Serve React frontend static files
static_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.isdir(static_dir):
    app.mount('/', StaticFiles(directory=static_dir, html=True), name='frontend')
else:
    # Fallback: if frontend/dist doesn't exist, just log a warning
    @app.get("/")
    def root():
        return {"message": "MarketMetrics API is running. Visit /docs"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
