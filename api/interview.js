import { verifyIdToken } from './_firebase-admin.js';
import { checkAndDecrementQuota } from './_quota.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // ── Quota gate ─────────────────────────────────────────────────────────────
  let uid = null;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      // Invalid/expired token — treat as anonymous
    }
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';

  try {
    const quota = await checkAndDecrementQuota(uid, ip);
    if (!quota.allowed) {
      return res.status(429).json({
        error: 'quota_exceeded',
        remaining: 0,
        limit: quota.limit,
        isPro: quota.isPro,
        isAnon: quota.isAnon,
      });
    }
  } catch (err) {
    // If quota check fails (e.g. Firebase Admin not configured), fail open in dev
    if (process.env.NODE_ENV === 'production') {
      console.error('[quota]', err.message);
      return res.status(500).json({ error: 'Service temporarily unavailable.' });
    }
  }
  // ── End quota gate ──────────────────────────────────────────────────────────

  // Lock model and cap tokens server-side — prevent API key abuse via body manipulation
  const { system, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing messages array' });
  }
  const safeBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system,
    messages,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('[interview]', err.message);
    res.status(500).json({ error: 'An error occurred. Please try again.' });
  }
}
