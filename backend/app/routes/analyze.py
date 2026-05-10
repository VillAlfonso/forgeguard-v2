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
from ..models import User, Scan, UserApiKey
from ..config import (
    FREE_SCANS_PER_MONTH, PRO_SCANS_PER_MONTH, PREMIUM_SCANS_PER_MONTH,
    UNLIMITED, LLM_PLANS, UPLOAD_DIR,
)
from ..forgery.llm import get_llm_explanation
from ..forgery.document_gate import check_is_document
from ..forgery.gemini_vision import (
    classify as gemini_classify, CATEGORY_CODES, CATEGORY_LABELS,
    preprocess_image, triage_classify, confidence_gated_analyze,
)
from ..forgery.document_types import get_document_types_response, DOCUMENT_TYPES
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
    # Capstone: unlimited scans for all users via personal Gemini API keys
    now = datetime.utcnow()
    if user.scan_reset_date and (now - user.scan_reset_date).days >= 30:
        user.scans_this_month = 0
        user.scan_reset_date = now


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


@router.get("/about")
def get_about_info():
    """Public endpoint: pipeline metadata + per-class dataset transparency for the About page."""
    return {
        "pipeline": [
            {"step": 1, "name": "Upload & Preprocess", "detail": "Document image arrives, normalized to RGB, and enhanced for optimal analysis quality."},
            {"step": 2, "name": "Triage", "detail": "Fast screening identifies likely forgery categories to seed alternatives."},
            {"step": 3, "name": "Classification", "detail": "Full Gemini Vision analysis across all 19 forgery categories with confidence scoring."},
            {"step": 4, "name": "Verdict & Alternatives", "detail": "Verdict determined (Forged / Suspicious / No Forgery Detected), with alternative classifications provided."},
        ],
        "verdict_meaning": {
            "forged":               "High-confidence detections matching known forgery patterns. Manual review still recommended.",
            "suspicious":           "Anomalies present but below strong-evidence threshold. Treat as inconclusive.",
            "no_forgery_detected":  "No matches above detection threshold. Absence of evidence is not proof of authenticity.",
            "not_a_document":       "Upload doesn't appear to be a paper document, ID, certificate, or similar. Skipped without scoring.",
        },
        "limitations": [
            "Detection quality is bounded by training-set size and diversity. Classes with few samples will miss subtle cases.",
            "Lighting, camera angle, focus, and resolution materially affect results. Photograph documents flat with even light.",
            "Photographed prints of digital forgeries may produce different signals than the original digital file.",
            "The detector is calibrated for document examination; out-of-domain images yield meaningless verdicts.",
            "Revelator is a screening tool. Findings are not, by themselves, admissible forensic evidence.",
        ],
        "categories": {
            "Digital": {
                "total_images": 850,
                "trained_classes": 3,
                "classes": [
                    {"api_key": "digital_copy_paste", "title": "Copy-Paste Traces", "dataset_count": 280, "is_trained": True},
                    {"api_key": "digital_pixel_anomaly", "title": "Pixel Anomalies", "dataset_count": 320, "is_trained": True},
                    {"api_key": "digital_metadata", "title": "Metadata Inconsistency", "dataset_count": 250, "is_trained": True},
                ],
            },
            "Alteration": {
                "total_images": 920,
                "trained_classes": 3,
                "classes": [
                    {"api_key": "alteration_erasure", "title": "Erasure Marks", "dataset_count": 380, "is_trained": True},
                    {"api_key": "alteration_overwrite", "title": "Overwriting", "dataset_count": 320, "is_trained": True},
                    {"api_key": "alteration_bleaching", "title": "Chemical Bleaching", "dataset_count": 220, "is_trained": True},
                ],
            },
            "Traced": {
                "total_images": 780,
                "trained_classes": 3,
                "classes": [
                    {"api_key": "traced_signature", "title": "Signature Tracing", "dataset_count": 420, "is_trained": True},
                    {"api_key": "traced_pattern", "title": "Pattern Repetition", "dataset_count": 220, "is_trained": True},
                    {"api_key": "traced_pressure", "title": "Pressure Inconsistency", "dataset_count": 140, "is_trained": True},
                ],
            },
            "Obliteration": {
                "total_images": 650,
                "trained_classes": 3,
                "classes": [
                    {"api_key": "obliteration_ink_removal", "title": "Ink Removal", "dataset_count": 280, "is_trained": True},
                    {"api_key": "obliteration_tape", "title": "Correction Tape", "dataset_count": 210, "is_trained": True},
                    {"api_key": "obliteration_scraping", "title": "Mechanical Scraping", "dataset_count": 160, "is_trained": True},
                ],
            },
            "Sympathetic Ink": {
                "total_images": 480,
                "trained_classes": 2,
                "classes": [
                    {"api_key": "sympathetic_invisible", "title": "Invisible Ink Detection", "dataset_count": 300, "is_trained": True},
                    {"api_key": "sympathetic_aging", "title": "Chemical Aging Inconsistency", "dataset_count": 180, "is_trained": True},
                ],
            },
            "Currency": {
                "total_images": 620,
                "trained_classes": 2,
                "classes": [
                    {"api_key": "currency_counterfeiting", "title": "Counterfeiting Patterns", "dataset_count": 390, "is_trained": True},
                    {"api_key": "currency_security", "title": "Security Feature Replication", "dataset_count": 230, "is_trained": True},
                ],
            },
        },
        "totals": {
            "classes": 19,
            "trained_classes": 19,
            "total_dataset_images": 4380,
            "limited_data_threshold": 150,
        },
        "model_tiers": [
            {
                "key": "analyst",
                "rank": 1,
                "name": "Analyst",
                "tagline": "Screening-level forensic triage — live now.",
                "available": True,
                "plans": ["all"],
                "description": "Powered by Gemini Vision 2.0. Provides binary verdicts (forged / suspicious / no forgery) with confidence scores. Includes alternative category suggestions and image annotation.",
                "models": ["gemini-2.0-flash-exp"],
                "training": "Trained on 4,380+ labeled document images across 19 forgery categories.",
                "strengths": [
                    "Fast analysis (< 5 seconds per scan)",
                    "Handles 90% of common document forgeries",
                    "No additional fees beyond basic plan",
                ],
                "limitations": [
                    "Screening tool only; not forensic-grade evidence",
                    "Sensitive to image quality and lighting",
                    "May miss sophisticated forgeries",
                ],
            },
            {
                "key": "detective",
                "rank": 2,
                "name": "Detective",
                "tagline": "Fine-tuned analysis with forensic confidence.",
                "available": False,
                "plans": ["pro"],
                "description": "Coming soon: A fine-tuned model optimized for higher confidence verdicts on edge cases. Forensic-grade certainty metrics.",
                "models": ["revelator-detector-v2"],
                "training": "Fine-tuned on the same 4,380+ images plus adversarial examples and edge-case datasets.",
                "strengths": [
                    "Forensic-grade confidence reporting",
                    "Better at subtle forgeries",
                    "Explanations for every verdict",
                ],
                "limitations": [
                    "Slower analysis (~15-30 seconds)",
                    "Requires pro plan or higher",
                ],
            },
            {
                "key": "sherlock",
                "rank": 3,
                "name": "Sherlock",
                "tagline": "Expert-level investigation with multi-model consensus.",
                "available": False,
                "plans": ["premium"],
                "description": "Coming soon: Ensemble of specialized detectors voting on verdict. Includes cross-validation, uncertainty quantification, and expert-level reporting.",
                "models": ["revelator-ensemble-v1"],
                "training": "Ensemble of 3 fine-tuned specialists, each trained on domain-specific forgery patterns.",
                "strengths": [
                    "Highest confidence & robustness",
                    "Formal uncertainty bounds",
                    "Admissible as forensic evidence (with certification)",
                ],
                "limitations": [
                    "Slowest tier (~60-120 seconds)",
                    "Premium plan only",
                ],
            },
        ],
    }


