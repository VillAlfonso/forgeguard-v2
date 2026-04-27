# Revelator - Quick Start Training Guide

## 🎯 Goal: Train ONE category to test your pipeline

We'll start with **Digital Forgery** because it has publicly available data.

---

## 📥 STEP 1: Get the Dataset

### Option A: Roboflow (Easiest - 402 images)

1. Go to: https://universe.roboflow.com/document-forgery-detection/document-forgery-detection
2. Click **"Download Dataset"** (free account required)
3. Select format: **YOLOv8**
4. Click **"Continue"** → **"Download zip"**
5. Extract to `./dataset/` folder

Your folder should look like:
```
dataset/
├── data.yaml          ← Training config
├── train/
│   ├── images/        ← Training images
│   └── labels/        ← YOLO format labels (.txt files)
└── valid/
    ├── images/        ← Validation images
    └── labels/        ← Validation labels
```

### Option B: CASIA 2.0 (Advanced - 5,000+ images)

This needs format conversion. Use only if you want more data later.

1. Download: https://github.com/namtpham/casia2groundtruth
2. Get images: https://bit.ly/2QazgkG (Google Drive)
3. Need to convert masks to YOLO bounding boxes (I can help)

---

## 💻 STEP 2: Setup Environment

```bash
# Create virtual environment (Python 3.11 required!)
python3.11 -m venv venv

# Activate it
source venv/bin/activate      # Mac/Linux
# OR
venv\Scripts\activate         # Windows

# Install dependencies
pip install ultralytics pillow

# Verify installation
python -c "from ultralytics import YOLO; print('✓ Ready!')"
```

---

## 🚀 STEP 3: Train!

### Local Machine (with or without GPU)

```bash
cd forgeguard-v2
python train_digital_forgery.py
```

### Google Colab (Free GPU - Recommended)

```python
# Cell 1: Install
!pip install ultralytics

# Cell 2: Upload dataset
from google.colab import files
uploaded = files.upload()  # Upload your dataset.zip

# Cell 3: Extract
!unzip dataset.zip -d dataset

# Cell 4: Train
from ultralytics import YOLO

model = YOLO('yolov8n.pt')
model.train(
    data='dataset/data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0  # Use GPU
)

# Cell 5: Download weights
from google.colab import files
files.download('runs/train/train/weights/best.pt')
```

---

## ⏱️ Expected Training Time

| Platform | Epochs | Time |
|----------|--------|------|
| Colab Free GPU | 100 | ~30-45 min |
| RTX 3060 | 100 | ~20-30 min |
| CPU only | 100 | ~3-5 hours |

---

## ✅ STEP 4: Test Your Model

```bash
# Test on a single image
python train_digital_forgery.py test runs/train/digital_forgery/weights/best.pt test_image.jpg
```

---

## 🔌 STEP 5: Deploy to Revelator

1. Copy `best.pt` to `weights/` folder
2. Update `.env`:
   ```
   YOLO_WEIGHTS_PATH=./weights/best.pt
   ```
3. Start server:
   ```bash
   python main.py
   ```
4. Open `forgeguard-v2-fixed.html` in browser

---

## 📊 What to Expect

With 402 images from Roboflow:
- **mAP50**: ~60-75% (decent for demo)
- **Precision**: ~65-80%
- **Recall**: ~55-70%

This proves your pipeline works! Then:
1. Add your client's specialized data
2. Train on all 16 categories together
3. Achieve higher accuracy

---

## 🆘 Troubleshooting

### "CUDA out of memory"
```python
# Reduce batch size
model.train(data=..., batch=8)  # or 4
```

### "No module named ultralytics"
```bash
pip install ultralytics --upgrade
```

### "Permission denied" on Colab
```python
# Use full path
model.train(data='/content/dataset/data.yaml', ...)
```

### Training stuck / very slow
- On CPU is normal to be slow
- Use Colab for free GPU access
- Check that `device=0` is set for GPU

---

## 📝 Summary

| Step | Action | Time |
|------|--------|------|
| 1 | Download Roboflow dataset | 2 min |
| 2 | Setup Python environment | 5 min |
| 3 | Train model | 30-45 min (GPU) |
| 4 | Test & deploy | 5 min |
| **Total** | | **~45 min** |

Once this works, you'll understand the full pipeline and can scale to all 16 categories!

---

## 🔮 After This Works

When your client provides the specialized forensic data:

1. **Keep it simple first**: Train ONE model on ALL 16 classes (standard approach)
2. **Only if needed**: Train specialized models per category (your original idea)

The standard approach (one model, 16 classes) is:
- Easier to maintain
- Better accuracy (classes learn shared features)
- Simpler deployment

Good luck! 🚀
