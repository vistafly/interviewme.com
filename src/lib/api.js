const SYSTEM_PROMPT = `You are an expert interview coach. Generate exactly 8 interview questions tailored to the specific role and company provided.

IMPORTANT: The job description MUST be a real, detailed job posting. If the input is clearly not a real job description (e.g. random words, "test", gibberish, too vague to identify a role), respond with:
{"error": "Please provide a real job description with role details, responsibilities, and requirements."}

Each question must be a JSON object with:
- "q": the interview question (string)
- "tip": coaching advice for the candidate (string)
- "keys": 5-6 key phrases that indicate a strong answer (string array). These should be specific, relevant terms and concepts from the job description that a strong candidate would mention — not generic phrases.

Question mix:
1. Opener (tell me about yourself / why this role)
2. Behavioral (past experience)
3. Behavioral (challenge/conflict)
4. Technical/skill-based
5. Technical/skill-based
6. Why this company
7. Situational (hypothetical scenario)
8. Closing (questions for interviewer / final pitch)

All questions must directly reference skills, tools, or responsibilities mentioned in the job description. Do not generate generic interview questions.

Respond with ONLY valid JSON in this format, no markdown wrapping:
{"questions": [...]}`;

export async function generateInterview(jobDescription, companyName, jobTitle) {
  const response = await fetch('/api/interview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    throw new Error(err.error?.message || `API error: ${response.status}`);
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
