"""
YOLO-based forgery detection logic (extracted from original main.py).
"""

from pathlib import Path
from typing import Optional, List, Dict
from PIL import Image

from ..config import CONFIDENCE_THRESHOLD
from . import roboflow_client

# ============================================
# CLASS LABELS - Map YOLO class indices to labels
# ============================================

CLASS_LABELS = {
    0: {"name": "traced_carbon", "title": "Carbon Transfer", "category": "Traced", "color": "#3b82f6"},
    1: {"name": "traced_indentation", "title": "Indentation/Canal Light", "category": "Traced", "color": "#3b82f6"},
    2: {"name": "traced_projection", "title": "Projection Process", "category": "Traced", "color": "#3b82f6"},
    3: {"name": "addition_insertion", "title": "Addition: Insertion", "category": "Alteration", "color": "#dc2626"},
    4: {"name": "addition_interlineation", "title": "Addition: Interlineation", "category": "Alteration", "color": "#dc2626"},
    5: {"name": "erasure_chemical", "title": "Erasure: Chemical", "category": "Alteration", "color": "#dc2626"},
    6: {"name": "erasure_mechanical", "title": "Erasure: Mechanical", "category": "Alteration", "color": "#dc2626"},
    7: {"name": "digital_cut_paste", "title": "Cut and Paste", "category": "Digital", "color": "#8b5cf6"},
    8: {"name": "digital_desktop", "title": "Desktop Publishing", "category": "Digital", "color": "#8b5cf6"},
    9: {"name": "digital_scanned", "title": "Scanned Documents", "category": "Digital", "color": "#8b5cf6"},
    10: {"name": "obliteration_ink", "title": "Ink Stroke", "category": "Obliteration", "color": "#f97316"},
    11: {"name": "obliteration_whiteout", "title": "White Out", "category": "Obliteration", "color": "#f97316"},
    12: {"name": "obliteration_pigment", "title": "Opaque Pigment", "category": "Obliteration", "color": "#f97316"},
    13: {"name": "sympathetic_indented", "title": "Indented Writing", "category": "Sympathetic Ink", "color": "#22c55e"},
    14: {"name": "sympathetic_special", "title": "Special Ink", "category": "Sympathetic Ink", "color": "#22c55e"},
    15: {"name": "currency_analysis", "title": "Currency Forgery", "category": "Currency", "color": "#eab308"},
}

NAME_TO_CLASS = {v["name"]: k for k, v in CLASS_LABELS.items()}
VALID_CATEGORIES = list(NAME_TO_CLASS.keys())

TRAINING_STATUS = {
    "traced_carbon": False,
    "traced_indentation": False,
    "traced_projection": False,
    "addition_insertion": False,
    "addition_interlineation": False,
    "erasure_chemical": False,
    "erasure_mechanical": False,
    "digital_cut_paste": False,
    "digital_desktop": False,
    "digital_scanned": False,
    "obliteration_ink": False,
    "obliteration_whiteout": False,
    "obliteration_pigment": False,
    "sympathetic_indented": False,
    "sympathetic_special": False,
    "currency_analysis": False,
}

# Dataset image counts per class (training set size).
# UPDATE THESE NUMBERS as datasets are gathered. Keep the keys aligned with TRAINING_STATUS.
DATASET_COUNTS = {
    "traced_carbon": 0,
    "traced_indentation": 0,
    "traced_projection": 0,
    "addition_insertion": 0,
    "addition_interlineation": 0,
    "erasure_chemical": 0,
    "erasure_mechanical": 0,
    "digital_cut_paste": 0,
    "digital_desktop": 0,
    "digital_scanned": 0,
    "obliteration_ink": 0,
    "obliteration_whiteout": 0,
    "obliteration_pigment": 0,
    "sympathetic_indented": 0,
    "sympathetic_special": 0,
    "currency_analysis": 0,
}

# Threshold for what counts as "limited" data — surfaced as a warning to users.
LIMITED_DATA_THRESHOLD = 200

CONFIDENCE_THRESHOLDS = {
    "high": 0.75,
    "medium": 0.50,
    "low": 0.25,
}

# Loaded YOLO models
yolo_models: Dict = {}

MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models"


def _count_dataset_images():
  """Count actual images in dataset folders to auto-populate DATASET_COUNTS."""
  for category in DATASET_COUNTS.keys():
    category_dir = MODELS_DIR / category
    count = 0
    for split in ["train", "valid", "test"]:
      images_dir = category_dir / split / "images"
      if images_dir.exists():
        count += len([f for f in images_dir.glob("*") if f.suffix.lower() in [".jpg", ".jpeg", ".png"]])
    DATASET_COUNTS[category] = count


def load_yolo_models() -> bool:
    global yolo_models

    # Auto-count images in dataset folders
    _count_dataset_images()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ultralytics not installed. Run: pip install ultralytics")
        return False

    loaded_count = 0
    for type_name in TRAINING_STATUS.keys():
        weights_path = MODELS_DIR / type_name / "weights" / "best.pt"
        if weights_path.exists():
            try:
                yolo_models[type_name] = YOLO(str(weights_path))
                TRAINING_STATUS[type_name] = True
                loaded_count += 1
                print(f"  Loaded: {type_name}")
            except Exception as e:
                print(f"  Failed: {type_name} - {e}")
        elif roboflow_client.is_configured(type_name):
            TRAINING_STATUS[type_name] = True
            loaded_count += 1
            print(f"  Loaded: {type_name} (roboflow)")

    print(f"\n  Models loaded: {loaded_count}/{len(TRAINING_STATUS)}")

    if loaded_count == 0:
        print("  No trained models found. Loading base yolov8n for demo.")
        try:
            yolo_models["_default"] = YOLO("yolov8n.pt")
        except Exception as e:
            print(f"  Could not load default model: {e}")
            return False

    return True


