import { getAdminDb, verifyIdToken } from './_firebase-admin.js';

export async function requireAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    const err = new Error('Invalid token');
    err.status = 401;
    throw err;
  }
  const db = getAdminDb();
  const snap = await db.collection('users').doc(decoded.uid).get();
  if (!snap.exists || !snap.data().isAdmin) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  return decoded;
}
