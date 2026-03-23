// ---------------------------------------------------------------------------
// answerAnalytics.js — Pure client-side speech analytics (zero API cost)
// ---------------------------------------------------------------------------
import { getCalibration, applyMultiCalibration } from './calibration';

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
  'your',  // possessive pronoun — appears in questions but never in first-person answers
]);

const FILLER_WORDS = [
  'you know','sort of','kind of','i mean','so yeah','i guess','you see',
  'um','uh','uhh','umm','er','ah','like','basically','actually','literally',
  'well',
];
const MULTI_FILLERS = FILLER_WORDS.filter(f => f.includes(' '));
const SINGLE_FILLERS = FILLER_WORDS.filter(f => !f.includes(' '));
const FILLER_SET = new Set(SINGLE_FILLERS);

// Generic narrative/interview words that appear in virtually every answer but carry zero domain signal
const INTERVIEW_NOISE = new Set([
  'company','previous','situation','needed','address','approach','example',
  'instance','result','outcome','improvement','challenge','problem','solution',
  'experience','focused','important','definitely','honestly',
  'worked','managed','helped','project','process','decided','started',
  'general','question','overall','everything','different','position',
  'department','organization','leadership','stakeholders','initiative',
  'methodology','particularly','demanding','period','significant',
  'comprehensive','implemented','specifically','approximately','acknowledged',
  'faced','critical','across','tasked','directly','discovered','realized',
  'involved','required','responsible','opportunity','eventually','initially',
  'basically','obviously','mentioned','regarding','associated','relevant',
  'ensure','ensured','ensuring','identified','understanding','effectively',
  'contributed','established','maintaining','recognized','personally',
  'proposed','ultimately','alignment','framework','standard','standards',
]);

// ---- Speaking Pace --------------------------------------------------------
function computePace(wordCount, timeUsed) {
  if (timeUsed <= 0) return { wpm: 0, label: 'N/A', quality: 'neutral' };
  const wpm = Math.round((wordCount / timeUsed) * 60);
  let quality, label;
  if (wpm < 90)       { quality = 'slow';  label = 'Too Slow'; }
  else if (wpm < 120) { quality = 'good';  label = 'Measured'; }
  else if (wpm < 160) { quality = 'ideal'; label = 'Natural'; }
  else if (wpm < 190) { quality = 'good';  label = 'Brisk'; }
  else                { quality = 'fast';  label = 'Too Fast'; }
  return { wpm, label, quality };
}

// ---- Coherence: does the response stay on a consistent topic? ------------
function measureCoherence(transcript) {
  const words = transcript.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const content = words.filter(w => !STOP_WORDS.has(w) && !FILLER_SET.has(w));

  if (content.length < 20) return 1.0; // too short to assess — segment overlap is noise below ~20 content words

  // Split content words into thirds and compare first ↔ last
  const third = Math.floor(content.length / 3);
  const seg1 = new Set(content.slice(0, third));
  const seg3 = content.slice(third * 2);

  const shared = seg3.filter(w => seg1.has(w)).length;
  const ratio = seg3.length > 0 ? shared / seg3.length : 0;

  // Thresholds: raw coherence signal — structure-aware boost applied later in analyzeAnswer
  // so well-structured CAR answers aren't penalized for natural vocabulary shifts.
  if (ratio >= 0.10) return 1.0;   // clearly on topic
  if (ratio >= 0.05) return 0.90;  // natural vocab evolution
  if (ratio >= 0.02) return 0.65;  // some drift
  return 0.40;                      // significant drift — structure boost may rescue this
}

// ---- Clarity (filler words + coherence) ----------------------------------
function computeClarity(transcript, wordCount, coherence) {
  if (wordCount === 0) return { score: 0, fillerCount: 0, fillers: [], label: 'N/A', coherence: 1.0 };
  const lower = transcript.toLowerCase();
  let fillerCount = 0;
  const fillersFound = [];

  for (const phrase of MULTI_FILLERS) {
    const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) {
      fillerCount += matches.length;
      fillersFound.push({ word: phrase, count: matches.length });
    }
  }
  for (const word of SINGLE_FILLERS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) {
      fillerCount += matches.length;
      fillersFound.push({ word, count: matches.length });
    }
  }

  const fillerRatio = fillerCount / wordCount;
  let score = Math.round(Math.max(0, Math.min(100, 100 - fillerRatio * 500)));

  // Coherence penalty — topic drift / rambling tanks clarity
  score = Math.round(Math.max(0, score * coherence));

  let label;
  if (score >= 90)      label = 'Excellent';
  else if (score >= 75) label = 'Good';
  else if (score >= 55) label = 'Fair';
  else                  label = 'Needs Work';

  return { score, fillerCount, fillers: fillersFound.filter(f => f.count > 0), label, coherence };
}

