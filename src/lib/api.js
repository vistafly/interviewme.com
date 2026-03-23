const SYSTEM_PROMPT = `You are a real hiring manager — not a chatbot, not a textbook. You've read this candidate's resume, you have 30 minutes, and you want to know who this person actually is. Generate exactly 10 questions.

IMPORTANT: The job description MUST be a real, detailed job posting. If the input is clearly not a real job description (e.g. random words, "test", gibberish, too vague to identify a role), respond with:
{"error": "Please provide a real job description with role details, responsibilities, and requirements."}

HOW REAL INTERVIEWERS TALK:
- Short. One sentence. Under 15 words. The best questions are almost casual.
- Never say "Can you walk me through..." or "Describe a time when..." — those are interview-prep clichés.
- Instead, talk like a person: "What pulled you toward this kind of work?" or "Tell me about something you built that didn't go as planned."
- Ask things that make the candidate PAUSE and think — not recite a rehearsed STAR answer.
- Each question should feel slightly uncomfortable in a good way — it should require honesty, not performance.

Examples of surface-level questions (DO NOT generate these):
- "What are your strengths and weaknesses?"
- "Where do you see yourself in 5 years?"
- "Tell me about a time you showed leadership."
- "How do you handle stress?"
- "What's a technical trade-off you've made recently?"

Examples of real, human questions (THIS is the bar):
- "What's the hardest piece of feedback you've gotten, and did you agree with it?"
- "Tell me about a time you were wrong about something at work."
- "If I talked to your last manager, what would they say frustrates them about you?"
- "What part of this job description made you think 'I'm not sure I can do that yet'?"
- "What's something you believe about building software that most people disagree with?"

Each question must be a JSON object with:
- "q": the interview question (string, 1 sentence, under 15 words ideally)
- "tip": honest coaching advice — what the interviewer is ACTUALLY evaluating with this question
- "keys": 5-6 key concepts a strong answer would touch on. Pull these from the job description — specific tools, responsibilities, and values mentioned in the posting.

Question flow (this is a conversation, not a checklist):
1. Warm-up — get them talking about what excites them about THIS specific role
2. Work style — how they actually operate day-to-day, not a hypothetical
3. Conflict or friction — a real moment where things got uncomfortable with a person or team
4. Technical depth — pick ONE specific skill from the job posting and go deep
5. Failure or struggle — something that went wrong and what they actually learned
6. Company motivation — why HERE, what they know about the company, what resonated
7. Honesty check — a question that requires genuine self-reflection, not a polished answer
8. Industry perspective — what they think most people get wrong about this field
9. Scenario challenge — a realistic problem they'd face in the first 90 days
10. Their turn — what they want to know from us (reveals priorities and maturity)

Ground every question in the actual job description. No generic questions that could apply to any role.

Respond with ONLY valid JSON in this format, no markdown wrapping:
{"questions": [...]}`;

export async function generateInterview(jobDescription, companyName, jobTitle, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

  const response = await fetch('/api/interview', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Company: ${companyName}\nJob Title: ${jobTitle}\n\nJob Description:\n${jobDescription}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    // Surface quota_exceeded as a structured error the hook can catch
    if (err.error === 'quota_exceeded') {
      const quotaErr = new Error('quota_exceeded');
      quotaErr.isQuotaError = true;
      quotaErr.isAnon = err.isAnon;
      quotaErr.limit = err.limit;
      throw quotaErr;
    }
    const msg = typeof err.error === 'string'
      ? err.error
      : err.error?.message || `API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.content?.map((b) => b.text || '').join('') || '';
  const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

  // Check if the AI rejected the input
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('Failed to generate questions. Please provide a more detailed job description.');
  }

  return parsed;
}

export async function gradeSession(sessionData, jobTitle, company) {
  const payload = {
    questions: sessionData.map((d) => ({
      question: d.question,
      answer: d.answer || '',
    })),
    jobTitle,
    company,
  };

  const response = await fetch('/api/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = typeof err.error === 'string'
      ? err.error
      : err.error?.message || `Grading API error: ${response.status}`;
    throw new Error(msg);
  }

  return response.json();
}

export function inferJobCategory(jobTitle = '', company = '') {
  const t = (jobTitle + ' ' + company).toLowerCase();
  if (/sale|account|bdr|sdr|d2d|door/.test(t)) return 'Sales';
  if (/engineer|developer|software|data|devops|sre|ml\b|ai\b/.test(t)) return 'Tech';
  if (/nurs|doctor|medic|health|pharma|dental/.test(t)) return 'Healthcare';
  if (/financ|bank|invest|accountan|audit|cpa/.test(t)) return 'Finance';
  if (/support|help desk|customer service/.test(t)) return 'Customer Service';
  if (/manag|director|supervis|\bvp\b|\bceo\b|\bcto\b|chief/.test(t)) return 'Management';
  if (/design|market|content|creative|copy|brand/.test(t)) return 'Creative';
  return 'General';
}

export async function storeTrainingData(records) {
  try {
    await fetch('/api/store-training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
  } catch {
    // fire-and-forget — silently ignore failures
  }
}

export async function getAdminStats(idToken, { dateFrom, dateTo } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set('from', dateFrom);
  if (dateTo) params.set('to', dateTo);
  const qs = params.toString();
  const response = await fetch(`/api/admin-stats${qs ? `?${qs}` : ''}`, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Admin stats error: ${response.status}`);
  }
  return response.json();
}

export async function runOptimization(idToken) {
  const response = await fetch('/api/optimize-calibration', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Optimization error: ${response.status}`);
  }
  return response.json();
}

export async function approveCalibration(idToken) {
  const response = await fetch('/api/approve-calibration', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Approve error: ${response.status}`);
  }
  return response.json();
}

export async function discardCalibration(idToken) {
  const response = await fetch('/api/discard-calibration', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}` },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Discard error: ${response.status}`);
  }
  return response.json();
}

export async function createCheckoutSession(idToken) {
  const response = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start checkout.');
  }

  return response.json(); // { url }
}
