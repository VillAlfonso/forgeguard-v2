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
    ⚠ CRITICAL DISTINCTION from digital_cut_paste: traced_projection means someone PHYSICALLY DREW over a projected image — the ink strokes exist in real ink on paper, showing tremor and hesitation. digital_cut_paste means the signature was lifted digitally and composited — no physical ink was applied, and you will see a halo, pixelation, or edge artefact at the boundary. If you see a digital halo, fringe, or compression artefact around a signature, classify as digital_cut_paste, NOT traced_projection.

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
  addition_insertion       — One or more characters were added INSIDE an existing word or number on a genuine document to change its meaning or value. There are TWO subtypes — both are addition_insertion:

    SUBTYPE A — NEW DIGIT INSERTED IN BLANK SPACE (e.g. "9,000" → "49,000"):
    - CROWDING / TIGHT SPACING: the inserted character is squeezed uncomfortably close to adjacent characters or to a currency symbol (₱, $, etc.). Authentic writers leave consistent natural spacing; forgers must squeeze a new digit into whatever gap was left.
    - INK DENSITY OR COLOR MISMATCH: the inserted character may appear slightly darker, lighter, thicker, or a different hue than surrounding original digits — forgers rarely match the exact pen used.
    - STROKE RHYTHM INCONSISTENCY: compare the slant, speed-taper, and formation of the suspect character against adjacent characters. Inserted strokes often show more hesitation, a different slant angle, or different pressure taper than the original writing event.
    - BASELINE MISALIGNMENT: the inserted character may sit slightly above or below the baseline of surrounding text.
    - LOGICAL VALUE CONFLICT: on checks and official forms, the numerical amount field and the written-out amount (words) line must match. If they don't match, this is a high-confidence indicator of numeric alteration — always check both fields when analyzing checks.

    SUBTYPE B — CHARACTER CONVERTED BY ADDING A STROKE (e.g. "3" → "8", "1" → "4", "0" → "8" or "9"):
    - INK TEXTURE MISMATCH (strongest indicator): the original character is printed toner or inkjet dots (smooth, uniform texture); the added stroke is liquid ballpoint or gel ink (wet-looking, jagged edges, different sheen). These have completely different luminance and texture even at normal scan resolution — a smooth printed character interrupted by a wet, darker manual stroke is the primary tell.
    - STROKE LAYERING / Z-AXIS: the added manual ink stroke sits visibly ON TOP of the printed character — it obscures the printed texture underneath it. In a genuine printout, all parts of a character are created simultaneously and have uniform texture throughout. Any stroke that appears to cover or overlap an existing printed region was added later.
    - MORPHOLOGICAL INCONSISTENCY: the arc or curve of the added stroke does not match the mathematical geometry of the surrounding font. Standard fonts have consistent radii and proportions; a manually added stroke almost always deviates from that geometry, creating an asymmetrical or jagged shape.
    - COMMON CONVERSION TARGETS: 3→8 (add a closing arc), 1→4 (add a crossbar and stem), 0→8 or 0→9 (add a crossbar), 7→1 (shorten), 5→6 (add a loop). When you see any of these specific digit shapes, specifically check for ink texture inconsistency on the added portion.

    PAPER SURFACE RULE: In addition_insertion the original paper surface is INTACT. The forger adds ink without removing anything. If the paper shows scuffing, thinning, fiber disruption, halos, or chemical staining, look at erasure_mechanical or erasure_chemical instead — those involve removing the original before adding new content. The core logic difference: insertion = "mutates" a character (3→8, 1→4) by adding strokes; erasure+substitution = "replaces" a character (John→Joan) by removing and rewriting.

    HYBRID FORGERY PATTERN (both subtypes): addition_insertion always occurs on otherwise authentic, genuine documents. The rest of the document (bank printing, MICR line, form template) will look real while only a small section shows the seam between original and added ink.
    ⚠ On bank checks, pay special attention to: (a) the numeric amount box — a leading digit squeezed against the currency symbol (subtype A), or a digit whose shape looks geometrically wrong with a different ink texture (subtype B); (b) the payee name line — a surname or suffix may be appended; (c) the date field — a year digit may be changed.
  addition_interlineation  — New writing squeezed BETWEEN existing lines of text (not inside a word, but in the whitespace between lines). Look for: text that is smaller or at a different baseline than surrounding lines, ink that differs from surrounding lines, spacing that is unnaturally compressed around the inserted line.
  erasure_chemical         — Original ink was removed using a chemical solvent (ink eradicator, bleach, acetone), often followed by new text written or printed in the cleaned area. This is a two-step substitution: remove original → replace with new. Key indicators:
    - HALO / TIDE MARK: a faint circular or irregular discoloration where the solvent spread beyond the target area, leaving a chemical residue ring on the paper.
    - INK GHOSTING: a faint shadow or "ghost" of the original character remains visible — solvents rarely remove 100% of the ink, especially from bond paper.
    - PAPER FIBER DAMAGE: solvent weakens the paper surface, causing slight translucency or a matte patch that reflects light differently from the surrounding area.
    - NEW TEXT ON DAMAGED BACKGROUND: the replacement text sits on a patch that looks clean but wrong — the paper's natural texture or aging is disrupted beneath the new characters.
    - UNDER OBLIQUE LIGHT: the erased area shows a dull or shiny patch inconsistent with surrounding paper reflectance.
    ⚠ DISTINCTION from addition_insertion: chemical erasure involves removing the original character FIRST (paper shows residue, ghost, or halo). addition_insertion leaves the original character intact and adds ink on top of it (paper surface is undamaged; the forgery is purely in the ink layer).

  erasure_mechanical       — Original ink was physically scraped off using a razor blade, sandpaper, eraser, or knife, often followed by new text written or printed on the scraped area. This is a two-step substitution: abrade original → replace with new. Key indicators:
    - ABRADED / SCUFFED PAPER FIBERS ("FUZZY PATCH"): the paper surface is visibly roughened — it looks "fuzzy," "pilled," or matted compared to the smooth surrounding paper. This is the strongest visible tell under normal lighting.
    - SHADOW PATCH / SHEEN DIFFERENCE: the erased area reflects light differently from the rest of the document — it may appear darker, lighter, or matte where the surrounding paper is glossy (or vice versa). In a scan this often appears as a gray-level patch that doesn't match the blank paper around it.
    - GHOST PARTICLES / RESIDUAL INK: mechanical scraping cannot remove 100% of the ink — tiny pigment particles become trapped deep in the disturbed fibers, leaving a dark smudge or shadow in the general shape of the original character. This ghost is NOT as sharp as a real character but has the right rough outline.
    - PAPER THINNING: repeated scraping thins the paper — in transmitted light (backlit) the erased area appears brighter or more translucent than surrounding paper.
    - JAGGED / UNEVEN VOID BOUNDARY: the damage zone has rough, irregular edges — unlike a clean erased area, the boundary between damaged and undamaged paper is jagged because the abrasive tool didn't scrape in a perfectly controlled path.
    - INK FEATHERING ON REPLACEMENT TEXT: new ink written on abraded paper bleeds or feathers into the damaged fibers — the sizing (paper coating) that normally keeps ink crisp has been destroyed by the scraping.
    - LOGICAL WORD TRUNCATION: if a word appears incomplete or truncated (e.g., "RENSIC" instead of "FORENSIC"), and there is a localized paper damage zone at the exact point of truncation, the missing characters were mechanically erased. Check whether the remaining text forms a logical word/name — if not, characters are missing.
    ⚠ DISTINCTION from erasure_chemical: mechanical erasure shows PHYSICAL fiber damage (rough, pilled surface). Chemical erasure uses a solvent and leaves the surface smoother but stained or with a tide mark; new ink bleeds from paper sizing loss, not from fiber disruption.
    ⚠ DISTINCTION from addition_insertion: mechanical erasure is visible as surface damage to the paper itself (scuffing, thinning, fiber disruption). addition_insertion has NO paper surface damage — the original character is still intact; only a new ink stroke was layered on top.

