"""
LLM explanation generation. Primary path is Groq's vision-capable chat API
(image + prompt). Text-only Ollama remains as a local fallback.
"""

import base64
import io
from typing import Optional, List, Dict

from PIL import Image, ImageDraw, ImageFont

from ..config import (
    USE_CLOUD_LLM, GROQ_API_KEY, GROQ_MODEL, GROQ_VISION_MODEL,
    OLLAMA_URL, OLLAMA_MODEL,
)


# ────────────── prompts ──────────────

CUT_PASTE_VISION_PROMPT = (
    "You are a forensic document examiner specializing in detecting digital cut-and-paste "
    "forgeries. The attached image has colored bounding boxes drawn on regions a YOLO "
    "detector flagged as potential tampering.\n\n"
    "Detected regions:\n{detection_lines}\n\n"
    "For EACH numbered region, examine the image and report:\n"
    "1. Visible artifacts at the boundary — be specific. Look for: edge sharpness mismatch, "
    "halo or fringe around the patch, lighting/shadow direction inconsistent with surroundings, "
    "color cast or white-balance shift, texture or paper-grain mismatch, JPEG block-grid "
    "misalignment, double-compression streaks, ghosting from prior content underneath.\n"
    "2. Why this looks pasted — connect the artifacts you actually see to the forgery hypothesis.\n\n"
    "Then provide:\n"
    "• Verdict: forged / suspicious / genuine, with one-sentence justification.\n"
    "• Caveats: anything benign that could explain the artifacts (compression, scanner edge "
    "effects, folded paper, motion blur). Don't fabricate evidence — only describe what is "
    "actually visible in the image.\n\n"
    "Be concise. No more than 6 short paragraphs total."
)

GENERIC_VISION_PROMPT = (
    "You are a forensic document examiner. The attached image has colored bounding boxes on "
    "regions a detector flagged as potential {category} forgery.\n\n"
    "Detected regions:\n{detection_lines}\n\n"
    "For each numbered region, describe the visible artifacts in the image, explain why they "
    "indicate {category}-type tampering, and give a verdict (forged / suspicious / genuine) "
    "with brief justification. List benign explanations as caveats. Be concise."
)


def _detection_lines(detections: List[Dict]) -> str:
    return "\n".join(
        f"- Region {i + 1}: {d['title']} (confidence: {d['confidence']:.0%})"
        for i, d in enumerate(detections)
    )


def build_vision_prompt(detections: List[Dict], category: Optional[str]) -> str:
    lines = _detection_lines(detections)
    if category == "digital_cut_paste":
        return CUT_PASTE_VISION_PROMPT.format(detection_lines=lines)
    return GENERIC_VISION_PROMPT.format(
        detection_lines=lines,
        category=(category or "unspecified").replace("_", " "),
    )


def build_text_prompt(detections: List[Dict], category: Optional[str] = None) -> str:
    """Fallback prompt when no image is sent."""
    if not detections:
        return (
            "You are a forensic document examiner AI. The image analysis found no clear signs "
            "of forgery. Provide a brief professional statement (2-3 sentences) indicating no "
            "obvious indicators were detected, but recommend physical examination for certainty."
        )
    summary = _detection_lines(detections)
    cat_note = f" specifically for {category} forgery" if category else ""
    return (
        f"You are a forensic document examiner AI. Analyze these detection results{cat_note}:\n\n"
        f"{summary}\n\n"
        "Provide a 3-4 sentence forensic explanation: summarize detections, explain what they "
        "typically indicate, state the likely conclusion, recommend next steps. No speculation."
    )


# ────────────── annotated-image helper ──────────────

def render_annotated_image(image: Image.Image, detections: List[Dict], max_dim: int = 896) -> bytes:
    """Draw numbered bboxes on a copy of the image, return JPEG bytes.

    Capped at ~896px to keep token cost down on the vision model.
    """
    img = image.copy().convert("RGB")
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    sx = img.width / image.width
    sy = img.height / image.height

    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", max(12, int(img.height / 50)))
    except OSError:
        font = ImageFont.load_default()

    for i, d in enumerate(detections):
        c = d["coordinates"]
        x1, y1 = c["x_min"] * sx, c["y_min"] * sy
        x2, y2 = c["x_max"] * sx, c["y_max"] * sy
        color = d.get("color", "#dc2626")
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        label = f"{i + 1}"
        tw = draw.textlength(label, font=font) if hasattr(draw, "textlength") else 14
        th = getattr(font, "size", 14)
        draw.rectangle([x1, max(0, y1 - th - 4), x1 + tw + 6, y1], fill=color)
        draw.text((x1 + 3, max(0, y1 - th - 2)), label, fill="#ffffff", font=font)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ────────────── API callers ──────────────

def call_groq_vision_api(prompt: str, image_bytes: bytes) -> Optional[str]:
    """Send image + prompt to Groq's vision-capable chat completions endpoint."""
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        b64 = base64.b64encode(image_bytes).decode("ascii")
        chat = client.chat.completions.create(
            model=GROQ_VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
            temperature=0.4,
            max_tokens=600,
        )
        return (chat.choices[0].message.content or "").strip() or None
    except Exception as e:
        print(f"Groq vision API error: {e}")
        return None


def call_groq_api(prompt: str) -> Optional[str]:
    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)
        chat = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a forensic document examiner AI assistant."},
                {"role": "user", "content": prompt},
            ],
            model=GROQ_MODEL,
            temperature=0.7,
            max_tokens=256,
        )
        return chat.choices[0].message.content
    except Exception as e:
        print(f"Groq API error: {e}")
        return None


def call_ollama_api(prompt: str) -> Optional[str]:
    """Local Ollama fallback (text only)."""
    import requests
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
                  "options": {"temperature": 0.7, "num_predict": 256}},
            timeout=30,
        )
        if response.status_code == 200:
            return response.json().get("response", "Analysis complete.")
    except Exception as e:
        print(f"Ollama API error: {e}")
    return None


# ────────────── public entry point ──────────────

def get_llm_explanation(
    detections: List[Dict],
    category: Optional[str] = None,
    image: Optional[Image.Image] = None,
) -> str:
    # Vision path: detections + image + Groq key available.
    if detections and image is not None and USE_CLOUD_LLM and GROQ_API_KEY:
        annotated = render_annotated_image(image, detections)
        prompt = build_vision_prompt(detections, category)
        result = call_groq_vision_api(prompt, annotated)
        if result:
            return result

    # Text-only path
    text_prompt = build_text_prompt(detections, category)
    if USE_CLOUD_LLM and GROQ_API_KEY:
        result = call_groq_api(text_prompt)
        if result:
            return result
    else:
        result = call_ollama_api(text_prompt)
        if result:
            return result

    # Static fallback
    if not detections:
        return (
            "Forensic analysis complete. No clear forgery indicators were detected. "
            "Physical examination by a certified forensic document examiner is recommended."
        )
    titles = [d["title"] for d in detections]
    return (
        f"Forensic analysis detected potential forgery indicators: {', '.join(titles)}. "
        "Further examination by a certified forensic document examiner is recommended."
    )
