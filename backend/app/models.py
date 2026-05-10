"""
Database models for Revelator SaaS.
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    full_name = Column(String, default="")
    google_id = Column(String, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    role = Column(String, default="user", nullable=False)  # user | admin | superadmin
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    scans_this_month = Column(Integer, default=0)
    scan_reset_date = Column(DateTime, nullable=True)
    gemini_api_key = Column(String, nullable=True)  # legacy single-key field (kept for migration)

    # Relationships
    scans = relationship("Scan", back_populates="user", cascade="all, delete-orphan")
    api_keys = relationship("UserApiKey", back_populates="user", cascade="all, delete-orphan")


class UserApiKey(Base):
    __tablename__ = "user_api_keys"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    label = Column(String, nullable=False, default="My Key")
    api_key = Column(String, nullable=False)
    is_active = Column(Boolean, default=False)
    quota_exhausted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="api_keys")


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id = Column(String, primary_key=True, default=gen_uuid)
    code = Column(String, unique=True, nullable=False, index=True)
    plan = Column(String, nullable=False)  # free, pro, premium
    expires_at = Column(DateTime, nullable=True)
    max_uses = Column(Integer, nullable=True)  # None = unlimited
    uses_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, default=gen_uuid)
    scan_id = Column(String, unique=True, nullable=False, index=True)  # FG-YYYYMMDD-XXXXX
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    category_analyzed = Column(String, nullable=True)
    verdict = Column(String, nullable=False)  # forged, suspicious, no_forgery_detected, not_a_document
    confidence_score = Column(Float, nullable=False)
    llm_explanation = Column(Text, nullable=True)
    annotations_json = Column(Text, nullable=True)  # JSON string of annotations
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    image_path = Column(String, nullable=True)  # relative path under UPLOAD_DIR
    training_warning = Column(Text, nullable=True)
    document_type = Column(String, nullable=True)  # key from document_types.py (passport, bank_check, etc.)
    # Gemini Vision classification — one of the 19 codes in forgery.gemini_vision.CATEGORY_CODES.
    detected_category = Column(String, nullable=True, index=True)
    detected_subtype = Column(String, nullable=True)
    category_explanation = Column(Text, nullable=True)
    tools_likely_used = Column(String, nullable=True)
    category_confidence = Column(Float, nullable=True)
    category_evidence = Column(Text, nullable=True)  # JSON array stored as string
    # Extended fields — saved for full history replay
    reasoning_steps = Column(Text, nullable=True)   # JSON array
    anomaly_location = Column(String, nullable=True)
    alternatives = Column(Text, nullable=True)       # JSON array
    certainty_level = Column(String, nullable=True)  # HIGH / MEDIUM / LOW
    # User context inputs
    suspicion_reason = Column(Text, nullable=True)
    area_of_concern = Column(String, nullable=True)
    image_source = Column(String, nullable=True)
    shot_type = Column(String, nullable=True)
    lighting = Column(String, nullable=True)
    physical_clues = Column(String, nullable=True)
    is_forged_belief = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="scans")


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    admin_id = Column(String, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)  # ban_user, unban_user, promote_admin, demote_admin, generate_code, etc.
    target_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    details = Column(Text, nullable=True)  # JSON details about the action
    created_at = Column(DateTime, default=datetime.utcnow)

    admin = relationship("User", foreign_keys=[admin_id])
    target_user = relationship("User", foreign_keys=[target_user_id])