Cut and Paste / Digital Fabrication:
  digital_cut_paste        — A genuine element (signature, stamp, photo, text block) was digitally lifted from one document and composited onto this one using Photoshop, GIMP, or a PDF editor. Key indicators:
    - HALO / FRINGE: a thin bright or differently-coloured edge around the pasted element — caused by anti-aliasing or colour-mismatch during compositing. This is the single strongest DTP indicator.
    - PIXELATION / ALIASING: jagged or blurry edges along the pasted element's boundary, especially visible on diagonal or curved strokes of a signature.
    - BACKGROUND INCONSISTENCY: the paper texture, grain, or colour under the pasted element differs from the surrounding area — looks like a different piece of paper was inserted.
    - COMPRESSION ARTEFACTS: JPEG blocking or noise concentrated around one specific element while the rest of the document is clean.
    - DPI / RESOLUTION MISMATCH: pasted element is noticeably sharper or blurrier than surrounding printed text.
    - SHADOW / LIGHTING: cast shadow direction, document reflections, or paper thickness inconsistent with the rest.
    - LEVELLING: pasted signature or stamp is too perfectly level or centred relative to surrounding text — originates from software alignment tools.
    ⚠ CRITICAL DISTINCTION from traced_projection: digital_cut_paste shows DIGITAL artefacts (halos, pixelation, compression noise, colour-boundary mismatch). Traced forgeries show PHYSICAL artefacts (tremor, hesitation, slow monotonous stroke, no digital halo). A clear digital halo around a signature IS digital_cut_paste even if the signature strokes themselves look fluid.
  digital_desktop          — The ENTIRE document (or a large section) was fabricated from scratch using word-processing or design software (Microsoft Word, Google Docs, Canva, Photoshop) rather than physically typed or printed on authentic forms. Key indicators:
    - PERFECT DIGITAL TYPOGRAPHY: computer-perfect font spacing, kerning, and alignment throughout — no typewriter key-strike impression, no ink variation between characters.
    - FONT INCONSISTENCY: different fonts or font weights within what should be a uniform official document (e.g., official form uses one font but specific fields use another).
    - GENERIC TEMPLATES: document layout matches common Word/Canva templates; borders, logos, or headers look stock/clipart rather than institutional.
    - SIGNATURE QUALITY CONTRAST: if a low-quality or obviously scanned signature is pasted onto otherwise pristine digital text, this is a strong DTP red flag — authentic signed documents look cohesive.
    - INKJET / LASER PRINT PATTERN: at high zoom, text shows inkjet dot arrays or toner microprinting instead of embossed letterpress / authentic printing press patterns expected on official forms.
    - NO PHYSICAL FORM ELEMENTS: official documents (government IDs, bank letters, certificates) normally show security printing, microtext, or embossed seals — absence on what claims to be an official document is suspicious.
    ⚠ CRITICAL DISTINCTION from digital_cut_paste: digital_desktop means the whole document is fake; digital_cut_paste means only one element was inserted into an otherwise real document.
  digital_scanned          — A real physical document was scanned, then digital elements were composited onto the scan image (stamp, signature, name field, or date added in an image editor), and the result was re-saved or re-printed. Key indicators:
    - NOISE INCONSISTENCY: an authentic scan has uniform "salt-and-pepper" scanner noise across the entire sheet. Digitally added elements sit ON TOP of this noise — they look artificially clean or sharp against a grainy background. Natural blank paper areas look uniformly noisy; areas around inserted elements look "erased" or unnaturally smooth.
    - STAMP / SIGNATURE FLATNESS: a genuine wet-ink stamp or signature pressed onto physical paper bleeds into paper fibers and interacts with existing ink. A digitally overlaid stamp or signature looks "flat" — no fiber absorption, no slight ink bleed, no interaction with underlying printed text where they overlap.
    - GLOBAL SCAN TILT vs. LOCAL ELEMENT ALIGNMENT: a real scanner captures the whole page with the same perspective/tilt. If the main document body has a slight skew but a stamp or signature is perfectly level (or vice versa), the element was inserted digitally AFTER scanning — it did not go through the same scanner geometry.
    - COMPRESSION LEVEL MISMATCH (ELA): JPEG compression artifacts cluster around digitally added elements at a different level than the surrounding scanned paper — the base scan was compressed once, the overlay was compressed again on re-save.
    - RESOLUTION HALO: the boundary between the scanned paper grain and the digitally inserted element shows a subtle halo or transition band where the two layers were blended.
    - FONT / FIELD INCONSISTENCY: student or employee names, ID numbers, or dates typed in a slightly different font weight, spacing, or DPI than the pre-printed form template — the template was digitally re-filled after scanning.
    ⚠ DISTINCTION from digital_cut_paste: digital_scanned uses a REAL SCANNED DOCUMENT as the base and adds elements on top of the scan. digital_cut_paste pastes elements into an otherwise authentic document. Choose digital_scanned when the underlying base is clearly a real scan (paper grain, scanner shadow, uniform noise) and the tampered elements sit on top of that grain.

