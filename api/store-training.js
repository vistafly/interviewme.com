import { getAdminDb } from './_firebase-admin.js';

const KNOWN_TYPES = new Set(['behavioral', 'motivation', 'opinion', 'hypothetical', 'follow_up']);

function validateRecord(r) {
  if (!r || typeof r !== 'object') return false;
  if (!KNOWN_TYPES.has(r.questionType)) return false;
  if (typeof r.heuristicScore !== 'number' || r.heuristicScore < 0 || r.heuristicScore > 100) return false;
  if (typeof r.aiScore !== 'number' || r.aiScore < 0 || r.aiScore > 100) return false;
  return true;
}

function sanitize(r) {
  return {
    questionType:   r.questionType,
    jobCategory:    typeof r.jobCategory === 'string' ? r.jobCategory.slice(0, 50) : 'General',
    sessionId:      typeof r.sessionId === 'string'   ? r.sessionId.slice(0, 32)   : null,
    questionNumber: typeof r.questionNumber === 'number' ? r.questionNumber : null,
    features: {
      clarity:          Number(r.features?.clarity)          || 0,
      vocabulary:       Number(r.features?.vocabulary)       || 0,
      depth:            Number(r.features?.depth)            || 0,
      structure:        Number(r.features?.structure)        || 0,
      keywords:         Number(r.features?.keywords)         || 0,
      relevance:        Number(r.features?.relevance)        || 0,
      coherence:        Number(r.features?.coherence)        || 0,
      wordCount:        Number(r.features?.wordCount)        || 0,
      hasNumbers:       Boolean(r.features?.hasNumbers),
      hasExamples:      Boolean(r.features?.hasExamples),
      sentenceCount:    Number(r.features?.sentenceCount)    || 0,
      avgSentenceLen:   Number(r.features?.avgSentenceLen)   || 0,
      fillerCount:      Number(r.features?.fillerCount)      || 0,
      fillerRate:       Number(r.features?.fillerRate)       || 0,
      keywordMatchRate: Number(r.features?.keywordMatchRate) || 0,
      carParts:         Number(r.features?.carParts)         || 0,
    },
    heuristicScore:   Math.round(r.heuristicScore),
    aiScore:          Math.round(r.aiScore),
    gap:              Math.round(r.heuristicScore - r.aiScore),
    structureFlagged: Boolean(r.structureFlagged),
    timestamp:        new Date().toISOString(),
    textMode:         Boolean(r.textMode),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { records } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records array required' });
  }

  const valid = records.filter(validateRecord).slice(0, 20).map(sanitize);
  if (valid.length === 0) {
    return res.status(400).json({ error: 'No valid records' });
  }

  try {
    const db = getAdminDb();
    const batch = db.batch();
    for (const record of valid) {
      // Deterministic ID prevents duplicate records from the same session+question
      const docId = record.sessionId && record.questionNumber != null
        ? `${record.sessionId}_q${record.questionNumber}`
        : undefined;
      const ref = docId
        ? db.collection('analytics_training').doc(docId)
        : db.collection('analytics_training').doc();
      batch.set(ref, record);
    }
    await batch.commit();
    res.json({ stored: valid.length });
  } catch (err) {
    console.error('[store-training]', err.message);
    res.status(500).json({ error: 'Failed to store training data.' });
  }
}
