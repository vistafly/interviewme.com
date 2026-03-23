import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_CALIBRATION = {
  behavioral:   { slope: 1.0, intercept: 15 },
  motivation:   { slope: 1.0, intercept: 18 },
  opinion:      { slope: 1.0, intercept: 12 },
  hypothetical: { slope: 1.0, intercept: 15 },
  follow_up:    { slope: 1.0, intercept: 0  },
};

export let liveCalibration = { ...DEFAULT_CALIBRATION };

export async function loadCalibration() {
  try {
    const snap = await getDoc(doc(db, 'calibration_config', 'live'));
    if (snap.exists()) {
      const data = snap.data();
      liveCalibration = { ...DEFAULT_CALIBRATION };
      for (const type of Object.keys(DEFAULT_CALIBRATION)) {
        if (data[type]) {
          liveCalibration[type] = { ...DEFAULT_CALIBRATION[type], ...data[type] };
        }
      }
    }
  } catch (e) {
    console.warn('[calibration] loadCalibration failed, using defaults:', e.message);
  }
}

export function getCalibration(questionType) {
  return liveCalibration[questionType] ?? DEFAULT_CALIBRATION[questionType] ?? DEFAULT_CALIBRATION.behavioral;
}

// Apply multi-feature regression model if available for this question type.
// Returns the predicted aiScore (clamped 40-95), or null if no multi model exists.
// Caller falls back to slope+intercept via getCalibration() when null is returned.
export function applyMultiCalibration(features, questionType) {
  const cal = liveCalibration[questionType] ?? DEFAULT_CALIBRATION[questionType] ?? DEFAULT_CALIBRATION.behavioral;
  if (!cal.weights || !cal.featureKeys) return null;

  let score = cal.intercept_raw ?? 0;
  for (const fk of cal.featureKeys) {
    const v = features[fk];
    const raw = typeof v === 'boolean' ? (v ? 1 : 0) : (Number(v) || 0);
    const mean = cal.featureMeans?.[fk] ?? 0;
    const std  = cal.featureStds?.[fk]  ?? 1;
    const normalized = (raw - mean) / (std + 1e-8);
    score += (cal.weights[fk] ?? 0) * normalized;
  }
  return Math.min(95, Math.max(40, Math.round(score)));
}