// ---- Vocabulary Richness --------------------------------------------------
function computeVocabulary(transcript, coherence) {
  const words = transcript.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  if (words.length === 0) return { ratio: 0, score: 0, uniqueCount: 0, totalCount: 0, label: 'N/A' };

  const contentWords = words.filter(w => !STOP_WORDS.has(w));
  const unique = new Set(contentWords);
  const ratio = contentWords.length > 0 ? unique.size / contentWords.length : 0;
  let score = Math.round(Math.max(0, Math.min(100, (ratio - 0.35) * 220)));
  // Cap score when too few content words — ratio is meaningless with tiny samples
  if (contentWords.length < 15) score = Math.min(score, 25);
  else if (contentWords.length < 20) score = Math.min(score, 50);

  // Off-topic rambling inflates diversity artificially — penalize with coherence
  score = Math.round(Math.max(0, score * coherence));

  let label;
  if (score >= 80)      label = 'Rich';
  else if (score >= 55) label = 'Good';
  else if (score >= 30) label = 'Average';
  else                  label = 'Limited';

  return { ratio: Math.round(ratio * 100), score, uniqueCount: unique.size, totalCount: contentWords.length, label };
}

// ---- Response Depth -------------------------------------------------------
function computeDepth(transcript, wordCount) {
  if (wordCount === 0) return { score: 0, sentences: 0, avgSentenceLen: 0, hasExamples: false, hasNumbers: false, label: 'N/A' };

  let sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 3);

  // Speech recognition rarely adds punctuation — fall back to clause boundary splitting
  if (sentences.length <= 1 && wordCount >= 30) {
    const clauses = transcript
      .split(/\b(?:but |so |then |and then |however |because |although |though |which |where |when i )/i)
      .filter(s => s.trim().split(/\s+/).length >= 4);
    if (clauses.length > sentences.length) {
      sentences = clauses;
    }
  }

  const sentenceCount = sentences.length;
  const avgSentenceLen = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;

  // Specific example markers — must indicate real concrete detail, not vague openers
  const hasExamples = /\b(for example|for instance|such as|specifically|in particular|one time i|when i was at|when i worked|i worked at \w+|i once had|we had a (specific|critical|major|serious)|i worked on a|i was \w+ing (at|for|in|on|a|the|our|an|my|one)?|we were working on|i've been working on|recently (i|we) (was|were|had|worked|built|noticed|found|discovered)|i built|i led a|i managed a|i created a|my role was|i was responsible for|i helped (build|design|develop|create|implement|launch)|i designed a|i developed a|i proposed a|i pulled up|i showed them|we (eventually|ultimately|traced|found|discovered|figured|investigated|identified)|(my manager|my lead|she|he|they) (raised|told me|mentioned|brought up) (this|it|that)?|i've (seen|watched|encountered) (teams|engineers|companies|people|systems|codebases|solutions|bugs|patterns|internal)|my (first|only|early|initial|last) (real |actual )?(job|role|position|gig|shift)|i worked (a |an |one |two |three |several |many ))\b/i.test(transcript);

  // Broad number/metric detection — includes digit-form and word-form numbers
  const hasNumbers = /(\d+\s*(%|percent|mph|acres|hours?|days?|weeks?|months?|years?|minutes?|seconds?|ms\b|packages?|repos?|requests?|users?|people|team|members?|clients?|projects?|sites?|flights?|units?|dBm?|MHz|GHz|kHz|kW|mW|watts?|miles?|feet|ft\b|km\b)|\$[\d,.]+|\d+x\b|\d+k\b|\b(two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\s+(days?|weeks?|months?|years?|minutes?|seconds?|hours?|people|engineers?|users?|records?|workspaces?|requests?|percent|times))/i.test(transcript);

  let score = 0;
  // Word count contribution (0-30)
  if (wordCount >= 150)      score += 30;
  else if (wordCount >= 100) score += 24;
  else if (wordCount >= 60)  score += 16;
  else if (wordCount >= 30)  score += 8;

  // Sentence variety (0-20) — ideal avg 12-20 words per sentence
  if (avgSentenceLen >= 12 && avgSentenceLen <= 20) score += 20;
  else if (avgSentenceLen >= 8 && avgSentenceLen <= 25) score += 14;
  else score += 5;

  // Specificity bonuses (0-25 each)
  if (hasExamples) score += 25;
  if (hasNumbers)  score += 25;
  score = Math.min(100, score);

  let label;
  if (score >= 80)      label = 'Thorough';
  else if (score >= 55) label = 'Good';
  else if (score >= 30) label = 'Surface';
  else                  label = 'Shallow';

  return { score, sentences: sentenceCount, avgSentenceLen, hasExamples, hasNumbers, label };
}

