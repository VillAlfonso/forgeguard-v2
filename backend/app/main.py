"""
Revelator SaaS API
==================
Full-stack document forgery detection with auth, payments, and scan history.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import APP_NAME, APP_VERSION, FRONTEND_URL, UPLOAD_DIR, USE_CLOUD_LLM, OLLAMA_URL, OLLAMA_MODEL
from .database import init_db
from .forgery.detector import load_yolo_models, TRAINING_STATUS, DATASET_COUNTS, yolo_models
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

    # Load YOLO models and count dataset images
    print("\nLoading YOLO models and counting datasets...")
    load_yolo_models()
    trained_count = sum(1 for v in TRAINING_STATUS.values() if v)
    total_images = sum(DATASET_COUNTS.values())
    print(f"  Models ready: {trained_count}/16 trained")
    print(f"  Dataset images: {total_images:,} total")

    # Warm up the local vision LLM so the first user request doesn't pay
    # the cold-load cost (which can exceed the gate timeout on CPU-only setups).
    if not USE_CLOUD_LLM:
        await _warm_up_ollama()

    print("=" * 50 + "\n")


async def _warm_up_ollama():
    import asyncio
    import requests

    print(f"\nWarming up Ollama vision model ({OLLAMA_MODEL})...")
    print("  This pre-loads the model so the first /analyze request is fast.")
    print("  Cold load takes ~60-120s on CPU; subsequent requests reuse it.")

    def _ping():
        try:
            # /api/generate with empty prompt is the canonical Ollama warm-up:
            # it loads weights into memory without spending tokens.
            r = requests.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": "", "keep_alive": "30m"},
                timeout=600,
            )
            r.raise_for_status()
            return True
        except Exception as e:
            print(f"  Warm-up failed (non-fatal): {type(e).__name__}: {e}")
            return False

    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(None, _ping)
    if ok:
        print("  Vision model loaded and ready.")


@app.get("/api/health")
def health_check():
    loaded_models = len([m for m in yolo_models.values() if m is not None])
    return {
        "status": "healthy",
        "version": APP_VERSION,
        "yolo_loaded": loaded_models > 0,
        "models_count": loaded_models,
    }
