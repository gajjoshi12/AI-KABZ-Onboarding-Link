// POST /api/advise — Claude advisor for the admin panel.
// Given one client's onboarding profile (JSON), returns a concrete "how to
// achieve this via AIKAB" recommendation in Markdown. Admin-token protected.

import Anthropic from '@anthropic-ai/sdk';

export const config = { maxDuration: 60 };

// ── Stable system prompt (cached) ────────────────────────────────────────────
// Keep this frozen — any byte change invalidates the prompt cache.
const SYSTEM_PROMPT = `You are an onboarding strategist for AIKAB — a Growth OS for medical spas.
You are speaking to the AIKAB internal team (an admin reviewing one new client's profile).
Your job: turn the client's submitted profile into a concrete plan for how AIKAB will deliver on what they asked for.

# What AIKAB does (your toolkit)

**Retention Engine — the foundation**
- Smart Follow-Up Automation — treatment-aware post-visit sequences (e.g. Botox check-in at day 14, microneedling at day 3), in the client's timezone, quiet-hours respected, frequency-capped.
- Appointment Reminders — 48h / 24h / 2h with one-tap confirm/reschedule/cancel.
- No-Show Recovery — empathetic outreach within 60 minutes of a no-show, with one-tap rebook + optional make-good code.
- Protocol Completion Tracking — multi-session plans (laser ×6, microneedling ×4, CoolSculpting ×2 cycles) tracked end-to-end with re-timed nudges.
- Birthday & Anniversary campaigns segmented by client value tier.
- Package & Membership Management — unused-session alerts, 30/15/7/1-day expiration warnings, membership dunning & reactivation.
- Churn Prevention — nightly risk score, automatic win-back at threshold.
- Basic Analytics — retention, no-show rate, package utilization, attributed revenue.

**Growth Intelligence — when marketing is in scope**
- Marketing Automation + closed-loop multi-channel Attribution (Meta, Google, etc.).
- Lead Nurture & conversion sequences so no inquiry goes cold.
- Personalization engine (treatment history, value tier).
- Referral program automation.
- Advanced analytics — LTV by cohort, predictive forecasting.

**Full Growth OS — when operations are in scope**
- Operations Automation — scheduling, intake, inventory (perishable injectables with expiry tracking), HIPAA compliance.
- Revenue Optimization — dynamic pricing, upsell/cross-sell.
- Team & Performance management.
- Client Experience Automation — VIP flows, post-visit, reputation/reviews.
- Advanced Intelligence — predictive analytics, competitive intel, custom reporting.
- Multi-location support and a dedicated CSM.

# How to write the recommendation

Read every field of the submitted profile. Tie every recommendation back to something the client actually said — quote their wording where useful. Be concrete, never generic.

Output **clean Markdown** with these sections, in this order, using these exact headings:

## Snapshot
One line. Who they are, their stage, the single biggest opportunity.

## Recommended plan
The right starting plan (Retention only / Retention + Growth / Full Growth OS) with one sentence of why, grounded in their answers (# locations, revenue band, pain points, marketing/ops status). Don't quote prices.

## Where their revenue is leaking — and which module catches it
A bulleted list. For each ranked pain point they selected, name the AIKAB module that fixes it and one specific automation that will run for them. Be tactical: "Smart Follow-Up: Botox day-14 sequence" beats "set up follow-ups."

## 30 / 60 / 90 day plan
A three-block plan with specific milestones tied to their stated goals (retention lift target, no-show reduction target, admin hours back). Show **what we configure**, **what they approve**, and **what they see** at each milestone.

## Expected impact
Translate their goal sliders into measurable numbers. If they said +15 pts retention on ~2,000 contacts at their revenue band, estimate the dollar impact. Cite the targets they entered.

## What we need from them
A short checklist: integrations to connect (Boulevard / Zenoti / etc. — use what they told us), brand-voice config, the one first-message-of-each-sequence they'll approve in review mode, any data they should bring to kickoff.

## Watch-outs
Anything risky or unusual about this client — e.g. tiny team that may struggle to approve sequences, no booking system (we'll need to land them on one first), unrealistic goal slider, multiple locations needing the right plan.

Keep the whole response under ~700 words. No marketing fluff, no emoji. Write like an operator briefing the kickoff lead.`;

// ─────────────────────────────────────────────────────────────────────────────

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

export default async function handler(req, res) {
  // auth
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: 'ADMIN_TOKEN env var is not set on the deployment.' });
  }
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Add it in Project Settings → Environment Variables on Vercel.',
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  const profile = body?.profile;
  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ error: 'Send { profile: <submission object> }.' });
  }

  try {
    // Render order is tools → system → messages. The cached system block ends with
    // cache_control so every subsequent call (any client profile) reads the same
    // ~1k-token prefix from cache at ~10% of input cost.
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 3000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content:
            'Here is the client onboarding profile (JSON). Write the recommendation per the system instructions.\n\n```json\n' +
            JSON.stringify(profile, null, 2) +
            '\n```',
        },
      ],
    });

    // Collect text blocks only (thinking blocks aren't rendered to the admin UI)
    const advice = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return res.status(200).json({
      advice,
      model: message.model,
      stop_reason: message.stop_reason,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error('advise error:', err);
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Claude rate-limited — try again in a moment.' });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(err.status || 500).json({ error: err.message });
    }
    return res.status(500).json({ error: err?.message || 'Unknown error.' });
  }
}
