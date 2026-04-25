import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.api.routes import alerts, forecasts, growth_projections, health, instruments, movers, quotes, search
from app.api.routes import simulations, watchlists, websocket_quotes
from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.core.config import settings
from app.core.database import database_runtime_summary

logging.basicConfig(
    level=getattr(logging, settings.app_log_level, logging.INFO),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger(__name__)

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
app.include_router(quotes.router)
app.include_router(instruments.router)
app.include_router(forecasts.router)
app.include_router(growth_projections.router)
app.include_router(auth_router)
app.include_router(websocket_quotes.router)
app.include_router(watchlists.router)
app.include_router(alerts.router)
app.include_router(admin_router)

# Serve React frontend static files
static_dir = Path(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")).resolve()
if static_dir.is_dir():
    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/favicon.svg", include_in_schema=False)
    def frontend_favicon():
        return FileResponse(static_dir / "favicon.svg")

    @app.get("/icons.svg", include_in_schema=False)
    def frontend_icons():
        return FileResponse(static_dir / "icons.svg")

    @app.get("/", include_in_schema=False)
    def frontend_root():
        return FileResponse(static_dir / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    def frontend_app(full_path: str):
        requested_file = static_dir / full_path
        if requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(static_dir / "index.html")
else:
    # Fallback: if frontend/dist doesn't exist, just log a warning
    @app.get("/")
    def root():
        return {"message": "MarketMetrics API is running. Visit /docs"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "Unhandled server error while processing %s %s",
        request.method,
        request.url.path,
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Check backend logs for details."},
    )


@app.on_event("startup")
def log_runtime_environment() -> None:
    logger.info("MarketMetrics API starting with database %s", database_runtime_summary())

    # Refuse to start on Render if JWT_SECRET is missing or still set to the dev placeholder.
    running_on_render = bool(
        os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID") or os.getenv("RENDER_EXTERNAL_URL")
    )
    jwt_secret = os.getenv("JWT_SECRET", "")
    if running_on_render and jwt_secret in ("", "change-me"):
        raise RuntimeError(
            "JWT_SECRET must be set to a secure random value for Render deployments. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
