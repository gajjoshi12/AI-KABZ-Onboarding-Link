# AIKAB — Client Onboarding + Admin Panel

A tiny Express server with two HTML pages and three JSON endpoints. **No database.**
Submissions are saved as plain JSON files to a persistent disk (a Railway Volume in production).
Both pages are mobile-responsive.

```
client-onboarding/
├─ public/
│  ├─ index.html        ← public onboarding form (8-step wizard + animated walkthrough)
│  └─ admin.html        ← token-gated admin dashboard
├─ server.js            ← Express app: static + /api/submit + /api/submissions
├─ package.json         ← express, nothing else
├─ railway.json         ← health check + start command
├─ .gitignore           ← ignores data/, node_modules, .env
└─ README.md
```

---

## What each page does

**`/`** — the public form. Mobile-responsive 8-step wizard: spa basics → team → services
→ current stack → ranked pain points → goals (sliders) → scale → contact. Followed by a
7-tab interactive walkthrough with animated demos (Smart Follow-Up, No-Show Recovery,
Churn Radar, Protocol Tracking, Package Recovery, Marketing Attribution, Dashboard).
Submitting POSTs to `/api/submit`. Progress auto-saves to `localStorage`.

**`/admin`** — token-gated dashboard. KPI strip, aggregate analytics (top pain points,
services, average goals, booking systems), searchable submission list, per-submission
detail drawer with full profile + raw JSON + delete.

---

## Deploy to Railway (~8 minutes)

### 1. Push to your GitHub repo

```powershell
cd C:\Users\Gaj\Desktop\Today\AIKAB\client-onboarding
git add . && git commit -m "AIKAB onboarding for Railway" && git push
```

### 2. Create a Railway project from the repo

1. Go to <https://railway.com> → **New Project** → **Deploy from GitHub repo**
2. Authorize Railway on GitHub if needed → pick **AI-KABZ-Onboarding-Link**
3. Railway auto-detects the Node project (via `package.json`), runs `npm install`, then
   `npm start`. **No build step to configure.**

Wait ~60 seconds for the first deploy. Don't open the URL yet — we still need to set
the admin token and attach a volume so data survives redeploys.

### 3. Generate an admin token

```powershell
# PowerShell
[Convert]::ToBase64String([Guid]::NewGuid().ToByteArray() + [Guid]::NewGuid().ToByteArray())
```

Copy the output. This is your admin panel password.

### 4. Set environment variables

In your Railway project → click the service → **Variables** tab → **+ New Variable**:

| Name | Value | Purpose |
|---|---|---|
| `ADMIN_TOKEN` | the long random string from step 3 | Gates `/admin` + `/api/submissions` |
| `DATA_DIR` | `/data` | Where submissions get written (matches the volume mount below) |

`PORT` is injected by Railway automatically — do **not** set it yourself.

### 5. Attach a persistent volume

This is the "database" — actually just a disk that survives redeploys.

1. Project → your service → **Settings** tab → scroll to **Volumes** → **+ New Volume**
2. **Mount path:** `/data`   *(must exactly match the `DATA_DIR` env var)*
3. **Size:** 1 GB is plenty for tens of thousands of submissions → **Create**

Railway will redeploy the service so the volume can attach.

### 6. Get the public URL

Project → service → **Settings** → **Networking** → **Generate Domain**.
You'll get something like `aikabz-onboarding-production.up.railway.app`.

### 7. Test it

| URL | What to do |
|---|---|
| `https://<your-domain>/`       | Fill the wizard. Last step → click **📨 Send to AIKAB team**. Green toast: `Sent to AIKAB — ref sub_…` |
| `https://<your-domain>/admin`  | Paste your `ADMIN_TOKEN` → see analytics + your submission. Click it for full profile, raw JSON, delete |

### Future updates

Every `git push` to `main` auto-redeploys. The volume + env vars stick around between deploys.

```powershell
cd C:\Users\Gaj\Desktop\Today\AIKAB\client-onboarding
# make changes
git add . && git commit -m "tweak: ..." && git push
```

---

## Local development

```powershell
cd C:\Users\Gaj\Desktop\Today\AIKAB\client-onboarding
npm install
$env:ADMIN_TOKEN="dev-token-12345"
npm start
```

Open <http://localhost:3000> and <http://localhost:3000/admin>. Submissions land in a
local `./data/submissions/` folder (gitignored). To start fresh, just delete the folder.

---

## How the flow works

```
   Browser                       Railway container                Browser
   ───────                       ─────────────────                ───────
   /                                                              /admin
     │                                                              │
     │  POST /api/submit                                            │
     │ ─────────────────────►  Express                              │
     │                          └─► fs.writeFile(                   │
     │                                /data/submissions/sub_X.json  │
     │                              )                               │
     │ ◄─ { ok:true, id }                                           │
                                                                    │  GET /api/submissions
                                                                    │  (x-admin-token header)
                                                       readdir() ◄──┘
                                                          │
                                                          ▼
                                                  list of JSON records
                                                          │
                                                          └─► drawer detail
                                                              + delete
```

- **Submissions** are individual JSON files on the mounted volume. Railway snapshots the
  volume automatically; resizing later is also one click.
- **Admin auth** is a single shared `ADMIN_TOKEN` checked in the `x-admin-token` header.
- **No serverless gotchas** — this is a long-running container, so cold starts and
  10-second function limits don't apply.

---

## Mobile responsiveness

Both pages have explicit `@media(max-width:640px)` + `@media(max-width:380px)` blocks:
- Inputs are forced to ≥16px font-size to stop iOS Safari zooming on focus
- Tap targets on chips and option cards are ≥40px tall
- Walkthrough tabs scroll horizontally instead of cramming
- KPI grid collapses 4→2 (or 1 on iPhone SE), drawer takes the full screen
- Profile rows stack key/value vertically; analytics bars shrink labels
- Toasts respect screen edges

Test on a real phone after deploying — DevTools mobile emulation only catches ~80% of issues.

---

## Costs

Railway's Hobby plan: $5/month gives you 8 GB RAM + 8 vCPU + $5 of usage credit. This
app uses <1% of that — Hobby covers thousands of submissions per month easily.

---

## Customization pointers

- **Change the form questions** — edit the wizard panels in [public/index.html](public/index.html)
  (each `<div class="wiz-panel" data-step="N">`). State persists by `data-k="path.to.field"`.
- **Rotate the admin token** — change `ADMIN_TOKEN` in Railway → the service redeploys → next
  admin login uses the new value.
- **Email submissions to your team too** — the form already has an "Email it" button that
  opens the user's mail app. To do it server-side, add SendGrid/Resend in `server.js`
  after the `fs.writeFile()` call.
- **Bigger volume later** — Railway → Volumes → resize. Data is preserved.

---

## Security notes

- Submissions contain PII (name, email, phone). The volume is private to your service —
  only your container reads it; nothing is publicly accessible without the admin token.
- The admin token is a single shared secret. For multiple teammates, give each one their
  own and check a set of tokens in `adminGate()` instead of one.
- Never commit `.env`, `.env.local`, or your tokens.
- `app.disable('x-powered-by')` is on so we don't advertise the server stack.
