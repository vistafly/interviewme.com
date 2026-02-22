import { useState, useCallback } from 'react';
import { generateInterview } from '../lib/api';

const MIN_GENERATING_MS = 5000;

export function useInterviewSetup() {
  // TODO: remove mock defaults before production
  const [jobTitle, setJobTitle] = useState('Senior Frontend Engineer');
  const [jobDescription, setJobDescription] = useState(
    `We are looking for a Senior Frontend Engineer to join our team and help build the next generation of our web platform. You will work closely with designers, product managers, and backend engineers to deliver high-quality user experiences.

Responsibilities:
- Design and implement responsive, accessible UI components using React and TypeScript
- Collaborate with UX designers to translate wireframes and prototypes into polished interfaces
- Optimize application performance including bundle size, rendering speed, and Core Web Vitals
- Write unit and integration tests using Jest and React Testing Library
- Participate in code reviews and mentor junior developers
- Contribute to our design system and shared component library

Requirements:
- 5+ years of professional experience with JavaScript and modern frontend frameworks
- Strong proficiency in React, TypeScript, HTML, and CSS
- Experience with state management solutions such as Redux or Zustand
- Familiarity with CI/CD pipelines, Git workflows, and agile development practices
- Excellent communication skills and ability to work in a cross-functional team
- Experience with performance profiling and optimization techniques`
  );
  const [companyName, setCompanyName] = useState('Acme Corp');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const jdWordCount = jobDescription.trim()
    ? jobDescription.trim().split(/\s+/).length
    : 0;

  const canGenerate =
    companyName.trim().length >= 2 && jobTitle.trim().length >= 2 && jdWordCount >= 50;

  const generate = useCallback(async () => {
    // Client-side validation
    const words = jobDescription.trim().split(/\s+/).length;
    if (companyName.trim().length < 2) {
      setError('Please enter a valid company name.');
      return null;
    }
    if (jobTitle.trim().length < 2) {
      setError('Please enter the job title you are applying for.');
      return null;
    }
    if (words < 50) {
      setError(`Job description needs at least 50 words (currently ${words}). Paste the full job posting for better questions.`);
      return null;
    }

    setGenerating(true);
    setError(null);
    setProgress(0);

    const startedAt = Date.now();

    try {
      const result = await generateInterview(jobDescription, companyName, jobTitle);

      // Ensure the animation plays long enough to feel intentional
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_GENERATING_MS) {
        await new Promise((r) => setTimeout(r, MIN_GENERATING_MS - elapsed));
      }

      setProgress(100);

      // Pause at 100% so user sees the success state
      await new Promise((r) => setTimeout(r, 1500));

      setGenerating(false);
      return result;
    } catch (err) {
      setGenerating(false);
      setError(err.message || 'Failed to generate interview. Please try again.');
      setProgress(0);
      return null;
    }
  }, [jobDescription, companyName, jobTitle]);

  return {
    jobDescription,
    setJobDescription,
    jobTitle,
    setJobTitle,
    companyName,
    setCompanyName,
    generating,
    error,
    progress,
    generate,
    canGenerate,
  };
}
