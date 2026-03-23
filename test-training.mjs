// test-training.mjs
// Generates training data from job URLs, grades via AI, computes heuristic scores,
// stores to Firestore, and triggers OLS optimization.
//
// Usage: node test-training.mjs
// Requires: dev server running on localhost:3001

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const BASE = 'http://localhost:3001';
const DELAY_MS = 14000; // 14s between grade API calls (5 req/min limit)

// ── Job URLs ─────────────────────────────────────────────────────────────────
const JOB_URLS = [
  'https://jobs.smartrecruiters.com/ITManagementCorpDba101VOICE/744000082062871-account-manager-sales-representative',
  'https://www.ziprecruiter.com/c/Hyundai-Capital/Job/Sr.-Software-Developer-%28Blaze%29/-in-Irvine,CA?jid=1405c3a6c9f416cc',
  'https://careers.24hourfitness.com/pasadena-ca/sales-and-service-manager/819E22B4BF7440B69096EBAD483E2657/job/',
  'https://careers.7-eleven.com/job/san-diego/store-implementation-specialist/45445/92150949520',
];

// ── Inline STOP_WORDS & FILLER_WORDS (mirrors answerAnalytics.js) ────────────
const STOP_WORDS = new Set([
  'the','be','to','of','and','in','that','have','it','for','not','on','with',
  'he','as','you','do','at','this','but','his','by','from','they','we','she',
  'or','an','my','had','was','is','are','were','been','has','would','could',
  'should','will','can','did','just','so','than','also','into','its','then',
  'them','our','out','very','when','what','which','their','all','about','up',
  'one','there','her','said','each','how','some','other','more','time','get',
  'like','been','who','now','way','may','these','know','people','take','come',
  'make','been','after','back','only','new','most','over','such','any','much',
  'well','really','think','thing','things','going','want','because','still',
  'got','lot','went','being','yeah','yes','don','didn','doesn','wasn','won',
  'told','asked','say','says','put','let','too','use','used','even','first',
  'last','before','while','where','through','during','between','own','those',
  'again','off','down','away','here','both','few','many','same','another',
  'tell','gave','give','came','done','something','every','need','keep',
  'thought','found','saw','left','right','around','long','never','always',
  'percent','number','numbers','wanted','changed','called','looking','started',
  'your',
]);
const FILLER_WORDS = [
  'you know','sort of','kind of','i mean','so yeah','i guess','you see',
  'um','uh','uhh','umm','er','ah','like','basically','actually','literally','well',
];
const MULTI_FILLERS = FILLER_WORDS.filter(f => f.includes(' '));
const SINGLE_FILLERS = FILLER_WORDS.filter(f => !f.includes(' '));
const FILLER_SET = new Set(SINGLE_FILLERS);

// ── Default calibration (mirrors calibration.js defaults) ────────────────────
const DEFAULT_CAL = {
  behavioral:   { slope: 1.0, intercept: 15 },
  motivation:   { slope: 1.0, intercept: 18 },
  opinion:      { slope: 1.0, intercept: 12 },
  hypothetical: { slope: 1.0, intercept: 15 },
  follow_up:    { slope: 1.0, intercept: 0  },
};
function getCal(type) { return DEFAULT_CAL[type] ?? DEFAULT_CAL.behavioral; }

// ── Heuristic functions (ported from answerAnalytics.js) ────────────────────
function measureCoherence(transcript) {
  const words = transcript.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const content = words.filter(w => !STOP_WORDS.has(w) && !FILLER_SET.has(w));
  if (content.length < 20) return 1.0;
  const third = Math.floor(content.length / 3);
  const seg1 = new Set(content.slice(0, third));
  const seg3 = content.slice(third * 2);
  const shared = seg3.filter(w => seg1.has(w)).length;
  const ratio = seg3.length > 0 ? shared / seg3.length : 0;
  if (ratio >= 0.10) return 1.0;
  if (ratio >= 0.05) return 0.90;
  if (ratio >= 0.02) return 0.65;
  return 0.40;
}

