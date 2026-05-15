# AIKAB — Client Onboarding + Admin Panel

Two pages and three serverless functions. No database. Deployed on Vercel.

```
client-onboarding/
├─ index.html        ← public onboarding form (mobile responsive)
├─ admin.html        ← token-protected admin dashboard + AI advisor
├─ api/
│  ├─ submit.js      ← POST  — save a submission to Vercel Blob
│  ├─ submissions.js ← GET   — list every submission (admin-only)
│  │                   DELETE— delete one submission   (admin-only)
│  └─ advise.js      ← POST  — Claude writes a tailored AIKAB rollout plan (admin-only)
├─ package.json
├─ vercel.json
└─ README.md
```

---

## What each page does

**`index.html`** — the public form. Mobile-responsive 8-step wizard that collects: spa basics → team → services → current stack → ranked pain points → goals (sliders) → scale → contact. Followed by a 7-tab interactive walkthrough with live animated demos (Smart Follow-Up, No-Show Recovery, Churn Radar, Protocol Tracking, Package Recovery, Marketing Attribution, Dashboard). Submitting calls `/api/submit`. Progress auto-saves to `localStorage`.

**`admin.html`** — token-gated dashboard at `https://your-domain.com/admin`. Shows:
- KPI strip (total submissions, this week, multi-location, average retention goal)
- Aggregate analytics (top pain points, services, average goals, booking systems)
- Searchable submissions list
- Per-submission detail drawer with a **✨ Generate recommendation** button — calls Claude to write a tailored AIKAB rollout plan (snapshot · recommended plan · pain-to-module map · 30/60/90 plan · expected impact · watch-outs)

---

## Deploy to Vercel (one-time setup, ~5 minutes)

### 1. Push to a Git repo

```bash
cd client-onboarding
git init && git add . && git commit -m "AIKAB onboarding + admin"
# push to GitHub / GitLab / Bitbucket
```

### 2. Import the project on vercel.com

- New Project → import your repo → Vercel auto-detects this as a static site with `/api` serverless functions. **No framework preset, no build step.**
- Set the **Root Directory** to `client-onboarding` if you're committing the wider repo.

### 3. Add a Blob store (this is your "database")

In your project on Vercel:
- **Storage → Create Database → Blob** → give it any name.
- Vercel auto-injects `BLOB_READ_WRITE_TOKEN` as an env var for you. You don't paste anything.

### 4. Set the two remaining env vars

Project Settings → Environment Variables (apply to **Production, Preview, Development**):

| Name | Value | What it's for |
|---|---|---|
| `ADMIN_TOKEN` | a long random string you choose | Gates `/admin`, `/api/submissions`, and `/api/advise` |
| `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com) | Powers the AI advisor in the admin panel |

Generate a strong admin token in your terminal:

```powershell
# PowerShell
[Convert]::ToBase64String([Guid]::NewGuid().ToByteArray() + [Guid]::NewGuid().ToByteArray())
```

```bash
# macOS / Linux
openssl rand -base64 36
```

### 5. Deploy

Push to your default branch (or click Redeploy). Vercel installs `@vercel/blob` and `@anthropic-ai/sdk` from `package.json` and serves both HTML pages as static assets.

You now have:
- `https://your-domain.com/`        — public onboarding form
- `https://your-domain.com/admin`   — token-gated dashboard (paste your `ADMIN_TOKEN`)

---

## Local development

```bash
npm install -g vercel
cd client-onboarding
npm install
# put your env vars in .env.local (NEVER commit this file)
echo "ADMIN_TOKEN=dev-token-12345" > .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
# Vercel Blob env vars get pulled when you link the project:
vercel link    # connect this folder to a Vercel project
vercel env pull .env.local   # pulls BLOB_READ_WRITE_TOKEN
vercel dev     # local server with the API routes wired up
```

Then open <http://localhost:3000> and <http://localhost:3000/admin>.

---

## How the no-database flow works

```
   Client                    Vercel                    Admin
   ──────                    ──────                    ─────
   index.html                                          admin.html
     │                                                   │
     │  POST /api/submit                                 │
     │ ─────────────────────►  submit.js                 │
     │                          └─► Vercel Blob          │
     │                              submissions/sub_X.json
     │ ◄─ {ok:true, id}                                  │
                                                         │  GET /api/submissions
                                                         │  (x-admin-token header)
                                            list() ◄───── │
                                            ┌──┘          │
                                            ▼          ◄─ list of JSON records
                                       Blob lists every                          
                                       sub_*.json, the                           
                                       admin fetches each                        
                                                                                 
                                                         │  POST /api/advise
                                                         │  { profile }
                                              advise.js ◄┘
                                                 │
                                                 ▼
                                       Anthropic API
                                       (claude-opus-4-7
                                        + prompt caching)
                                                         │
                                                         ◄ Markdown recommendation
```

- **Submissions** are individual JSON files in Vercel Blob storage (object storage — not a database). Each filename ends with a random suffix so URLs aren't guessable; listing and reading them goes through the token-protected admin endpoint.
- **Admin auth** is a single shared `ADMIN_TOKEN` checked in the `x-admin-token` header — simple, no user accounts to manage.
- **The AI advisor** uses `claude-opus-4-7` with adaptive thinking. The system prompt (your AIKAB module knowledge + format instructions) is marked `cache_control: { type: "ephemeral" }`, so every recommendation after the first reads that ~1k-token prefix from cache at ~10% of input cost.

---

## Costs (rough)

| Thing | Cost on Hobby tier |
|---|---|
| Static hosting + serverless functions | Free |
| Vercel Blob storage | Free tier covers thousands of submissions |
| Claude API per recommendation | ~$0.02–$0.05 (3K output tokens with `claude-opus-4-7`, cache hits after the first call) |

---

## Customization pointers

- **Change the form questions** — edit the wizard panels in `index.html` (each `<div class="wiz-panel" data-step="N">`). State persists by `data-k="path.to.field"`.
- **Change the AI advisor's recommendation style** — edit `SYSTEM_PROMPT` in `api/advise.js`. Keep it stable byte-for-byte across requests to preserve cache hits.
- **Rotate the admin token** — change `ADMIN_TOKEN` in Vercel and the next admin login uses the new one.
- **Email submissions to your team too** — the form already has an "Email it" button that opens the user's email app pre-filled. To do it server-side, add SendGrid/Resend in `api/submit.js` after the `put()` call.

---

## Security notes

- Submissions contain PII (name, email, phone). Blobs are public-URL-with-random-suffix — practically unguessable, but if you need true privacy upgrade to Vercel Blob's private access mode or move to Vercel KV / Postgres.
- The admin token is a single shared secret. If multiple teammates need access, give each one their own and check a set of tokens instead of one.
- Never commit `.env.local` or your API keys.
