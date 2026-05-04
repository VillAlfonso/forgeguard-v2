# Revelator — System Architecture & Design Decisions

**Status:** TODO — Add detailed analysis before final submission

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

## Mobile & Deployment Strategy

### Mobile App Architecture (Capstone Phase)
- **Frontend**: React Native or Flutter (not yet implemented, but planned)
- **Can't run LLM locally** on mobile (RAM/battery/GPU constraints)
- **Must call backend API** for all inference

### Free Hosting Plan for Capstone
1. **Fine-tuned LLaVA model** → Hugging Face Spaces (free GPU tier)
2. **Backend API** → Google Cloud Run OR Oracle Always Free
3. **Mobile/Web app** → Calls backend `/api/analyze` endpoint
4. **Data flow:**
   ```
   Mobile App
       ↓ (POST image)
   Backend (/api/analyze)
       ↓ (calls with image)
   HuggingFace Spaces (fine-tuned LLaVA inference)
       ↓ (returns: category, confidence, explanation, evidence)
   Backend (processes result)
       ↓ (returns to app)
   Mobile App (displays forensic report)
   ```

### Backend Hosting Options (Free)
- **Google Cloud Run** (recommended) — Free tier usually covers small apps; pay-per-invocation model
- **Oracle Always Free** (current) — Truly free but severely underpowered; good for demo
- **Render** (alternative) — Free tier with cold start; spins down after 15 min inactivity
- **⚠️ Railway** — NOT truly free ($5/month credit, then charges; avoid)

### Why This Works for Capstone
1. No local LLM needed (fine-tuned or otherwise)
2. All components remain free or cheap
3. Backend doesn't care if it's Gemini or fine-tuned LLaVA — same API contract
4. Can swap models easily (Gemini now → LLaVA later)
5. Mobile app works with any backend

### Current Status (Demo)
- Gemini Vision as classifier (free tier, no hosting needed)
- Web frontend on local/demo server
- Can pivot to fine-tuned LLaVA + mobile app without API changes

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

### Alternative MVP: Fine-Tuned LLaVA Instead of Gemini
If you want to show "we built and trained our own model" for the capstone:
1. Fine-tune LLaVA on Colab with your labeled datasets
2. Host on Hugging Face Spaces (free)
3. Backend calls HF Spaces instead of Gemini
4. Same API, same UX — but now it's *your* trained model
5. Trade-off: Slower inference (HF Spaces cold starts), requires labeled data

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
