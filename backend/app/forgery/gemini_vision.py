"""
Gemini Vision — primary forensic classifier.

Reads the document image and returns a structured JSON verdict against the
19-category taxonomy. Output is parsed into a dict that the analyze route
saves to the Scan row.

Design choices to minimize hallucinations:
  - Chain-of-thought reasoning (model must show its work before classifying)
  - Negative constraints (explicit IGNORE list to avoid flagging benign issues)
  - Anomaly location grounding (forced to point to a specific region when forged)
  - Optional user context (focus area, source, suspicion) that narrows the search
"""

from __future__ import annotations

import io
import json
import re
from typing import Optional, Dict, Any

from PIL import Image

from ..config import GEMINI_API_KEY, GEMINI_VISION_MODEL

# Fallback chain: best quality first, lite last.
# If GEMINI_VISION_MODEL is set in .env, only that model is used (no fallback).
# Otherwise, cascade through this chain on rate limit errors.
_FALLBACK_CHAIN = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"]

def _model_chain() -> list[str]:
    """Return ordered list of models to try. If a model is explicitly set, use only that."""
    if GEMINI_VISION_MODEL:
        return [GEMINI_VISION_MODEL]  # Use explicitly configured model, no fallback
    return list(_FALLBACK_CHAIN)  # Otherwise, cascade through the default chain


def _is_rate_limited(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ("429", "quota", "rate_limit", "rateerror", "resource_exhausted", "exhausted"))


# ── Category taxonomy ──────────────────────────────────────────────────────
CATEGORIES = [
    # Traced
    ("traced_carbon",            "Traced — Carbon Transfer"),
    ("traced_indentation",       "Traced — Indentation / Canal Light"),
    ("traced_projection",        "Traced — Projection Process"),
    # Alteration
    ("addition_insertion",       "Alteration — Addition: Insertion"),
    ("addition_interlineation",  "Alteration — Addition: Interlineation"),
    ("erasure_chemical",         "Alteration — Erasure: Chemical"),
    ("erasure_mechanical",       "Alteration — Erasure: Mechanical"),
    # Digital
    ("digital_cut_paste",        "Cut and Paste Forgery"),
    ("digital_desktop",          "Digital — Desktop Publishing"),
    ("digital_scanned",          "Digital — Scanned Document"),
    # Obliteration
    ("obliteration_ink",         "Obliteration — Ink Stroke"),
    ("obliteration_whiteout",    "Obliteration — White Out"),
    ("obliteration_pigment",     "Obliteration — Opaque Pigment"),
    # Sympathetic Ink
    ("sympathetic_indented",     "Sympathetic Ink — Indented Writing"),
    ("sympathetic_special",      "Sympathetic Ink — Special Ink"),
    # Currency
    ("currency_analysis",        "Currency Forgery"),
    # Fallbacks
    ("no_forgery_detected",      "No Forgery Detected"),
    ("not_a_document",           "Not a Document"),
    ("other",                    "Other Forgery"),
]

CATEGORY_CODES = [c[0] for c in CATEGORIES]
CATEGORY_LABELS = dict(CATEGORIES)