function computeClarity(transcript, wordCount, coherence) {
  if (wordCount === 0) return { score: 0, fillerCount: 0 };
  const lower = transcript.toLowerCase();
  let fillerCount = 0;
  for (const phrase of MULTI_FILLERS) {
    const m = lower.match(new RegExp(`\\b${phrase}\\b`, 'gi'));
    if (m) fillerCount += m.length;
  }
  for (const word of SINGLE_FILLERS) {
    const m = lower.match(new RegExp(`\\b${word}\\b`, 'gi'));
    if (m) fillerCount += m.length;
  }
  const fillerRatio = fillerCount / wordCount;
  let score = Math.round(Math.max(0, Math.min(100, 100 - fillerRatio * 500)));
  score = Math.round(Math.max(0, score * coherence));
  return { score, fillerCount };
}

function computeVocabulary(transcript, coherence) {
  const words = transcript.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  if (words.length === 0) return { ratio: 0, score: 0 };
  const contentWords = words.filter(w => !STOP_WORDS.has(w));
  const unique = new Set(contentWords);
  const ratio = contentWords.length > 0 ? unique.size / contentWords.length : 0;
  let score = Math.round(Math.max(0, Math.min(100, (ratio - 0.35) * 220)));
  if (contentWords.length < 15) score = Math.min(score, 25);
  else if (contentWords.length < 20) score = Math.min(score, 50);
  score = Math.round(Math.max(0, score * coherence));
  return { ratio: Math.round(ratio * 100), score };
}

function computeDepth(transcript, wordCount) {
  if (wordCount === 0) return { score: 0, sentences: 0, avgSentenceLen: 0, hasExamples: false, hasNumbers: false };
  let sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 3);
  if (sentences.length <= 1 && wordCount >= 30) {
    const clauses = transcript.split(/\b(?:but |so |then |and then |however |because |although |though |which |where |when i )/i).filter(s => s.trim().split(/\s+/).length >= 4);
    if (clauses.length > sentences.length) sentences = clauses;
  }
  const sentenceCount = sentences.length;
  const avgSentenceLen = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
  const hasExamples = /\b(for example|for instance|specifically|one time i|when i was at|when i worked|i worked at \w+|i once had|i built|i led a|i managed a|recently (i|we) (was|were|had|worked)|my (first|last|early) (real |actual )?(job|role|shift)|(a |the |one )?(customer|client|guest) (came|called|walked|asked))\b/i.test(transcript);
  const hasNumbers = /(\d+\s*(%|percent|hours?|days?|weeks?|months?|years?|people|clients?|users?)|\$[\d,.]+|\d+x\b|\d+k\b|\b(two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred)\s+(days?|weeks?|months?|years?|people|users?))/i.test(transcript);
  let score = 0;
  if (wordCount >= 150)      score += 30;
  else if (wordCount >= 100) score += 24;
  else if (wordCount >= 60)  score += 16;
  else if (wordCount >= 30)  score += 8;
  if (avgSentenceLen >= 12 && avgSentenceLen <= 20) score += 20;
  else if (avgSentenceLen >= 8 && avgSentenceLen <= 25) score += 14;
  else score += 5;
  if (hasExamples) score += 25;
  if (hasNumbers)  score += 25;
  score = Math.min(100, score);
  return { score, sentences: sentenceCount, avgSentenceLen, hasExamples, hasNumbers };
}

function computeStructure(transcript) {
  if (!transcript || transcript.length < 20) return { score: 0, parts: { context: false, action: false, result: false } };
  const lower = transcript.toLowerCase();
  const hasContext = /\b(when i was|when i worked|i worked at \w+|my (last|previous|old|former) job|at my (previous|last|former)|in my (previous |last |former )?(role|position|job)|previously|situation was|problem was|tasked with|we were (asked|tasked|facing)|during a|had a (critical|major|big|serious)|the team (wanted|needed|requested)|i was \w+ing (at|for|in|on|a|the|our|my)|(a |the |one )?(customer|client|guest|manager|coworker) (came|called|walked|asked|needed|wanted|was)|there was (a|an) (issue|bug|problem|situation|case))\b/i.test(lower);
  const hasAction = /\b(i (decided|chose|implemented|developed|created|built|designed|led|managed|organized|initiated|proposed|analyzed|pushed back|showed|offered|recommended|suggested|explained|convinced|presented|addressed|challenged|flagged|identified|discovered|noticed|rewrote|rebuilt|trained|coordinated|negotiated|prioritized|streamlined|optimized|automated|mentored|delegated|supervised|launched|tested|resolved|investigated)|we (eventually|ultimately|traced|found|discovered|figured|decided|built|implemented|deployed|shipped|fixed)|i took (the|a) |what i (did|changed|started) (was)?|i started (by|to)|i (said|told|asked|went|got|came|fixed|showed|stayed|called|stepped|apologized)|my approach (was|is)|i worked (with|on|closely))\b/i.test(lower);
  const hasResult = /\b(result(ed)? (in|was)|the outcome|as a (direct )?result|which led to|improved (by|our|the)|increased (by|our|the)|reduced (by|our|the)|achieved|successfully completed|ultimately|this (led to|resulted)|impact was|saved (them|us)|completed (the|it)|team appreciated|my (manager|supervisor|boss|lead|team) (said|noted|told me|confirmed|recognized|appreciated)|ended up (with|saving|improving)|dropped (by|from|to)|recognized|delivered|(was|became) (my|our) best|(she|he|they) (thanked|appreciated|recognized|acknowledged)( me\b| that\b)?)\b/i.test(lower);
  const parts = { context: hasContext, action: hasAction, result: hasResult };
  const partsHit = [hasContext, hasAction, hasResult].filter(Boolean).length;
  let score;
  if (partsHit === 3)      score = 100;
  else if (partsHit === 2) score = 65;
  else if (partsHit === 1) score = 30;
  else                     score = 20;
  return { score, parts };
}

