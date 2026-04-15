from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

DATABASE_URL = settings.database_url

# Required for SQLite with FastAPI (multi-threading)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

_pool_kwargs: dict = {}
if not DATABASE_URL.startswith("sqlite"):
    _pool_kwargs = {
        "pool_size": 3,
        "max_overflow": 7,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

engine = create_engine(DATABASE_URL, connect_args=connect_args, **_pool_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def database_runtime_summary() -> str:
    url = engine.url
    dialect = engine.dialect.name
    database_name = url.database or ""

    if dialect == "sqlite":
        return f"{dialect}:///{database_name}"

    host = url.host or "unknown-host"
    port = f":{url.port}" if url.port else ""
    return f"{dialect}://{host}{port}/{database_name}"