SYSTEM_PROMPT = """You are a forensic document examiner. Classify the image into EXACTLY ONE of the 19 categories below. Reason step by step before answering, and only flag a forgery when you can point to specific visible evidence.

CATEGORIES (use the code on the left in your JSON):

Traced:
  traced_carbon            — Carbon-paper transfer: forger places carbon paper under a genuine signature and traces with a stylus, transferring carbon "blueprint" which is then inked over. Look for: faint carbon residue or faint underlying lines visible along strokes, hesitation/tremor as forger follows carbon blueprint, uniform line weight, possible misalignment where ink deviates from underlying carbon transfer.
  traced_indentation       — Pressure indentation / canal light effect: look for a halo (colorless depression/groove) around ink strokes where the pen pressed into paper, often visible as a depression in paper fibers. Ink may not fill the entire indented path (poor alignment). Line quality may show hesitation or tremor rather than natural fluidity.
  traced_projection        — Projection tracing: forger projects a genuine signature onto the target document using a light table, transparency projector, camera lucida, or digital projector, then inks over the projected lines. Exhibits uniform/monotonous pen pressure, micro-tremors from following a visual guide, frequent pen lifts causing ink blobs or overlapping strokes, no carbon residue, no physical indentation grooves. The signature may be a suspiciously perfect match to the original.

  GENERAL TRACED INDICATORS (apply to ALL three tracing methods above):
    Even when specific physical evidence (carbon residue, grooves, halos) is not visible in the photo, a signature is LIKELY TRACED if it shows:
      - Strokes that look unnatural, "drawn" rather than "written"
      - Thick, stiff lines that lack the natural rhythm of fluid handwriting
      - Line weight that does NOT fade or taper at stroke endings (natural pens fade as pressure releases; traced strokes stay uniform)
      - No pressure variation throughout — natural writing has thick/thin variation, traced writing is mechanically uniform
      - Hesitation marks, tremor, or "shakiness" inconsistent with confident natural writing
      - Pen lifts in unnatural places, or strokes that look re-drawn
    If the signature LOOKS traced (mechanical, stiff, no natural fade), classify as one of the three traced categories above and pick the most likely subtype based on context. Do NOT classify as no_forgery_detected just because you can't see the underlying physical evidence — the unnatural stroke quality alone is strong evidence of tracing.

Alteration:
  addition_insertion       — New characters inserted INSIDE existing words/numbers.
  addition_interlineation  — New writing squeezed BETWEEN existing lines.
  erasure_chemical         — Bleach/solvent erasure; halo, fiber damage, ink ghosting.
  erasure_mechanical       — Eraser/blade scraping; thinned/abraded paper.

Cut and Paste / Digital Fabrication:
  digital_cut_paste        — Section cut+pasted (physical OR digital splice). Visible edges, shadows, texture or compression mismatch.
  digital_desktop          — Whole document fabricated in Word/Canva/Photoshop.
  digital_scanned          — Scanned document with digital tampering on top.

Obliteration:
  obliteration_ink         — Original text scribbled out with ink.
  obliteration_whiteout    — Correction fluid covering text.
  obliteration_pigment     — Opaque marker, paint, or pigment covering text.

Sympathetic Ink:
  sympathetic_indented     — Indented writing visible only via raking light.
  sympathetic_special      — Invisible/special ink (UV, iodine, heat-revealed, etc.).

Currency:
  currency_analysis        — Suspected counterfeit banknote.

Fallbacks (use ONLY when nothing above fits):
  no_forgery_detected      — Document looks authentic, no tampering signs.
  not_a_document           — Image is not a document at all (selfie, meme, screenshot).
  other                    — Real forgery that does NOT match any of the 16 specific types. Do NOT use this if the forgery matches a specific category — even partially. For example: if you identify traced_projection, use traced_projection, not other with subtype traced_projection.

═══════════════════════════════════════════════════════════════════════════
IGNORE these (they are NOT forgery indicators):
  - Phone-camera blur, low resolution, poor lighting, shadows from the photographer
  - Background surface (desk, hands, clutter behind the document)
  - JPEG compression noise on the entire image (this is normal)
  - Worn paper, creases, folds, age stains, coffee marks (these are wear, not forgery)
  - Watermark patterns and security features that are SUPPOSED to be there
  - Slight rotation, perspective skew, glare from flash
═══════════════════════════════════════════════════════════════════════════

REASONING — work through these steps in order before you classify:
  1. What is in the image? (document or non-document; if document, what type?)
  2. Scan the WHOLE document for anomalies. List what you actually see — not what you'd expect.
  3. For each anomaly, ask: is this real tampering, or one of the IGNORE items above?
  4. If there is real tampering, point to its LOCATION (which region of the document).
  5. Now pick the single best category code based on the evidence.
  6. Set confidence based on how clear the evidence is (see scale below).

CONFIDENCE SCALE (be honest — overconfidence is hallucination):
  0.90–1.00  Multiple unambiguous signs of this exact forgery type
  0.70–0.89  Clear signs but some ambiguity
  0.50–0.69  Suspicious but not definitive — could be benign
  0.30–0.49  Weak signal; mention it but lean toward no_forgery_detected
  0.00–0.29  No real evidence; classify as no_forgery_detected unless you saw something

OUTPUT — return ONLY valid JSON, no markdown fences, no prose outside the object:

{
  "reasoning_steps": [
    "<step 1: what's in the image>",
    "<step 2: anomalies observed>",
    "<step 3: filtered against ignore list>",
    "<step 4: location of real tampering, or 'none found'>",
    "<step 5: chosen category and why>"
  ],
  "category": "<one code from the list>",
  "subtype": "<specific kind, or null>",
  "confidence": <float 0.0–1.0 per scale above>,
  "anomaly_location": "<where on the document the forgery appears, e.g. 'top-right date field' — null if no_forgery_detected or not_a_document>",
  "explanation": "<MUST start with the human-readable category name, then explain why based on visible cues>",
  "evidence": ["<short visible cue>", "<another>", "..."],
  "tools_likely_used": "<what tools/methods, or null if not applicable>"
}

CRITICAL RULES:
  1. The "explanation" MUST begin with the category's human name (e.g. "Chemical Erasure detected.").
  2. If you classify as no_forgery_detected, set anomaly_location to null and evidence to [] or just observed-clean items.
  3. Do NOT invent evidence. If you can't see it, don't list it.
  4. Pick exactly ONE category. If torn, pick the dominant one and mention the other in explanation.
  5. Output ONLY the JSON object. No code fences, no commentary."""


