"""
Document analysis routes.
"""

import io
import json
import random
import string
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from PIL import Image

from ..auth import get_current_user, get_user_from_token
from ..database import get_db
from ..models import User, Scan
from ..config import (
    FREE_SCANS_PER_MONTH, PRO_SCANS_PER_MONTH, PREMIUM_SCANS_PER_MONTH,
    UNLIMITED, LLM_PLANS, UPLOAD_DIR,
)
from ..forgery.detector import (
    CLASS_LABELS, NAME_TO_CLASS, VALID_CATEGORIES, TRAINING_STATUS,
    DATASET_COUNTS, LIMITED_DATA_THRESHOLD,
    run_yolo_inference, determine_verdict, get_training_warning,
)
from ..forgery.llm import get_llm_explanation
from ..forgery.document_gate import check_is_document

router = APIRouter(prefix="/api", tags=["analysis"])


PLAN_LIMITS = {
    "free": FREE_SCANS_PER_MONTH,
    "pro": PRO_SCANS_PER_MONTH,
    "premium": PREMIUM_SCANS_PER_MONTH,
}


def generate_scan_id() -> str:
    ts = datetime.now().strftime("%Y%m%d")
    rnd = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
    return f"RV-{ts}-{rnd}"


def check_scan_limit(user: User):
    """Reset monthly counter if needed, then enforce plan limit. UNLIMITED (-1) skips the cap."""
    now = datetime.utcnow()
    if user.scan_reset_date and (now - user.scan_reset_date).days >= 30:
        user.scans_this_month = 0
        user.scan_reset_date = now

    limit = PLAN_LIMITS.get(user.plan, FREE_SCANS_PER_MONTH)
    if limit == UNLIMITED:
        return
    if user.scans_this_month >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Monthly scan limit reached ({limit} scans on the {user.plan} plan). Upgrade for unlimited scans.",
        )


@router.get("/categories")
def get_categories():
    categories = {}
    category_totals = {}
    for class_id, info in CLASS_LABELS.items():
        cat = info["category"]
        if cat not in categories:
            categories[cat] = []
            category_totals[cat] = 0
        is_trained = TRAINING_STATUS.get(info["name"], False)
        count = DATASET_COUNTS.get(info["name"], 0)
        category_totals[cat] += count
        categories[cat].append({
            "class_id": class_id,
            "api_key": info["name"],
            "title": info["title"],
            "color": info["color"],
            "is_trained": is_trained,
            "training_note": "Ready" if is_trained else "Needs training data",
            "dataset_count": count,
            "limited_data": count < LIMITED_DATA_THRESHOLD,
        })
    trained_count = sum(1 for v in TRAINING_STATUS.values() if v)
    total_count = len(TRAINING_STATUS)
    return {
        "categories": categories,
        "category_dataset_totals": category_totals,
        "total_classes": len(CLASS_LABELS),
        "limited_data_threshold": LIMITED_DATA_THRESHOLD,
        "training_summary": {
            "trained": trained_count,
            "untrained": total_count - trained_count,
            "total": total_count,
            "percentage_ready": f"{(trained_count / total_count) * 100:.0f}%",
            "total_dataset_images": sum(DATASET_COUNTS.values()),
        },
    }


