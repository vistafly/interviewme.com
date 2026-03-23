import Stripe from 'stripe';
import { verifyIdToken, getAdminDb } from './_firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to upgrade to Pro.' });

  let uid;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid auth token.' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId   = process.env.STRIPE_PRICE_ID;
  if (!stripeKey || !priceId) {
    return res.status(500).json({ error: 'Stripe is not configured.' });
  }

  const stripe = new Stripe(stripeKey);

  try {
    const db   = getAdminDb();
    const snap = await db.doc(`users/${uid}/usage/daily`).get();
    const existingCustomerId = snap.exists ? snap.data()?.stripeCustomerId : null;

    const appUrl = process.env.APP_URL || 'https://interviewme.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { uid },
      customer: existingCustomerId || undefined,
      success_url: `${appUrl}/?upgraded=1`,
      cancel_url:  `${appUrl}/setup`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout]', err.message);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
}
