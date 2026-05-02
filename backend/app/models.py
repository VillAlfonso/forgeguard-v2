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
    google_id = Column(String, nullable=True, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Subscription
    plan = Column(String, default="free")  # free, basic, pro
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)
    scans_this_month = Column(Integer, default=0)
    scan_reset_date = Column(DateTime, nullable=True)

    # Relationships
    scans = relationship("Scan", back_populates="user", cascade="all, delete-orphan")


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
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="scans")
