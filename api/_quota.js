import { createHash } from 'crypto';
import { getAdminDb } from './_firebase-admin.js';

const FREE_LIMIT = 5;   // logged-in free users per day
const ANON_LIMIT = 3;   // anonymous users per day
const PRO_LIMIT  = 30;  // Pro subscribers per day

function today() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function hashIp(ip) {
  return createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 20);
}

/**
 * Check whether the caller has quota remaining and, if so, decrement it.
 * Returns { allowed, remaining, limit, isPro, isAnon }
 */
export async function checkAndDecrementQuota(uid, ip) {
  const db = getAdminDb();
  const date = today();

  if (uid) {
    // ── Logged-in user — atomic read-increment via transaction ───────────────
    const ref = db.doc(`users/${uid}/usage/daily`);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const isPro  = data.isPro || false;
      const limit  = isPro ? PRO_LIMIT : FREE_LIMIT;
      const count  = data.date === date ? (data.count || 0) : 0;
      if (count >= limit) {
        return { allowed: false, remaining: 0, limit, isPro, isAnon: false };
      }
      tx.set(ref, { count: count + 1, date, isPro }, { merge: true });
      return { allowed: true, remaining: limit - count - 1, limit, isPro, isAnon: false };
    });

  } else {
    // ── Anonymous user — atomic read-increment via transaction ───────────────
    const hashed = hashIp(ip);
    const ref    = db.doc(`anonymous_usage/${hashed}`);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const count = data.date === date ? (data.count || 0) : 0;
      if (count >= ANON_LIMIT) {
        return { allowed: false, remaining: 0, limit: ANON_LIMIT, isPro: false, isAnon: true };
      }
      tx.set(ref, { count: count + 1, date }, { merge: true });
      return { allowed: true, remaining: ANON_LIMIT - count - 1, limit: ANON_LIMIT, isPro: false, isAnon: true };
    });
  }
}
