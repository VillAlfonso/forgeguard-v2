"""
Pre-detection sanity check: is the upload actually a document?

Runs a tight yes/no vision-LLM call before the full forgery pipeline. If the
image is clearly not a document (selfie, meme, photo of an object, etc.) we
return early with a friendly verdict and skip both the detection step and the
quota counter.

Fails open: if the LLM call errors or times out, we let the upload through
rather than block users on flaky infra.
"""

import base64
import io
from typing import Tuple

import requests
from PIL import Image

from ..config import (
    USE_CLOUD_LLM,
    GROQ_API_KEY,
    GROQ_VISION_MODEL,
    OLLAMA_URL,
    OLLAMA_MODEL,
)


GATE_PROMPT = (
    "You are screening uploads for a document-forensics tool. Look at the "
    "image and decide whether it is a document.\n\n"
    "Count as DOCUMENT: paper documents, forms, IDs, passports, certificates, "
    "contracts, receipts, letters, handwritten notes, currency/banknotes, "
    "cheques, photos of any of those, scans of any of those, and screenshots "
    "of any of those.\n\n"
    "Count as NOT_DOCUMENT: photos of people, animals, food, scenery, "
    "vehicles, objects, art/illustrations, memes, screenshots of UIs/games/"
    "websites that aren't a document, or anything where there is no "
    "meaningful printed or handwritten text on a paper-like surface.\n\n"
    "Format your reply EXACTLY like this:\n"
    "  • LINE 1: a single word, all caps, no punctuation: DOCUMENT or "
    "NOT_DOCUMENT.\n"
    "  • LINES 2+: a short explanation written for the end user.\n"
    "      - If DOCUMENT: one sentence naming what kind of document it "
    "looks like (e.g. \"This appears to be a scanned national ID card.\").\n"
    "      - If NOT_DOCUMENT: 2-4 sentences. First, state plainly that "
    "the upload is not a document and say what it actually is "
    "(\"The file you provided is not a document, but rather a ...\"). "
    "Then describe what the image actually shows — subject, setting, any "
    "notable details — so the user understands you looked at it. End with "
    "one short redirect line asking them to upload an actual document "
    "(paper document, ID, certificate, receipt, etc.) so Revelator can "
    "analyze it.\n\n"
    "Be specific in the description. Don't fabricate details that aren't "
    "visible. Keep the tone helpful, not scolding."
)


def _resize_for_gate(image: Image.Image, max_dim: int = 512) -> bytes:
    """Small panel keeps the gate fast — full-res isn't needed for yes/no."""
    img = image.copy().convert("RGB")
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def _ask_groq(image_bytes: bytes) -> str:
    from groq import Groq
    client = Groq(api_key=GROQ_API_KEY)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    chat = client.chat.completions.create(
        model=GROQ_VISION_MODEL,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": GATE_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        }],
        temperature=0.2,
        max_tokens=220,
    )
    return (chat.choices[0].message.content or "").strip()


def _ask_ollama(image_bytes: bytes) -> str:
    """Cold-start on a CPU-only 11B vision model can take 90-180s; budget 5 min."""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    resp = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": OLLAMA_MODEL,
            "messages": [{"role": "user", "content": GATE_PROMPT, "images": [b64]}],
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 220},
        },
        timeout=300,
    )
    resp.raise_for_status()
    return (resp.json().get("message", {}).get("content") or "").strip()


def check_is_document(image: Image.Image) -> Tuple[bool, str]:
    """
    Returns (is_document, reason).

    On any error this returns (True, "...") so the rest of the pipeline still
    runs — we'd rather over-accept than block users on transient LLM issues.
    """
    image_bytes = _resize_for_gate(image)
    try:
        if USE_CLOUD_LLM and GROQ_API_KEY:
            raw = _ask_groq(image_bytes)
        else:
            raw = _ask_ollama(image_bytes)
    except Exception as e:
        # Loud log so users know why a non-document slipped through.
        print(f"⚠️  Document gate FAILED OPEN ({type(e).__name__}: {e}). "
              f"Image will be processed as if it were a document.")
        return True, ""

    if not raw:
        print("⚠️  Document gate returned empty response — failing open.")
        return True, ""

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    verdict_line = lines[0].upper() if lines else ""
    # The description may span multiple lines / paragraphs. Re-join them so the
    # frontend gets the full prose.
    reason = " ".join(lines[1:]).strip()

    # Be lenient about formatting — the model sometimes prefixes punctuation
    # or wraps the verdict in markdown bold.
    if "NOT_DOCUMENT" in verdict_line or "NOT DOCUMENT" in verdict_line:
        return False, reason or "The uploaded image does not appear to be a document."
    if "DOCUMENT" in verdict_line:
        return True, reason

    print(f"⚠️  Document gate ambiguous response — failing open. Raw: {raw[:200]!r}")
    return True, ""