Obliteration:
  obliteration_ink         — Original text scribbled out with ink.
  obliteration_whiteout    — Correction fluid covering text.
  obliteration_pigment     — Opaque marker, paint, or pigment covering text.

Sympathetic Ink:
  sympathetic_indented     — Indented writing visible only via raking light. Pressure indentations on paper with no visible ink.
  sympathetic_special      — Invisible/special ink revealed by an external stimulus (heat, chemical reagent, or UV light). When you detect this, you MUST identify the likely substance based on visible cues:
    HEAT-ACTIVATED (browned/charred organic substance — most common):
      - Lemon/citrus juice: brown strokes, slight crystalline residue
      - Milk: brown strokes, possible greasy/translucent appearance
      - Sugar water / honey: dark brown to black, glossy carbonized look
      - Onion juice / vinegar: pale brown, sharp smell association
      - Wax / crayon resist: waxy sheen, repels later ink/water
    CHEMICALLY-ACTIVATED (color reaction from reagent):
      - Phenolphthalein + ammonia → bright pink/magenta strokes
      - Cobalt chloride + heat → blue→pink color shift
      - Starch + iodine → dark blue/purple strokes
    UV/FLUORESCENT (only visible under UV light):
      - Security ink, quinine (tonic water), highlighter residue → glowing strokes under blacklight
    Put the specific substance in the "subtype" field (e.g., "lemon juice", "milk", "phenolphthalein", "UV ink"). State the substance and method explicitly in the explanation. If genuinely unsure, say so but propose the most likely candidate based on color, texture, and any charring pattern.

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
  2. Scan the WHOLE document for anomalies. List EVERY anomaly you see — do not stop at the first one.
  3. For each anomaly, ask: is this real tampering, or one of the IGNORE items above?
  4. If there are MULTIPLE anomalies, decide which is the PRIMARY forgery (the one that changes the document's legal meaning). A squeezed leading digit on a check amount is more significant than a smudge near the signature.
  5. Point to the PRIMARY anomaly's LOCATION (which region of the document).
  6. Pick the single best category code based on the PRIMARY evidence.
  7. Set confidence based on how clear the evidence is (see scale below).
  ⚠ BANK CHECK RULE: When analyzing a check, always compare the numeric amount field AND the written-out pesos/dollars line. If they don't match, or if a digit appears squeezed against the currency symbol, classify as addition_insertion even if other anomalies (like a smudge or lighter patch) also exist.
  ⚠ INK LAYERING RULE: On any document with printed (toner/inkjet) text, if you see a stroke or mark that has a different texture, sheen, or "wetness" than the surrounding printed characters — especially if it appears to sit ON TOP of the printed text — this is addition_insertion (subtype B: character conversion). Do NOT classify abrasion or disrupted paper fiber as erasure_mechanical if the dominant anomaly is a visually different ink stroke overlaid on top of printed text.
  ⚠ INCOMPLETE WORD RULE: If a word or name appears to be missing characters at one end or in the middle, AND there is a patch of paper damage (roughened surface, shadow patch, ghost smudge) at exactly the gap, classify as erasure_mechanical. A word that cannot stand alone as a real word but would be a real word if characters were prepended is a strong signal (e.g., "RENSIC" → "FORENSIC", "OAN" → "LOAN").
  ⚠ SEMANTIC CONFLICT / CHEMICAL ERASURE RULE: If the written-out amount (e.g., "THREE THOUSAND") does NOT match the numeric field (e.g., "000" with a smudge where the leading digit should be), a leading digit was likely chemically erased. Ink eradicator dissolves the original digit, causing the new ink applied in the cleaned spot to bleed and feather into the damaged paper sizing — this creates dark smudges or halos at the edges of the erased area that can look like obliteration_ink. Key distinguisher: obliteration_ink smears cover text intentionally; erasure_chemical smears appear at the EDGE of a blank area where a character USED TO BE. If the smudge is adjacent to missing/blank space where a digit is expected (based on the written-out amount), classify as erasure_chemical, not obliteration_ink.

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
    "<step 5: chosen category and why>",
    "<step 6: list every plausible alternative and why each is less likely than the primary>"
  ],
  "category": "<one code from the list>",
  "subtype": "<specific kind, or null>",
  "confidence": <float 0.0–1.0 per scale above>,
  "anomaly_location": "<where on the document the forgery appears, e.g. 'top-right date field' — null if no_forgery_detected or not_a_document>",
  "explanation": "<MUST start with the human-readable category name, then explain why based on visible cues>",
  "evidence": ["<short visible cue>", "<another>", "..."],
  "tools_likely_used": "<what tools/methods, or null if not applicable>",
  "alternatives": [
    {"category": "<code>", "reasoning": "<one sentence: what evidence points toward this, and what makes the primary more likely>"},
    {"category": "<code>", "reasoning": "<...>"}
  ]
}

