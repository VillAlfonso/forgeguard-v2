"""
Synthesize a YOLOv8 cut-and-paste forgery dataset from clean source documents.

For each source image, this script generates N forged versions by copying a
random text-rich region and pasting it elsewhere on the same document, with
realistic perturbations applied so the cut-paste artifacts the model learns
match what real forgeries look like.

Output is written in standard Roboflow / YOLOv8 layout:
    <out>/train/images/, train/labels/
    <out>/valid/images/, valid/labels/
    <out>/test/images/,  test/labels/
    <out>/data.yaml

Usage:
    python synthesize.py --sources ./sources --count 8

Then run the existing train.py — it picks up data.yaml automatically.

Citation context: this is the synthesis-based forgery training approach used
by MVSS-Net and ManTra-Net. Realistic perturbations are applied to avoid
overfitting to artificially clean paste edges.
"""

import argparse
import io
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

CLASS_NAME = "cut_paste"
IMAGE_GLOBS = ("*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG")


# ─── Region selection ──────────────────────────────────────────────────────

def variance_score(crop: Image.Image) -> float:
    """Standard deviation of luminance — high = textured/text, low = blank."""
    arr = np.asarray(crop.convert("L"), dtype=np.float32)
    return float(arr.std())


def pick_text_rich_region(img, min_dim, max_dim, attempts=24):
    """Random search for a content-rich rectangular region. Returns (x,y,w,h) or None."""
    W, H = img.size
    upper_w = min(max_dim, W // 3)
    upper_h = min(max_dim, H // 3)
    if upper_w < min_dim or upper_h < min_dim:
        return None

    best, best_score = None, -1.0
    for _ in range(attempts):
        w = random.randint(min_dim, upper_w)
        h = random.randint(min_dim, upper_h)
        x = random.randint(0, W - w)
        y = random.randint(0, H - h)
        score = variance_score(img.crop((x, y, x + w, y + h)))
        if score > best_score:
            best, best_score = (x, y, w, h), score
    return best


def overlap(a, b) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)


# ─── Patch perturbations (the heart of why this generalizes) ──────────────

def perturb_brightness(patch):
    return ImageEnhance.Brightness(patch).enhance(random.uniform(0.92, 1.08))


def perturb_color(patch):
    return ImageEnhance.Color(patch).enhance(random.uniform(0.92, 1.08))


def perturb_blur(patch):
    return patch.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3, 0.9)))


def perturb_jpeg(patch):
    """Re-encode the patch at a different JPEG quality — produces the
    double-compression artifact that distinguishes real forgeries."""
    buf = io.BytesIO()
    patch.save(buf, format="JPEG", quality=random.randint(55, 85))
    buf.seek(0)
    return Image.open(buf).convert("RGB")


PERTURB_FNS = [perturb_brightness, perturb_color, perturb_blur, perturb_jpeg]


def apply_random_perturbations(patch):
    fns = random.sample(PERTURB_FNS, k=random.randint(1, 3))
    for fn in fns:
        patch = fn(patch)
    return patch


# ─── Pasting (hard-edge or feathered) ─────────────────────────────────────

def make_feather_mask(size, feather: int):
    """Black border that fades to white in the middle, blurred for soft edges."""
    w, h = size
    mask = Image.new("L", size, 0)
    inset = max(1, feather)
    ImageDraw.Draw(mask).rectangle(
        [inset, inset, w - 1 - inset, h - 1 - inset], fill=255
    )
    return mask.filter(ImageFilter.GaussianBlur(radius=feather))


def paste_patch(canvas, patch, dst_xy, feather: int):
    if feather <= 0:
        canvas.paste(patch, dst_xy)
    else:
        canvas.paste(patch, dst_xy, make_feather_mask(patch.size, feather))


# ─── Main per-image synthesis ─────────────────────────────────────────────

