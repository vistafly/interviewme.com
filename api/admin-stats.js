import { getAdminDb } from './_firebase-admin.js';
import { requireAdmin } from './_adminAuth.js';

const KNOWN_TYPES  = ['behavioral', 'motivation', 'opinion', 'hypothetical', 'follow_up'];
const KNOWN_CATS   = ['Sales', 'Tech', 'Healthcare', 'Finance', 'Customer Service', 'Management', 'Creative', 'General'];
const FEATURE_KEYS = ['clarity', 'vocabulary', 'depth', 'structure', 'keywords', 'relevance', 'coherence', 'wordCount'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const db = getAdminDb();

  try {
    // ── Build Firestore query with date bounds pushed to the server ────────────
    const dateFrom = req.query.from;  // YYYY-MM-DD
    const dateTo   = req.query.to;    // YYYY-MM-DD
    let trainingQuery = db.collection('analytics_training').orderBy('timestamp', 'desc');
    if (dateFrom) trainingQuery = trainingQuery.where('timestamp', '>=', dateFrom);
    if (dateTo)   trainingQuery = trainingQuery.where('timestamp', '<=', dateTo + 'T23:59:59');

    const [trainingSnap, usersSnap, liveSnap, proposedSnap] = await Promise.all([
      trainingQuery.get(),
      db.collection('users').get(),
      db.doc('calibration_config/live').get(),
      db.doc('calibration_config/proposed').get(),
    ]);
    const records = trainingSnap.docs.map((d) => d.data());

    // ── User metrics ──────────────────────────────────────────────────────────
    const usersData = usersSnap.docs.map((d) => d.data());
    const now   = new Date();
    const wkAgo = new Date(now); wkAgo.setDate(wkAgo.getDate() - 7);
    const moAgo = new Date(now); moAgo.setMonth(moAgo.getMonth() - 1);
    const twoMinAgo = new Date(now); twoMinAgo.setMinutes(twoMinAgo.getMinutes() - 2);
    const totalUsers       = usersData.length;
    const liveUsers        = usersData.filter((u) => u.lastSeen   && new Date(u.lastSeen)   >= twoMinAgo).length;
    const newUsersWeek     = usersData.filter((u) => u.createdAt  && new Date(u.createdAt)  >= wkAgo).length;
    const newUsersMonth    = usersData.filter((u) => u.createdAt  && new Date(u.createdAt)  >= moAgo).length;
    const activeUsersWeek  = usersData.filter((u) => u.lastActive && new Date(u.lastActive) >= wkAgo).length;
    const activeUsersMonth = usersData.filter((u) => u.lastActive && new Date(u.lastActive) >= moAgo).length;

    // ── Aggregate training records ────────────────────────────────────────────
    const byType        = Object.fromEntries(KNOWN_TYPES.map((t) => [t, 0]));
    const byCat         = Object.fromEntries(KNOWN_CATS.map((c) => [c, 0]));
    const gapSumByType  = Object.fromEntries(KNOWN_TYPES.map((t) => [t, 0]));
    const gapSqByType   = Object.fromEntries(KNOWN_TYPES.map((t) => [t, 0]));
    const aiSumByType   = Object.fromEntries(KNOWN_TYPES.map((t) => [t, 0]));
    const hsSumByType   = Object.fromEntries(KNOWN_TYPES.map((t) => [t, 0]));
    const gapSumByCat   = Object.fromEntries(KNOWN_CATS.map((c) => [c, 0]));
    const gapCntByCat   = Object.fromEntries(KNOWN_CATS.map((c) => [c, 0]));
    const featSumByType = Object.fromEntries(KNOWN_TYPES.map((t) => [t, Object.fromEntries(FEATURE_KEYS.map((f) => [f, 0]))]));
    const scoreDist     = { '<50': 0, '50-60': 0, '60-70': 0, '70-80': 0, '80-90': 0, '90+': 0 };
    let flaggedCount    = 0;
    const gapBuckets    = { '-20': 0, '-15': 0, '-10': 0, '-5': 0, '0': 0, '+5': 0, '+10': 0 };

    // 30-day daily counts
    const daily30 = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      daily30[d.toISOString().slice(0, 10)] = 0;
    }

    for (const r of records) {
      const type = r.questionType;
      const cat  = KNOWN_CATS.includes(r.jobCategory) ? r.jobCategory : 'General';
      const gap  = r.gap ?? 0;
      const ai   = r.aiScore ?? 0;
      const hs   = r.heuristicScore ?? 0;

      if (KNOWN_TYPES.includes(type)) {
        byType[type]++;
        gapSumByType[type] += gap;
        gapSqByType[type]  += gap ** 2;
        aiSumByType[type]  += ai;
        hsSumByType[type]  += hs;
        if (r.features) {
          for (const fk of FEATURE_KEYS) {
            featSumByType[type][fk] += (r.features[fk] ?? 0);
          }
        }
      }
      byCat[cat]++;
      gapSumByCat[cat] += gap;
      gapCntByCat[cat]++;
      if (r.structureFlagged) flaggedCount++;

      if      (gap <= -17) gapBuckets['-20']++;
      else if (gap <= -12) gapBuckets['-15']++;
      else if (gap <= -7)  gapBuckets['-10']++;
      else if (gap <= -2)  gapBuckets['-5']++;
      else if (gap <= 2)   gapBuckets['0']++;
      else if (gap <= 7)   gapBuckets['+5']++;
      else                  gapBuckets['+10']++;

      if      (ai < 50) scoreDist['<50']++;
      else if (ai < 60) scoreDist['50-60']++;
      else if (ai < 70) scoreDist['60-70']++;
      else if (ai < 80) scoreDist['70-80']++;
      else if (ai < 90) scoreDist['80-90']++;
      else              scoreDist['90+']++;

      if (r.timestamp) {
        const day = r.timestamp.slice(0, 10);
        if (daily30[day] !== undefined) daily30[day]++;
      }
    }

    // ── Derived metrics ───────────────────────────────────────────────────────
    const meanGapByType  = {};
    const rmseByType     = {};
    const avgAiByType    = {};
    const avgHsByType    = {};
    const featAvgsByType = {};
    for (const type of KNOWN_TYPES) {
      const n = byType[type];
      if (n > 0) {
        meanGapByType[type] = Math.round((gapSumByType[type] / n) * 100) / 100;
        rmseByType[type]    = Math.round(Math.sqrt(gapSqByType[type] / n) * 100) / 100;
        avgAiByType[type]   = Math.round((aiSumByType[type] / n) * 10) / 10;
        avgHsByType[type]   = Math.round((hsSumByType[type] / n) * 10) / 10;
        featAvgsByType[type] = Object.fromEntries(
          FEATURE_KEYS.map((fk) => [fk, Math.round((featSumByType[type][fk] / n) * 10) / 10])
        );
      }
    }

    const meanGapByCategory = {};
    for (const cat of KNOWN_CATS) {
      if (gapCntByCat[cat] > 0) {
        meanGapByCategory[cat] = Math.round((gapSumByCat[cat] / gapCntByCat[cat]) * 100) / 100;
      }
    }

    // ── Recent records for filterable table (last 200) ────────────────────────
    const recentRecords = records.slice(0, 200).map((r) => ({
      questionType:     r.questionType,
      jobCategory:      r.jobCategory || 'General',
      heuristicScore:   r.heuristicScore,
      aiScore:          r.aiScore,
      gap:              r.gap,
      structureFlagged: r.structureFlagged ?? false,
      timestamp:        r.timestamp,
      features:         r.features ?? {},
    }));

    res.json({
      // User metrics
      totalUsers,
      liveUsers,
      newUsersWeek,
      newUsersMonth,
      activeUsersWeek,
      activeUsersMonth,
      // Training counts
      totalSamples:      records.length,
      byType,
      byJobCategory:     byCat,
      flaggedSamples:    flaggedCount,
      // Accuracy
      meanGapByType,
      rmseByType,
      avgAiByType,
      avgHsByType,
      meanGapByCategory,
      // Distributions
      gapHistogram:      gapBuckets,
      scoreDistribution: scoreDist,
      // Features
      featureAvgsByType: featAvgsByType,
      // Time series
      daily30,
      // Raw records for filter table
      recentRecords,
      // Calibration
      liveCalibration:     liveSnap.exists ? liveSnap.data() : null,
      proposedCalibration: proposedSnap.exists ? proposedSnap.data() : null,
    });
  } catch (err) {
    console.error('[admin-stats]', err.message);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
}
