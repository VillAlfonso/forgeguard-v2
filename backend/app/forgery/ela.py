"""
Error Level Analysis helpers used by the runtime LLM explainer.

ELA visualizes JPEG re-compression seams: re-save the image at a known
quality, take the pixel-wise absolute difference against the original, then
amplify. Edited regions tend to compress differently from their surroundings
and show up as brighter pixels — a complementary signal to the YOLO/Roboflow
bounding boxes.
"""

import io
from typing import Iterable

from PIL import Image, ImageChops, ImageEnhance


def compute_ela(image: Image.Image, quality: int = 90, amp: float = 10.0) -> Image.Image:
    """Re-save at `quality`, take abs-diff, amplify by `amp`. Returns RGB image."""
    rgb = image.convert("RGB") if image.mode != "RGB" else image
    buf = io.BytesIO()
    rgb.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    resaved = Image.open(buf).convert("RGB")
    diff = ImageChops.difference(rgb, resaved)
    return ImageEnhance.Brightness(diff).enhance(amp)


def side_by_side(images: Iterable[Image.Image], gap: int = 4, bg=(20, 20, 20)) -> Image.Image:
    """Place images horizontally with a small dark gap between them."""
    images = list(images)
    if not images:
        raise ValueError("need at least one image")
    h = max(im.height for im in images)
    w = sum(im.width for im in images) + gap * (len(images) - 1)
    canvas = Image.new("RGB", (w, h), color=bg)
    x = 0
    for im in images:
        canvas.paste(im, (x, 0))
        x += im.width + gap
    return canvas
