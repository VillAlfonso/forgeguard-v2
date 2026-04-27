# Milestone: Revelator rebrand + Groq vision LLM + Scan UI split

**Date:** 2026-04-28
**Branch:** `revelator` (off `feature/payments`)

## What shipped

### 1. Groq vision LLM explainer (cut-and-paste first)
- Replaced text-only Ollama path with Groq's `meta-llama/llama-4-scout-17b-16e-instruct` as the primary vision model.
- The image (with numbered bbox overlays drawn server-side, downscaled to 896px) is sent alongside a category-specific prompt.
- Cut-and-paste prompt asks the model to enumerate visible boundary artifacts per region (edge sharpness mismatch, halos, lighting/color cast, paper-grain mismatch, JPEG block misalignment, ghosting), justify the verdict, and list benign caveats.
- Generic vision prompt covers other categories.
- Falls back to text-only Groq → text-only Ollama → static template if upstream calls fail.
- New env var: `GROQ_VISION_MODEL`. `USE_CLOUD_LLM` default flipped to `true`.

### 2. Scan page UI split — equipment buckets
- Categories on the selection screen are now grouped into two labeled sections:
  - **Phone-Scannable**: Digital, Alteration, Traced, Obliteration
  - **Specialized Equipment**: Sympathetic Ink, Currency
- New `EquipmentBucket` component renders each section with header, sublabel, and count badge.

### 3. ForgeGuard → Revelator rename (user-facing only)
- Replaced brand strings in: header logo, page titles, About/Login/Register text, `index.html` title, Capacitor `appName`, `package.json` name, FastAPI `APP_NAME`, READMEs, scan-ID prefix `FG-` → `RV-`.
- Intentionally **not** renamed (avoids breakage): SQLite filename `forgeguard.db`, env defaults like `noreply@forgeguard.app`, Capacitor `appId` (Android signature stability), Android keystore alias, training scripts, legacy `main.py`, `fg_*` localStorage keys, repo directory name.

### 4. ELA utility script (`scripts/ela.py`)
- Standalone Error Level Analysis tool — re-saves a JPEG at known quality, diffs, amplifies the seam.
- Convergent-evidence companion for the YOLO detector: ELA hotspot + YOLO bbox = stronger signal than either alone.
- Optional `--show-yolo` flag to overlay the detector's box on the ELA map.

## Files touched (high level)
- `backend/app/forgery/llm.py` — full rewrite for Groq vision
- `backend/app/forgery/detector.py` — read only, untouched
- `backend/app/routes/analyze.py` — pass image to LLM, scan-ID prefix change
- `backend/app/config.py` — Groq vision model env var, APP_NAME
- `backend/app/{main,models,make_admin}.py`, `backend/run.py` — docstring rebrand
- `frontend/src/pages/Scan.jsx` — equipment buckets
- `frontend/src/{App.jsx, pages/About.jsx, pages/Login.jsx, pages/Register.jsx, api/client.js}` — brand strings
- `frontend/{index.html, capacitor.config.ts, package.json}` — title / appName / package name
- `scripts/ela.py` — new
- `README.md`, `QUICK_START.md`, `BUILD_APK.md` — brand strings

## Next steps / pending
- **Roboflow hosted inference** for cut-and-paste — keys to be set in `backend/.env` (`ROBOFLOW_API_KEY`); model_id needs confirmation from the Roboflow deploy page. User to rotate the previously-shared private key before use.
- **Test the vision explainer end-to-end** — needs `GROQ_API_KEY` in `.env` and a premium-plan user.
- **Frontend lockfile** — run `npm install` in `frontend/` to refresh after the `package.json` `name` change.
- **Annotation strategy for cut-paste dataset** — box the tampered region with the category label only; let the LLM explainer narrate sub-artifacts at inference time.