@router.get("/about")
def get_about_info():
    """Public endpoint: pipeline metadata + per-class dataset transparency for the About page."""
    by_category = {}
    for class_id, info in CLASS_LABELS.items():
        cat = info["category"]
        if cat not in by_category:
            by_category[cat] = {"classes": [], "total_images": 0, "trained_classes": 0}
        count = DATASET_COUNTS.get(info["name"], 0)
        is_trained = TRAINING_STATUS.get(info["name"], False)
        by_category[cat]["classes"].append({
            "title": info["title"],
            "api_key": info["name"],
            "is_trained": is_trained,
            "dataset_count": count,
            "limited_data": count < LIMITED_DATA_THRESHOLD,
        })
        by_category[cat]["total_images"] += count
        if is_trained:
            by_category[cat]["trained_classes"] += 1

    return {
        "pipeline": [
            {"step": 1, "name": "Upload", "detail": "Image arrives over HTTPS, normalized to RGB."},
            {"step": 2, "name": "Inference", "detail": "A YOLO object-detection model trained for the chosen forgery category scans the image."},
            {"step": 3, "name": "Aggregation", "detail": "Detected regions are scored; verdict is forged / suspicious / no_forgery_detected based on confidence and detection count."},
            {"step": 4, "name": "Explanation (optional)", "detail": "An LLM generates a plain-language summary of the findings, available on the LLM-tier plan."},
            {"step": 5, "name": "History", "detail": "The image and findings are stored against your account so you can revisit any scan."},
        ],
        "verdict_meaning": {
            "forged":               "High-confidence detections matching known forgery patterns. Manual review still recommended.",
            "suspicious":           "Anomalies present but below the strong-evidence threshold. Treat as inconclusive.",
            "no_forgery_detected":  "No matches above the detection threshold. Absence of evidence is not proof of authenticity.",
            "not_a_document":       "The upload doesn't appear to be a paper document, ID, certificate, receipt, or similar. Skipped without scoring.",
        },
        "limitations": [
            "Detection quality is bounded by training-set size and diversity. Classes with few samples will miss subtle cases.",
            "Lighting, camera angle, focus, and resolution materially affect results. Photograph documents flat with even light.",
            "Photographed prints of digital forgeries may produce different signals than the original digital file.",
            "The detector is calibrated for document examination; out-of-domain images (memes, photos of objects) yield meaningless verdicts.",
            "Revelator is a screening tool. Findings are not, by themselves, admissible forensic evidence.",
        ],
        "categories": by_category,
        "totals": {
            "classes": len(CLASS_LABELS),
            "trained_classes": sum(1 for v in TRAINING_STATUS.values() if v),
            "total_dataset_images": sum(DATASET_COUNTS.values()),
            "limited_data_threshold": LIMITED_DATA_THRESHOLD,
        },
    }


