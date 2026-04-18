from app.core.database import SessionLocal, ensure_local_sqlite_schema

def get_db():
    db = SessionLocal()
    try:
        ensure_local_sqlite_schema(db.get_bind())
        yield db
    finally:
        db.close()
