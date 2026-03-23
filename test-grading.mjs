/**
 * InterviewMe Grading Self-Test
 * Run:  node test-grading.mjs
 * Requires dev server on port 3001 (node server.js)
 *
 * Tests:
 *  1. AI grade accuracy — weak/mid/strong answers across 8 job types
 *  2. Question type detection — all 5 types
 *  3. Score ordering — strong must beat mid, mid must beat weak (per type)
 */

const BASE = 'http://localhost:3001';
const GRADE_URL = `${BASE}/api/grade`;

// ── ANSI colours ─────────────────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;  // green
const R = (s) => `\x1b[31m${s}\x1b[0m`;  // red
const Y = (s) => `\x1b[33m${s}\x1b[0m`;  // yellow
const B = (s) => `\x1b[1m${s}\x1b[0m`;   // bold
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

// ── Grade helper ──────────────────────────────────────────────────────────────
async function gradeOne(jobTitle, company, question, answer) {
  const res = await fetch(GRADE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions: [{ question, answer }], jobTitle, company }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { pct: data.grades?.[0]?.pct, fb: data.grades?.[0]?.fb };
}

// ── Question type detection (mirrors answerAnalytics.js) ────────────────────
function detectType(q) {
  if (!q) return 'behavioral';
  const s = q.toLowerCase();
  if (/what questions|do you have.*question|anything.*ask|haven.t covered|want to ask|like to ask/i.test(s)) return 'follow_up';
  if (/how would you|what would you do if|if you were (scheduled|asked|put|given)|if you had to|walk (me )?through how you('d| would|d )|how do you (\w+ )?(handle|approach|deal with|respond to|react to)|what do you do\b/i.test(s)) return 'hypothetical';
  if (/why (do|did|would) you want|what (made|makes|drew|attracted|draws|got) you|why (apply|choose|pick|come here|chipotle|this company|this role)|why (\w+ ){1,3}(specifically|over|rather|versus|vs)\b|why \w+ instead of/i.test(s)) return 'motivation';
  if (/what does .* (look like|mean) to you|what is .* to you|what do you (think|believe|consider)|something .* (don.t|people) understand|what.s something|what do (most|many) people (not |)?(understand|know|realize|get wrong)|if (i|we|you) asked.*(supervisor|manager|boss|coworker).*(say|tell|describe)|what would (your|your last|your previous) (supervisor|manager|boss)|what.s your (biggest|main|greatest|primary) (weakness|strength|challenge|limitation|flaw)/i.test(s)) return 'opinion';
  return 'behavioral';
}

// ── Test cases ────────────────────────────────────────────────────────────────
const TESTS = [
  // ── 1. BEHAVIORAL — Sales ──
  {
    id: 'sales-beh-weak', jobTitle: 'Sales Rep', company: 'SolarCity',
    question: 'Tell me about a time you handled a difficult customer.',
    answer: 'I deal with difficult customers all the time. I just stay calm and try to help them.',
    quality: 'weak', expectRange: [40, 67], expectedType: 'behavioral',
  },
  {
    id: 'sales-beh-mid', jobTitle: 'Sales Rep', company: 'SolarCity',
    question: 'Tell me about a time you handled a difficult customer.',
    answer: 'One time a customer was upset about a billing issue. I listened carefully, apologized sincerely, and worked with my manager to issue a credit. They ended up staying with us.',
    quality: 'mid', expectRange: [68, 84], expectedType: 'behavioral',
  },
  {
    id: 'sales-beh-strong', jobTitle: 'Sales Rep', company: 'SolarCity',
    question: 'Tell me about a time you handled a difficult customer.',
    answer: 'At AT&T, I had a customer threatening to cancel their $2,400/year plan over a billing error. I pulled up the account, identified three months of incorrect charges, issued a $180 credit on the spot, and upgraded them to a bundled plan that saved them $50/month. They stayed and referred two friends. My customer retention rate that quarter was 94%, highest on the team.',
    quality: 'strong', expectRange: [83, 100], expectedType: 'behavioral',
  },

  // ── 2. MOTIVATION — Tech ──
  {
    id: 'tech-motiv-weak', jobTitle: 'Software Engineer', company: 'Google',
    question: 'Why do you want to work at Google?',
    answer: "Google is a great company and I want to work somewhere good.",
    quality: 'weak', expectRange: [40, 67], expectedType: 'motivation',
  },
  {
    id: 'tech-motiv-mid', jobTitle: 'Software Engineer', company: 'Google',
    question: 'Why do you want to work at Google?',
    answer: "I'm passionate about software and Google's scale is unmatched. I've built distributed systems for 5 years and want to work on problems that impact billions of users.",
    quality: 'mid', expectRange: [68, 84], expectedType: 'motivation',
  },
  {
    id: 'tech-motiv-strong', jobTitle: 'ML Engineer', company: 'Google',
    question: 'Why do you want to work at Google?',
    answer: "I've been following Google Brain's work on transformer efficiency since 'Attention is All You Need'. At Meta I built recommendation systems serving 300M requests/day and published a paper on quantization that reduced inference cost 40%. Google's infrastructure and research culture are the only place I can push that work further — specifically I want to join the Gemini efficiency team.",
    quality: 'strong', expectRange: [85, 100], expectedType: 'motivation',
  },

  // ── 3. OPINION — Healthcare ──
  {
    id: 'health-opin-weak', jobTitle: 'Registered Nurse', company: 'Kaiser',
    question: 'What does good patient care look like to you?',
    answer: 'Good patient care means helping patients feel better and being kind to them.',
    quality: 'weak', expectRange: [40, 67], expectedType: 'opinion',
  },
  {
    id: 'health-opin-strong', jobTitle: 'Registered Nurse', company: 'Kaiser',
    question: 'What does good patient care look like to you?',
    answer: "Good care means treating the whole person, not just the diagnosis. On my unit I noticed post-op anxiety was extending recovery times, so I started 10-minute pre-surgery education sessions explaining exactly what patients would feel and see. Our anxiety scores dropped 40% and average recovery time shortened by half a day. Care that anticipates needs rather than just reacts to them is what separates good from great.",
    quality: 'strong', expectRange: [85, 100], expectedType: 'opinion',
  },

  // ── 4. HYPOTHETICAL — Finance ──
  {
    id: 'finance-hypo-weak', jobTitle: 'Financial Analyst', company: 'JPMorgan',
    question: 'How would you handle discovering a significant financial discrepancy in a client account?',
    answer: "I would tell my boss about it.",
    quality: 'weak', expectRange: [40, 67], expectedType: 'hypothetical',
  },
  {
    id: 'finance-hypo-mid', jobTitle: 'Financial Analyst', company: 'JPMorgan',
    question: 'How would you handle discovering a significant financial discrepancy in a client account?',
    answer: "I'd first document exactly what I found with timestamps and amounts, then escalate immediately to my supervisor and compliance. I'd notify the client only after consulting legal to ensure proper disclosure procedures are followed. I'd avoid touching the affected data to preserve the audit trail.",
    quality: 'mid', expectRange: [68, 84], expectedType: 'hypothetical',
  },
  {
    id: 'finance-hypo-strong', jobTitle: 'Financial Analyst', company: 'JPMorgan',
    question: 'How would you handle discovering a significant financial discrepancy in a client account?',
    answer: "I'd follow a three-step process. First, document everything immediately — screenshot the discrepancy with timestamps, record the exact dollar amount and which accounts are affected, and save it to a secure audit log. Second, escalate within the hour to my direct supervisor and the compliance team — never try to resolve a discrepancy independently or discuss it with other clients. Third, work with compliance on client notification: depending on the size, SEC Rule 17a-3 may require formal reporting within a specific window. In a previous role at Fidelity I caught a $47K reconciliation error that turned out to be a systems bug affecting 12 accounts — by following this protocol we corrected all accounts within 48 hours and the client renewed their contract.",
    quality: 'strong', expectRange: [85, 100], expectedType: 'hypothetical',
  },

  // ── 5. FOLLOW-UP ──
  {
    id: 'follow-weak', jobTitle: 'Manager', company: 'Starbucks',
    question: 'Do you have any questions for us?',
    answer: "No, I think I'm good. Thanks.",
    quality: 'weak', expectRange: [0, 67], expectedType: 'follow_up',
  },
  {
    id: 'follow-strong', jobTitle: 'Manager', company: 'Starbucks',
    question: 'Do you have any questions for us?',
    answer: "Yes — three things. First, how do you define success for this role in the first 90 days? Second, what's the biggest challenge the team is currently facing that you'd want this person to help solve? And third, how has the company's culture around work-life balance evolved recently — I want to understand what the realistic day-to-day looks like for your managers.",
    quality: 'strong', expectRange: [72, 92], expectedType: 'follow_up',
  },

  // ── 6. BEHAVIORAL — Customer Service ──
  {
    id: 'cs-beh-weak', jobTitle: 'Customer Service Rep', company: 'Amazon',
    question: 'Tell me about a time you went above and beyond for a customer.',
    answer: 'I always try to go above and beyond. I work really hard for every customer I help.',
    quality: 'weak', expectRange: [40, 67], expectedType: 'behavioral',
  },
  {
    id: 'cs-beh-strong', jobTitle: 'Customer Service Rep', company: 'Amazon',
    question: 'Tell me about a time you went above and beyond for a customer.',
    answer: "During a winter storm, an elderly customer called our pharmacy panicking — she was out of insulin and couldn't drive. I was off the clock but drove 20 minutes to deliver her medication personally. The next day she brought cookies for the whole team. Beyond that, I documented the incident and worked with my manager to create a formal 'critical medication delivery' protocol. We've used it eight times since, and it's now part of new employee training.",
    quality: 'strong', expectRange: [85, 100], expectedType: 'behavioral',
  },

  // ── 7. MOTIVATION — Creative ──
  {
    id: 'creative-motiv-mid', jobTitle: 'Graphic Designer', company: 'TBWA',
    question: 'Why do you want to work at our agency?',
    answer: "I've admired TBWA's Disruption methodology for years. I want to work on campaigns that genuinely challenge category conventions rather than just executing safe briefs.",
    quality: 'mid', expectRange: [68, 84], expectedType: 'motivation',
  },

  // ── 8. BEHAVIORAL — Management ──
  {
    id: 'mgmt-beh-strong', jobTitle: 'Store Manager', company: 'Target',
    question: 'Tell me about a time you turned around a low-performing team.',
    answer: "When I took over the Fresno location, turnover was 85% annually and we were bottom 10% in district for customer satisfaction. I started with 1-on-1s with every team member to understand root causes — discovered scheduling was erratic and raises were tied to unclear criteria. I created a fixed-schedule rotation and published a transparent performance rubric. Over 6 months, turnover dropped to 34%, customer satisfaction improved from 72nd to 11th percentile in the district, and we hit 103% of our quarterly sales target.",
    quality: 'strong', expectRange: [88, 100], expectedType: 'behavioral',
  },

  // ── 9. COMPLETELY OFF-TOPIC (should cap at 64) ──
  {
    id: 'off-topic', jobTitle: 'Engineer', company: 'Tesla',
    question: 'Tell me about a time you showed leadership.',
    answer: 'I went to the grocery store last Tuesday and bought some apples. The store was busy.',
    quality: 'weak', expectRange: [0, 64], expectedType: 'behavioral',
  },
];

// ── Question type detection tests ─────────────────────────────────────────────
const TYPE_TESTS = [
  { q: 'Tell me about a time you led a team.',                              expect: 'behavioral' },
  { q: 'Why do you want to work at Apple specifically?',                   expect: 'motivation' },
  { q: 'What drew you to this role?',                                      expect: 'motivation' },
  { q: 'What does success look like to you?',                              expect: 'opinion' },
  { q: "What's your biggest weakness?",                                    expect: 'opinion' },
  { q: 'How would you handle a conflict between two team members?',        expect: 'hypothetical' },
  { q: 'What would you do if you missed a critical deadline?',             expect: 'hypothetical' },
  { q: 'Do you have any questions for us?',                                expect: 'follow_up' },
  { q: "Is there anything we haven't covered that you'd like to mention?", expect: 'follow_up' },
  { q: 'Walk me through your resume.',                                     expect: 'behavioral' },
  { q: 'What do you think about the future of AI in healthcare?',         expect: 'opinion' },
  { q: 'If you had to redesign our onboarding process, how would you do it?', expect: 'hypothetical' },
];

// ── Run ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(B('\n═══════════════════════════════════════════════════'));
  console.log(B('  InterviewMe — Self-Test Suite'));
  console.log(B('═══════════════════════════════════════════════════\n'));

  // ── Part 1: Question type detection ──
  console.log(B('┌─ PART 1: Question Type Detection ─────────────────'));
  let typePass = 0, typeFail = 0;
  for (const t of TYPE_TESTS) {
    const got = detectType(t.q);
    const ok = got === t.expect;
    if (ok) typePass++; else typeFail++;
    const icon = ok ? G('✓') : R('✗');
    const label = ok ? DIM(got) : R(`got ${got}, expected ${t.expect}`);
    console.log(`  ${icon}  ${t.q.slice(0, 60).padEnd(60)} ${label}`);
  }
  console.log(`\n  ${G(typePass + ' passed')}  ${typeFail > 0 ? R(typeFail + ' failed') : DIM('0 failed')}\n`);

  // ── Part 2: AI grade accuracy ──
  console.log(B('┌─ PART 2: AI Grade Accuracy ────────────────────────'));
  console.log(DIM('  (This makes real API calls — may take ~60s)\n'));

  const results = [];
  let aiPass = 0, aiFail = 0;

  for (const t of TESTS) {
    process.stdout.write(`  Grading ${t.id.padEnd(25)} `);
    try {
      const { pct, fb } = await gradeOne(t.jobTitle, t.company, t.question, t.answer);
      const inRange = pct >= t.expectRange[0] && pct <= t.expectRange[1];
      if (inRange) { aiPass++; } else { aiFail++; }
      const icon = inRange ? G('✓') : R('✗');
      const range = `[${t.expectRange[0]}-${t.expectRange[1]}]`;
      const score = inRange ? G(String(pct)) : R(String(pct));
      console.log(`${icon}  ${t.quality.padEnd(7)} ${score.padEnd(20)} expected ${range}  ${DIM(fb || '')}`);
      results.push({ ...t, pct, inRange });
    } catch (e) {
      console.log(R(`ERROR: ${e.message}`));
      results.push({ ...t, pct: null, inRange: false });
      aiFail++;
    }
    // Anthropic free tier: 5 req/min → wait 13s between calls
    await new Promise((r) => setTimeout(r, 13_000));
  }

  // ── Part 3: Score ordering (strong > mid > weak per category) ─────────────
  console.log(B('\n┌─ PART 3: Score Ordering (strong > mid > weak) ────'));
  const groups = {};
  for (const r of results) {
    const key = r.id.replace(/-weak|-mid|-strong/, '');
    if (!groups[key]) groups[key] = {};
    groups[key][r.quality] = r.pct;
  }

  let orderPass = 0, orderFail = 0;
  for (const [key, g] of Object.entries(groups)) {
    if (g.strong != null && g.weak != null) {
      const ok = g.strong > g.weak;
      if (ok) orderPass++; else orderFail++;
      const icon = ok ? G('✓') : R('✗');
      const detail = `weak=${g.weak ?? '–'}  mid=${g.mid ?? '–'}  strong=${g.strong ?? '–'}`;
      console.log(`  ${icon}  ${key.padEnd(22)} ${ok ? G(detail) : R(detail)}`);
    }
    if (g.strong != null && g.mid != null) {
      const ok = g.strong >= g.mid;
      if (!ok) {
        orderFail++;
        console.log(`  ${R('✗')}  ${key.padEnd(22)} ${R(`strong(${g.strong}) < mid(${g.mid}) — ordering broken`)}`);
      }
    }
  }
  console.log(`\n  ${G(orderPass + ' passed')}  ${orderFail > 0 ? R(orderFail + ' failed') : DIM('0 failed')}\n`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(B('═══════════════════════════════════════════════════'));
  const totalPass = typePass + aiPass + orderPass;
  const totalFail = typeFail + aiFail + orderFail;
  const pct = Math.round((totalPass / (totalPass + totalFail)) * 100);
  const summary = `  ${totalPass} passed  ${totalFail} failed  (${pct}%)`;
  console.log(totalFail === 0 ? G(summary) : totalFail <= 2 ? Y(summary) : R(summary));
  console.log(B('═══════════════════════════════════════════════════\n'));

  if (aiFail > 0) {
    console.log(Y('Note: AI score failures may indicate calibration drift — consider running /api/optimize-calibration.\n'));
  }

  process.exit(totalFail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(R('\nFatal error: ' + e.message));
  process.exit(1);
});