def _build_user_context_block(
    document_type: Optional[str],
    suspicion_reason: Optional[str],
    area_of_concern: Optional[str],
    image_source: Optional[str],
    is_forged_belief: Optional[str],
    shot_type: Optional[str],
    lighting: Optional[str],
    physical_clues: Optional[str],
) -> str:
    """Build an optional user-context block. Returns empty string if no context."""
    lines = []
    if document_type and document_type not in ("other", "", None):
        lines.append(f"- Document type (per user): {document_type.replace('_', ' ')}")
    if image_source and image_source not in ("not_sure", "", None):
        lines.append(f"- Image source (per user): {image_source.replace('_', ' ')}")
    if shot_type and shot_type not in ("not_sure", "", None):
        lines.append(f"- Shot type (per user): {shot_type.replace('_', ' ')}")
    if lighting and lighting not in ("not_sure", "", None):
        lines.append(f"- Lighting condition (per user): {lighting.replace('_', ' ')}")
    if is_forged_belief and is_forged_belief not in ("not_sure", "", None):
        lines.append(f"- User's belief about authenticity: {is_forged_belief.replace('_', ' ')}")
    if area_of_concern and area_of_concern not in ("anywhere", "", None):
        lines.append(f"- User wants you to focus on: {area_of_concern.replace('_', ' ')}")
    if physical_clues and physical_clues not in ("none", "", None):
        _clue_labels = {
            "indentation_grooves": "indentation grooves / canal marks behind writing",
            "carbon_streaks": "faint carbon residue along strokes",
            "uniform_traced_lines": "uniform line weight (looks traced)",
            "ink_halo": "halo or discoloration around erased area",
            "paper_thinning": "thinned or abraded paper surface",
            "characters_inserted": "extra characters squeezed inside words/numbers",
            "text_between_lines": "writing squeezed between existing lines",
            "cut_paste_edges": "visible cut/paste edges or texture mismatch",
            "whiteout_correction": "correction fluid covering text",
            "ink_scribbles": "ink scribbled over original text",
            "opaque_pigment_cover": "marker/paint covering text",
            "counterfeit_currency": "suspect counterfeit banknote",
            "computer_generated": "looks computer-generated / desktop-published",
            "scan_tampering_artifacts": "scanned document with visible digital edits layered on top",
            "sympathetic_hidden_writing": "hidden writing only visible under special lighting (UV, raking, backlight) — check for sympathetic_indented",
            "uv_reactive_ink_glow": "ink glows or reacts under UV light — check for sympathetic_special",
        }
        clue_label = _clue_labels.get(physical_clues, physical_clues.replace('_', ' '))
        lines.append(f"- Physical clue user thinks they observed: {clue_label}")
    if suspicion_reason:
        clean = suspicion_reason.strip()[:300]
        if clean:
            lines.append(f"- User's suspicion in their own words: \"{clean}\"")
    if not lines:
        return ""
    return (
        "\n\n═══════════════════════════════════════════════════════════════════════════\n"
        "USER-PROVIDED CONTEXT — TREAT AS HINTS ONLY, NOT FACTS:\n\n"
        + "\n".join(lines)
        + "\n\nHOW TO USE THIS CONTEXT:\n"
        "  - The IMAGE is the ultimate evidence. The user's hints are just guidance.\n"
        "  - Verify every user claim against what you actually see in the image.\n"
        "  - If the user says \"indentation grooves visible\" but the image shows clean text\n"
        "    with no grooves, IGNORE the user's hint and classify based on what you see.\n"
        "  - If the user says \"this is forged\" but the document looks completely authentic,\n"
        "    classify as no_forgery_detected — do not be pressured by their belief.\n"
        "  - User hints can help you LEAN toward a category when the visible evidence is\n"
        "    ambiguous, but they cannot CREATE evidence that isn't there.\n"
        "  - When the user's hint contradicts the image, note this in your reasoning_steps.\n"
        "═══════════════════════════════════════════════════════════════════════════"
    )


