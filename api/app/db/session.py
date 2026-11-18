"""Database engine and session management supporting both PostgreSQL and SQLite."""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from api.app.core.config import settings

db_url = settings.DATABASE_URL

# Ensure data directory exists if using SQLite
if db_url.startswith("sqlite"):
    Path("data").mkdir(exist_ok=True)
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False},
    )

    # Enable foreign keys on SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

else:
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
