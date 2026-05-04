# Revelator — System Architecture & Design Decisions

**Status:** In progress — documenting architectural journey and final decisions

## Architectural Evolution & Decision-Making Journey

### Phase 1: Initial Implementation (FastAPI + SQLite)

**What was built:**
- **Backend**: FastAPI (Python) running on local machine
- **Database**: SQLite for all data (users, scans, history, promo codes)
- **Frontend**: React web app
- **Image storage**: Local file system (`uploads/` directory)
- **Authentication**: JWT tokens + OAuth (Google)
- **Payments**: Stripe + PayMongo integration (test keys)
- **LLM**: Gemini Vision API (free tier)
- **Admin panel**: Custom FastAPI endpoints + React dashboard

**Why this approach:**
- FastAPI is powerful and flexible
- SQLite is simple for local development
- Full control over everything
- Learning SaaS development (auth, payments, subscriptions)

**Current state (commit `3981a71`):**
```
┌─────────────┐
│   React     │
└──────┬──────┘
       │
    ┌──▼──────────────────┐
    │   FastAPI Backend   │
    │ • Auth (OAuth)      │
    │ • Subscriptions     │
    │ • Payments          │
    │ • Admin             │
    │ • Rate limits       │
    └──┬──────────────────┘
       │
    ┌──▼──┐    ┌────────┐    ┌──────────┐
    │SQLite   Gemini    Local FS
    └──────┘    └────────┘    └──────────┘
```

### Phase 2: Exploration & Questions (Current)

**Discovery: Do we actually need all this complexity?**

Realized that for a capstone + mobile app:
1. **Firebase can replace SQLite** (Firestore document DB)
2. **Firebase Storage can replace local file system** (cloud storage)
3. **Firebase Auth can replace custom JWT** (but OAuth still works)
4. **Stripe SDK can replace backend payment handler** (webhooks via Cloud Functions)
5. **Firebase Console can replace custom admin panel**

**Key realizations:**
- FastAPI is powerful, but adds complexity for a capstone
- Gemini Vision works well, but fine-tuned LLaVA could be better (custom model)
- SQLite works locally, but Firebase scales automatically
- Local file storage works for demo, but Firebase Storage is more robust

**Questions raised:**
- Do we need a backend at all?
- Can Firebase handle everything?
- Is FastAPI overkill for a capstone?
- Should we focus on learning (keep backend) or shipping (use Firebase)?

### Phase 3: Architectural Options (Current Decision Point)

**Three viable paths emerged:**

**Option A: Simplify to Firebase (No backend)**
```
Web: React → Firebase (auth + Firestore + Storage) → Stripe SDK → HF Spaces
Mobile: React Native → Firebase → Stripe SDK → HF Spaces
Cost: $0 | Complexity: Low | Backend learning: None
```
- Fastest to ship
- Least complexity
- No server management
- No backend experience

**Option B: Keep FastAPI + Add Firebase (Hybrid)**
```
Web: React → FastAPI (local) → Stripe/PayMongo → HF Spaces
    ├─ Auth (JWT + OAuth)
    ├─ Subscriptions
    ├─ Admin panel
    └─ SQLite (local)
Mobile: React Native → Firebase → Stripe SDK → HF Spaces
Cost: $0 (demo) | Complexity: Medium | Backend learning: Full SaaS stack
```
- Learn SaaS development
- Keep existing FastAPI work
- Show both architectures
- More complex but educational

**Option C: Full Firebase everywhere (Serverless)**
```
Web: React → Firebase (everything)
Mobile: React Native → Firebase (everything)
Cost: $0 | Complexity: Low | Backend learning: None
```
- Cleanest architecture
- True serverless
- No custom code for auth/payments
- Scales automatically

