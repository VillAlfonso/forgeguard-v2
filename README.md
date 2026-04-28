# Revelator v2.0 - Document Forensics System

AI-powered document forgery detection system with 16 detection classes.

![Crime Scene Theme](https://img.shields.io/badge/Theme-Crime%20Scene-yellow)
![Python 3.11](https://img.shields.io/badge/Python-3.11-blue)
![YOLOv8](https://img.shields.io/badge/YOLO-v8-green)

---

## 📋 Categories & Classes

| # | Category | Subcategory | API Key | Samples |
|---|----------|-------------|---------|---------|
| 0 | **Traced** | Carbon Transfer | `traced_carbon` | 100 |
| 1 | **Traced** | Indentation/Canal Light | `traced_indentation` | 100 |
| 2 | **Traced** | Projection Process | `traced_projection` | 100 |
| 3 | **Alteration** | Addition: Insertion | `addition_insertion` | 100 |
| 4 | **Alteration** | Addition: Interlineation | `addition_interlineation` | 100 |
| 5 | **Alteration** | Erasure: Chemical | `erasure_chemical` | 100 |
| 6 | **Alteration** | Erasure: Mechanical | `erasure_mechanical` | 100 |
| 7 | **Digital** | Cut and Paste | `digital_cut_paste` | 100 |
| 8 | **Digital** | Desktop Publishing | `digital_desktop` | 100 |
| 9 | **Digital** | Scanned Documents | `digital_scanned` | 100 |
| 10 | **Obliteration** | Ink Stroke | `obliteration_ink` | 100 |
| 11 | **Obliteration** | White Out | `obliteration_whiteout` | 100 |
| 12 | **Obliteration** | Opaque Pigment | `obliteration_pigment` | 100 |
| 13 | **Sympathetic Ink** | Indented Writing | `sympathetic_indented` | 100 |
| 14 | **Sympathetic Ink** | Special Ink (Identify) | `sympathetic_special` | 100 |
| 15 | **Currency** | Currency Analysis | `currency_analysis` | 100 |

**Total: 1,600 training images (100 per class)**

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment (Python 3.11 recommended)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

### 2. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

### 3. Setup LLM (Choose One)

The LLM looks at the annotated image plus the ELA map and explains the verdict.
It needs a **multimodal (vision-capable)** model — text-only models won't work.

**Option A: Local Ollama (Free, runs on your machine)**
```bash
# 1. Install Ollama: https://ollama.com/download
# 2. Pull a vision-capable model:
ollama pull llama3.2-vision:11b
# 3. In .env, leave defaults:
#      USE_CLOUD_LLM=false
#      OLLAMA_MODEL=llama3.2-vision:11b
```
Notes:
- ~7.9 GB download. Needs ~10-12 GB free RAM during inference.
- AMD integrated GPUs on Windows fall back to CPU — first call ~1-2 min, later
  calls faster. Only discrete NVIDIA / RX 6000+ AMD GPUs get acceleration.
- If 11B is too heavy, swap to a lighter vision model and update `OLLAMA_MODEL`:
  `minicpm-v:8b` (~5.5 GB) or `llava-phi3:3.8b`.

**Option B: Groq Cloud (Fast, recommended for production / live demos)**
```bash
# 1. Get API key: https://console.groq.com
# 2. In .env, set:
#      USE_CLOUD_LLM=true
#      GROQ_API_KEY=sk_...
#      GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

**Option C: Roboflow hosted detection (already wired for `digital_cut_paste`)**
```bash
# 1. Get a private API key from your Roboflow workspace settings.
# 2. In .env, set:
#      ROBOFLOW_API_KEY=...
#      ROBOFLOW_CUT_PASTE_MODEL=find-cut-and-paste/1
# Other categories continue to use local YOLO weights under models/<cat>/weights/best.pt.
```

### 4. Run Server

```bash
# Development
python main.py

# Production
uvicorn main:app --host 0.0.0.0 --port 8000
```

Server runs at: http://localhost:8000

---

## 📁 Project Structure

```
forgeguard-v2/
├── main.py                 # FastAPI server
├── requirements.txt        # Python dependencies
├── .env.example           # Environment template
├── data.yaml              # YOLO training config
│
├── weights/               # Place trained model here
│   └── best.pt           # Your trained YOLO weights
│
├── data/                  # Training images (organize here)
│   ├── traced/
│   │   ├── carbon/
│   │   ├── indentation/
│   │   └── projection/
│   ├── alteration/
│   │   ├── addition_insertion/
│   │   ├── addition_interlineation/
│   │   ├── erasure_chemical/
│   │   └── erasure_mechanical/
│   ├── digital/
│   │   ├── cut_paste/
│   │   ├── desktop_publishing/
│   │   └── scanned/
│   ├── obliteration/
│   │   ├── ink_stroke/
│   │   ├── whiteout/
│   │   └── opaque_pigment/
│   ├── sympathetic_ink/
│   │   ├── indented_writing/
│   │   └── special_ink/
│   └── currency/
│       └── currency_analysis/
│
├── scripts/
│   └── train.py           # Training script
│
└── tests/
```

---

## 🎯 Training Your Model

### Step 1: Prepare Dataset

1. Place images in the `data/` folders (100 per class)
2. Use [Roboflow](https://roboflow.com) or [LabelImg](https://github.com/HumanSignal/labelImg) to annotate
3. Export in YOLO format with train/val split (80/20)

### Step 2: Train

**Local (if you have GPU):**
```bash
python scripts/train.py --data data.yaml --epochs 100 --device 0
```

**Google Colab (recommended):**
```python
# Upload your labeled dataset to Colab
!pip install ultralytics

from ultralytics import YOLO

model = YOLO('yolov8n.pt')
model.train(
    data='data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0
)

# Download weights
from google.colab import files
files.download('runs/train/forgeguard/weights/best.pt')
```

### Step 3: Deploy

1. Copy `best.pt` to `weights/` folder
2. Update `.env`: `YOLO_WEIGHTS_PATH=./weights/best.pt`
3. Restart server

---

## 🔌 API Endpoints

### Health Check
```
GET /health
```

### Get Categories
```
GET /categories
```

### Analyze Document
```
POST /analyze
Content-Type: multipart/form-data

imageFile: <image>
category: traced_carbon (optional)
```

### Preliminary Scan
```
POST /preliminary
Content-Type: multipart/form-data

imageFile: <image>
```

---

## 🎨 Frontend

Open `forgeguard-v2.html` in browser. Features:
- Crime scene dark theme
- Evidence marker annotations
- Responsive (mobile + desktop)
- Real-time server status
- JSON report export

---

## 📊 Expected Accuracy

| Dataset Size | Images/Class | Expected mAP |
|-------------|--------------|--------------|
| Minimum | 50-100 | ~60% |
| Basic | 100-300 | ~75% |
| **Your Dataset** | **100** | **~65-70%** |
| Solid | 300-500 | ~85% |
| Strong | 500-1000 | ~90% |

**Tip:** Use data augmentation (rotation, brightness, blur) to effectively 3-5x your dataset.

---

## 🔧 Troubleshooting

**YOLO not loading?**
```bash
pip install ultralytics --upgrade
```

**Ollama not connecting?**
```bash
# Check if Ollama is running and what's pulled
curl http://localhost:11434/api/tags
# If empty, pull the vision model
ollama pull llama3.2-vision:11b
```

**Ollama returns 400 / "model does not support images"?**
You're pointing at a text-only model. The explainer needs a vision-capable
one. Set `OLLAMA_MODEL=llama3.2-vision:11b` (or another multimodal tag) in
`.env` and restart the server.

**LLM explanation is null on /analyze response?**
The endpoint only generates explanations for accounts on `pro` or `premium`
plans (`LLM_PLANS` in `backend/app/config.py`). Free accounts get the
verdict and bounding boxes only.

**CUDA out of memory?**
- Reduce batch size: `--batch 8`
- Use smaller model: `yolov8n.pt`

---

## 📄 License

For capstone project use. Check with your institution for commercial licensing.

---

## 🤝 Support

Built for LSPU Capstone Project - Revelator Document Forensics System
