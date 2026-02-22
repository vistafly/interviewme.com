const MOCK_QUESTIONS = [
  {
    q: "Tell me about yourself and why you're interested in this role.",
    tip: "Keep it under 2 minutes. Focus on relevant experience, key achievements, and why this specific role excites you.",
    keys: ["experience", "background", "passionate", "career growth", "skills", "team"]
  },
  {
    q: "Describe a time you had to learn a new technology or tool quickly to deliver on a project.",
    tip: "Use the STAR method: Situation, Task, Action, Result. Emphasize your learning process and the outcome.",
    keys: ["learned quickly", "deadline", "documentation", "hands-on", "delivered", "outcome"]
  },
  {
    q: "Tell me about a time you disagreed with a teammate or manager. How did you handle it?",
    tip: "Show emotional intelligence. Focus on listening, finding common ground, and reaching a productive resolution.",
    keys: ["disagreement", "listened", "perspective", "compromise", "resolved", "professional"]
  },
  {
    q: "Walk me through how you would design and implement a REST API for a new feature.",
    tip: "Discuss endpoints, HTTP methods, data models, authentication, error handling, and testing strategy.",
    keys: ["endpoints", "authentication", "error handling", "database", "testing", "documentation"]
  },
  {
    q: "How do you approach debugging a complex issue in production?",
    tip: "Describe your systematic process: logs, reproduction steps, isolating variables, and preventing recurrence.",
    keys: ["logs", "reproduce", "isolate", "root cause", "monitoring", "prevention"]
  },
  {
    q: "What interests you about our company and our mission?",
    tip: "Show you've done your research. Connect their mission to your personal values and career goals.",
    keys: ["mission", "product", "culture", "growth", "impact", "values"]
  },
  {
    q: "Imagine you're given a project with unclear requirements and a tight deadline. How would you proceed?",
    tip: "Show you can handle ambiguity. Talk about clarifying priorities, communicating with stakeholders, and iterating.",
    keys: ["clarify requirements", "stakeholders", "prioritize", "iterate", "communicate", "MVP"]
  },
  {
    q: "What questions do you have for us about the team or the role?",
    tip: "Ask thoughtful questions about team culture, growth opportunities, tech stack decisions, or current challenges.",
    keys: ["team structure", "growth", "challenges", "tech stack", "mentorship", "roadmap"]
  }
];

function buildMockResponse() {
  return {
    id: 'mock_msg_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: JSON.stringify({ questions: MOCK_QUESTIONS }) }],
    model: 'mock-mode',
    stop_reason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const MOCK_MODE = process.env.MOCK_MODE === 'true';

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1200));
    return res.json(buildMockResponse());
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
