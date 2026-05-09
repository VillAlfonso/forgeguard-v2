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
from ..forgery.llm import get_llm_explanation
from ..forgery.document_gate import check_is_document
from ..forgery.gemini_vision import classify as gemini_classify, CATEGORY_CODES, CATEGORY_LABELS
from ..forgery.document_types import get_document_types_response, DOCUMENT_TYPES
from ..forgery.model_tiers import (
    TIER_ANALYST, TIER_DETECTIVE, TIER_SHERLOCK, ALL_TIERS,
    TIER_AVAILABLE, TIER_META, get_tiers_response, is_tier_allowed,
)
from ..forgery import llava_client

router = APIRouter(prefix="/api", tags=["analysis"])

_FORGERY_CATS = {c for c in CATEGORY_CODES if c not in {"no_forgery_detected", "not_a_document", "other"}}

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


def _verdict_from_gemini(gemini: dict) -> tuple[str, float]:
    """Derive verdict + confidence from Gemini classification result."""
    cat = gemini["category"]
    conf = gemini["confidence"]
    if cat == "not_a_document":
        return "not_a_document", conf
    if cat == "no_forgery_detected":
        return "no_forgery_detected", conf
    if cat in _FORGERY_CATS:
        if conf >= 0.70:
            return "forged", conf
        if conf >= 0.50:
            return "suspicious", conf
        return "no_forgery_detected", conf
    # "other" or unknown — apply same confidence thresholds, don't auto-escalate
    if conf >= 0.70:
        return "forged", conf
    if conf >= 0.50:
        return "suspicious", conf
    return "no_forgery_detected", conf


@router.get("/document-types")
def get_document_types():
    return get_document_types_response()


@router.get("/tiers")
def get_model_tiers(current_user: User = Depends(get_current_user)):
    return get_tiers_response(user_plan=current_user.plan)


@router.get("/about")
def get_about_info():
    return {
        "verdict_meaning": {
            "forged":               "High-confidence indicators matching known forgery patterns. Manual review still recommended.",
            "suspicious":           "Anomalies present but below the strong-evidence threshold. Treat as inconclusive.",
            "no_forgery_detected":  "No forgery signals detected above threshold. Absence of evidence is not proof of authenticity.",
            "not_a_document":       "The upload doesn't appear to be a document. Skipped without scoring.",
        },
        "limitations": [
            "Gemini Vision is a general-purpose model — subtle, domain-specific forgeries may be missed.",
            "Lighting, camera angle, focus, and resolution materially affect results.",
            "Revelator is a screening tool. Findings are not by themselves admissible forensic evidence.",
        ],
        "model_tiers": list(TIER_META.values()),
    }


