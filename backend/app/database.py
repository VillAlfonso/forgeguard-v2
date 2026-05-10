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
                conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR"))
            if "paymongo_customer_id" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN paymongo_customer_id VARCHAR"))
            if "paymongo_source_id" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN paymongo_source_id VARCHAR"))
            if "is_super_admin" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT 0"))
            if "gemini_api_key" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN gemini_api_key VARCHAR"))

            # Plan rename migration: legacy 'basic' -> new 'pro' ($5 unlimited);
            # legacy 'pro' (1000-scan tier) -> new 'premium' ($10 unlimited + AI).
            # Existing 'free' and already-migrated rows are left alone.
            conn.execute(text("UPDATE users SET plan = 'premium' WHERE plan = 'pro'"))
            conn.execute(text("UPDATE users SET plan = 'pro' WHERE plan = 'basic'"))

        if "scans" in table_names:
            scan_cols = {col["name"] for col in inspector.get_columns("scans")}
            if "image_path" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN image_path VARCHAR"))
            if "detected_category" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN detected_category VARCHAR"))
            if "detected_subtype" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN detected_subtype VARCHAR"))
            if "category_explanation" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN category_explanation TEXT"))
            if "tools_likely_used" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN tools_likely_used VARCHAR"))
            if "category_confidence" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN category_confidence FLOAT"))
            if "category_evidence" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN category_evidence TEXT"))
            if "document_type" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN document_type VARCHAR"))
            if "reasoning_steps" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN reasoning_steps TEXT"))
            if "anomaly_location" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN anomaly_location VARCHAR"))
            if "alternatives" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN alternatives TEXT"))
            if "certainty_level" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN certainty_level VARCHAR"))
            if "suspicion_reason" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN suspicion_reason TEXT"))
            if "area_of_concern" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN area_of_concern VARCHAR"))
            if "image_source" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN image_source VARCHAR"))
            if "shot_type" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN shot_type VARCHAR"))
            if "lighting" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN lighting VARCHAR"))
            if "physical_clues" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN physical_clues VARCHAR"))
            if "is_forged_belief" not in scan_cols:
                conn.execute(text("ALTER TABLE scans ADD COLUMN is_forged_belief VARCHAR"))

        # Create user_api_keys table for multi-key management
        if "user_api_keys" not in table_names:
            conn.execute(text("""
                CREATE TABLE user_api_keys (
                    id VARCHAR PRIMARY KEY,
                    user_id VARCHAR NOT NULL,
                    label VARCHAR NOT NULL DEFAULT 'My Key',
                    api_key VARCHAR NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 0,
                    quota_exhausted_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
            """))

        # Create admin_audit_logs table if it doesn't exist (for logging admin actions)
        if "admin_audit_logs" not in table_names:
            conn.execute(text("""
                CREATE TABLE admin_audit_logs (
                    id VARCHAR PRIMARY KEY,
                    admin_id VARCHAR NOT NULL,
                    action VARCHAR NOT NULL,
                    target_user_id VARCHAR,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(admin_id) REFERENCES users(id),
                    FOREIGN KEY(target_user_id) REFERENCES users(id)
                )
            """))
