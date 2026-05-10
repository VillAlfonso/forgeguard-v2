# Revelator Deployment Guide — Cloudflare Tunnel (Free)

## Overview
Host Revelator on a school laptop using **Cloudflare Tunnel**, which creates a secure public tunnel to your local backend at **zero cost**. Students access the app from anywhere via a free auto-generated URL.

---

## Prerequisites
- Windows/Mac/Linux laptop at the school
- Python 3.9+ and Node.js 18+ installed
- Cloudflare account (free, takes 2 minutes)
- Backend and frontend code ready to run

---

## Step 1: Install Cloudflare Tunnel (cloudflared)

### Windows
1. Download the installer: https://github.com/cloudflare/cloudflared/releases
   - Look for `cloudflared-windows-amd64.msi` (or appropriate arch)
2. Run the installer and follow prompts
3. Verify installation:
   ```powershell
   cloudflared --version
   ```

### Mac
```bash
brew install cloudflare/cloudflare/cloudflared
```

### Linux
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

---

## Step 2: Start the Backend

On the laptop, start the Revelator backend:

```powershell
cd C:\Revelator\backend
python run.py
```

The backend should be running on `http://localhost:8000`

Verify it's working:
```powershell
curl http://localhost:8000/api/health
# Should return: {"status":"healthy","version":"2.0.0"}
```

---

## Step 3: Create a Cloudflare Tunnel

### Option A: Quick Setup (No authentication needed for initial testing)

Open a **new terminal/PowerShell** and run:

```powershell
cloudflared tunnel run --url http://localhost:8000
```

This will:
1. Create a tunnel automatically
2. Output a public URL like: `https://abc123-abc123.cfargotunnel.com`
3. That URL is now accessible from anywhere

**Copy that URL** — that's your public backend!

### Option B: Named Tunnel (More reliable, persists across restarts)

```powershell
# Authenticate once
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create revelator

# Start the tunnel
cloudflared tunnel run --url http://localhost:8000 revelator
```

This creates a tunnel that keeps the same URL even after restarts.

---

## Step 4: Configure the Frontend

Update the frontend to point to your public backend URL:

**File:** `frontend/.env` (create if doesn't exist)
```
VITE_API_URL=https://abc123-abc123.cfargotunnel.com
```

Replace `abc123-abc123.cfargotunnel.com` with the URL from Step 3.

---

## Step 5: Start the Frontend

Open **another terminal** and run:

```powershell
cd C:\Revelator\frontend
npm install  # Only needed first time
npm run build
```

Then serve the built files (or run dev server):
```powershell
npm run dev
```

Frontend will be on `http://localhost:5173` or `http://localhost:5174`

---

## Step 6: Share with Students

Give students this URL to bookmark:
```
https://abc123-abc123.cfargotunnel.com
```

(Use your actual Cloudflare URL from Step 3)

They can access it from:
- ✅ Home WiFi
- ✅ Mobile data
- ✅ Campus WiFi
- ✅ Anywhere with internet

---

## Important Notes

### Laptop Must Stay On
- The tunnel only works while the laptop is running and the `cloudflared` process is active
- For 24/7 access, the laptop should stay on (or set to never sleep in power settings)
- If the laptop goes to sleep, students will lose access until it wakes up

### Keep Terminal Windows Open
Keep both terminals open while students are using the app:
1. Backend (Python) terminal
2. Cloudflare tunnel terminal

### Environment Variables
Make sure `.env` files are configured:
- `C:\Revelator\.env` — Backend config (API keys, database, etc.)
- `C:\Revelator\frontend\.env` — Frontend config (VITE_API_URL)

### First-Time Setup Checklist
- [ ] Backend `.env` configured with database path and Gemini API keys
- [ ] Backend running on `http://localhost:8000`
- [ ] Cloudflare tunnel running
- [ ] Frontend `.env` pointing to tunnel URL
- [ ] Students can access the public URL

---

## Troubleshooting

### Tunnel URL changes on restart
- Use Option B (Named Tunnel) to keep the same URL across restarts

### Students can't access the URL
- Check laptop has internet connection
- Verify `cloudflared` process is still running
- Try accessing the tunnel URL from another device to confirm

### Backend not responding
- Verify Python backend is still running: `curl http://localhost:8000/api/health`
- Check backend logs for errors

### Frontend won't load
- Verify `VITE_API_URL` in `frontend/.env` matches your tunnel URL exactly
- Rebuild frontend: `npm run build`

---

## Cost Breakdown
- Cloudflare Tunnel: **$0** (free tier)
- Domain: **$0** (auto-generated)
- Hosting: **$0** (runs on school laptop)
- **Total: $0** ✅

---

## Next Steps (Optional Improvements)

### Use a Custom Domain
If you want a nicer URL (e.g., `forgeguard.school.edu.ph`):
1. Register domain (can be cheap, ~$2-5/year)
2. Point DNS to Cloudflare
3. Add to tunnel config
4. (Still uses free Cloudflare Tunnel)

### Add Authentication/Admin Panel
- Current setup allows anyone with the URL to register
- Consider adding admin controls or disabling public registration

### Backup Database
- Keep regular backups of `backend/forgeguard.db` to external storage

### Monitor Traffic
- Cloudflare dashboard shows tunnel traffic and uptime

---

## Questions?
If students can't connect or the app crashes, check:
1. Laptop still on and connected to internet
2. Backend terminal still showing logs (not errored)
3. Cloudflare tunnel terminal still active
4. Frontend `.env` has correct API URL
