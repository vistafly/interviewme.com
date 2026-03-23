import Stripe from 'stripe';
import { getAdminDb } from './_firebase-admin.js';

// Vercel requires raw body for Stripe signature verification.
// Add this to vercel.json if needed: { "api/stripe-webhook": { "bodyParser": false } }
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe webhook not configured.' });
  }

  const stripe = new Stripe(stripeKey);
  const sig    = req.headers['stripe-signature'];

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch {
    return res.status(400).json({ error: 'Could not read request body.' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature invalid.' });
  }

  const db = getAdminDb();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const uid     = session.metadata?.uid;
    if (uid) {
      await db.doc(`users/${uid}/usage/daily`).set(
        {
          isPro: true,
          stripeCustomerId:     session.customer,
          stripeSubscriptionId: session.subscription,
        },
        { merge: true },
      );
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub  = event.data.object;
    const snap = await db.collectionGroup('usage')
      .where('stripeCustomerId', '==', sub.customer)
      .limit(1)
      .get();
    if (!snap.empty) {
      await snap.docs[0].ref.set({ isPro: false }, { merge: true });
    }
  }

  res.json({ received: true });
}