**Decision:** Exploring **hybrid approach** (Option B) for capstone because:
- Shows understanding of both traditional and serverless architectures
- Leverages existing FastAPI work (don't waste it)
- Learn real SaaS backend development
- Still maintain free costs (run locally)
- Strong portfolio piece

---

## Evolution of Infrastructure Decisions

### LLM Classification: Gemini → Fine-tuned LLaVA

**Why Gemini initially:**
- Free tier available (1,500 requests/day)
- Works immediately (no training)
- Multimodal (understands images)
- Good accuracy out-of-box

**Issues discovered:**
- Can't be fine-tuned (black box)
- Misses subtle forgeries in specific documents
- User data goes to Google servers
- Limited customization

**Why switching to LLaVA:**
- Open-source, can be fine-tuned on YOUR data
- Better accuracy after training on forensic documents
- Runs on your infrastructure (HF Spaces)
- Learn model training (Colab)
- Potentially better than Gemini after fine-tuning

**Model choice: LLaVA-NeXT 7B**
- Newer than LLaVA-1.5
- Same size, better quality
- Fits HF Spaces T4 GPU (free)
- Inference ~5-10s

### Database: SQLite → Considering Firestore

**Why SQLite initially:**
- Built-in, no setup
- Perfect for local development
- Works with FastAPI
- Simple migrations

**Issues discovered:**
- Tied to FastAPI (can't use with Firebase mobile app)
- No automatic scaling
- No built-in auth rules
- Manual backup/recovery

**Why considering Firestore:**
- Real-time updates
- Built-in access control
- Automatic scaling
- Free tier generous
- Works from frontend directly (mobile)
- No backend needed for basic CRUD

### Image Storage: Local filesystem → Firebase Storage

**Why local filesystem initially:**
- Simplest to implement
- Works with FastAPI
- Full control over files

**Issues discovered:**
- Requires server to be running
- Manual backup needed
- No CDN/caching
- Scales poorly

**Why Firebase Storage:**
- Global CDN
- Automatic backups
- Free tier: 1GB
- Works from mobile directly
- Integrated with Firestore

---

## Summary of Decisions Made

| Aspect | Phase 1 (Built) | Phase 2 (Exploring) | Decision |
|---|---|---|---|
| **Backend** | FastAPI | Firebase alternative | Keep FastAPI for web (learning) |
| **Database** | SQLite | Firestore | Keep SQLite for web; Firebase for mobile |
| **Image storage** | Local FS | Firebase Storage | Firebase Storage for both |
| **Auth** | JWT + OAuth | Firebase Auth | Keep JWT for web; Firebase for mobile |
| **LLM** | Gemini Vision | Fine-tuned LLaVA | Switch to LLaVA-NeXT 7B |
| **Inference hosting** | Gemini API | HF Spaces | Use HF Spaces (free GPU) |
| **Payments** | Stripe + PayMongo | Stripe SDK | Keep Stripe/PayMongo in FastAPI |
| **Mobile backend** | FastAPI | Firebase | Use Firebase (no backend needed) |

**Final architecture:** Hybrid (Option B) — FastAPI for web + Firebase for mobile + fine-tuned LLaVA on HF Spaces

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

**Recommendation for capstone:** **LLaVA-NeXT 7B** (BEST)
- Newest architecture (better reasoning than 1.5, fewer hallucinations)
- Same size as 1.5 7B (~4GB quantized) — fast inference (~5-10s per image)
- Better document understanding than 1.5
- Fits HF Spaces T4 free GPU comfortably (16GB VRAM)
- Good accuracy with moderate fine-tuning data

**Alternative if NeXT unavailable:** Qwen-VL
- Excellent document understanding
- Also ~6GB quantized, good HF Spaces fit
- Slightly less tested on English forensic domain

**Avoid:** LLaVA-1.5 13B
- Tight fit on T4 GPU (15-20s inference, slow)
- Marginal accuracy gain over 7B doesn't justify the slowdown

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

## Hybrid SaaS Architecture (Best for Learning)

### Architecture Overview (Hybrid Approach)

```
CAPSTONE PHASE:
┌─────────────────────────────────────────────────────┐
│                                                     │
│  WEB VERSION (Demo)          MOBILE VERSION        │
│  ┌──────────────────┐        ┌──────────────────┐  │
│  │  React           │        │ React Native     │  │
│  │  (local demo)    │        │ (future)         │  │
│  └────────┬─────────┘        └────────┬─────────┘  │
│           │                           │            │
│           │    ┌──────────────────────┘            │
│           ▼    ▼                                    │
│    ┌──────────────────┐           ┌─────────────┐  │
│    │  FastAPI Backend │           │  Firebase   │  │
│    │  (local server)  │           │  (auth+DB)  │  │
│    │                  │           │             │  │
│    │ • Auth (OAuth)   │           └─────────────┘  │
│    │ • Subscriptions  │                            │
│    │ • Payments       │           ┌─────────────┐  │
│    │ • Admin Panel    │           │  HF Spaces  │  │
│    │ • Rate Limits    │           │ (LLaVA)     │  │
│    └────────┬─────────┘           └─────────────┘  │
│             │                            ▲         │
│             └────────────┬───────────────┘         │
│                          │                         │
│                  ┌───────▼─────────┐              │
│                  │  HF Spaces API  │              │
│                  │  (fine-tuned    │              │
│                  │   LLaVA-NeXT)   │              │
│                  └─────────────────┘              │
│                                                     │
└─────────────────────────────────────────────────────┘

PRODUCTION PHASE (later):
├─ Deploy FastAPI → Railway/Render ($5-10/mo)
├─ Keep Firebase → free tier scales
├─ Keep HF Spaces → free GPU tier
└─ Add real Stripe/PayMongo → production keys
```

### Web Version (Demo — Local FastAPI)
- **Frontend**: React (current)
- **Backend**: FastAPI running locally on your machine
  - User auth (JWT + OAuth)
  - Subscription tiers (demo only, no real payment yet)
  - Admin panel
  - Promo codes
  - Rate limiting per user
  - Scan history in SQLite
- **Inference**: Call fine-tuned LLaVA on HF Spaces
- **Hosting**: Run `python run.py` on your machine during demo
- **Cost**: $0

### Mobile Version (Firebase — No Backend)
- **Frontend**: React Native or Flutter (to be built)
- **Authentication**: Firebase Auth (sign in/register)
- **Database**: Firebase Firestore (scan history per user)
- **Inference**: Direct call to HF Spaces API
- **Cost**: $0
- **Data flow**:
  ```
  Mobile App
      ├─→ Firebase Auth (user sign in)
      ├─→ Firebase Firestore (store/fetch scan history)
      └─→ HF Spaces (image → fine-tuned LLaVA → result)
  ```

### Why Hybrid Works for Capstone
- **Web**: Shows full SaaS architecture (FastAPI, auth, payments, subscriptions, admin)
- **Mobile**: Shows modern Firebase + serverless design
- **Learning**: You build two different architectures, understand both
- **Cost**: Completely free for capstone (run locally)
- **Portfolio**: Can show both approaches to employers/investors

### Trade-offs
- ✓ Learn real SaaS backend (FastAPI, payments, auth)
- ✓ Learn modern serverless (Firebase)
- ✓ Zero hosting costs for capstone
- ✓ Both web and mobile work
- ✗ Two different architectures (but that's the learning)
- ✗ Web backend only runs when you launch it locally

### Hosting & Services (Free)
| Service | Purpose | Version | Cost |
|---|---|---|---|
| **FastAPI** | User auth, subscriptions, admin | Web | $0 (local) |
| **Firebase Auth** | User sign in/register | Mobile | Free tier |
| **Firebase Firestore** | Scan history | Mobile | Free tier |
| **HF Spaces** | Fine-tuned LLaVA inference | Both | Free GPU tier |
| **Stripe (mock)** | Payment flow (demo only) | Web | $0 (test keys) |

### Do You Actually Need FastAPI?

**Question: Can we do everything with just Firebase (no backend)?**

**Answer: Yes, but with trade-offs.**

**What Firebase can handle:**

| Feature | FastAPI | Firebase |
|---|---|---|
| User auth (sign in/register) | ✅ Custom JWT | ✅ Firebase Auth |
| Scan history storage | ✅ SQLite/PostgreSQL | ✅ Firestore |
| Call LLaVA for inference | ✅ Backend API | ✅ Direct from frontend |
| Payment processing (Stripe) | ✅ Webhook handler | ✅ Stripe SDK + Cloud Function |
| Subscription management | ✅ Custom logic | ✅ Store in Firestore |
| Admin panel | ✅ Custom dashboard | ✅ Firebase Console |
| Rate limiting per user | ✅ Backend enforces | ✅ Firestore rules |

**Path A: Firebase Only (Simplest)**
```
Web: React → Firebase (auth + DB) → Stripe SDK → HF Spaces
Mobile: React Native → Firebase (auth + DB) → Stripe SDK → HF Spaces
Cost: $0
Complexity: Low
Backend experience: None
```

**Path B: Hybrid (FastAPI + Firebase) — What we planned**
```
Web: React → FastAPI (local) → Stripe/PayMongo → HF Spaces
     FastAPI also has: JWT auth, subscriptions, admin panel, rate limiting
Mobile: React Native → Firebase (auth + DB) → Stripe SDK → HF Spaces
Cost: $0 (FastAPI runs locally)
Complexity: Medium
Backend experience: Learn SaaS architecture
```

**Trade-offs:**

| Aspect | Path A (Firebase Only) | Path B (Hybrid) |
|---|---|---|
| **Shipping speed** | Fast ⚡ | Slower 🐢 |
| **Hosting cost** | $0 | $0 (local demo) |
| **Production hosting** | Firebase (scalable) | Need to host FastAPI (~$5-10/mo) |
| **Backend learning** | None | Full SaaS stack |
| **Code reuse** | One codebase (Firebase) | Two architectures |
| **Portfolio value** | "Full-stack engineer" | "Backend engineer + modern stack" |
| **Maintenance** | Simpler | More complex |

### Current Status (Choose Your Path)
- **If Path A (Firebase only):**
  - Web: React + Firebase (replace backend)
  - Mobile: React Native + Firebase
  - Inference: Direct to HF Spaces from frontend
  - Admin: Use Firebase Console

- **If Path B (Hybrid — recommended for learning):**
  - Web: FastAPI backend ✅ + React frontend ✅ (replace Gemini with LLaVA)
  - Mobile: React Native + Firebase
  - Inference: Both call HF Spaces
  - Admin: Keep custom FastAPI admin panel

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
