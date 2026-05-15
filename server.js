// AIKAB onboarding — Express server for Railway.
// Serves the public/ folder and exposes three JSON endpoints backed by a
// persistent volume that stores submissions as plain JSON files (no database).
//
//   POST   /api/submit         — public; saves a submission to {DATA_DIR}/submissions/sub_*.json
//   GET    /api/submissions    — admin-only; lists every submission
//   DELETE /api/submissions?id — admin-only; deletes one submission
//   GET    /health             — health check (used by Railway)
//   GET    /                   — serves public/index.html
//   GET    /admin              — serves public/admin.html
//
// Required env vars:
//   ADMIN_TOKEN  — long random string; gates the admin endpoints + admin page
// Optional:
//   PORT         — defaults to 3000 (Railway injects its own PORT automatically)
//   DATA_DIR     — defaults to ./data (mount a Railway Volume here in production)

import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT        = Number(process.env.PORT) || 3000;
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, 'data');
const SUBS_DIR    = path.join(DATA_DIR, 'submissions');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PUBLIC_DIR  = path.join(__dirname, 'public');

// Ensure the submissions directory exists at boot
await fs.mkdir(SUBS_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway terminates TLS at the edge
app.use(express.json({ limit: '256kb' }));

// ── Helpers ──────────────────────────────────────────────────────────────────
function adminGate(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(500).json({ error: 'ADMIN_TOKEN env var is not set on the server.' });
  }
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized — bad or missing admin token.' });
  }
  next();
}

const isValidId = (s) => typeof s === 'string' && /^sub_[A-Za-z0-9_]+$/.test(s);

// ── Public form submission ──────────────────────────────────────────────────
app.post('/api/submit', async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }
    const email = body?.contact?.email;
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ error: 'A valid contact email is required.' });
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id,
      submittedAt: new Date().toISOString(),
      meta: {
        userAgent: req.headers['user-agent'] || null,
        referer: req.headers['referer'] || null,
        ip: req.ip || null,
      },
      data: body,
    };

    await fs.writeFile(
      path.join(SUBS_DIR, `${id}.json`),
      JSON.stringify(record, null, 2),
      'utf8'
    );

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to save submission.' });
  }
});

// ── Admin: list every submission ────────────────────────────────────────────
app.get('/api/submissions', adminGate, async (req, res) => {
  try {
    const files = (await fs.readdir(SUBS_DIR)).filter((f) => f.endsWith('.json'));
    const submissions = [];
    for (const f of files) {
      try {
        const content = await fs.readFile(path.join(SUBS_DIR, f), 'utf8');
        submissions.push(JSON.parse(content));
      } catch {
        // skip an unreadable file instead of failing the entire request
      }
    }
    submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return res.status(200).json({ count: submissions.length, submissions });
  } catch (err) {
    console.error('list error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to list submissions.' });
  }
});

// ── Admin: delete one submission ────────────────────────────────────────────
app.delete('/api/submissions', adminGate, async (req, res) => {
  const id = req.query?.id;
  if (!isValidId(id)) return res.status(400).json({ error: 'Pass ?id=sub_… to delete.' });
  try {
    await fs.unlink(path.join(SUBS_DIR, `${id}.json`));
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return res.status(404).json({ error: 'Not found.' });
    console.error('delete error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to delete.' });
  }
});

// ── Routes for the two HTML pages + health check ───────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get(['/admin', '/admin/'], (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

// Static assets (HTML pages, future CSS/images). Disable serving index.html
// automatically for "/" so we can keep custom routing if we ever need it.
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));

// Fallback for unknown routes — send the form so deep links survive refresh
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AIKAB onboarding listening on :${PORT}`);
  console.log(`  data dir: ${DATA_DIR}`);
  console.log(`  admin token: ${ADMIN_TOKEN ? '✓ set' : '✗ MISSING — set ADMIN_TOKEN env var'}`);
});