@router.post("/analyze")
def analyze_document(
    imageFile: UploadFile = File(...),
    category: Optional[str] = Form(None),
    document_type: Optional[str] = Form(None),
    model_tier: Optional[str] = Form(None),
    suspicion_reason: Optional[str] = Form(None),
    area_of_concern: Optional[str] = Form(None),
    image_source: Optional[str] = Form(None),
    is_forged_belief: Optional[str] = Form(None),
    shot_type: Optional[str] = Form(None),
    lighting: Optional[str] = Form(None),
    physical_clues: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Resolve & validate model tier
    tier = (model_tier or TIER_ANALYST).lower()
    if tier not in ALL_TIERS:
        raise HTTPException(status_code=400, detail=f"Invalid model_tier. Options: {ALL_TIERS}")
    if not is_tier_allowed(current_user.plan, tier):
        raise HTTPException(
            status_code=403,
            detail=f"The {TIER_META[tier]['name']} tier requires a higher plan. "
                   f"Upgrade to {TIER_META[tier]['plans'][0]} or above.",
        )

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

    # Document gate — don't charge quota for non-documents
    is_doc, gate_reason = check_is_document(image)
    if not is_doc:
        return {
            "scan_id": None,
            "document_type": document_type,
            "verdict": "not_a_document",
            "confidence_score": 0.0,
            "llm_explanation": gate_reason or "This does not appear to be a document.",
            "llm_locked": False,
            "llm_required_plan": "pro",
            "annotations": [],
            "original_image_dimensions": {"width": width, "height": height},
            "timestamp": datetime.now().isoformat(),
            "detected_category": "not_a_document",
            "detected_category_label": "Not a Document",
        }

    # Tiered inference: Analyst = Gemini only. Detective/Sherlock = LLaVA + Gemini (stubs for now).
    gemini = gemini_classify(
        image,
        document_type=document_type,
        suspicion_reason=suspicion_reason,
        area_of_concern=area_of_concern,
        image_source=image_source,
        is_forged_belief=is_forged_belief,
        shot_type=shot_type,
        lighting=lighting,
        physical_clues=physical_clues,
    )
    if gemini.get("_unavailable"):
        raise HTTPException(status_code=503, detail="Gemini Vision is temporarily unavailable. Please try again in a moment.")
    print(f"[DEBUG] model={gemini.get('model_used')} category={gemini.get('category')} confidence={gemini.get('confidence')} certainty={gemini.get('certainty_level')}")

    llava_result = None
    tier_used = TIER_ANALYST

    if tier == TIER_DETECTIVE and TIER_AVAILABLE[TIER_DETECTIVE]:
        llava_result = llava_client.classify_detective(image, document_type=document_type)
        if llava_result is not None:
            tier_used = TIER_DETECTIVE
    elif tier == TIER_SHERLOCK and TIER_AVAILABLE[TIER_SHERLOCK]:
        llava_result = llava_client.classify_sherlock(image, document_type=document_type)
        if llava_result is not None:
            tier_used = TIER_SHERLOCK

    # Ensemble blend if LLaVA returned a result
    if llava_result is not None:
        agreement = llava_result["category"] == gemini["category"]
        avg_conf = (llava_result["confidence"] + gemini["confidence"]) / 2
        gemini = {
            **gemini,
            "category": llava_result["category"],
            "category_label": llava_result.get("category_label", gemini["category_label"]),
            "subtype": llava_result.get("subtype", gemini["subtype"]),
            "confidence": avg_conf if agreement else min(llava_result["confidence"], gemini["confidence"]),
            "explanation": (
                f"{llava_result['explanation']}\n\nVerification: {gemini['explanation']}"
            ),
            "evidence": (llava_result.get("evidence") or []) + gemini.get("evidence", []),
            "tools_likely_used": llava_result.get("tools_likely_used", gemini["tools_likely_used"]),
            "certainty_level": "HIGH" if agreement and avg_conf >= 0.85 else (
                "MEDIUM" if agreement and avg_conf >= 0.60 else "LOW"
            ),
        }

    verdict, confidence = _verdict_from_gemini(gemini)

    # LLM explanation — pro feature
    llm_explanation = (
        get_llm_explanation(gemini, image=image)
        if current_user.plan in LLM_PLANS
        else None
    )

    scan_id = generate_scan_id()

    # Persist image
    user_dir = UPLOAD_DIR / current_user.id
    user_dir.mkdir(parents=True, exist_ok=True)
    saved_path = user_dir / f"{scan_id}.jpg"
    try:
        image.save(saved_path, format="JPEG", quality=88)
        image_path = str(saved_path.relative_to(UPLOAD_DIR))
    except Exception:
        image_path = None

    scan = Scan(
        scan_id=scan_id,
        user_id=current_user.id,
        filename=imageFile.filename or "unknown",
        category_analyzed=category,
        document_type=document_type,
        verdict=verdict,
        confidence_score=confidence,
        llm_explanation=llm_explanation,
        annotations_json=json.dumps([]),
        image_width=width,
        image_height=height,
        image_path=image_path,
        training_warning=None,
        detected_category=gemini["category"],
        detected_subtype=gemini["subtype"],
        category_explanation=gemini["explanation"],
        tools_likely_used=gemini["tools_likely_used"],
        category_confidence=gemini["confidence"],
        category_evidence=json.dumps(gemini["evidence"]),
    )
    db.add(scan)
    current_user.scans_this_month += 1
    db.commit()

    return {
        "scan_id": scan_id,
        "document_type": document_type,
        "verdict": verdict,
        "confidence_score": confidence,
        "llm_explanation": llm_explanation,
        "llm_locked": current_user.plan not in LLM_PLANS,
        "llm_required_plan": "pro",
        "annotations": [],
        "original_image_dimensions": {"width": width, "height": height},
        "timestamp": datetime.now().isoformat(),
        "detected_category": gemini["category"],
        "detected_category_label": gemini["category_label"],
        "detected_subtype": gemini["subtype"],
        "category_explanation": gemini["explanation"],
        "category_evidence": gemini["evidence"],
        "tools_likely_used": gemini["tools_likely_used"],
        "category_confidence": gemini["confidence"],
        "certainty_level": gemini.get("certainty_level"),
        "reasoning_steps": gemini.get("reasoning_steps", []),
        "anomaly_location": gemini.get("anomaly_location"),
        "alternatives": gemini.get("alternatives", []),
        "model_tier_requested": tier,
        "model_tier_used": tier_used,
        "model_tier_fallback": tier != tier_used,
    }


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
                "verdict": s.verdict,
                "confidence_score": s.confidence_score,
                "created_at": s.created_at.isoformat() if s.created_at else "",
                "has_image": bool(s.image_path),
                "has_llm_explanation": bool(s.llm_explanation),
                "detected_category": s.detected_category,
                "category_confidence": s.category_confidence,
                "document_type": s.document_type,
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
        "verdict": scan.verdict,
        "confidence_score": scan.confidence_score,
        "llm_explanation": scan.llm_explanation,
        "llm_locked": (not scan.llm_explanation) and (current_user.plan not in LLM_PLANS),
        "llm_required_plan": "pro",
        "annotations": [],
        "image_width": scan.image_width,
        "image_height": scan.image_height,
        "has_image": bool(scan.image_path),
        "detected_category": scan.detected_category,
        "detected_category_label": CATEGORY_LABELS.get(scan.detected_category) if scan.detected_category else None,
        "detected_subtype": scan.detected_subtype,
        "category_explanation": scan.category_explanation,
        "tools_likely_used": scan.tools_likely_used,
        "category_confidence": scan.category_confidence,
        "category_evidence": json.loads(scan.category_evidence) if scan.category_evidence else [],
        "certainty_level": (
            "HIGH" if (scan.category_confidence or 0) >= 0.85
            else "MEDIUM" if (scan.category_confidence or 0) >= 0.60
            else "LOW"
        ) if scan.category_confidence else None,
        "document_type": scan.document_type,
        "document_type_label": DOCUMENT_TYPES.get(scan.document_type, {}).get("title") if scan.document_type else None,
        "created_at": scan.created_at.isoformat() if scan.created_at else "",
    }


@router.get("/history/{scan_id}/image")
def get_scan_image(
    scan_id: str,
    token: str = Query(..., description="Access token (query param so <img src> works)"),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(token, db)
    scan = db.query(Scan).filter(Scan.scan_id == scan_id, Scan.user_id == user.id).first()
    if not scan or not scan.image_path:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = (UPLOAD_DIR / scan.image_path).resolve()
    if not str(file_path).startswith(str(UPLOAD_DIR.resolve())) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(file_path, media_type="image/jpeg")
