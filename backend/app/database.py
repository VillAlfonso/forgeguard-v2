"""
Database setup using SQLAlchemy + SQLite (swap to PostgreSQL by changing DATABASE_URL).
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables, then add new columns to existing tables for dev SQLite migrations."""
    Base.metadata.create_all(bind=engine)
    _ensure_columns()


def _ensure_columns():
    """Add columns introduced after the initial schema (SQLite-friendly, idempotent)."""
    from sqlalchemy import text, inspect

    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    with engine.begin() as conn:
        if "users" in table_names:
            user_cols = {col["name"] for col in inspector.get_columns("users")}
            if "is_admin" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"))
            if "google_id" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR UNIQUE"))

            # Plan rename migration: legacy 'basic' -> new 'pro' ($5 unlimited);
            # legacy 'pro' (1000-scan tier) -> new 'premium' ($10 unlimited + AI).
            # Existing 'free' and already-migrated rows are left alone.
            conn.execute(text("UPDATE users SET plan = 'premium' WHERE plan = 'pro'"))
            conn.execute(text("UPDATE users SET plan = 'pro' WHERE plan = 'basic'"))

        if "scans" in table_names:
            scan_cols = {col["name"] for col in inspector.get_columns("scans")}
            if "image_path" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN image_path VARCHAR"))
