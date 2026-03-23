import { scrapeJobUrl } from './_scrapeHelpers.js';

// Block SSRF attempts: localhost, private CIDRs, and cloud metadata endpoints
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' || h === '0.0.0.0' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||        // link-local / AWS metadata service
    /^::1$/.test(h) ||              // IPv6 loopback
    /^f[cd][0-9a-f]{2}:/i.test(h)  // IPv6 ULA (fc00::/7)
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' });
  }

  if (isPrivateHost(parsed.hostname)) {
    return res.status(400).json({ error: 'URL not allowed' });
  }

  try {
    const result = await scrapeJobUrl(url);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'URL took too long to respond' });
    }
    res.status(status).json({ error: err.message || 'Failed to fetch URL' });
  }
}
