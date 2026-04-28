"""
Roboflow Hosted Inference client.

Routes a single category (currently digital_cut_paste) to a Roboflow-hosted
model instead of a locally trained YOLO checkpoint. The response is normalized
to the same detection shape the rest of the pipeline expects.
"""

import base64
import io
from typing import List, Dict, Optional

import requests
from PIL import Image

from ..config import (
    ROBOFLOW_API_KEY,
    ROBOFLOW_API_URL,
    ROBOFLOW_CUT_PASTE_MODEL,
    CONFIDENCE_THRESHOLD,
)


# Map a Revelator category name -> Roboflow model_id ("<project>/<version>").
# Add more entries here as additional categories are migrated to Roboflow.
CATEGORY_TO_MODEL = {
    "digital_cut_paste": ROBOFLOW_CUT_PASTE_MODEL,
}


def is_configured(category: str) -> bool:
    return bool(ROBOFLOW_API_KEY) and bool(CATEGORY_TO_MODEL.get(category))


def _encode_image(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def infer(image: Image.Image, category: str) -> List[Dict]:
    """
    Call Roboflow hosted inference for the given category.

    Returns a list of raw predictions, each with keys:
      x, y, width, height (center-based, pixels), confidence, class
    Returns [] on error (logged) so the caller can degrade gracefully.
    """
    model_id = CATEGORY_TO_MODEL.get(category)
    if not model_id or not ROBOFLOW_API_KEY:
        return []

    url = f"{ROBOFLOW_API_URL.rstrip('/')}/{model_id}"
    params = {
        "api_key": ROBOFLOW_API_KEY,
        "confidence": int(CONFIDENCE_THRESHOLD * 100),
    }
    body = _encode_image(image)
    try:
        resp = requests.post(
            url,
            params=params,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"Roboflow inference error ({model_id}): {e}")
        return []
    except ValueError as e:
        print(f"Roboflow returned non-JSON ({model_id}): {e}")
        return []

    return data.get("predictions", []) or []


def to_detections(
    predictions: List[Dict],
    category: str,
    class_labels: Dict[int, Dict],
    name_to_class: Dict[str, int],
) -> List[Dict]:
    """
    Convert Roboflow predictions (center x/y + width/height) into the
    Revelator detection shape (x_min/y_min/x_max/y_max + metadata).
    """
    class_info = class_labels.get(name_to_class.get(category, -1), {
        "name": category,
        "title": category.replace("_", " ").title(),
        "category": "Unknown",
        "color": "#dc2626",
    })

    detections: List[Dict] = []
    for p in predictions:
        try:
            cx = float(p["x"])
            cy = float(p["y"])
            w = float(p["width"])
            h = float(p["height"])
            conf = float(p.get("confidence", 0.0))
        except (KeyError, TypeError, ValueError):
            continue

        x1 = int(cx - w / 2)
        y1 = int(cy - h / 2)
        x2 = int(cx + w / 2)
        y2 = int(cy + h / 2)

        detections.append({
            "id": len(detections) + 1,
            "class_id": name_to_class.get(class_info["name"], -1),
            "confidence": conf,
            "title": class_info["title"],
            "category": class_info["category"],
            "color": class_info["color"],
            "model_used": f"roboflow:{CATEGORY_TO_MODEL.get(category)}",
            "coordinates": {"x_min": x1, "y_min": y1, "x_max": x2, "y_max": y2},
        })

    return detections