CRITICAL RULES:
  1. The "explanation" MUST begin with the category's human name (e.g. "Chemical Erasure detected.").
  2. If you classify as no_forgery_detected, set anomaly_location to null and evidence to [] or just observed-clean items.
  3. Do NOT invent evidence. If you can't see it, don't list it.
  4. Pick exactly ONE category. If torn, pick the dominant one and mention the other in the alternatives array.
  5. Output ONLY the JSON object. No code fences, no commentary.
  6. "alternatives" must be a JSON array (never null — use [] if there are none). Include up to 3 alternatives ordered by likelihood. Populate it whenever: confidence is below 0.90, OR multiple categories fit the evidence almost equally, OR image quality limits certainty. Leave it as [] only when the evidence is completely unambiguous. Be honest — it is better to admit ambiguity than to over-commit."""


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

    # Alternatives array — support both new array format and legacy single-field format
    raw_alts = parsed.get("alternatives")
    if isinstance(raw_alts, list):
        alternatives = []
        for item in raw_alts:
            if not isinstance(item, dict):
                continue
            code = (item.get("category") or "").strip()
            if code not in CATEGORY_CODES:
                continue
            alternatives.append({
                "category": code,
                "category_label": CATEGORY_LABELS[code],
                "reasoning": (item.get("reasoning") or "").strip() or None,
            })
    else:
        # Legacy fallback: single alternative_category / alternative_reasoning fields
        alt_cat_raw = (parsed.get("alternative_category") or "").strip()
        alt_cat = alt_cat_raw if alt_cat_raw in CATEGORY_CODES else None
        alt_reasoning = (parsed.get("alternative_reasoning") or "").strip() or None
        alternatives = ([{
            "category": alt_cat,
            "category_label": CATEGORY_LABELS[alt_cat],
            "reasoning": alt_reasoning,
        }] if alt_cat else [])

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
        "alternatives": alternatives,
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