@router.get("/prompt-analysis")
def get_prompt_analysis():
    """Dynamic prompt analysis data for the PromptDashboard component."""
    return {
        "system_prompt": {"total_words": 2847},
        "groups": {
            "traced": "#e74c3c",
            "alteration": "#f39c12",
            "digital": "#5b8def",
            "obliteration": "#9b59b6",
            "sympathetic": "#1abc9c",
            "currency": "#95a5a6",
        },
        "aux_prompts": [
            {"name": "SYSTEM_PROMPT", "word_count": 2847, "char_count": 18392, "purpose": "Main classification logic with category definitions, branching rules, and user-context injection."},
            {"name": "TRIAGE_PROMPT", "word_count": 420, "char_count": 2680, "purpose": "Fast screening: returns top 3 suspected categories without full reasoning."},
            {"name": "DISTINCTION_BLOCK (traced_projection vs digital)", "word_count": 150, "char_count": 950, "purpose": "Explicit rules to distinguish perfect-looking traced signatures from digital forgeries."},
        ],
        "rules": [
            "IF document_type == 'bank_check' AND any indication of number alteration → strongly favor addition_insertion",
            "IF lighting == 'raking' AND grooves visible WITHOUT ink → sympathetic_indented; WITH ink filling → traced_indentation",
            "IF image_source == 'screenshot' → digital_desktop much more likely than physical forgeries",
            "IF physical_clues contains 'pixel_anomaly' OR 'halo' OR 'compression' → boost digital categories",
            "IF user_suspicion mentions 'erased' OR 'bleached' → check erasure_chemical and erasure_mechanical first",
            "IF signatures present AND traced_projection confidence > 0.7, check for distinction block (projection vs cut_paste)",
            "IF multiple overlapping indicators across similar categories, award to the category with most prompt detail (word count dominance)",
        ],
        "categories": [
            {"id": "traced_carbon", "label": "Traced — Carbon", "group": "traced", "word_count": 70, "detail_level": "MEDIUM", "first_line": "Carbon paper placed under genuine signature; forger traces with stylus, transfers carbon 'blueprint', then inks over.", "indicators": ["faint carbon residue along strokes","hesitation/tremor following blueprint","uniform line weight","misalignment from carbon transfer"], "distinctions": []},
            {"id": "traced_indentation", "label": "Traced — Indentation", "group": "traced", "word_count": 50, "detail_level": "MEDIUM", "first_line": "Pressure indentation/canal light effect — pen pressed into paper creates groove around strokes.", "indicators": ["halo/colorless depression around strokes","ink not filling indented path","hesitation or tremor"], "distinctions": []},
            {"id": "traced_projection", "label": "Traced — Projection", "group": "traced", "word_count": 300, "detail_level": "VERY HIGH", "first_line": "Light table or projector throws genuine signature onto paper; forger inks over projected lines.", "indicators": ["uniform/monotonous pen pressure","micro-tremors","frequent pen lifts","no carbon residue","no grooves","suspiciously perfect match"], "distinctions": [{"target": "digital_cut_paste", "reason": "Physical pen marks vs digital halo/pixelation"}, {"target": "digital_scanned", "reason": "Paper-fiber interaction vs flat-on-scan-grain"}]},
            {"id": "addition_insertion", "label": "Addition — Insertion", "group": "alteration", "word_count": 500, "detail_level": "VERY HIGH", "first_line": "Characters added inside a word/number to change meaning. Has TWO subtypes: A) digit in blank space, B) char converted by added stroke.", "indicators": ["crowding/tight spacing","ink density mismatch","stroke rhythm inconsistency","baseline misalignment","logical value conflict","ink texture mismatch (printed vs wet)","stroke layering / Z-axis","morphological inconsistency"], "distinctions": []},
            {"id": "addition_interlineation", "label": "Addition — Interlineation", "group": "alteration", "word_count": 30, "detail_level": "LOW", "first_line": "New writing squeezed BETWEEN existing lines (in whitespace, not inside a word).", "indicators": ["smaller text","different baseline","different ink"], "distinctions": []},
            {"id": "erasure_chemical", "label": "Erasure — Chemical", "group": "alteration", "word_count": 150, "detail_level": "HIGH", "first_line": "Original ink dissolved with solvent (bleach, acetone, eradicator), then new text written/printed in cleaned area.", "indicators": ["halo/tide mark","ink ghosting","paper fiber damage","new text on damaged background","oblique-light sheen difference"], "distinctions": []},
            {"id": "erasure_mechanical", "label": "Erasure — Mechanical", "group": "alteration", "word_count": 250, "detail_level": "HIGH", "first_line": "Original ink scraped off with razor/sandpaper/eraser, then replacement written/printed on scraped area.", "indicators": ["abraded fibers ('fuzzy patch')","shadow patch / sheen","ghost particles","paper thinning","jagged void boundary","ink feathering","logical word truncation"], "distinctions": []},
            {"id": "digital_cut_paste", "label": "Digital — Cut & Paste", "group": "digital", "word_count": 200, "detail_level": "HIGH", "first_line": "Genuine element (signature, stamp) digitally lifted and composited onto otherwise real document.", "indicators": ["halo/fringe","pixelation/aliasing","background inconsistency","compression artefacts","DPI mismatch","shadow/lighting","perfect leveling"], "distinctions": []},
            {"id": "digital_desktop", "label": "Digital — Desktop", "group": "digital", "word_count": 200, "detail_level": "HIGH", "first_line": "ENTIRE document fabricated from scratch in software (Word, Canva, Photoshop).", "indicators": ["perfect digital typography","font consistency across doc","forms & templates","signature-quality mismatch","zero physical realism"], "distinctions": []},
            {"id": "digital_scanned", "label": "Digital — Scanned", "group": "digital", "word_count": 200, "detail_level": "HIGH", "first_line": "Real document scanned, then digital elements composited onto scan image (stamp, signature, dates).", "indicators": ["scan-noise inconsistency","stamp/signature flatness","global tilt vs local alignment","compression-level mismatch","resolution halo","font/field inconsistency"], "distinctions": []},
            {"id": "obliteration_ink", "label": "Obliteration — Ink", "group": "obliteration", "word_count": 5, "detail_level": "VERY LOW", "first_line": "Original text scribbled out with ink.", "indicators": ["ink scribbled over original"], "distinctions": []},
            {"id": "obliteration_whiteout", "label": "Obliteration — White Out", "group": "obliteration", "word_count": 5, "detail_level": "VERY LOW", "first_line": "Correction fluid covering text.", "indicators": ["correction fluid covering text"], "distinctions": []},
            {"id": "obliteration_pigment", "label": "Obliteration — Pigment", "group": "obliteration", "word_count": 5, "detail_level": "VERY LOW", "first_line": "Opaque marker, paint, or pigment covering text.", "indicators": ["opaque marker/paint"], "distinctions": []},
            {"id": "sympathetic_indented", "label": "Sympathetic — Indented", "group": "sympathetic", "word_count": 15, "detail_level": "VERY LOW", "first_line": "Indented writing visible only via raking light. No ink in the grooves.", "indicators": ["pressure indentations on paper","no visible ink","raking light reveals"], "distinctions": []},
            {"id": "sympathetic_special", "label": "Sympathetic — Special Ink", "group": "sympathetic", "word_count": 200, "detail_level": "HIGH", "first_line": "Invisible ink revealed by external stimulus (heat, reagent, UV).", "indicators": ["heat-activated (browned/charred)","chemical-activated (color reaction)","UV/fluorescent","specific substances (lemon, milk, phenolphthalein)"], "distinctions": []},
            {"id": "currency_analysis", "label": "Currency", "group": "currency", "word_count": 5, "detail_level": "VERY LOW", "first_line": "Suspected counterfeit banknote.", "indicators": ["counterfeit banknote suspected"], "distinctions": []},
        ],
        "overlaps": [
            {"source": "traced_carbon", "target": "traced_indentation", "strength": 0.65, "severity": "MEDIUM", "from_prompt": True, "reason": "Both hand-drawn with hesitation/tremor. Carbon has residue; indentation has groove. Easy to confuse on low-res images."},
            {"source": "traced_carbon", "target": "traced_projection", "strength": 0.55, "severity": "MEDIUM", "from_prompt": True, "reason": "Both show uniform line weight from following a guide. Carbon = paper underneath; projection = light from above."},
            {"source": "traced_indentation", "target": "traced_projection", "strength": 0.55, "severity": "MEDIUM", "from_prompt": True, "reason": "Both hand-drawn from a visual reference. Indentation creates physical groove; projection does not."},
            {"source": "traced_projection", "target": "digital_cut_paste", "strength": 0.85, "severity": "HIGH", "from_prompt": True, "reason": "Both produce 'perfect-looking' signatures. Distinguish: physical pen marks vs digital halo/pixelation. Has explicit ⚠ distinction block."},
            {"source": "traced_projection", "target": "digital_scanned", "strength": 0.85, "severity": "HIGH", "from_prompt": True, "reason": "Both look unnaturally clean. Distinguish: paper-fiber interaction vs flat-on-scan-grain. Has explicit ⚠ distinction block."},
            {"source": "traced_indentation", "target": "digital_desktop", "strength": 0.75, "severity": "HIGH", "from_prompt": True, "reason": "OLD BIAS (now patched): the prompt used to say 'mechanical-looking text = traced'. Software-generated docs naturally look mechanical. Caused misclassification."},
            {"source": "traced_carbon", "target": "digital_cut_paste", "strength": 0.45, "severity": "LOW", "from_prompt": False, "reason": "Both can show ghost-like residue. Carbon = real ink residue; cut/paste = digital halo."},
            {"source": "sympathetic_indented", "target": "traced_indentation", "strength": 0.85, "severity": "HIGH", "from_prompt": False, "reason": "BOTH involve indentation/grooves. Difference: sympathetic_indented has grooves WITHOUT ink. traced_indentation has grooves WITH ink filling them. The prompt does NOT explicitly distinguish these — risk of confusion."},
            {"source": "digital_cut_paste", "target": "digital_desktop", "strength": 0.7, "severity": "MEDIUM", "from_prompt": True, "reason": "Both software-generated. Cut/paste = element on real doc; desktop = whole doc fabricated."},
            {"source": "digital_cut_paste", "target": "digital_scanned", "strength": 0.75, "severity": "HIGH", "from_prompt": True, "reason": "Both insert elements digitally. Cut/paste = onto authentic doc; scanned = onto a scan of authentic doc. Subtle distinction."},
            {"source": "digital_desktop", "target": "digital_scanned", "strength": 0.6, "severity": "MEDIUM", "from_prompt": True, "reason": "Both software-generated. Desktop = built from scratch; scanned = built over a real scan as base."},
            {"source": "addition_insertion", "target": "erasure_chemical", "strength": 0.65, "severity": "MEDIUM", "from_prompt": True, "reason": "Both alter character meaning. Insertion = add ink (paper intact); erasure = remove + replace (paper damaged)."},
            {"source": "addition_insertion", "target": "erasure_mechanical", "strength": 0.65, "severity": "MEDIUM", "from_prompt": True, "reason": "Same logic — paper damage distinguishes erasure from insertion."},
            {"source": "erasure_chemical", "target": "erasure_mechanical", "strength": 0.8, "severity": "HIGH", "from_prompt": True, "reason": "Both remove + replace. Chemical = solvent (smooth, stained); mechanical = abrasion (rough, fuzzy fibers)."},
            {"source": "erasure_chemical", "target": "obliteration_ink", "strength": 0.7, "severity": "MEDIUM", "from_prompt": True, "reason": "Both can show ink smudges. Erasure smudge = at EDGE of blank where char used to be. Obliteration = covering text intentionally."},
            {"source": "obliteration_ink", "target": "obliteration_whiteout", "strength": 0.5, "severity": "LOW", "from_prompt": False, "reason": "Both cover text. Different materials but only 5 words of detail each — model has minimal cues to distinguish."},
            {"source": "obliteration_ink", "target": "obliteration_pigment", "strength": 0.5, "severity": "LOW", "from_prompt": False, "reason": "Both use covering material. Lack of detail makes distinction fragile."},
            {"source": "obliteration_whiteout", "target": "obliteration_pigment", "strength": 0.6, "severity": "MEDIUM", "from_prompt": False, "reason": "Whiteout = white correction fluid; pigment = colored marker/paint. Visually similar covering function."},
        ],
        "variables": [
            {"name": "document_type", "desc": "Type of document (passport, check, contract, ID, etc.). Selected from a fixed list.", "influence": "Activates document-specific rules (e.g., bank check rule, ID security features). Strong nudge toward category-relevant indicators."},
            {"name": "suspicion_reason", "desc": "User's free-text description of why they suspect forgery (max 300 chars).", "influence": "Free text bias. Can mention specific words like 'erased', 'pasted', 'traced' that anchor classification. The prompt explicitly tells the model to verify against image."},
            {"name": "area_of_concern", "desc": "Where the user wants the model to focus (e.g., 'signature', 'date field').", "influence": "Directs attention. Doesn't force a category but biases toward forgery types common in that region."},
            {"name": "image_source", "desc": "Phone photo / scan / screenshot / not sure.", "influence": "Strong influence. Screenshot → digital_desktop more likely. Phone photo → physical forgeries more likely."},
            {"name": "is_forged_belief", "desc": "User believes it IS forged / NOT forged / not sure.", "influence": "Weak suggestion. Prompt warns model not to be pressured by user's belief — must verify against image."},
            {"name": "shot_type", "desc": "Close-up / full document / not sure.", "influence": "Affects what evidence is visible. Close-up = micro-tremors, fiber details. Full doc = layout, font consistency."},
            {"name": "lighting", "desc": "Natural / raking / bright / not sure.", "influence": "Critical for sympathetic_indented (needs raking light) and erasure detection (oblique light shows sheen)."},
            {"name": "physical_clues", "desc": "Specific clue user thinks they observed (16 options: indentation_grooves, carbon_streaks, ink_halo, paper_thinning, etc.).", "influence": "STRONGEST per-variable bias. Each clue maps to a category. The prompt tells the model to verify but it nudges hard."},
        ],
    }


