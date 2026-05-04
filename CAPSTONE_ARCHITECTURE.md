# Revelator — System Architecture & Design Decisions

**Status:** TODO — Add detailed analysis before final submission

## Fine-Tuning LLaVA for Forensic Classification

### Would Fine-Tuned LLaVA Beat Claude?
- **Claude** is smarter overall (better reasoning, fewer hallucinations, general-purpose)
- **Fine-tuned LLaVA** is more specialized (trained specifically on forensic documents)
- For your use case: **Fine-tuned LLaVA could outperform Claude** on forgery detection
- Trade-off: Claude wins on general reasoning; LLaVA wins on domain-specific accuracy
- **Bottom line:** Yes, fine-tuning is worth doing if you have labeled data

### LLaVA vs YOLO for Forgery Detection
| Aspect | YOLO | LLaVA |
|---|---|---|
| **Task** | Object detection (bounding boxes) | Vision-language understanding |
| **Output** | Box coordinates + class | Classification + explanation + localization |
| **Appropriate for forgery?** | ❌ No (detects objects, not forgery patterns) | ✅ Yes (understands document context) |
| **Fine-tunable** | ❌ Requires labeled bounding boxes | ✅ Requires labeled images + text descriptions |
| **Explainability** | Low (just boxes) | High (explains why it's a forgery) |
| **Verdict** | LLaVA is the right tool for this project |

### LLaVA Model Sizes & Hosting Limits

**Available Models:**

| Model | Parameters | Quantized (4-bit) | HF Spaces T4 GPU | Training Data Needed |
|---|---|---|---|---|
| **LLaVA-1.5 7B** | 7 billion | ~4GB | ✅ Fits fine | 100-500/category |
| **LLaVA-1.5 13B** | 13 billion | ~8-10GB | ⚠️ Tight (15-20s inference) | 200-1000/category |
| **Qwen-VL** | 10 billion | ~6GB | ✅ Good fit | 100-500/category |
| **LLaVA-NeXT 7B** | 7 billion | ~4GB | ✅ Fits fine | 100-500/category |

**Recommendation for capstone:** **LLaVA-1.5 7B** or **Qwen-VL**
- Comfortably fits HF Spaces T4 free GPU (16GB VRAM)
- Fast inference (~5-10s per image)
- Good accuracy with moderate fine-tuning data

### Training Data Requirements
- **Minimum viable:** 100-200 labeled images per forgery category (~1600-3200 total)
- **Good:** 500+ per category (~8000 total)
- **Excellent:** 1000+ per category (~16000 total)
- More data = better accuracy + less overfitting
- Each image needs: photo + text description of forgery type, visual cues, and evidence

### Other Vision-Language Model Options
| Model | Strengths | Trade-offs |
|---|---|---|
| **Qwen-VL** (10B) | Excellent document understanding, ~6GB quantized | Chinese-origin (no political issues, but check org) |
| **LLaVA-NeXT** (13B) | Newer than 1.5, better reasoning | Larger (tight fit on T4) |
| **CLIP** | Fast, tiny models available | Only classification, no text explanation |
| **Claude 3.5 Sonnet** | Best reasoning, most expensive | $15/1M input tokens (not free) |

---

## 1. Alternatives for Each Component

### Classification & Localization Layer

#### Chosen: Gemini Vision (Demo) + Fine-tuned LLaVA (Future)
- **Gemini Vision (current)**
  - ✓ Multimodal, sees document details, accurate on 19-category taxonomy
  - ✓ Free tier (1,500 RPD), no training needed
  - ✗ Black box, can't be fine-tuned
  - ✗ Can hallucinate on subtle forgeries (user experienced this)
  - ✗ Cost scales with user base (needs upgrade for enterprise)
  - **Why chosen for demo:** Free, works immediately, good for presentation

- **Fine-tuned LLaVA (future ideal)**
  - ✓ Multimodal + reasoning (classifies AND explains AND localizes in one model)
  - ✓ Learns your specific forgery patterns from training data
  - ✓ Completely free to run (open-source, self-hosted)
  - ✓ Can be improved iteratively as you collect more data
  - ✗ Requires labeled training datasets per category
  - ✗ Needs GPU for training and inference (slower than Gemini)
  - **Why not chosen now:** Don't have enough labeled data yet

#### Rejected: YOLO (Object Detection)
- ✗ Detection-only, doesn't understand *what* it's detecting
- ✗ Requires separate training for each category (no trained models exist)
- ✗ Redundant if using fine-tuned LLaVA (LLaVA can do both classification + localization with reasoning)
- ✗ Can't explain *why* something is a forgery
- **Decision:** Skip YOLO entirely; invest in fine-tuned LLaVA which solves all three problems (classify, localize, explain)

#### Rejected: Claude API
- ✗ Expensive on free tier, cost-prohibitive for SaaS
- ✗ Text-only, needs image preprocessing pipeline (ELA, edge detection, etc.) to understand documents
- ✗ Would need separate YOLO for localization anyway
- **Decision:** Use Gemini (free multimodal) for demo; Claude reserved for enterprise if budget allows

#### Rejected: Text-only LLMs (Ollama, Groq)
- ✗ Can't see the document image
- ✗ Would require extracting features (ELA, metadata) and describing them in text
- ✗ Loses all subtle visual forensic indicators
- **Decision:** Only use for explanation layer (post-classification)

### Explanation Layer (LLM Reasoning)
- [ ] **Chosen: Groq (free tier)** for follow-up explanations
  - ✓ Fast, free tier available
  - ✓ Good enough for plain-language forensic summaries
  - ✗ Doesn't see the image (text-only)
  - Alternatives rejected: Ollama (slower), OpenAI (expensive), fine-tuned Llama (overkill for summarization)

### Database & Persistence
- [ ] **Chosen: SQLAlchemy + SQLite (dev) / PostgreSQL (prod)**
  - Why: Flexible, scales from local to cloud
  - Alternatives: MongoDB, Firebase, direct REST API

### Frontend
- [ ] **Chosen: React + Vite**
  - Why: Fast, modern, good for real-time feedback
  - Alternatives: Vue, Svelte, Next.js

---

## 2. System for the Demo (Presentation)

### What's shown:
- **Gemini Vision classifier** (19-category taxonomy)
- Upload document → Instant forensic verdict + explanation
- Per-category colors, confidence scores, certainty levels (HIGH/MEDIUM/LOW)
- Clean unified result card
- History with all Gemini metadata

### Why Gemini for the demo?
- Free tier available (no credit card required)
- Works immediately (no training needed)
- Fast enough for live demo
- Good enough to show concept

### What's hidden/not shown:
- YOLO detection (untrained models, not functional)
- Multi-user subscription tiers (assume all users on Pro)
- Admin panel complexity (omit or show briefly)
- GPU requirements (Gemini is cloud-based, runs anywhere)

### Known limitations acknowledged in demo:
- "Gemini is a general-purpose model; may miss subtle region-specific patterns"
- "Future versions will use fine-tuned models trained on your specific document types"

---

## Mobile & Deployment Strategy (Firebase-Only Approach)

### Mobile App Architecture (Capstone Phase)
- **Frontend**: React Native or Flutter (not yet implemented, but planned)
- **Can't run LLM locally** on mobile (RAM/battery/GPU constraints)
- **Must call API for inference** (HuggingFace Spaces)
- **No backend server needed** — use Firebase instead

### Zero-Backend Architecture
1. **Fine-tuned LLaVA model** → Hugging Face Spaces (free GPU tier)
2. **Authentication + Database** → Firebase (free tier)
3. **Mobile app** → Direct calls to HF Spaces + Firebase
4. **Data flow:**
   ```
   Mobile App
       ├─→ Firebase Auth (sign in/register)
       ├─→ Firebase Firestore (store/fetch scan history)
       └─→ HuggingFace Spaces API (inference; image → result)
   ```

### Why Firebase Works for Capstone
- **Authentication**: Built-in user sign in/register (free tier)
- **Database**: Firestore stores scan history per user (free tier covers capstone usage)
- **Zero hosting cost**: No backend server to deploy or maintain
- **Simple deployment**: Just React Native/Flutter → Firebase SDK
- **Scalable**: If needed, can add backend later without changing app

### Hosting & Services (All Free)
| Service | Purpose | Cost |
|---|---|---|
| **Firebase Auth** | User sign in/register | Free tier |
| **Firebase Firestore** | Scan history storage | Free tier (< 1GB/mo) |
| **Hugging Face Spaces** | Fine-tuned LLaVA inference | Free GPU tier |
| **Mobile app hosting** | React Native/Flutter | N/A (installed on device) |
| **Backend server** | Not needed | $0 |

### Trade-offs
- ✓ Zero hosting costs
- ✓ Simple architecture (no backend to manage)
- ✓ Shows understanding of managed services
- ✗ HF Spaces API keys in mobile app (acceptable for capstone demo)
- ✗ Inference speed depends on HF Spaces cold start (~10-30s first call)

### Current Status (Demo)
- Gemini Vision as classifier via web frontend (FastAPI backend)
- Mobile app (Firebase + HF Spaces) not yet built
- Can port React components from web to React Native

---

## 3. Viable Product (MVP)

### Current Implementation (Gemini-powered)
What makes this sellable?
- **Gemini Vision classification** (19-category taxonomy, reliable)
- **Low API cost** (free tier covers MVP scale: <100 active users)
- **Per-plan quotas** (free: 10 scans/mo, pro: 100 scans/mo, premium: unlimited)
- **Audit trail** (History page with all Gemini + LLM metadata)
- **Honest transparency** (shows certainty levels HIGH/MEDIUM/LOW)
- **Multi-user SaaS** (auth, subscription management, per-user quotas)

### Why Gemini for MVP (not Claude/local)?
- **Free tier eliminates initial cost** (bootstrap-friendly)
- **No training required** (ship immediately)
- **No GPU needed** (runs on our existing backend)
- **Fast enough** (<2 sec per document)
- **Trade-off:** Accuracy is "good enough" for 80% of documents; misses 15-20% of subtle forgeries

### Scaling Path
- **Phase 1 (now):** Gemini Vision free tier
- **Phase 2 (100 users):** Gemini paid tier (~$1k/mo cost, passed to customers)
- **Phase 3 (1000+ users):** Switch to fine-tuned LLaVA (owned infrastructure, $0 API cost)

### Pricing Model
- **Free**: 10 scans/month, Gemini classification only
- **Pro**: 100 scans/month, + LLM explanations (Groq)
- **Premium**: Unlimited scans, + future fine-tuned models + batch API access

### MVP Roadmap: Gemini → Fine-Tuned LLaVA
**Phase 1 (Current - Web Demo):**
- Gemini Vision as classifier (free tier)
- FastAPI backend (optional, for demos)
- Web frontend (React)

**Phase 2 (Mobile + Fine-Tuned):**
- Fine-tune LLaVA on Colab with labeled datasets
- Host on Hugging Face Spaces (free)
- Mobile app (React Native/Flutter)
- Firebase for auth + history
- Mobile app calls HF Spaces directly for inference
- Trade-off: Slower inference (HF Spaces cold starts ~10-30s), requires labeled data

**No backend changes needed** — Firebase SDK handles everything the app needs

### Viability Threshold
- Break-even at ~200 Pro users (@$5/mo = $1k/mo, covers Gemini paid tier)
- Profitable at ~500 Pro users (enough to fund on-premise infrastructure)
- If using fine-tuned LLaVA: stays free as long as HF Spaces + GCP Cloud Run free tiers cover traffic

---

## 4. Maximum Potential (Enterprise Level)

### Ideal Classification Stack (unlimited budget)
- **Primary: Fine-tuned LLaVA or Qwen-VL**
  - Trained on 10,000+ labeled forensic documents per category
  - Runs on-premise (GPU cluster) — zero latency, zero API cost
  - Can localize, classify, AND explain in single inference
  - Continuously improved with customer feedback

- **Secondary: Claude API (for reasoning)**
  - For complex multi-document analysis and chain-of-thought reasoning
  - Cost justified by enterprise contract ($10k+/month)
  - Better than Gemini for nuanced explanations

- **Fallback: Gemini** (if on-premise model uncertain)
  - Second opinion on borderline cases
  - Cost amortized across user subscriptions

### Scaling & Deployment
- **Regional fine-tuned models**
  - Filipino documents (LSPU capstone focus)
  - US banking documents
  - EU identity documents
  - Chinese currency/passports
  - Each trained on regional sample data

- **Hardware**
  - NVIDIA GPU cluster (A100s) for inference
  - Or TPU pods if budget allows
  - <500ms inference time per document

- **API & Integration**
  - REST/gRPC for law firms, banks, government agencies
  - Batch processing (100+ documents at once)
  - Webhook callbacks for async processing
  - Audit logs with cryptographic signatures

- **Federated Learning**
  - Clients can train local models on their private documents
  - Models sync back to central server (privacy-preserving)
  - Improves global model without exposing client data

- **Hardware-Specific Forgery Detection**
  - UV light photography simulation (synthetic data generation)
  - Raking light angle detection from 2D photos
  - Spectral analysis (RGB → spectrographic features)

### Revenue & Viability
- **SaaS** (current): $10/mo (Pro) → $50/mo (Premium) per user
- **Enterprise API**: $50k-500k/year based on volume
- **On-premise licensing**: $100k+ setup + $50k/year maintenance
- **White-label**: Custom branding for law firms, government agencies
- **Training services**: Certify document examiners on the platform

### Why this is better than current
- No ongoing Gemini costs (owned ML infrastructure)
- Accuracy improves over time (learns from your data)
- Can handle region-specific patterns (Filipino documents)
- Defensible IP (trained models, regional datasets)
- Enterprise-grade SLAs and compliance

---

## TODO: Flesh out each section with details, trade-offs, cost analysis, timeline
