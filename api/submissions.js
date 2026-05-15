// GET    /api/submissions       — list every onboarding submission (admin only)
// DELETE /api/submissions?url=  — delete one submission blob (admin only)
// Protected by the ADMIN_TOKEN env var, sent in the x-admin-token header.

import { list, del } from '@vercel/blob';

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized — missing or invalid admin token.' });
}

export default async function handler(req, res) {
  // --- auth ---
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: 'ADMIN_TOKEN env var is not set on the deployment.' });
  }
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return unauthorized(res);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Blob storage not configured (BLOB_READ_WRITE_TOKEN missing).' });
  }

  // --- DELETE one submission ---
  if (req.method === 'DELETE') {
    const url = req.query?.url;
    if (!url) return res.status(400).json({ error: 'Pass ?url= of the submission blob to delete.' });
    try {
      await del(String(url));
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('delete error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to delete.' });
    }
  }

  // --- GET all submissions ---
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const submissions = [];
    let cursor;
    // page through every blob under submissions/
    do {
      const page = await list({ prefix: 'submissions/', cursor, limit: 1000 });
      for (const blob of page.blobs) {
        try {
          const r = await fetch(blob.url);
          if (!r.ok) continue;
          const record = await r.json();
          // attach the blob URL so the admin UI can delete it later
          record._blobUrl = blob.url;
          submissions.push(record);
        } catch {
          // skip an unreadable blob rather than failing the whole list
        }
      }
      cursor = page.cursor;
    } while (cursor);

    submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return res.status(200).json({ count: submissions.length, submissions });
  } catch (err) {
    console.error('list error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to list submissions.' });
  }
}