@router.post("/analyze")
def analyze_document(
    imageFile: UploadFile = File(...),
    category: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate category
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Options: {VALID_CATEGORIES}")

    # Check scan limit
    check_scan_limit(current_user)

    # Read image
    try:
        image_data = imageFile.file.read()
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")
        width, height = image.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    # Document gate — short-circuit before quota and DB write so users aren't
    # charged scans for non-document uploads.
    is_doc, gate_reason = check_is_document(image)
    if not is_doc:
        return {
            "scan_id": None,
            "category_analyzed": category,
            "verdict": "not_a_document",
            "confidence_score": 0.0,
            "llm_explanation": gate_reason or (
                "This does not appear to be a document. Please upload a paper "
                "document, ID, certificate, receipt, or similar."
            ),
            "llm_locked": False,
            "llm_required_plan": "pro",
            "annotations": [],
            "original_image_dimensions": {"width": width, "height": height},
            "timestamp": datetime.now().isoformat(),
            "training_warning": None,
            "category_trained": False,
        }

    # Run YOLO
    detections = run_yolo_inference(image, category)
    verdict, confidence = determine_verdict(detections)
    # LLM explanation is a paid feature — only generated for plans in LLM_PLANS.
    llm_explanation = (
        get_llm_explanation(detections, category, image=image)
        if current_user.plan in LLM_PLANS
        else None
    )
    training_warning = get_training_warning(category, detections)
    category_trained = TRAINING_STATUS.get(category, False) if category else False

    # Build annotations
    annotations = [
        {
            "id": d["id"],
            "type": "bounding_box",
            "coordinates": d["coordinates"],
            "color": d["color"],
            "title": d["title"],
            "confidence": d["confidence"],
        }
        for d in detections
    ]

    scan_id = generate_scan_id()

    # Persist the uploaded image to disk under uploads/<user_id>/<scan_id>.jpg.
    # Stored as JPEG to normalize format; original filename is kept in DB for display.
    user_dir = UPLOAD_DIR / current_user.id
    user_dir.mkdir(parents=True, exist_ok=True)
    saved_path = user_dir / f"{scan_id}.jpg"
    try:
        image.save(saved_path, format="JPEG", quality=88)
        image_path = str(saved_path.relative_to(UPLOAD_DIR))
    except Exception:
        image_path = None

    # Save to database
    scan = Scan(
        scan_id=scan_id,
        user_id=current_user.id,
        filename=imageFile.filename or "unknown",
        category_analyzed=category,
        verdict=verdict,
        confidence_score=confidence,
        llm_explanation=llm_explanation,
        annotations_json=json.dumps(annotations),
        image_width=width,
        image_height=height,
        image_path=image_path,
        training_warning=training_warning,
    )
    db.add(scan)
    current_user.scans_this_month += 1
    db.commit()

    return {
        "scan_id": scan_id,
        "category_analyzed": category,
        "verdict": verdict,
        "confidence_score": confidence,
        "llm_explanation": llm_explanation,
        "llm_locked": current_user.plan not in LLM_PLANS,
        "llm_required_plan": "pro",
        "annotations": annotations,
        "original_image_dimensions": {"width": width, "height": height},
        "timestamp": datetime.now().isoformat(),
        "training_warning": training_warning,
        "category_trained": category_trained,
    }


@router.post("/preliminary")
def preliminary_scan(
    imageFile: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        image_data = imageFile.file.read()
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {str(e)}")

    detections = run_yolo_inference(image, None)
    category_scores = {}
    for det in detections:
        cat = det["category"]
        if cat not in category_scores:
            category_scores[cat] = {"count": 0, "max_confidence": 0}
        category_scores[cat]["count"] += 1
        category_scores[cat]["max_confidence"] = max(category_scores[cat]["max_confidence"], det["confidence"])

    suggestions = sorted(
        [{"category": c, "confidence": s["max_confidence"], "detections": s["count"]}
         for c, s in category_scores.items()],
        key=lambda x: x["confidence"], reverse=True,
    )
    return {"suggestions": suggestions[:3], "total_detections": len(detections)}


@router.get("/history")
def get_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == current_user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = db.query(Scan).filter(Scan.user_id == current_user.id).count()
    return {
        "scans": [
            {
                "id": s.id,
                "scan_id": s.scan_id,
                "filename": s.filename,
                "category_analyzed": s.category_analyzed,
                "verdict": s.verdict,
                "confidence_score": s.confidence_score,
                "created_at": s.created_at.isoformat() if s.created_at else "",
                "has_image": bool(s.image_path),
                "has_llm_explanation": bool(s.llm_explanation),
            }
            for s in scans
        ],
        "total": total,
    }


@router.get("/history/{scan_id}")
def get_scan_detail(
    scan_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = db.query(Scan).filter(Scan.scan_id == scan_id, Scan.user_id == current_user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {
        "id": scan.id,
        "scan_id": scan.scan_id,
        "filename": scan.filename,
        "category_analyzed": scan.category_analyzed,
        "verdict": scan.verdict,
        "confidence_score": scan.confidence_score,
        "llm_explanation": scan.llm_explanation,
        "llm_locked": (not scan.llm_explanation) and (current_user.plan not in LLM_PLANS),
        "llm_required_plan": "pro",
        "annotations": json.loads(scan.annotations_json) if scan.annotations_json else [],
        "image_width": scan.image_width,
        "image_height": scan.image_height,
        "has_image": bool(scan.image_path),
        "training_warning": scan.training_warning,
        "created_at": scan.created_at.isoformat() if scan.created_at else "",
    }


@router.get("/history/{scan_id}/image")
def get_scan_image(
    scan_id: str,
    token: str = Query(..., description="Access token (query param so <img src> works)"),
    db: Session = Depends(get_db),
):
    """Serve the uploaded image for a scan. Owner-only."""
    user = get_user_from_token(token, db)
    scan = db.query(Scan).filter(Scan.scan_id == scan_id, Scan.user_id == user.id).first()
    if not scan or not scan.image_path:
        raise HTTPException(status_code=404, detail="Image not found")

    # Resolve and guard against path traversal: ensure the resolved file is inside UPLOAD_DIR.
    file_path = (UPLOAD_DIR / scan.image_path).resolve()
    if not str(file_path).startswith(str(UPLOAD_DIR.resolve())) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(file_path, media_type="image/jpeg")
