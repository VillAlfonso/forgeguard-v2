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

**Option A: Local Ollama (Free)**
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3
```

**Option B: Groq Cloud (Fast)**
```bash
# Get API key: https://console.groq.com
# Add to .env: GROQ_API_KEY=your_key
# Set: USE_CLOUD_LLM=true
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
# Check if Ollama is running
curl http://localhost:11434/api/tags
```

**CUDA out of memory?**
- Reduce batch size: `--batch 8`
- Use smaller model: `yolov8n.pt`

---

## 📄 License

For capstone project use. Check with your institution for commercial licensing.

---

## 🤝 Support

Built for LSPU Capstone Project - Revelator Document Forensics System
