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
    return res.status(404).json({ error: 'No proposed calibration found' });
  }

  const proposed = proposedSnap.data();
  const live = {
    ...proposed,
    status: 'live',
    approvedAt: new Date().toISOString(),
    lastOptimizedAt: proposed.proposedAt,
  };
  delete live.proposedAt;
  delete live.newRecordsSince;

  await db.doc('calibration_config/live').set(live);
  await db.doc('calibration_config/proposed').delete();

  res.json({ ok: true, live });
}