function computeRelevance(transcript, question) {
  if (!question || question.length < 10) return 100;
  const Q_VERBS = new Set(['describe','explain','share','discuss','provide','elaborate','example','walk']);
  const qWords = question.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const qContent = [...new Set(qWords.filter(w => !STOP_WORDS.has(w) && !Q_VERBS.has(w)))];
  if (qContent.length < 2) return 100;
  const answerLower = transcript.toLowerCase();
  const hits = qContent.filter(w => {
    const stem = w.length > 6 ? w.slice(0, 6) : w;
    return new RegExp(`\\b${stem}\\w*`, 'i').test(answerLower);
  });
  return Math.round((hits.length / qContent.length) * 100);
}

function detectQuestionType(question) {
  if (!question) return 'behavioral';
  const q = question.toLowerCase();
  if (/what questions|do you have.*question|anything.*ask|haven.t covered|want to ask|like to ask/i.test(q)) return 'follow_up';
  if (/how would you|what would you do if|if you were (scheduled|asked|put|given)|if you had to|walk (me )?through how you('d| would)|how do you (\w+ )?(handle|approach|deal with|respond to)|what do you do\b/i.test(q)) return 'hypothetical';
  if (/why (do|did|would) you want|what (made|makes|drew|attracted|draws|got) you|why (apply|choose|pick|come here|this company|this role)|why (\w+ ){1,3}(specifically|over|rather|versus|vs)\b|why \w+ instead of/i.test(q)) return 'motivation';
  if (/what does .* (look like|mean) to you|what is .* to you|what do you (think|believe|consider)|something .* (don.t|people) understand|what.s something|what do (most|many) people (not )?(understand|know|realize|get wrong)|what.s your (biggest|main|greatest|primary) (weakness|strength|challenge)/i.test(q)) return 'opinion';
  return 'behavioral';
}

function analyzeAnswerNode(transcript, question, keys = []) {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return null;
  const questionType = detectQuestionType(question);
  const rawCoherence = measureCoherence(transcript);
  const structure = computeStructure(transcript);
  const coherence = structure.score >= 100 ? Math.max(rawCoherence, 0.85)
    : structure.score >= 65 ? Math.max(rawCoherence, 0.70)
    : (questionType === 'motivation' || questionType === 'opinion' || questionType === 'hypothetical')
      ? Math.max(rawCoherence, 0.75)
      : wordCount >= 200 ? Math.max(rawCoherence, 0.75)
      : wordCount >= 40  ? Math.max(rawCoherence, 0.60)
      : rawCoherence;
  const clarity    = computeClarity(transcript, wordCount, coherence);
  const vocabulary = computeVocabulary(transcript, coherence);
  const depth      = computeDepth(transcript, wordCount);
  const qRelevance = computeRelevance(transcript, question);
  const relevance  = qRelevance;
  const fillerCount = clarity.fillerCount ?? 0;
  const features = {
    clarity:         clarity.score,
    vocabulary:      vocabulary.score,
    depth:           depth.score,
    structure:       structure.score,
    relevance,
    coherence:       Math.round(coherence * 100),
    wordCount,
    sentenceCount:   depth.sentences,
    avgSentenceLen:  depth.avgSentenceLen,
    fillerRate:      wordCount > 0 ? Math.round((fillerCount / wordCount) * 1000) / 10 : 0,
    keywordMatchRate: 50,
    carParts:        [structure.parts?.context, structure.parts?.action, structure.parts?.result].filter(Boolean).length,
    hasNumbers:      depth.hasNumbers,
    hasExamples:     depth.hasExamples,
  };

  let heuristicScore;
  const { slope, intercept } = getCal(questionType);
  const smoothFactor = 0.65 + 0.35 * (relevance / 100);

  if (questionType === 'follow_up') {
    const qCount = (transcript.match(/\?/g) || []).length;
    const rawVocabScore = Math.round(Math.max(0, Math.min(100, (vocabulary.ratio / 100 - 0.35) * 220)));
    const rawVocabCapped = wordCount < 30 ? Math.min(rawVocabScore, 30) : rawVocabScore;
    const followUpRaw = Math.round(Math.min(88, Math.max(40,
      40 + Math.min(qCount * 10, 30) + Math.min(wordCount / 5, 15) + rawVocabCapped * 0.10
    )));
    heuristicScore = followUpRaw;
  } else if (questionType === 'motivation' || questionType === 'opinion') {
    const motivRaw = clarity.score * 0.25 + vocabulary.score * 0.30 + 50 * 0.20 + (wordCount >= 150 ? 100 : wordCount >= 100 ? 80 : wordCount >= 60 ? 55 : wordCount >= 30 ? 30 : 10) * 0.25;
    const motivSmooth = Math.max(0.75, smoothFactor);
    const blended = motivRaw * motivSmooth + 45 * (1 - motivSmooth);
    heuristicScore = Math.min(95, Math.max(40, Math.round(slope * blended + intercept)));
  } else if (questionType === 'hypothetical') {
    const rawClarityScore = Math.round(Math.max(0, Math.min(100, 100 - (fillerCount / Math.max(wordCount, 1)) * 500)));
    const hypoDepth = Math.min(100,
      (wordCount >= 80 ? 25 : wordCount >= 60 ? 18 : 10) +
      (structure.score >= 100 ? 35 : structure.score >= 65 ? 20 : structure.score >= 30 ? 8 : 0) +
      (depth.hasNumbers ? 15 : 0) +
      (rawClarityScore >= 90 ? 20 : rawClarityScore >= 70 ? 10 : 0)
    );
    const hypoRaw = rawClarityScore * 0.35 + vocabulary.score * 0.30 + hypoDepth * 0.20 + 50 * 0.15;
    const hypoSmooth = Math.max(0.72, smoothFactor);
    const blended = hypoRaw * hypoSmooth + 45 * (1 - hypoSmooth);
    heuristicScore = Math.min(95, Math.max(40, Math.round(slope * blended + intercept)));
  } else {
    const lengthScore = wordCount >= 150 ? 100 : wordCount >= 100 ? 80 : wordCount >= 60 ? 55 : wordCount >= 30 ? 30 : 10;
    const rawClarityScore = Math.round(Math.max(0, Math.min(100, 100 - (fillerCount / Math.max(wordCount, 1)) * 500)));
    const raw = rawClarityScore * 0.15 + depth.score * 0.30 + structure.score * 0.20 + vocabulary.score * 0.10 + lengthScore * 0.15 + 50 * 0.10;
    const blended = raw * smoothFactor + 45 * (1 - smoothFactor);
    heuristicScore = Math.min(95, Math.max(40, Math.round(slope * blended + intercept)));
  }

  return { questionType, heuristicScore, features };
}

// ── Q&A Templates (all 5 types × 3 qualities) ───────────────────────────────
function getQAs(jobTitle, company, jobCategory) {
  const isSales    = /sale|account|bdr|sdr|d2d/i.test(jobTitle);
  const isTech     = /engineer|developer|software|data|blaze/i.test(jobTitle);
  const isService  = /fitness|service|specialist|store/i.test(jobTitle);
  const isManager  = /manager|lead|director|supervisor/i.test(jobTitle);

  // Context flavor for strong behavioral answers
  const ctx = isSales   ? { env: 'sales', action: 'close the deal', metric: 'increased monthly quota attainment by 22%', co: company }
    : isTech    ? { env: 'engineering', action: 'refactor the system', metric: 'reduced page load time by 40%', co: company }
    : isService ? { env: 'customer service', action: 'de-escalate the situation', metric: 'brought NPS up 15 points that quarter', co: company }
    :             { env: 'operations', action: 'implement the new process', metric: 'cut onboarding time by 30%', co: company };

  return [
    // ── BEHAVIORAL ────────────────────────────────────────────────────────────
    {
      type: 'behavioral',
      question: 'Tell me about a time you handled a difficult situation at work.',
      weak: `I just try to stay calm and do my best. I think communication is key in any difficult situation. I always try to be professional.`,
      mid: `At my previous job, I had a situation where a client was unhappy with our service. I listened to their concerns and worked with my manager to find a resolution. We ended up giving them a discount and they stayed with us. It was a good learning experience about how to handle upset customers.`,
      strong: `At ${ctx.co}, I inherited a ${ctx.env} project that was three weeks behind schedule with a key stakeholder threatening to pull funding. I immediately set up a daily 15-minute standup to surface blockers, personally took on two overdue tasks, and negotiated a two-week extension backed by a revised milestone plan. I also renegotiated scope by cutting two lower-priority features with stakeholder buy-in. We shipped on the new date — the stakeholder praised the turnaround in the all-hands, and that approach of transparent scope negotiation became our standard playbook. We ultimately ${ctx.metric}.`,
    },
    // ── MOTIVATION ────────────────────────────────────────────────────────────
    {
      type: 'motivation',
      question: `Why do you want to work at ${company} specifically?`,
      weak: `I want a job that pays well and this seemed like a good opportunity. I have some experience and think I could do well here.`,
      mid: `I've been following ${company} for a while and I really like what you're doing. The role aligns well with my background and I think I can contribute to the team. I'm looking for a place where I can grow and this seems like a good fit.`,
      strong: `${company} stands out to me for two specific reasons. First, your reputation for ${isSales ? 'customer-first sales culture and high performer development programs' : isTech ? 'technical excellence and investing in modern engineering practices' : isService ? 'member experience and promoting from within' : 'operational innovation and structured onboarding'} is something I've heard consistently from people inside the company. Second, this role sits at the intersection of ${isSales ? 'relationship building and consultative selling' : isTech ? 'scalable backend architecture and cross-team collaboration' : isService ? 'team leadership and revenue management' : 'cross-functional coordination and process improvement'} — which is exactly where I've built my strongest results. I'm not just looking for a next step; I want to double down in an environment that values what I do best.`,
    },
    // ── OPINION ──────────────────────────────────────────────────────────────
    {
      type: 'opinion',
      question: 'What do you think makes someone truly successful in this type of role?',
      weak: `I think being a hard worker and having a positive attitude. Also showing up on time and being reliable are important things.`,
      mid: `I think the most important qualities are communication and being a team player. You also need to be organized and manage your time well. Being able to handle stress and stay focused is also helpful for success in this kind of role.`,
      strong: `In my experience, the people who consistently outperform in ${ctx.env} roles share three traits: they obsess over understanding the person in front of them — ${isSales ? "what the prospect actually needs, not just what they asked for" : isTech ? "the user's actual pain point behind the ticket, not the surface request" : isService ? "what the member is really frustrated about, not just the complaint on the surface" : "what the stakeholder actually needs to succeed"}; they take ownership of outcomes rather than just tasks; and they actively rebuild themselves after failures rather than avoiding them. The hard skill component matters but honestly it is the secondary factor in top performers I have worked with.`,
    },
    // ── HYPOTHETICAL ─────────────────────────────────────────────────────────
    {
      type: 'hypothetical',
      question: 'How would you handle a situation where you disagreed with your manager\'s decision?',
      weak: `I would probably just go along with it since they are my manager. You have to respect authority and just do your job.`,
      mid: `I would first make sure I understood the decision fully by asking questions. If I still disagreed, I would respectfully share my perspective and explain my reasoning. If they still chose to go a different way, I would support the decision and do my best to make it work.`,
      strong: `My default is to disagree in private, align in public. If I disagreed, I'd first ask clarifying questions to check whether I'm missing context — often what looks like a bad decision has reasoning I haven't seen. If I still disagreed after that, I'd request a private conversation, frame my concern around the outcome we both want, and present one or two alternative options with trade-offs rather than just raising the problem. If my manager heard me out and still chose their original path, I'd commit fully — because partial execution of a good plan beats full execution of a mediocre plan half-heartedly. The only exception is if the decision were clearly unethical, in which case I'd escalate appropriately.`,
    },
    // ── FOLLOW-UP ─────────────────────────────────────────────────────────────
    {
      type: 'follow_up',
      question: 'Do you have any questions for us?',
      weak: `No, I think I'm all good. Thanks for the interview.`,
      mid: `I do have a couple of questions. What does a typical day look like in this role? And what are the biggest challenges someone in this position usually faces? Also, what does success look like in the first 90 days?`,
      strong: `Yes, a few actually. First — what does a strong 90-day performance look like in this role, and how is it measured? I want to understand how you'd define success early on. Second — ${isSales ? 'how are territories or accounts allocated, and how does the team handle competition for inbound leads?' : isTech ? 'what does the on-call rotation look like, and how does the team balance feature work against technical debt?' : isService ? 'how does this location handle the balance between new member acquisition goals and retaining existing members?' : 'how do cross-functional handoffs typically work here, and where do projects most commonly stall?'} And third — what's the one thing the last person in this role did exceptionally well that you're hoping to find in their successor?`,
    },
  ];
}

// ── Utility: delay ────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── API helpers ────────────────────────────────────────────────────────────────
async function scrapeJob(url) {
  try {
    const res = await fetch(`${BASE}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`scrape ${res.status}`);
    const data = await res.json();
    return { jobTitle: data.jobTitle || 'Unknown', company: data.company || 'Unknown', description: data.description || '' };
  } catch (e) {
    console.warn(`  [scrape failed: ${e.message}] using defaults`);
    return null;
  }
}

async function gradeAnswers(questions, jobTitle, company) {
  const res = await fetch(`${BASE}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions, jobTitle, company }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`grade ${res.status}: ${err.error || ''}`);
  }
  const data = await res.json();
  return data.grades || [];
}

async function storeRecords(records) {
  const res = await fetch(`${BASE}/api/store-training`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`store-training ${res.status}: ${err.error || ''}`);
  }
  return res.json();
}