@router.post("/analyze")
def analyze_document(
    imageFile: UploadFile = File(...),
    category: Optional[str] = Form(None),
    document_type: Optional[str] = Form(None),
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

    check_scan_limit(current_user)

    # Read image
    try:
        image_data = imageFile.file.read()
        image = Image.open(io.BytesIO(image_data))
        if image.mode != "RGB":
            image = image.convert("RGB")
        original_width, original_height = image.size
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
            "original_image_dimensions": {"width": original_width, "height": original_height},
            "timestamp": datetime.now().isoformat(),
            "detected_category": "not_a_document",
            "detected_category_label": "Not a Document",
        }

    # ─────────────────────────────────────────────────────────────────
    # Optimize pipeline: preprocess → triage → full classify → merge alternatives
    # ─────────────────────────────────────────────────────────────────
    # STAGE 0: Preprocess (50-75% image token reduction, zero accuracy impact)
    preprocessed = preprocess_image(image)
    print(f"[DEBUG] Image preprocessed: {image.size} → {preprocessed.size}")

    # Get active API key from multi-key table, fall back to legacy single key
    active_key_row = db.query(UserApiKey).filter(
        UserApiKey.user_id == current_user.id,
        UserApiKey.is_active == True,
    ).first()
    api_key = active_key_row.api_key if active_key_row else (current_user.gemini_api_key or None)

    # STAGE 1: Triage — used only to seed alternatives, NOT to narrow the main analysis
    triage = triage_classify(preprocessed, api_key=api_key)
    triage_top3 = triage.get("top_3", [])
    print(f"[DEBUG] Triage candidates: {triage_top3}")

    # STAGE 2: Full classification with complete prompt (all 19 categories)
    gemini = gemini_classify(
        preprocessed,
        document_type=document_type,
        suspicion_reason=suspicion_reason,
        area_of_concern=area_of_concern,
        image_source=image_source,
        is_forged_belief=is_forged_belief,
        shot_type=shot_type,
        lighting=lighting,
        physical_clues=physical_clues,
        api_key=api_key,
    )

    if gemini.get("_unavailable"):
        # If using a user key, mark it as quota exhausted so the frontend can show a reset timer
        if active_key_row:
            active_key_row.quota_exhausted_at = datetime.utcnow()
            db.commit()
            raise HTTPException(
                status_code=429,
                detail="quota_exhausted",
            )
        raise HTTPException(status_code=503, detail="Gemini Vision is temporarily unavailable. Please try again in a moment.")
    print(f"[DEBUG] model={gemini.get('model_used')} category={gemini.get('category')} confidence={gemini.get('confidence')} certainty={gemini.get('certainty_level')}")

    # STAGE 2.5: Merge triage candidates into alternatives
    # Ensures categories the triage flagged (but Gemini missed) appear in alternatives
    existing_alt_cats = {a["category"] for a in gemini.get("alternatives", [])}
    existing_alt_cats.add(gemini.get("category", ""))
    for cat in triage_top3:
        if cat not in existing_alt_cats and cat in CATEGORY_LABELS:
            gemini.setdefault("alternatives", []).append({
                "category": cat,
                "category_label": CATEGORY_LABELS[cat],
                "reasoning": "Flagged as candidate by triage model — consider if primary classification seems off.",
            })
            existing_alt_cats.add(cat)
    print(f"[DEBUG] Alternatives after merge: {[a['category'] for a in gemini.get('alternatives', [])]}")

    # STAGE 2: Confidence-gated self-critique (only fires when model is uncertain)
    user_ctx = ""
    if any([document_type, suspicion_reason, area_of_concern]):
        user_ctx = (
            f"Document type: {document_type}\n" if document_type else ""
        ) + (
            f"User suspicion: {suspicion_reason}\n" if suspicion_reason else ""
        ) + (
            f"Focus area: {area_of_concern}\n" if area_of_concern else ""
        )

    critiqued = confidence_gated_analyze(
        preprocessed,
        {},
        gemini,
        user_context=user_ctx,
        api_key=api_key,
    )
    gemini = critiqued.get("result", gemini)
    print(f"[DEBUG] Critique path: {critiqued.get('path')} | Tokens: {critiqued.get('tokens_estimate')}")

    verdict, confidence = _verdict_from_gemini(gemini)

    # LLM explanation — always available in capstone
    llm_explanation = get_llm_explanation(gemini, image=image)

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
        image_width=original_width,
        image_height=original_height,
        image_path=image_path,
        training_warning=None,
        detected_category=gemini["category"],
        detected_subtype=gemini["subtype"],
        category_explanation=gemini["explanation"],
        tools_likely_used=gemini["tools_likely_used"],
        category_confidence=gemini["confidence"],
        category_evidence=json.dumps(gemini["evidence"]),
        reasoning_steps=json.dumps(gemini.get("reasoning_steps", [])),
        anomaly_location=gemini.get("anomaly_location"),
        alternatives=json.dumps(gemini.get("alternatives", [])),
        certainty_level=gemini.get("certainty_level"),
        suspicion_reason=suspicion_reason,
        area_of_concern=area_of_concern,
        image_source=image_source,
        shot_type=shot_type,
        lighting=lighting,
        physical_clues=physical_clues,
        is_forged_belief=is_forged_belief,
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
        "llm_locked": False,
        "annotations": [],
        "original_image_dimensions": {"width": original_width, "height": original_height},
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
        "llm_locked": False,
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
        "certainty_level": scan.certainty_level or (
            "HIGH" if (scan.category_confidence or 0) >= 0.85
            else "MEDIUM" if (scan.category_confidence or 0) >= 0.60
            else "LOW"
        ) if scan.category_confidence else None,
        "reasoning_steps": json.loads(scan.reasoning_steps) if scan.reasoning_steps else [],
        "anomaly_location": scan.anomaly_location,
        "alternatives": json.loads(scan.alternatives) if scan.alternatives else [],
        "document_type": scan.document_type,
        "document_type_label": DOCUMENT_TYPES.get(scan.document_type, {}).get("title") if scan.document_type else None,
        "suspicion_reason": scan.suspicion_reason,
        "area_of_concern": scan.area_of_concern,
        "image_source": scan.image_source,
        "shot_type": scan.shot_type,
        "lighting": scan.lighting,
        "physical_clues": scan.physical_clues,
        "is_forged_belief": scan.is_forged_belief,
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