def get_model_for_category(category: Optional[str] = None):
    if category and category in yolo_models:
        return yolo_models[category]
    return yolo_models.get("_default")


def run_yolo_inference(image: Image.Image, category: Optional[str] = None) -> List[Dict]:
    detections = []

    # Dispatch order: prefer locally-trained YOLO weights when present.
    # Roboflow is the fallback for categories that don't have a local checkpoint.
    # Setting ROBOFLOW_<CAT>_MODEL='' in .env (or never training the local model)
    # is enough to switch a single category between the two paths.
    if category and category not in yolo_models and roboflow_client.is_configured(category):
        preds = roboflow_client.infer(image, category)
        detections.extend(roboflow_client.to_detections(preds, category, CLASS_LABELS, NAME_TO_CLASS))
        detections.sort(key=lambda x: x["confidence"], reverse=True)
        return detections

    if category is None:
        # Preliminary scan: run Roboflow for categories that DON'T have a
        # local model loaded (the local ones get picked up by the YOLO loop below).
        for cat in NAME_TO_CLASS:
            if cat not in yolo_models and roboflow_client.is_configured(cat):
                preds = roboflow_client.infer(image, cat)
                detections.extend(roboflow_client.to_detections(preds, cat, CLASS_LABELS, NAME_TO_CLASS))

    if category:
        models_to_run = {category: yolo_models.get(category)}
        if models_to_run[category] is None:
            default_model = yolo_models.get("_default")
            if default_model:
                models_to_run = {"_default": default_model}
            else:
                return []
    else:
        models_to_run = {k: v for k, v in yolo_models.items() if k != "_default"}
        if not models_to_run:
            default_model = yolo_models.get("_default")
            if default_model:
                models_to_run = {"_default": default_model}
            else:
                detections.sort(key=lambda x: x["confidence"], reverse=True)
                return detections

    for model_name, model in models_to_run.items():
        if model is None:
            continue
        try:
            results = model(image, conf=CONFIDENCE_THRESHOLD, verbose=False)
            for result in results:
                boxes = result.boxes
                for i, box in enumerate(boxes):
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                    if model_name != "_default":
                        type_name = model_name
                        class_info = CLASS_LABELS.get(NAME_TO_CLASS.get(type_name, -1), {
                            "name": type_name, "title": type_name.replace("_", " ").title(),
                            "category": "Unknown", "color": "#dc2626"
                        })
                    else:
                        class_info = CLASS_LABELS.get(class_id, {
                            "name": f"class_{class_id}", "title": f"Detection {class_id}",
                            "category": "Unknown", "color": "#dc2626"
                        })

                    detections.append({
                        "id": len(detections) + 1,
                        "class_id": NAME_TO_CLASS.get(class_info["name"], class_id),
                        "confidence": confidence,
                        "title": class_info["title"],
                        "category": class_info["category"],
                        "color": class_info["color"],
                        "model_used": model_name,
                        "coordinates": {"x_min": x1, "y_min": y1, "x_max": x2, "y_max": y2},
                    })
        except Exception as e:
            print(f"YOLO inference error ({model_name}): {e}")
            continue

    detections.sort(key=lambda x: x["confidence"], reverse=True)
    return detections


def determine_verdict(detections: List[Dict]) -> tuple:
    """Return (verdict, confidence). 'no_forgery_detected' is intentional —
    the model finding nothing is *not* the same as proving authenticity, and
    'genuine' overclaims. See the About page for the full caveat."""
    if not detections:
        return "no_forgery_detected", 0.15
    max_conf = max(d["confidence"] for d in detections)
    avg_conf = sum(d["confidence"] for d in detections) / len(detections)
    confidence = (max_conf * 0.7) + (avg_conf * 0.3)
    if confidence >= 0.75:
        return "forged", confidence
    elif confidence >= 0.50:
        return "suspicious", confidence
    else:
        return "no_forgery_detected", confidence


def get_training_warning(category: Optional[str], detections: List[Dict]) -> Optional[str]:
    warnings = []
    if category:
        is_trained = TRAINING_STATUS.get(category, False)
        if not is_trained:
            warnings.append(
                f"LIMITED TRAINING DATA: The '{category}' category has not been "
                f"trained with sufficient real-world samples. Results may be unreliable."
            )
    trained_categories = sum(1 for v in TRAINING_STATUS.values() if v)
    total_categories = len(TRAINING_STATUS)
    if trained_categories == 0:
        warnings.append("MODEL NOT TRAINED: All results are placeholder/demo only.")
    elif trained_categories < total_categories:
        untrained = [k for k, v in TRAINING_STATUS.items() if not v]
        if len(untrained) <= 5:
            warnings.append(f"PARTIAL TRAINING: Lacking data for: {', '.join(untrained[:5])}")
    if detections:
        avg_conf = sum(d["confidence"] for d in detections) / len(detections)
        if avg_conf < CONFIDENCE_THRESHOLDS["medium"]:
            warnings.append(f"LOW CONFIDENCE: Average {avg_conf:.1%}. Consider physical examination.")
    return " | ".join(warnings) if warnings else None
