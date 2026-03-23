import { getAdminDb } from './_firebase-admin.js';
import { requireAdmin } from './_adminAuth.js';

const KNOWN_TYPES = ['behavioral', 'motivation', 'opinion', 'hypothetical', 'follow_up'];
const MULTI_FEAT_KEYS = [
  'clarity', 'vocabulary', 'depth', 'structure', 'relevance', 'coherence',
  'wordCount', 'sentenceCount', 'avgSentenceLen', 'fillerRate',
  'keywordMatchRate', 'carParts', 'hasNumbers', 'hasExamples',
];

function transpose(A) {
  const rows = A.length, cols = A[0].length;
  return Array.from({ length: cols }, (_, j) => Array.from({ length: rows }, (_, i) => A[i][j]));
}
function matMul(A, B) {
  const n = A.length, m = B[0].length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) =>
      A[i].reduce((s, _, l) => s + A[i][l] * B[l][j], 0)
    )
  );
}
function matVec(A, v) {
  return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}
function solveLinear(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return null;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  return aug.map((row, i) => row[n] / row[i]);
}

// Remove outliers using IQR on the heuristic-AI gap
function removeOutliers(records) {
  if (records.length < 10) return records;
  const gaps = records.map(r => r.heuristicScore - r.aiScore).sort((a, b) => a - b);
  const q1 = gaps[Math.floor(gaps.length * 0.25)];
  const q3 = gaps[Math.floor(gaps.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return records.filter(r => {
    const gap = r.heuristicScore - r.aiScore;
    return gap >= lo && gap <= hi;
  });
}

function computeOLS(records) {
  records = removeOutliers(records);
  const n = records.length;
  if (n < 20) return null;
  const pairs = records.map(r => ({ x: r.heuristicScore, y: r.aiScore }));
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n;
  const covXY = pairs.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const varX  = pairs.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  if (varX === 0) return null;
  const slope     = covXY / varX;
  const intercept = meanY - slope * meanX;
  const rmse = Math.sqrt(pairs.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0) / n);
  // Sanity checks: reject nonsensical models
  if (slope < 0) return null;           // heuristic↑ should mean aiScore↑
  if (intercept > 100) return null;     // intercept above max score is meaningless
  if (rmse > 15) return null;           // model is too noisy to be useful
  return {
    slope:       Math.round(slope * 1000) / 1000,
    intercept:   Math.round(intercept * 10) / 10,
    rmse:        Math.round(rmse * 100) / 100,
    meanGap:     Math.round(pairs.reduce((s, p) => s + (p.x - p.y), 0) / n * 100) / 100,
    sampleCount: n,
    modelType:   'ols',
  };
}

function computeMultiOLS(records, featureKeys, lambda = 0.5) {
  records = removeOutliers(records);
  const n = records.length;
  if (n < 25) return null;
  const rich = records.filter(r => r.features && (r.features.sentenceCount > 0 || r.features.wordCount > 30));
  if (rich.length < 25) return null;

  const p = featureKeys.length;
  const means = {}, stds = {};
  for (const fk of featureKeys) {
    const vals = rich.map(r => {
      const v = r.features[fk];
      return typeof v === 'boolean' ? (v ? 1 : 0) : (Number(v) || 0);
    });
    const mean = vals.reduce((s, v) => s + v, 0) / rich.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / rich.length);
    means[fk] = mean;
    stds[fk] = std;
  }

  const X = rich.map(r => {
    const row = [1];
    for (const fk of featureKeys) {
      const v = r.features[fk];
      const raw = typeof v === 'boolean' ? (v ? 1 : 0) : (Number(v) || 0);
      row.push((raw - means[fk]) / (stds[fk] + 1e-8));
    }
    return row;
  });
  const y = rich.map(r => r.aiScore);

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  for (let j = 1; j <= p; j++) XtX[j][j] += lambda;
  const Xty = matVec(Xt, y);
  const beta = solveLinear(XtX, Xty);
  if (!beta) return null;

  const yMean = y.reduce((s, v) => s + v, 0) / rich.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < rich.length; i++) {
    const pred = X[i].reduce((s, x, j) => s + x * beta[j], 0);
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }

  const rmse = Math.sqrt(ssRes / rich.length);
  const r2   = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // Sanity checks: reject models that explain nothing or produce wild predictions
  if (r2 < 0.1) return null;              // model explains <10% of variance
  if (beta[0] < 30 || beta[0] > 100) return null; // intercept outside plausible score range
  if (rmse > 15) return null;              // too noisy to be useful
  return {
    intercept_raw: Math.round(beta[0] * 100) / 100,
    weights:       Object.fromEntries(featureKeys.map((fk, j) => [fk, Math.round(beta[j + 1] * 1000) / 1000])),
    featureKeys,
    featureMeans:  Object.fromEntries(featureKeys.map(fk => [fk, Math.round(means[fk] * 100) / 100])),
    featureStds:   Object.fromEntries(featureKeys.map(fk => [fk, Math.round(stds[fk]  * 100) / 100])),
    rmse:        Math.round(rmse * 100) / 100,
    r2:          Math.round(r2 * 10000) / 10000,
    meanGap:     Math.round(records.reduce((s, r) => s + (r.heuristicScore - r.aiScore), 0) / n * 100) / 100,
    sampleCount: n,
    richCount:   rich.length,
    modelType:   'multi',
  };
}

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

  try {
    // Only use records added after the last approved optimization
    const liveSnap = await db.doc('calibration_config/live').get();
    const lastOptimizedAt = liveSnap.exists ? (liveSnap.data().lastOptimizedAt ?? null) : null;

    let query = db.collection('analytics_training');
    if (lastOptimizedAt) query = query.where('timestamp', '>', lastOptimizedAt);
    const snap = await query.get();

    if (snap.empty) {
      return res.status(400).json({ error: 'No new training data since last optimization.' });
    }

    const byType = Object.fromEntries(KNOWN_TYPES.map((t) => [t, []]));

    snap.forEach((doc) => {
      const d = doc.data();
      if (KNOWN_TYPES.includes(d.questionType) && typeof d.heuristicScore === 'number' && typeof d.aiScore === 'number') {
        byType[d.questionType].push(d);
      }
    });

    const proposed = {
      status: 'proposed',
      proposedAt: new Date().toISOString(),
      newRecordsSince: lastOptimizedAt ?? 'all',
    };
    for (const type of KNOWN_TYPES) {
      const recs = byType[type];
      const result = computeMultiOLS(recs, MULTI_FEAT_KEYS) ?? computeOLS(recs);
      if (result) proposed[type] = result;
    }

    const typeCount = KNOWN_TYPES.filter((t) => proposed[t]).length;
    if (typeCount === 0) {
      const perType = Object.fromEntries(KNOWN_TYPES.map((t) => [t, byType[t].length]));
      return res.status(400).json({
        error: 'Insufficient data to optimize. Need ≥20 samples per question type (after outlier removal).',
        perTypeCounts: perType,
      });
    }

    // Check if proposed coefficients are identical to what's already live
    if (liveSnap.exists) {
      const liveData = liveSnap.data();
      const unchanged = KNOWN_TYPES.every((t) => {
        if (!proposed[t] && !liveData[t]) return true;
        if (!proposed[t] || !liveData[t]) return false;
        return proposed[t].slope === liveData[t].slope
          && proposed[t].intercept === liveData[t].intercept
          && proposed[t].rmse === liveData[t].rmse
          && proposed[t].sampleCount === liveData[t].sampleCount
          && proposed[t].modelType === liveData[t].modelType
          && proposed[t].intercept_raw === liveData[t].intercept_raw;
      });
      if (unchanged) {
        return res.status(400).json({
          error: 'Proposed coefficients are identical to live. No new meaningful data to recalibrate from.',
        });
      }
    }

    await db.doc('calibration_config/proposed').set(proposed);
    res.json({ proposed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
