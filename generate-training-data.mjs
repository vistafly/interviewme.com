/**
 * Generate realistic human-speech training data.
 * Simulates diverse interviewee personas with natural speech patterns.
 * Run: node generate-training-data.mjs
 */

const API = 'http://localhost:3001/api/store-training';
const BATCH_SIZE = 20;
const QUESTION_TYPES = ['behavioral', 'motivation', 'opinion', 'hypothetical', 'follow_up'];
const JOB_CATEGORIES = ['Sales', 'Tech', 'Healthcare', 'Finance', 'Customer Service', 'Management', 'Creative', 'General'];

// ── Helpers ──────────────────────────────────────────────────────────────────
const rand = (a, b) => Math.random() * (b - a) + a;
const randInt = (a, b) => Math.round(rand(a, b));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const gaussian = (m, s) => {
  const u = Math.random() || 1e-10, v = Math.random();
  return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const gClamp = (m, s, lo, hi) => clamp(Math.round(gaussian(m, s)), lo, hi);

// ── Interviewee Personas ─────────────────────────────────────────────────────
// Each persona defines HOW someone speaks, separate from WHAT they know
const PERSONAS = [
  {
    name: 'nervous-junior',
    weight: 0.12,
    fillerRate: [5, 12], // lots of ums and uhs
    wordMult: [0.7, 1.0], // shorter, trails off
    coherencePenalty: -15, // jumps around
    clarityPenalty: -12,
    depthPenalty: -8,
    carBonus: -1, // rarely structures answers
    aiRange: [48, 72], // knows some stuff but delivery hurts
    textMode: 0.05,
  },
  {
    name: 'rambler',
    weight: 0.10,
    fillerRate: [3, 7],
    wordMult: [1.6, 2.5], // talks way too much
    coherencePenalty: -20, // loses the thread
    clarityPenalty: -5,
    depthPenalty: 5, // hits some depth by volume
    carBonus: 0,
    aiRange: [55, 78], // content is there but buried
    textMode: 0.1,
  },
  {
    name: 'concise-expert',
    weight: 0.08,
    fillerRate: [0, 1.5],
    wordMult: [0.5, 0.75], // short but every word counts
    coherencePenalty: 10,
    clarityPenalty: 12,
    depthPenalty: -5, // penalized by word-count-based depth
    carBonus: 1,
    aiRange: [80, 95],
    textMode: 0.4,
  },
  {
    name: 'average-candidate',
    weight: 0.25,
    fillerRate: [1.5, 5],
    wordMult: [0.85, 1.2],
    coherencePenalty: 0,
    clarityPenalty: 0,
    depthPenalty: 0,
    carBonus: 0,
    aiRange: [65, 83],
    textMode: 0.25,
  },
  {
    name: 'strong-speaker',
    weight: 0.15,
    fillerRate: [0.5, 2.5],
    wordMult: [1.0, 1.4],
    coherencePenalty: 8,
    clarityPenalty: 8,
    depthPenalty: 6,
    carBonus: 1,
    aiRange: [78, 92],
    textMode: 0.15,
  },
  {
    name: 'text-prep-paster',
    weight: 0.08,
    fillerRate: [0, 0.3], // no fillers — typed/pasted
    wordMult: [1.0, 1.5],
    coherencePenalty: 15,
    clarityPenalty: 15,
    depthPenalty: 8,
    carBonus: 1,
    aiRange: [75, 93],
    textMode: 0.95,
  },
  {
    name: 'off-topic-tangent',
    weight: 0.07,
    fillerRate: [2, 6],
    wordMult: [1.0, 1.8],
    coherencePenalty: -25,
    clarityPenalty: -8,
    depthPenalty: -15,
    carBonus: -1,
    aiRange: [42, 64], // misses the question
    textMode: 0.15,
  },
  {
    name: 'confident-mid',
    weight: 0.10,
    fillerRate: [0.8, 3],
    wordMult: [0.9, 1.3],
    coherencePenalty: 5,
    clarityPenalty: 5,
    depthPenalty: -3, // sounds confident but shallow
    carBonus: 0,
    aiRange: [68, 82],
    textMode: 0.2,
  },
  {
    name: 'thoughtful-slow',
    weight: 0.05,
    fillerRate: [2, 5], // pauses come through as fillers in speech
    wordMult: [0.8, 1.1],
    coherencePenalty: 12, // very logical flow
    clarityPenalty: 3,
    depthPenalty: 10,
    carBonus: 1,
    aiRange: [80, 94],
    textMode: 0.1,
  },
];

function pickPersona() {
  const r = Math.random();
  let acc = 0;
  for (const p of PERSONAS) { acc += p.weight; if (r < acc) return p; }
  return PERSONAS[3]; // average-candidate fallback
}

// ── Question-type tendencies ─────────────────────────────────────────────────
const TYPE_BIAS = {
  behavioral:   { carExpected: true,  baseWords: [90, 220],  relevanceBase: 42, hGap: [-18, -3] },
  motivation:   { carExpected: false, baseWords: [60, 160],  relevanceBase: 48, hGap: [-15, -2] },
  opinion:      { carExpected: false, baseWords: [70, 180],  relevanceBase: 38, hGap: [-20, -5] },
  hypothetical: { carExpected: false, baseWords: [80, 200],  relevanceBase: 40, hGap: [-17, -4] },
  follow_up:    { carExpected: false, baseWords: [30, 100],  relevanceBase: 52, hGap: [-12, 0]  },
};

// ── Record generator ─────────────────────────────────────────────────────────
function generateRecord(questionType, sessionId, questionNumber) {
  const persona = pickPersona();
  const typeBias = TYPE_BIAS[questionType];

  // AI score — persona range with gaussian spread
  const aiMid = (persona.aiRange[0] + persona.aiRange[1]) / 2;
  const aiSpread = (persona.aiRange[1] - persona.aiRange[0]) / 3;
  const aiScore = clamp(Math.round(gaussian(aiMid, aiSpread)), 40, 99);

  // Quality factor
  const q = (aiScore - 40) / 59;

  // Heuristic always lags AI — gap varies by type
  const heuristicScore = clamp(aiScore + randInt(...typeBias.hGap), 0, 100);

  // Word count: base range × persona multiplier
  const baseWords = randInt(...typeBias.baseWords);
  const wordMult = rand(...persona.wordMult);
  const wordCount = Math.max(12, Math.round(baseWords * wordMult));

  // Sentence structure
  const wordsPerSentence = rand(10, 25); // natural speech is messy
  const sentenceCount = Math.max(1, Math.round(wordCount / wordsPerSentence));
  const avgSentenceLen = +(wordCount / sentenceCount).toFixed(1);

  // Filler words
  const fillerRate = +clamp(rand(...persona.fillerRate), 0, 20).toFixed(2);
  const fillerCount = Math.round(fillerRate * wordCount / 100);

  // CAR structure — behavioral expects it, others less so
  let carBase = typeBias.carExpected ? randInt(0, 3) : randInt(0, 1);
  carBase = clamp(carBase + persona.carBonus + (q > 0.6 ? 1 : 0), 0, 3);
  const carParts = Math.round(carBase);
  const structureMap = { 0: 20, 1: 30, 2: 65, 3: 100 };
  const structure = structureMap[carParts] ?? 20;

  // Concrete details — correlated with AI score and persona
  const hasExamples = Math.random() < (q * 0.6 + (persona.depthPenalty > 0 ? 0.2 : 0));
  const hasNumbers = Math.random() < (q * 0.4 + (persona.depthPenalty > 0 ? 0.15 : 0));

  // Core features — driven by AI score + persona quirks + noise
  const clarity = gClamp(
    35 + q * 50 + persona.clarityPenalty - (fillerRate * 2),
    7, 0, 100
  );
  const vocabulary = gClamp(28 + q * 48, 8, 0, 100);
  const depth = gClamp(
    15 + q * 55 + persona.depthPenalty + (wordCount > 150 ? 5 : 0) + (hasExamples ? 8 : 0) + (hasNumbers ? 5 : 0),
    9, 0, 100
  );
  const relevance = gClamp(
    typeBias.relevanceBase + q * 45 + persona.coherencePenalty * 0.3,
    10, 0, 100
  );
  const coherence = gClamp(
    35 + q * 40 + persona.coherencePenalty,
    9, 0, 100
  );
  const keywordMatchRate = gClamp(10 + q * 55 + (relevance > 60 ? 8 : 0), 12, 0, 100);
  const keywords = Math.max(0, Math.round(keywordMatchRate / 100 * randInt(2, 10)));

  const structureFlagged = structure <= 20 && aiScore >= 85;

  return {
    questionType,
    jobCategory: pick(JOB_CATEGORIES),
    sessionId,
    questionNumber,
    features: {
      clarity, vocabulary, depth, structure, keywords, relevance, coherence,
      wordCount, hasNumbers, hasExamples, sentenceCount, avgSentenceLen,
      fillerCount, fillerRate, keywordMatchRate, carParts,
    },
    heuristicScore,
    aiScore,
    gap: heuristicScore - aiScore,
    structureFlagged,
    textMode: Math.random() < persona.textMode,
  };
}

// ── Simulate realistic interview sessions ────────────────────────────────────
function makeSessionId() {
  return 'sim_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// A session simulates one person answering 5-10 questions.
// The SAME persona should answer all questions in a session (people don't change mid-interview).
function generateSession() {
  const sessionId = makeSessionId();
  const numQuestions = randInt(5, 10);
  const records = [];

  // Realistic question order: behavioral heavy, motivation early, follow_up at end
  const questionOrder = [];
  // 1-2 motivation/opinion up front
  questionOrder.push(pick(['motivation', 'motivation', 'opinion']));
  // 3-6 behavioral/hypothetical middle
  for (let i = 1; i < numQuestions - 1; i++) {
    questionOrder.push(pick(['behavioral', 'behavioral', 'behavioral', 'hypothetical', 'opinion']));
  }
  // Last question is usually follow_up
  questionOrder.push('follow_up');

  for (let q = 0; q < questionOrder.length; q++) {
    records.push(generateRecord(questionOrder[q], sessionId, q));
  }
  return records;
}

async function submitBatch(records) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  return await res.json();
}

async function main() {
  const allRecords = [];
  const typeCounts = { behavioral: 0, motivation: 0, opinion: 0, hypothetical: 0, follow_up: 0 };
  const TARGET = 40; // per type

  // Generate full sessions until all types have enough
  while (QUESTION_TYPES.some(t => typeCounts[t] < TARGET)) {
    const session = generateSession();
    for (const rec of session) {
      allRecords.push(rec);
      typeCounts[rec.questionType]++;
    }
  }

  console.log(`Generated ${allRecords.length} records across ${new Set(allRecords.map(r => r.sessionId)).size} sessions:`);
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  ${type}: ${count}`);
  }

  // Persona distribution check
  console.log('\nAI Score distribution:');
  const scores = allRecords.map(r => r.aiScore);
  for (const [lo, hi] of [[40,55],[55,65],[65,75],[75,85],[85,95],[95,100]]) {
    const n = scores.filter(s => s >= lo && s < hi).length;
    const bar = '█'.repeat(Math.round(n / 2));
    console.log(`  ${lo}-${hi}: ${String(n).padStart(3)} ${bar}`);
  }

  console.log('\nSpeech vs text:');
  const speech = allRecords.filter(r => !r.textMode).length;
  console.log(`  Speech: ${speech}  Text: ${allRecords.length - speech}`);

  // Submit
  let totalStored = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE);
    const result = await submitBatch(batch);
    totalStored += result.stored || 0;
  }

  console.log(`\nStored: ${totalStored} / ${allRecords.length}`);
}

main().catch(console.error);
