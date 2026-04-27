"""
Revelator SaaS API
==================
Full-stack document forgery detection with auth, payments, and scan history.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import APP_NAME, APP_VERSION, FRONTEND_URL, UPLOAD_DIR
from .database import init_db
from .forgery.detector import load_yolo_models, TRAINING_STATUS, yolo_models
from .routes import auth, analyze, payments, admin

app = FastAPI(title=f"{APP_NAME} API", description="AI-powered document forgery detection SaaS", version=APP_VERSION)

# CORS - allow the frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(analyze.router)
app.include_router(payments.router)
app.include_router(admin.router)


@app.on_event("startup")
async def startup_event():
    print("\n" + "=" * 50)
    print(f"{APP_NAME} API v{APP_VERSION} Starting...")
    print("=" * 50)

    # Create database tables
    print("\nInitializing database...")
    init_db()
    print("  Database ready.")

    # Ensure upload directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  Upload directory: {UPLOAD_DIR}")

    # Load YOLO models
    print("\nLoading YOLO models...")
    load_yolo_models()
    trained_count = sum(1 for v in TRAINING_STATUS.values() if v)
    print(f"\n  Models ready: {trained_count}/16 trained")
    print("=" * 50 + "\n")


@app.get("/api/health")
def health_check():
    loaded_models = len([m for m in yolo_models.values() if m is not None])
    return {
        "status": "healthy",
        "version": APP_VERSION,
        "yolo_loaded": loaded_models > 0,
        "models_count": loaded_models,
    }
