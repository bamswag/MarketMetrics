from threading import Lock

from sqlalchemy import create_engine, inspect, text
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

_SQLITE_SCHEMA_LOCK = Lock()
_ENSURED_SQLITE_SCHEMA_KEYS: set[str] = set()
_SQLITE_SCHEMA_PATCHES: dict[str, tuple[tuple[str, str], ...]] = {
    "users": (
        ("primaryAuthProvider", "ALTER TABLE users ADD COLUMN primaryAuthProvider VARCHAR DEFAULT 'password'"),
        ("passwordAuthEnabled", "ALTER TABLE users ADD COLUMN passwordAuthEnabled BOOLEAN DEFAULT 1"),
        ("googleSubject", "ALTER TABLE users ADD COLUMN googleSubject VARCHAR"),
        ("emailNotificationsEnabled", "ALTER TABLE users ADD COLUMN emailNotificationsEnabled BOOLEAN DEFAULT 0"),
        ("emailVerifiedAt", "ALTER TABLE users ADD COLUMN emailVerifiedAt DATETIME"),
        ("pendingEmail", "ALTER TABLE users ADD COLUMN pendingEmail VARCHAR"),
        ("sessionVersion", "ALTER TABLE users ADD COLUMN sessionVersion INTEGER DEFAULT 1"),
        ("passwordResetTokenHash", "ALTER TABLE users ADD COLUMN passwordResetTokenHash VARCHAR"),
        ("passwordResetTokenExpiresAt", "ALTER TABLE users ADD COLUMN passwordResetTokenExpiresAt DATETIME"),
        ("signupVerificationTokenHash", "ALTER TABLE users ADD COLUMN signupVerificationTokenHash VARCHAR"),
        ("signupVerificationTokenExpiresAt", "ALTER TABLE users ADD COLUMN signupVerificationTokenExpiresAt DATETIME"),
        ("pendingEmailTokenHash", "ALTER TABLE users ADD COLUMN pendingEmailTokenHash VARCHAR"),
        ("pendingEmailTokenExpiresAt", "ALTER TABLE users ADD COLUMN pendingEmailTokenExpiresAt DATETIME"),
        ("riskProfile", "ALTER TABLE users ADD COLUMN riskProfile VARCHAR"),
    ),
    "price_alerts": (
        ("severity", "ALTER TABLE price_alerts ADD COLUMN severity VARCHAR DEFAULT 'normal'"),
        ("expiresAt", "ALTER TABLE price_alerts ADD COLUMN expiresAt DATETIME"),
        ("referencePrice", "ALTER TABLE price_alerts ADD COLUMN referencePrice FLOAT"),
        ("lowerBound", "ALTER TABLE price_alerts ADD COLUMN lowerBound FLOAT"),
        ("upperBound", "ALTER TABLE price_alerts ADD COLUMN upperBound FLOAT"),
    ),
}


def _bind_cache_key(bind) -> str:
    engine = getattr(bind, "engine", bind)
    return str(getattr(engine, "url", engine))


def ensure_local_sqlite_schema(bind=engine) -> None:
    engine = getattr(bind, "engine", bind)
    if getattr(engine.dialect, "name", "") != "sqlite":
        return

    cache_key = _bind_cache_key(engine)
    with _SQLITE_SCHEMA_LOCK:
        if cache_key in _ENSURED_SQLITE_SCHEMA_KEYS:
            return

        import app.orm_models  # noqa: F401

        Base.metadata.create_all(bind=engine, checkfirst=True)
        inspector = inspect(engine)

        with engine.begin() as connection:
            for table_name, patches in _SQLITE_SCHEMA_PATCHES.items():
                if not inspector.has_table(table_name):
                    continue

                existing_columns = {
                    column["name"] for column in inspect(connection).get_columns(table_name)
                }
                for column_name, statement in patches:
                    if column_name not in existing_columns:
                        connection.execute(text(statement))

            if inspector.has_table("users"):
                connection.execute(
                    text(
                        """
                        UPDATE users
                        SET primaryAuthProvider = COALESCE(NULLIF(primaryAuthProvider, ''), 'password'),
                            passwordAuthEnabled = COALESCE(passwordAuthEnabled, 1),
                            emailNotificationsEnabled = COALESCE(emailNotificationsEnabled, 0),
                            sessionVersion = COALESCE(sessionVersion, 1),
                            emailVerifiedAt = CASE
                                WHEN emailVerifiedAt IS NULL
                                 AND signupVerificationTokenHash IS NULL
                                 AND signupVerificationTokenExpiresAt IS NULL
                                THEN createdAt
                                ELSE emailVerifiedAt
                            END
                        """
                    )
                )

            if inspector.has_table("price_alerts"):
                connection.execute(
                    text(
                        """
                        UPDATE price_alerts
                        SET severity = COALESCE(NULLIF(severity, ''), 'normal')
                        """
                    )
                )

        _ENSURED_SQLITE_SCHEMA_KEYS.add(cache_key)


def database_runtime_summary() -> str:
    url = engine.url
    dialect = engine.dialect.name
    database_name = url.database or ""

    if dialect == "sqlite":
        return f"{dialect}:///{database_name}"

    host = url.host or "unknown-host"
    port = f":{url.port}" if url.port else ""
    return f"{dialect}://{host}{port}/{database_name}"
