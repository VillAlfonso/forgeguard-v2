"""
Revelator Configuration
=======================
All settings loaded from environment variables.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
ENV_PATH = Path(__file__).parent.parent.parent / ".env"
load_dotenv(ENV_PATH)


# ============================================
# DATABASE
# ============================================
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./forgeguard.db")

# ============================================
# AUTH / JWT
# ============================================
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE-ME-generate-a-random-64-char-string")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

# ============================================
# OAUTH (Google)
# ============================================
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# ============================================
# PAYMENTS (Stripe)
# ============================================
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID_PRO = os.getenv("STRIPE_PRICE_ID_PRO", "")
STRIPE_PRICE_ID_PREMIUM = os.getenv("STRIPE_PRICE_ID_PREMIUM", "")
# Legacy alias — old "basic" tier maps to new "pro". Keep so existing .env files still load.
STRIPE_PRICE_ID_BASIC = os.getenv("STRIPE_PRICE_ID_BASIC", STRIPE_PRICE_ID_PRO)

# ============================================
# LLM
# ============================================
USE_CLOUD_LLM = os.getenv("USE_CLOUD_LLM", "true").lower() == "true"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
# Vision-capable Groq model. Receives the annotated image + prompt for the explainer.
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# ============================================
# YOLO
# ============================================
YOLO_WEIGHTS_PATH = os.getenv("YOLO_WEIGHTS_PATH", "./weights/best.pt")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))

# ============================================
# ROBOFLOW (hosted inference for select categories)
# ============================================
# When set, the digital_cut_paste category routes to a Roboflow-hosted model
# instead of a local YOLO checkpoint. Other categories continue to use local
# weights until they are migrated.
ROBOFLOW_API_KEY = os.getenv("ROBOFLOW_API_KEY", "")
ROBOFLOW_API_URL = os.getenv("ROBOFLOW_API_URL", "https://serverless.roboflow.com")
ROBOFLOW_CUT_PASTE_MODEL = os.getenv("ROBOFLOW_CUT_PASTE_MODEL", "find-cut-and-paste/1")

# ============================================
# APP
# ============================================
APP_NAME = "Revelator"
APP_VERSION = "2.0.0"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
API_URL = os.getenv("API_URL", "http://localhost:8000")

# Uploaded scan images are stored here (created on startup if missing).
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(Path(__file__).parent.parent / "uploads")))

# Plan limits. -1 means unlimited.
UNLIMITED = -1
FREE_SCANS_PER_MONTH = int(os.getenv("FREE_SCANS_PER_MONTH", "10"))
PRO_SCANS_PER_MONTH = int(os.getenv("PRO_SCANS_PER_MONTH", "-1"))         # $5/mo unlimited
PREMIUM_SCANS_PER_MONTH = int(os.getenv("PREMIUM_SCANS_PER_MONTH", "-1"))  # $10/mo unlimited + AI

# Plan pricing (USD/month). Source of truth for the /plans API response.
PRO_PRICE_USD = float(os.getenv("PRO_PRICE_USD", "5"))
PREMIUM_PRICE_USD = float(os.getenv("PREMIUM_PRICE_USD", "10"))

# Plans that include the AI/LLM-generated forensic explanation.
LLM_PLANS = {"pro", "premium"}

# ============================================
# EMAIL (optional, for password reset etc.)
# ============================================
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@forgeguard.app")