// ── Infer job category ────────────────────────────────────────────────────────
function inferCategory(jobTitle = '') {
  const t = jobTitle.toLowerCase();
  if (/sale|account|bdr|sdr|d2d|door/.test(t)) return 'Sales';
  if (/engineer|developer|software|data|devops|blaze/.test(t)) return 'Tech';
  if (/nurs|doctor|medic|health|pharma|dental/.test(t)) return 'Healthcare';
  if (/financ|bank|invest|accountan|audit|cpa/.test(t)) return 'Finance';
  if (/support|help desk|customer service/.test(t)) return 'Customer Service';
  if (/manag|director|supervis|\bvp\b|\bceo\b|\bcto\b|chief/.test(t)) return 'Management';
  if (/design|market|content|creative|copy|brand/.test(t)) return 'Creative';
  return 'General';
}

// ── ANSI color helpers ────────────────────────────────────────────────────────
const G = s => `\x1b[32m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;
const R = s => `\x1b[31m${s}\x1b[0m`;
const B = s => `\x1b[36m${s}\x1b[0m`;

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(B('\n══════════════════════════════════════════════'));
  console.log(B('  InterviewMe — Training Data Generator'));
  console.log(B('══════════════════════════════════════════════\n'));

  let apiCallCount = 0;
  const allRecords = [];
  const typeCounts = { behavioral: 0, motivation: 0, opinion: 0, hypothetical: 0, follow_up: 0 };

  for (let jobIdx = 0; jobIdx < JOB_URLS.length; jobIdx++) {
    const url = JOB_URLS[jobIdx];
    console.log(B(`\n[Job ${jobIdx + 1}/${JOB_URLS.length}]`) + ` Scraping: ${url.slice(0, 70)}...`);

    const scraped = await scrapeJob(url);
    const jobTitle  = scraped?.jobTitle  || `Job ${jobIdx + 1}`;
    const company   = scraped?.company   || 'Unknown Company';
    const category  = inferCategory(jobTitle);
    console.log(`  Title: ${Y(jobTitle)} | Company: ${Y(company)} | Category: ${Y(category)}`);

    const qas = getQAs(jobTitle, company, category);

    // Build flat list of (question, answer, type) for batching
    const flat = [];
    for (const qa of qas) {
      for (const quality of ['weak', 'mid', 'strong']) {
        flat.push({ question: qa.question, answer: qa[quality], type: qa.type, quality });
      }
    }
    // flat = 5 types × 3 qualities = 15 items

    // Batch into groups of 10 for /api/grade
    const batches = [];
    for (let i = 0; i < flat.length; i += 10) batches.push(flat.slice(i, i + 10));

    const aiScores = [];
    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (apiCallCount > 0) {
        process.stdout.write(`  Waiting ${DELAY_MS / 1000}s for rate limit...`);
        await sleep(DELAY_MS);
        process.stdout.write(' done\n');
      }
      const batch = batches[bIdx];
      const payload = batch.map(b => ({ question: b.question, answer: b.answer }));
      console.log(`  Grading batch ${bIdx + 1}/${batches.length} (${payload.length} answers)...`);
      let grades;
      try {
        grades = await gradeAnswers(payload, jobTitle, company);
        apiCallCount++;
      } catch (e) {
        console.error(R(`  Grade error: ${e.message}`));
        grades = batch.map(() => ({ pct: 75 })); // fallback
      }
      aiScores.push(...grades);
    }

    // Build training records
    let recordsBuilt = 0;
    for (let i = 0; i < flat.length; i++) {
      const { question, answer, type, quality } = flat[i];
      const aiScore = aiScores[i]?.pct;
      if (aiScore == null) continue;

      const analytics = analyzeAnswerNode(answer, question);
      if (!analytics) continue;

      const { questionType, heuristicScore, features } = analytics;
      const gap = heuristicScore - aiScore;
      const record = {
        questionType,
        jobCategory: category,
        features: {
          clarity:         features.clarity,
          vocabulary:      features.vocabulary,
          depth:           features.depth,
          structure:       features.structure,
          keywords:        0,
          relevance:       features.relevance,
          coherence:       features.coherence,
          wordCount:       features.wordCount,
          sentenceCount:   features.sentenceCount,
          avgSentenceLen:  features.avgSentenceLen,
          fillerCount:     0,
          fillerRate:      features.fillerRate,
          keywordMatchRate: 50,
          carParts:        features.carParts,
          hasNumbers:      features.hasNumbers,
          hasExamples:     features.hasExamples,
        },
        heuristicScore,
        aiScore,
        gap,
        structureFlagged: features.structure === 0 && aiScore >= 85,
        textMode: true,
      };
      allRecords.push(record);
      typeCounts[questionType] = (typeCounts[questionType] || 0) + 1;

      const gStr = gap > 3 ? R(`+${gap}`) : gap < -3 ? Y(`${gap}`) : G(`${gap > 0 ? '+' : ''}${gap}`);
      console.log(`    [${quality.padEnd(6)}] ${type.padEnd(12)} hs=${String(heuristicScore).padStart(2)} ai=${String(aiScore).padStart(2)} gap=${gStr}`);
      recordsBuilt++;
    }
    console.log(`  ${G('✓')} ${recordsBuilt} records built for ${company}`);
  }

  // ── Store all records ───────────────────────────────────────────────────────
  console.log(B(`\n══ Storing ${allRecords.length} training records ══`));
  const BATCH_SIZE = 20;
  let totalStored = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const chunk = allRecords.slice(i, i + BATCH_SIZE);
    try {
      const result = await storeRecords(chunk);
      totalStored += result.stored || chunk.length;
      process.stdout.write(G('.'));
    } catch (e) {
      process.stdout.write(R('!'));
      console.error(`\n  Store error: ${e.message}`);
    }
  }
  console.log(`\n${G('✓')} Stored ${totalStored}/${allRecords.length} records`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(B('\n══ Sample Counts by Type ══'));
  let canOptimize = true;
  for (const [type, count] of Object.entries(typeCounts)) {
    const ok = count >= 10;
    if (!ok) canOptimize = false;
    console.log(`  ${type.padEnd(14)} ${ok ? G(String(count)) : Y(String(count))} ${ok ? G('✓ ready') : Y('⚠ need 10')}`);
  }

  if (canOptimize) {
    console.log(G('\n✓ All question types have ≥10 samples!'));
    console.log('  Go to the Admin Dashboard → Calibration tab → click "Run OLS Optimization"');
  } else {
    console.log(Y('\n⚠ Some types need more samples. Run this script again or add more URLs.'));
  }

  console.log(B('\n══════════════════════════════════════════════\n'));
})();
