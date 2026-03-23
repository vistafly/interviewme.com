import { getAdminDb } from './_firebase-admin.js';
import { requireAdmin } from './_adminAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const db = getAdminDb();

  const proposedSnap = await db.doc('calibration_config/proposed').get();
  if (!proposedSnap.exists) {
    return res.status(404).json({ error: 'No proposed calibration to discard' });
  }

  // Only delete proposed — do NOT update lastOptimizedAt so the same
  // training records remain eligible for the next optimization run.
  await db.doc('calibration_config/proposed').delete();

  res.json({ ok: true, message: 'Proposed calibration discarded. Training data preserved for next optimization.' });
}
