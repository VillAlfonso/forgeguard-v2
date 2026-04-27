"""
Error Level Analysis (ELA) — visualize JPEG re-compression seams.

Technique (Krawetz 2007, popularized by FotoForensics):
  1. Re-save the input image at a known JPEG quality.
  2. Compute pixel-wise absolute difference between original and re-saved.
  3. Amplify the difference so it is humanly visible.

Regions edited *after* the original was JPEG-compressed (cut-paste forgery,
inserted text, edited signatures) tend to compress differently from the
surrounding pixels. The seam appears as a brighter region in the ELA map.

This is a complementary signal to the YOLOv8 detector — converging evidence
between an ELA hotspot and a YOLO bounding box is much stronger than either
alone, which makes ELA a useful capstone enhancement for "did the model
actually localize a real artifact, or hallucinate?"

Usage:
    python scripts/ela.py path/to/image.jpg
    python scripts/ela.py image.jpg --side-by-side
    python scripts/ela.py image.jpg --show-yolo            # overlay YOLO bbox
    python scripts/ela.py image.jpg --quality 85 --amp 15
"""

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance


def compute_ela(image: Image.Image, quality: int, amp: float) -> Image.Image:
    """Re-save at `quality`, take abs-diff, amplify by `amp`. Returns RGB image."""
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    resaved = Image.open(buf).convert("RGB")
    diff = ImageChops.difference(image, resaved)
    return ImageEnhance.Brightness(diff).enhance(amp)


def side_by_side(*images: Image.Image, gap: int = 4, bg=(20, 20, 20)) -> Image.Image:
    """Place images horizontally with a small gap between them."""
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


def overlay_yolo_bboxes(image: Image.Image, label_path: Path, color=(255, 200, 0)):
    """If a YOLO label file exists, draw each bbox on the image. Mutates a copy."""
    if not label_path.exists():
        return image
    out = image.copy()
    draw = ImageDraw.Draw(out)
    W, H = out.size
    for line in label_path.read_text().splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        _cls, cx, cy, w, h = map(float, parts[:5])
        x1 = (cx - w / 2) * W
        y1 = (cy - h / 2) * H
        x2 = (cx + w / 2) * W
        y2 = (cy + h / 2) * H
        for offset in range(2):
            draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("input", type=Path, help="Input image (JPG/PNG)")
    ap.add_argument("--quality", type=int, default=90,
                    help="JPEG re-save quality 1-100 (default: 90)")
    ap.add_argument("--amp", type=float, default=10.0,
                    help="ELA amplification factor (default: 10)")
    ap.add_argument("--out", type=Path, default=None,
                    help="Output path (default: <input>_ela.jpg)")
    ap.add_argument("--side-by-side", action="store_true",
                    help="Place original and ELA side-by-side in the output")
    ap.add_argument("--show-yolo", action="store_true",
                    help="If a YOLO label exists at <input>.txt, overlay the bbox on the output")
    args = ap.parse_args()

    if not args.input.exists():
        print(f"Input not found: {args.input}")
        return 1

    original = Image.open(args.input).convert("RGB")
    ela = compute_ela(original, quality=args.quality, amp=args.amp)

    if args.show_yolo:
        # YOLO label is conventionally the .txt at the same stem as the image
        label_path = args.input.with_suffix(".txt")
        # Draw bbox on the ELA so the hotspot/box convergence is obvious
        ela = overlay_yolo_bboxes(ela, label_path, color=(255, 200, 0))
        if args.side_by_side:
            original = overlay_yolo_bboxes(original, label_path, color=(255, 200, 0))

    result = side_by_side(original, ela) if args.side_by_side else ela
    out = args.out or args.input.with_name(f"{args.input.stem}_ela.jpg")
    result.save(out, format="JPEG", quality=95)

    print(f"ELA written to {out}")
    print(f"  quality={args.quality}  amp={args.amp}")
    if args.side_by_side:
        print(f"  layout: ORIGINAL | ELA")
    if args.show_yolo:
        label_path = args.input.with_suffix(".txt")
        n = len(label_path.read_text().splitlines()) if label_path.exists() else 0
        print(f"  YOLO bboxes overlaid: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