// ---- Structure (CAR: Context → Action → Result) ---------------------------
function computeStructure(transcript) {
  if (!transcript || transcript.length < 20) return { score: 0, parts: {}, label: 'N/A' };

  const lower = transcript.toLowerCase();

  const hasContext = /\b(when i was|when i worked|i worked at \w+|my (last|previous|old|former) job|at my (previous|last|former)|in my (previous |last |former )?(role|position|job)|at [a-z]+ (company|role|position|job)|previously|situation was|context was|challenge was|problem was|tasked with|we were (asked|tasked|facing|dealing)|during a|had a (critical|major|big|serious|important)|the team (wanted|needed|requested|asked)|they (wanted|needed|requested|asked) (us|me|to)|i was \w+ing (at|for|in|on|a|the|our|my|one)?|we (were|had) (a|the|an) .{3,40} (that|which|where)|recently (i|we) (was|were|had|worked|built|noticed|found)|there was (a|an) (issue|bug|problem|situation|case|time)|i've worked at (companies|teams|places|organizations)|(my manager|she|he|they) (raised|mentioned|brought up|told me) (it|this|that)?|the (core|main|real|first) (constraint|challenge|tension|problem|issue) (with|is|here|for|that)?|the (most common|biggest|main) (mistake|misconception) (is|engineers)|i've (seen|watched|encountered) (teams|engineers|companies|people|systems|codebases|solutions|bugs|patterns|internal)|the first (is|question|thing|point) (about|regarding|on)?|what (hooked|drew|attracted|got) me (was|is|to|into)|when everything('s| is) (on fire|broken|down|failing)|we were seeing (elevated|high|increased|degraded|slow)|this (comes up|happens) (constantly|regularly|often|all the time)|the (clearest|best|most recent|closest) (example|case|instance|time|situation|one) (i|i've) (have|had|seen)|the (scary|tricky|dangerous|critical|interesting|hard) (word|part|thing|detail|bit) (is|here|there|that)|my (first|only|early|initial|last) (real |actual )?(job|role|position|gig|shift)|i worked (a |an |one |two |three |several )|it's my (first|second|third|fourth|fifth) day|(a |the |one )?(customer|client|guest|manager|coworker|colleague|employee|woman|man|person|someone) (came|called|walked|asked|needed|wanted|was) |i (worked with|dealt with|sat with|met with|partnered with) (a |an |the |one ))\b/i.test(lower);
  const hasAction = /\b(i (decided|chose|implemented|developed|created|built|designed|led|managed|organized|initiated|proposed|analyzed|researched|pushed back|pulled up|showed them|offered|recommended|suggested|explained to|convinced|presented|established|introduced|set up|brought up|raised|spoke up|spoke out|voiced|expressed|addressed|challenged|confronted|questioned|flagged|highlighted|pointed out|identified|discovered|noticed|rewrote|rebuilt|personally|audited|trained|coordinated|negotiated|facilitated|prioritized|evaluated|streamlined|optimized|automated|mentored|delegated|supervised|monitored|launched|tested|reviewed|resolved|investigated|restructured|overhauled|piloted|spearheaded|drafted|consolidated|stripped|replaced|switched|removed|updated|modified|migrated|refactored|renamed)|we (eventually|ultimately|traced|found|discovered|figured|investigated|identified|narrowed|confirmed|realized|decided|chose|built|implemented|deployed|rolled out|shipped|added|switched|instrumented|updated|changed|modified|replaced|removed|stripped|fixed|migrated)|my approach (was|is|would be|starts)|i took (the|a) |steps i took|what i (did|changed|started|began|did differently) (was|is|doing)?|what i('ve| have) (changed|done|learned|built|started|begun) (since then|is|was|after)?|i started (by|to|\w+ing)|i (just )?(said|told|asked|went|got|came|ran|fixed|showed|stayed|called|stepped|grabbed|apologized)|i didn't (argue|fight|push|wait|hesitate|make excuses)|i came in (early|an hour|a few|before)|i'd (be honest|just|rather|ask|commit|focus|tell|try|stay)|i worked (with|on|closely)|i (spent|took) .{1,20} (building|working|developing|learning|using|diving|studying|researching|investigating|analyzing|reviewing|reading|exploring|preparing)|i'd (add|implement|design|build|create|establish|propose|run|set up|structure|approach|want to|like to|ask|use|store|return|focus|instrument|look|pull|check|compare|post|write|draft|spend|send|pick|go with|prefer|do|let|drop|tell|handle|cover|prep|start|work|grab|catch|call|flag|escalate|notify|prioritize|communicate|assess|figure|manage|complete|finish)|my (actual )?(sequence|process|steps|method|plan)( (is|are|was))?)\b/i.test(lower);
  const hasResult = /\b(result(ed)? (in|was)|the outcome|as a (direct )?result|which led to|improved (by|our|the|from)|increased (by|our|the)|reduced (by|our|the)|achieved|successfully completed|ultimately|this (led to|resulted|meant)|impact was|saved (them|us|the)|completed (the|it|our|with)|team appreciated|my (manager|supervisor|boss|lead|team) (said|noted|told me|confirmed|recognized|appreciated)|ended up (with|saving|improving|going with|deciding on|choosing|adopting)|(the|that) outcome (validated|confirmed|proved|demonstrated)|dropped (by|from|to)|reached \d|recognized (the|as|our|it)|adopted (our|my|the|it)|delivered (the|it|our|a)|grew (by|to)|\d+ (weeks?|months?) ahead|became the|renewed (their|the|our)|\d+\s*percent (accuracy|improvement|increase|reduction|compliance)|shaped how (i|we)|changed how (i|we)|taught (me|us)|in (hindsight|retrospect)|that (experience|taught|showed|proved|confirmed)|now (i|we) (always|make sure|know|understand)|(it|which|that) (broke|changed|shifted|reset) the (pattern|dynamic|habit|cycle)|i('m| am) (genuinely|meaningfully|much|significantly|noticeably)? better (at|now|with)|i('ve| have) (genuinely|meaningfully|much|significantly|noticeably)? gotten better (at|now|with)|that (usually|often|always) tells (you|us|me)|what (i've|we've) found .{0,15}(is|was)|the (thing|part|failure mode|scenario|case|risk|question) (i'd|i would) be most (paranoid|worried|concerned|nervous) about|the real (design|question|issue|lesson)? (question )?is (that|whether|how|what|not|never)|after (that|the incident|this|those) (i|we) (rewrote|changed|rebuilt|created|built|implemented|added|introduced|established|updated|redesigned|modified)|the thing (i'd|i would) tell (anyone|someone|every engineer|people)|(this|that|which|it) prevents (the|a|duplicate|multiple|conflicting|us from)|that's when i (stopped|started|began|realized|shifted|became|changed|moved|switched)|what i find (technically )?(interesting|fascinating|clever|notable|impressive|worth noting) (about|is|here)|(by|at|in) the end|(she|he|they) (thanked|appreciated|recognized|acknowledged)( me\b| that\b)?|my manager (mentioned|noted)|(she|he|they) said (i|we|it|that)|that (taught|showed|changed) (me|us)|i was (cross-trained|promoted|offered|moved)|within (a few|several|two|three|six) (weeks|months|days)|people (quit|left|stayed)|after the (rush|shift|event|game|meeting|call)|(almost|nearly|significantly) (eliminated|reduced|removed|fixed|resolved)|(she|he|they) came back|(they|she|he|we) signed|referred (two|three|four|five|six|seven|eight|nine|ten|several|\d+)|(was|became) (my|our) best)\b/i.test(lower);

  const parts = { context: hasContext, action: hasAction, result: hasResult };
  const partsHit = [hasContext, hasAction, hasResult].filter(Boolean).length;

  let score, label;
  if (partsHit === 3)      { score = 100; label = 'Well Structured'; }
  else if (partsHit === 2) { score = 65;  label = 'Partial Structure'; }
  else if (partsHit === 1) { score = 30;  label = 'Needs Structure'; }
  else                     { score = 20;  label = 'Unstructured'; }

  return { score, parts, label };
}

// ---- Key Topics Extraction ------------------------------------------------
function extractTopics(transcript, question) {
  if (!transcript || transcript.length < 10) return [];

  // Strip contractions before extracting words so "weren't" → "were not" instead of "weren"+"t"
  const cleaned = transcript.toLowerCase()
    .replace(/n't\b/g, ' not')
    .replace(/'s\b/g, '')
    .replace(/'re\b/g, ' are')
    .replace(/'ve\b/g, ' have')
    .replace(/'ll\b/g, ' will')
    .replace(/'d\b/g, ' would');
  const words = cleaned.match(/\b[a-z]{3,}\b/g) || [];
  const ngrams = {};

  for (let i = 0; i < words.length; i++) {
    // Unigrams — content words only, 5+ chars, exclude filler words
    if (!STOP_WORDS.has(words[i]) && !FILLER_SET.has(words[i]) && !INTERVIEW_NOISE.has(words[i]) && words[i].length >= 5) {
      ngrams[words[i]] = (ngrams[words[i]] || 0) + 1;
    }
    // Bigrams — both non-stop, at least one word 5+ chars for substance
    if (i < words.length - 1) {
      if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])
          && words[i].length >= 3 && words[i + 1].length >= 3
          && (words[i].length >= 5 || words[i + 1].length >= 5)) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        ngrams[bigram] = (ngrams[bigram] || 0) + 1;
      }
    }
  }

  // Generic filler bigrams to skip
  const JUNK_TOPICS = new Set([
    'good idea','bad idea','great job','long time','hard time','big deal',
    'lot of','kind of','sort of','end of','some of','most of','all of',
    'able to','want to','need to','have to','going to','trying to',
    'worked out','turned out','ended up','came back','went well',
  ]);

  const questionLower = (question || '').toLowerCase();
  const scored = Object.entries(ngrams)
    .filter(([term]) => !JUNK_TOPICS.has(term))
    .map(([term, freq]) => {
      // Bigrams only get a bonus if they recur (single-occurrence = accidental adjacency)
      const lengthBonus = term.includes(' ') ? (freq >= 2 ? 2.5 : 0.7) : 1;
      const questionPenalty = questionLower.includes(term) ? 0.2 : 1;
      return { term, score: freq * lengthBonus * questionPenalty };
    })
    .filter(t => t.score >= 1.0)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const item of scored) {
    if (selected.length >= 5) break;
    const isDuplicate = selected.some(s => {
      if (s.term.includes(item.term) || item.term.includes(s.term)) return true;
      // Block bigrams that share a significant word with an already-selected topic
      const sWords = s.term.split(' ');
      const iWords = item.term.split(' ');
      return sWords.some(w => w.length >= 4 && iWords.includes(w));
    });
    if (!isDuplicate) selected.push(item);
  }

  return selected.map(s => s.term);
}

// ---- Question Relevance ---------------------------------------------------
function computeRelevance(transcript, question) {
  if (!question || question.length < 10) return 100;

  // Filter out generic question verbs that rarely appear in answers
  const Q_VERBS = new Set(['describe','explain','share','discuss','provide','elaborate','example','walk']);
  const qWords = question.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const qContent = [...new Set(qWords.filter(w => !STOP_WORDS.has(w) && !Q_VERBS.has(w)))];
  if (qContent.length < 2) return 100; // too few content words to judge

  const answerLower = transcript.toLowerCase();
  const hits = qContent.filter(w => {
    // Stem-match: use first 6 chars to handle "troubleshoot" ↔ "troubleshooting"
    // (5 was too short — "compl" matched "complicated" for "compliance")
    const stem = w.length > 6 ? w.slice(0, 6) : w;
    return new RegExp(`\\b${stem}\\w*`, 'i').test(answerLower);
  });

  return Math.round((hits.length / qContent.length) * 100);
}

// ---- Keyword Hit Rate (stem-matching, mirrors grading.js relaxed logic) ---
// Returns { pct, hits, misses } — hits/misses are the original key strings.
function keywordHitRate(transcript, keys) {
  if (!keys || keys.length === 0) return { pct: 50, hits: [], misses: [] };
  const lower = transcript.toLowerCase();
  const hits = [];
  const misses = [];
  keys.forEach((k) => {
    const keyLower = k.toLowerCase();
    let matched = false;
    if (lower.includes(keyLower)) {
      matched = true;
    } else {
      // Relaxed stem match: >= half of significant words (4+ chars) must appear.
      // Mirrors gradeAnswer() in grading.js — abstract keyword phrases rarely
      // appear verbatim but paraphrased answers should still score.
      const sigWords = keyLower.match(/\b[a-z]{4,}\b/g);
      if (sigWords && sigWords.length > 0) {
        const matchedWords = sigWords.filter(sw => {
          const stem = sw.length > 5 ? sw.slice(0, 5) : sw;
          return new RegExp(`\\b${stem}\\w*`, 'i').test(lower);
        });
        if (matchedWords.length >= Math.ceil(sigWords.length / 2)) matched = true;
      }
    }
    if (matched) hits.push(k);
    else misses.push(k);
  });
  return { pct: Math.round((hits.length / keys.length) * 100), hits, misses };
}

// ---- Score label helper ---------------------------------------------------
function scoreLabel(score) {
  if (score >= 85) return 'Excellent Response';
  if (score >= 70) return 'Good Response';
  if (score >= 55) return 'Decent Response';
  if (score >= 35) return 'Needs Improvement';
  return 'Keep Practicing';
}

// ---- Composite Confidence Score -------------------------------------------
function computeConfidence({ pace, clarity, vocabulary, depth, structure, keywordPct, textMode, wordCount, relevance, questionType = 'behavioral' }) {
  const paceScore =
    pace.quality === 'ideal' ? 100 :
    pace.quality === 'good'  ? 80  :
    pace.quality === 'slow'  ? 40  :
    pace.quality === 'fast'  ? 40  : 50;

  // Length/effort score — rewards substantive responses
  const lengthScore =
    wordCount >= 150 ? 100 :
    wordCount >= 100 ? 80  :
    wordCount >= 60  ? 55  :
    wordCount >= 30  ? 30  : 10;

  // Raw clarity without coherence penalty — used for non-behavioral question types
  // where multi-point answers naturally shift vocabulary (tanking coherence score unfairly)
  const rawClarityScore = clarity.fillerCount !== undefined
    ? Math.round(Math.max(0, Math.min(100, 100 - (clarity.fillerCount / Math.max(wordCount, 1)) * 500)))
    : clarity.score;

  // Additive relevance blend: prevents floor-binding by smoothly interpolating between
  // the raw score and a neutral anchor (45) instead of multiplicative penalization.
  // smoothFactor range: 0.65 (fully off-topic) → 1.0 (fully on-topic)
  const smoothFactor = 0.65 + 0.35 * (relevance / 100);

  // ---- Motivation / opinion questions ----
  // These don't follow CAR structure — score on vocabulary, keyword coverage, delivery.
  if (questionType === 'motivation' || questionType === 'opinion') {
    const motivRaw = textMode
      ? keywordPct * 0.20 + rawClarityScore * 0.25 + vocabulary.score * 0.30 + lengthScore * 0.25
      : keywordPct * 0.20 + rawClarityScore * 0.20 + vocabulary.score * 0.25 + paceScore * 0.10 + lengthScore * 0.25;
    // Motivation/opinion answers naturally have lower keyword relevance — raise smooth floor
    const motivSmooth = Math.max(0.75, smoothFactor);
    const blended = motivRaw * motivSmooth + 45 * (1 - motivSmooth);
    const { slope, intercept } = getCalibration(questionType);
    const motivScore = Math.min(95, Math.max(40, Math.round(slope * blended + intercept)));
    return { score: motivScore, label: scoreLabel(motivScore) };
  }

  // ---- Hypothetical questions ----
  // Candidate is asked what they WOULD do — past examples don't exist.
  // Score on planning clarity, vocabulary, and action orientation.
  if (questionType === 'hypothetical') {
    const hypoDepth = Math.min(100,
      (wordCount >= 80 ? 25 : wordCount >= 60 ? 18 : 10) +
      (structure.score >= 100 ? 35 : structure.score >= 65 ? 20 : structure.score >= 30 ? 8 : 0) +
      (depth.hasNumbers ? 15 : 0) +
      (rawClarityScore >= 90 ? 20 : rawClarityScore >= 70 ? 10 : 0)
    );
    const hypoRaw = textMode
      ? rawClarityScore * 0.35 + vocabulary.score * 0.30 + hypoDepth * 0.20 + keywordPct * 0.15
      : rawClarityScore * 0.30 + vocabulary.score * 0.25 + hypoDepth * 0.20 + paceScore * 0.10 + keywordPct * 0.15;
    const hypoSmooth = Math.max(0.72, smoothFactor);
    const blended = hypoRaw * hypoSmooth + 45 * (1 - hypoSmooth);
    const { slope, intercept } = getCalibration('hypothetical');
    const hypoScore = Math.min(95, Math.max(40, Math.round(slope * blended + intercept)));
    return { score: hypoScore, label: scoreLabel(hypoScore) };
  }

  // ---- Standard behavioral / general formula ----
  const raw = textMode
    ? keywordPct        * 0.10 +
      clarity.score     * 0.15 +
      depth.score       * 0.30 +
      structure.score   * 0.20 +
      vocabulary.score  * 0.10 +
      lengthScore       * 0.15
    : keywordPct        * 0.10 +
      clarity.score     * 0.15 +
      depth.score       * 0.25 +
      structure.score   * 0.15 +
      vocabulary.score  * 0.10 +
      lengthScore       * 0.10 +
      paceScore         * 0.15;

  const blended = raw * smoothFactor + 45 * (1 - smoothFactor);
  const { slope, intercept } = getCalibration('behavioral');
  const score = Math.min(95, Math.max(40, Math.round(slope * blended + intercept)));
  return { score, label: scoreLabel(score) };
}

// ---- Coaching Tip ---------------------------------------------------------
function generateCoachingTip({ pace, clarity, depth, structure, vocabulary, confidence, textMode, relevance }) {
  const tips = [];

  if (relevance !== undefined && relevance === 0) {
    tips.push({ p: 0, text: 'Answer may be off-topic — address the specific scenario asked' });
  } else if (relevance !== undefined && relevance <= 30) {
    tips.push({ p: 0.3, text: 'Address the question more directly — echo key themes from the prompt' });
  }
  if (clarity.coherence !== undefined && clarity.coherence < 0.65) {
    tips.push({ p: 0.5, text: 'Stay on one topic — finish each thought before moving on' });
  }
  if (structure.score < 50) {
    tips.push({ p: 1, text: 'Use CAR method: Context → Action → Result' });
  }
  if (clarity.fillerCount > 3) {
    tips.push({ p: 2, text: `${clarity.fillerCount} filler words — pause instead of "um" or "like"` });
  }
  if (!depth.hasExamples) {
    tips.push({ p: 3, text: 'Add a specific example from a past role' });
  }
  if (!depth.hasNumbers) {
    tips.push({ p: 4, text: 'Quantify impact with numbers (e.g. "improved by 30%")' });
  }
  if (!textMode && pace.quality === 'fast') {
    tips.push({ p: 5, text: `${pace.wpm} WPM is fast — slow down slightly` });
  }
  if (!textMode && pace.quality === 'slow') {
    tips.push({ p: 5, text: `${pace.wpm} WPM is slow — aim for 120-160 WPM` });
  }
  if (vocabulary.score < 40) {
    tips.push({ p: 6, text: 'Vary word choice — use domain-specific terms' });
  }
  if (confidence.score >= 80) {
    tips.push({ p: 10, text: 'Strong answer — well-structured with specific details' });
  } else if (confidence.score >= 60) {
    tips.push({ p: 9, text: 'Solid foundation — one more example or metric would strengthen it' });
  }

  tips.sort((a, b) => a.p - b.p);
  const result = tips.slice(0, 3).map(t => t.text);
  return result.length > 0 ? result : ['Structure with situation → actions → measurable results'];
}

// ---- Question Type Detection ----------------------------------------------
function detectQuestionType(question) {
  if (!question) return 'behavioral';
  const q = question.toLowerCase();
  if (/what questions|do you have.*question|anything.*ask|haven.t covered|want to ask|like to ask/i.test(q)) return 'follow_up';
  if (/how would you|what would you do if|if you were (scheduled|asked|put|given)|if you had to|walk (me )?through how you('d| would|d )|how do you (\w+ )?(handle|approach|deal with|respond to|react to)|what do you do\b/i.test(q)) return 'hypothetical';
  if (/why (do|did|would) you want|what (made|makes|drew|attracted|draws|got) you|why (apply|choose|pick|come here|chipotle|this company|this role)|why (\w+ ){1,3}(specifically|over|rather|versus|vs)\b|why \w+ instead of/i.test(q)) return 'motivation';
  if (/what does .* (look like|mean) to you|what is .* to you|what do you (think|believe|consider)|something .* (don.t|people) understand|what.s something|what do (most|many) people (not |)?(understand|know|realize|get wrong)|if (i|we|you) asked.*(supervisor|manager|boss|coworker).*(say|tell|describe)|what would (your|your last|your previous) (supervisor|manager|boss)|what.s your (biggest|main|greatest|primary) (weakness|strength|challenge|limitation|flaw)/i.test(q)) return 'opinion';
  return 'behavioral';
}

// ---- Master Analyzer ------------------------------------------------------
export function analyzeAnswer({ transcript, timeUsed, wordCount, keys, question, textMode = false }) {
  if (!transcript || wordCount === 0) return null;

  const questionType = detectQuestionType(question);
  const rawCoherence = measureCoherence(transcript);
  const structure = computeStructure(transcript);

  // Structure-aware coherence: well-structured CAR answers naturally shift vocabulary
  // between context/action/result segments, producing low segment overlap.
  // Boost coherence based on structure so this doesn't falsely tank clarity/vocabulary.
  // Long answers (200+ words) with no detected CAR structure are usually opinion/design
  // questions where vocab diversity is intentional — apply a soft floor.
  const coherence = structure.score >= 100
    ? Math.max(rawCoherence, 0.85)   // full CAR: vocab shift is expected
    : structure.score >= 65
      ? Math.max(rawCoherence, 0.70) // partial structure: moderate protection
      : (questionType === 'motivation' || questionType === 'opinion' || questionType === 'hypothetical')
        ? Math.max(rawCoherence, 0.75) // motivation/opinion/hypothetical: multi-point answers, floor at 0.75
        : wordCount >= 200
          ? Math.max(rawCoherence, 0.75) // long answer, no CAR — likely opinion/design
          : wordCount >= 40
            ? Math.max(rawCoherence, 0.60) // medium answer: prevent coherence from tanking clarity/vocab
            : rawCoherence;                // short/weak: raw signal is meaningful

  const pace = computePace(wordCount, timeUsed);
  const clarity = computeClarity(transcript, wordCount, coherence);
  const vocabulary = computeVocabulary(transcript, coherence);
  const depth = computeDepth(transcript, wordCount);
  const topics = extractTopics(transcript, question);

  const kwResult = keywordHitRate(transcript, keys);
  const keywordPct = kwResult.pct;

  // Blend question-word relevance with keyword coverage — keywords ARE the question's domain
  // so 100% keyword hits should give at least ~70% relevance, not 20%
  const qRelevance = computeRelevance(transcript, question);
  const relevance = Math.max(qRelevance, Math.round(keywordPct * 0.7));

  // Raw feature vector — mirrors training record schema for multi-feature calibration
  const fillerCount = clarity.fillerCount ?? 0;
  const rawFeatures = {
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
    keywordMatchRate: kwResult.pct,
    carParts: [structure.parts?.context, structure.parts?.action, structure.parts?.result].filter(Boolean).length,
    hasNumbers:  depth.hasNumbers,
    hasExamples: depth.hasExamples,
  };

  // Follow-up questions ("what questions do you have for me") need entirely different scoring.
  // No CAR structure or examples expected — score on question count, specificity, vocabulary.
  if (questionType === 'follow_up') {
    const qCount = (transcript.match(/\?/g) || []).length;
    // Use raw vocab ratio (not coherence-penalized score) since short answers are capped unfairly
    const rawVocabScore = Math.round(Math.max(0, Math.min(100, (vocabulary.ratio / 100 - 0.35) * 220)));
    const rawVocabCapped = wordCount < 30 ? Math.min(rawVocabScore, 30) : rawVocabScore;
    const followUpRaw = Math.round(Math.min(88, Math.max(40,
      40 + Math.min(qCount * 10, 30) + Math.min(wordCount / 5, 15) + rawVocabCapped * 0.10
    )));
    const multiScore = applyMultiCalibration(rawFeatures, 'follow_up');
    const followUpScore = multiScore !== null ? multiScore : followUpRaw;
    const confidence = { score: followUpScore, label: scoreLabel(followUpScore) };
    const coaching = generateCoachingTip({ pace, clarity, depth, structure, vocabulary, confidence, textMode, relevance });
    return { questionType, confidence, pace, clarity, vocabulary, depth, topics, structure, coaching, relevance, coherence, keywordBreakdown: kwResult };
  }

  const confidence = computeConfidence({ pace, clarity, vocabulary, depth, structure, keywordPct, textMode, wordCount, relevance, questionType });
  // Override with multi-feature model when learned weights are available
  const multiScore = applyMultiCalibration(rawFeatures, questionType);
  if (multiScore !== null) {
    confidence.score = multiScore;
    confidence.label = scoreLabel(multiScore);
  }
  const coaching = generateCoachingTip({ pace, clarity, depth, structure, vocabulary, confidence, textMode, relevance });

  return { questionType, confidence, pace, clarity, vocabulary, depth, topics, structure, coaching, relevance, coherence, keywordBreakdown: kwResult };
}