def synthesize_one(src_img, patch_min, patch_max):
    W, H = src_img.size

    src_box = pick_text_rich_region(src_img, patch_min, patch_max)
    if src_box is None:
        return None
    sx, sy, sw, sh = src_box

    patch = src_img.crop((sx, sy, sx + sw, sy + sh))
    patch = apply_random_perturbations(patch)
    pw, ph = patch.size

    # Find a non-overlapping destination
    for _ in range(40):
        dx = random.randint(0, W - pw)
        dy = random.randint(0, H - ph)
        if not overlap((sx, sy, sw, sh), (dx, dy, pw, ph)):
            break
    else:
        return None

    canvas = src_img.copy()
    # Mostly hard edges (real Photoshop forgeries often are), some feathered.
    feather = random.choices([0, 0, 0, 1, 2, 3], k=1)[0]
    paste_patch(canvas, patch, (dx, dy), feather=feather)

    return canvas, (dx, dy, pw, ph)


def to_yolo_label(bbox, img_w, img_h, cls_id=0):
    x, y, w, h = bbox
    cx = (x + w / 2) / img_w
    cy = (y + h / 2) / img_h
    return f"{cls_id} {cx:.6f} {cy:.6f} {w / img_w:.6f} {h / img_h:.6f}"


def split_indices(n, ratios=(0.7, 0.2, 0.1)):
    idx = list(range(n))
    random.shuffle(idx)
    a = int(n * ratios[0])
    b = int(n * (ratios[0] + ratios[1]))
    return idx[:a], idx[a:b], idx[b:]


# ─── CLI ───────────────────────────────────────────────────────────────────

def gather_sources(folder: Path):
    files = []
    for pat in IMAGE_GLOBS:
        files.extend(folder.glob(pat))
    return sorted(set(files))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--sources", required=True, type=Path,
                    help="Folder of clean source images (jpg/png)")
    ap.add_argument("--out", default=".", type=Path, help="Dataset output root")
    ap.add_argument("--count", type=int, default=8,
                    help="Forgeries to generate per source image (default: 8)")
    ap.add_argument("--patch-min", type=int, default=40,
                    help="Min patch dimension in px (default: 40)")
    ap.add_argument("--patch-max", type=int, default=220,
                    help="Max patch dimension in px (default: 220)")
    ap.add_argument("--quality", type=int, default=88,
                    help="Output JPEG quality 1-100 (default: 88)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not args.sources.is_dir():
        print(f"sources folder not found: {args.sources}")
        return 1

    random.seed(args.seed)
    np.random.seed(args.seed)

    sources = gather_sources(args.sources)
    if not sources:
        print(f"No images found in {args.sources}")
        return 1
    print(f"Found {len(sources)} source images.")

    out = args.out
    for split in ("train", "valid", "test"):
        (out / split / "images").mkdir(parents=True, exist_ok=True)
        (out / split / "labels").mkdir(parents=True, exist_ok=True)

    examples = []   # (PIL.Image, label_text, basename)
    for path in sources:
        try:
            img = Image.open(path).convert("RGB")
        except Exception as e:
            print(f"  skip {path.name}: {e}")
            continue
        made = 0
        for k in range(args.count):
            r = synthesize_one(img, args.patch_min, args.patch_max)
            if r is None:
                continue
            forged, bbox = r
            examples.append((forged, to_yolo_label(bbox, *forged.size), f"{path.stem}_forge_{k:03d}"))
            made += 1
        print(f"  {path.name}: {made}/{args.count} forgeries")

    if not examples:
        print("No forgeries generated.")
        return 1

    train_idx, valid_idx, test_idx = split_indices(len(examples))
    splits = {"train": train_idx, "valid": valid_idx, "test": test_idx}
    for split_name, indices in splits.items():
        for i in indices:
            img, label, name = examples[i]
            img.save(out / split_name / "images" / f"{name}.jpg",
                     format="JPEG", quality=args.quality)
            (out / split_name / "labels" / f"{name}.txt").write_text(label + "\n")
        print(f"  {split_name}: {len(indices)} examples")

    yaml_path = out / "data.yaml"
    yaml_path.write_text(
        f"path: {out.resolve()}\n"
        f"train: train/images\n"
        f"val: valid/images\n"
        f"test: test/images\n"
        f"\n"
        f"nc: 1\n"
        f"names:\n  0: {CLASS_NAME}\n"
    )
    print(f"\nTotal: {len(examples)} forgeries across {len(sources)} source images.")
    print(f"data.yaml written to {yaml_path}")
    print("\nReady to train. Run:\n  python train.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
