// POST /api/submit — saves one client onboarding submission to Vercel Blob.
// No database: each submission is a single JSON object in Blob storage under submissions/.
// Public form endpoint — no auth (anyone with the form can submit, by design).

import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: 'Blob storage not configured. Create a Blob store in the Vercel dashboard (Storage tab) — it auto-adds BLOB_READ_WRITE_TOKEN.',
    });
  }

  try {
    // Vercel parses JSON bodies automatically when Content-Type: application/json
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object.' });
    }

    // Light validation — we want a contact email so the team can follow up
    const email = body?.contact?.email;
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ error: 'A valid contact email is required.' });
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id,
      submittedAt: new Date().toISOString(),
      // basic request metadata, helpful for the team
      meta: {
        userAgent: req.headers['user-agent'] || null,
        referer: req.headers['referer'] || null,
      },
      data: body,
    };

    // addRandomSuffix keeps the blob URL unguessable. Listing/reading happens
    // only through the token-protected /api/submissions endpoint.
    const blob = await put(`submissions/${id}.json`, JSON.stringify(record, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: true,
    });

    return res.status(200).json({ ok: true, id, url: blob.url });
  } catch (err) {
    console.error('submit error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to save submission.' });
  }
}