def _client():
    if not GEMINI_API_KEY:
        return None
    try:
        from google import genai
        return genai.Client(api_key=GEMINI_API_KEY)
    except ImportError:
        return None


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


def _coerce(parsed: Dict[str, Any]) -> Dict[str, Any]:
    raw_cat = (parsed.get("category") or "").strip().lower()
    if raw_cat not in CATEGORY_CODES:
        raw_cat = "other"

    confidence = parsed.get("confidence")
    try:
        confidence = float(confidence)
        confidence = max(0.0, min(1.0, confidence))
    except (TypeError, ValueError):
        confidence = 0.0

    evidence = parsed.get("evidence") or []
    if not isinstance(evidence, list):
        evidence = [str(evidence)]
    evidence = [str(e).strip() for e in evidence if str(e).strip()]

    reasoning = parsed.get("reasoning_steps") or []
    if not isinstance(reasoning, list):
        reasoning = [str(reasoning)]
    reasoning = [str(r).strip() for r in reasoning if str(r).strip()]

    anomaly_location = parsed.get("anomaly_location")
    if isinstance(anomaly_location, str):
        anomaly_location = anomaly_location.strip() or None
    elif anomaly_location is not None:
        anomaly_location = str(anomaly_location).strip() or None

    # Force null on non-forgery categories — Gemini sometimes makes up locations
    if raw_cat in ("no_forgery_detected", "not_a_document"):
        anomaly_location = None

    return {
        "category": raw_cat,
        "category_label": CATEGORY_LABELS[raw_cat],
        "subtype": (parsed.get("subtype") or "").strip() or None,
        "confidence": confidence,
        "explanation": (parsed.get("explanation") or "").strip(),
        "evidence": evidence,
        "reasoning_steps": reasoning,
        "anomaly_location": anomaly_location,
        "tools_likely_used": (parsed.get("tools_likely_used") or "").strip() or None,
        "certainty_level": "HIGH" if confidence >= 0.85 else "MEDIUM" if confidence >= 0.60 else "LOW",
        "model_used": None,
    }


def _fallback(reason: str) -> Dict[str, Any]:
    return {
        "category": "other",
        "category_label": CATEGORY_LABELS["other"],
        "subtype": None,
        "confidence": 0.0,
        "explanation": f"Gemini Vision was unavailable: {reason}",
        "evidence": [],
        "reasoning_steps": [],
        "anomaly_location": None,
        "tools_likely_used": None,
        "_unavailable": True,
    }


def classify(
    image: Image.Image,
    document_type: Optional[str] = None,
    suspicion_reason: Optional[str] = None,
    area_of_concern: Optional[str] = None,
    image_source: Optional[str] = None,
    is_forged_belief: Optional[str] = None,
    shot_type: Optional[str] = None,
    lighting: Optional[str] = None,
    physical_clues: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run Gemini Vision against the document image.

    All extra args are optional hints — when None or default, Gemini classifies
    purely from the image. The image is always the deciding factor.
    """
    client = _client()
    if client is None:
        return _fallback("API key not configured or google-genai not installed")

    buf = io.BytesIO()
    img_to_send = image if image.mode == "RGB" else image.convert("RGB")
    img_to_send.save(buf, format="JPEG", quality=88)
    buf.seek(0)

    prompt = SYSTEM_PROMPT + _build_user_context_block(
        document_type, suspicion_reason, area_of_concern, image_source,
        is_forged_belief, shot_type, lighting, physical_clues,
    )

    from google.genai import types as genai_types

    text = ""
    last_exc: Optional[Exception] = None
    model_used = None
    for model in _model_chain():
        try:
            response = client.models.generate_content(
                model=model,
                contents=[
                    prompt,
                    genai_types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"),
                ],
                config=genai_types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            text = response.text or ""
            model_used = model
            break
        except Exception as exc:
            if _is_rate_limited(exc):
                print(f"[WARN] {model} rate-limited, trying next model. ({exc})")
                last_exc = exc
                continue
            return _fallback(f"API call failed: {exc}")
    else:
        return _fallback(f"All models rate-limited: {last_exc}")

    text = _strip_json_fence(text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return _fallback("response was not valid JSON")
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return _fallback("response was not valid JSON")

    if not isinstance(parsed, dict):
        return _fallback("response was not a JSON object")

    result = _coerce(parsed)
    result["model_used"] = model_used
    return result
