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

## Deploy to Railway (~5 minutes)

> **Admin login is `admin` / `admin` by default** — no env vars required to get started.
> See "Changing the admin password" below to lock it down.

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

Wait ~60 seconds for the first deploy.

### 3. Set the data directory + attach a volume

So submissions survive redeploys instead of vanishing each time the container restarts.

1. Project → click the service → **Variables** tab → **+ New Variable**
   - Name: `DATA_DIR` · Value: `/data` · Save
2. Same service → **Settings** tab → scroll to **Volumes** → **+ New Volume**
   - **Mount path:** `/data` (must match the env var above)
   - **Size:** 1 GB (plenty for tens of thousands of submissions) → **Create**

`PORT` is injected by Railway automatically — do **not** set it yourself. Railway will
redeploy after the volume is created.

### 4. Get the public URL

Service → **Settings** → **Networking** → **Generate Domain**. You'll get a URL like
`aikabz-onboarding-production.up.railway.app`.

### 5. Test it

| URL | What to do |
|---|---|
| `https://<your-domain>/`       | Fill the wizard. Last step → click **📨 Send to AIKAB team**. Green toast: `Sent to AIKAB — ref sub_…` |
| `https://<your-domain>/admin`  | Username: `admin` · Password: `admin` → see analytics + your submission. Click it for full profile, raw JSON, delete |

### Changing the admin password

Default `admin`/`admin` is fine for getting started but anyone who finds the URL can sign in.
To lock it down, in your Railway service → **Variables** tab add:

| Name | Value |
|---|---|
| `ADMIN_USER` | a username only you know |
| `ADMIN_PASS` | a strong password |

Railway redeploys automatically. The next admin login uses the new credentials.

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
npm start
```

Open <http://localhost:3000> and <http://localhost:3000/admin> (login: `admin` / `admin`).
Submissions land in a local `./data/submissions/` folder (gitignored). To start fresh,
just delete the folder.

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
                                                                    │  (Authorization: Basic admin:admin)
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
- **Admin auth** is HTTP Basic Auth — username/password sent in the `Authorization` header.
  Defaults to `admin`/`admin`; override with the `ADMIN_USER` / `ADMIN_PASS` env vars in Railway.
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
- **Change the admin password** — set `ADMIN_USER` and/or `ADMIN_PASS` env vars in Railway. The
  service redeploys and the next admin login uses the new credentials.
- **Email submissions to your team too** — the form already has an "Email it" button that
  opens the user's mail app. To do it server-side, add SendGrid/Resend in `server.js`
  after the `fs.writeFile()` call.
- **Bigger volume later** — Railway → Volumes → resize. Data is preserved.

---

## Security notes

- Submissions contain PII (name, email, phone). The volume is private to your service —
  only your container reads it; nothing is publicly accessible without admin credentials.
- **The default `admin` / `admin` login is for getting started — anyone who finds the URL can
  sign in.** Set `ADMIN_USER` and `ADMIN_PASS` env vars on Railway before sharing the link.
- Admin auth is a single shared username + password. For multiple teammates, replace the
  `safeEqual` check in `adminGate()` with a lookup against multiple credential pairs.
- Never commit `.env`, `.env.local`, or your tokens.
- Credentials are sent as HTTP Basic Auth, which is plain-text — Railway terminates TLS at
  the edge so the wire is encrypted, but never use this admin panel over plain HTTP.
- `app.disable('x-powered-by')` is on so we don't advertise the server stack.
