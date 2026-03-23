import { useState, useCallback } from 'react';
import { generateInterview } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const MIN_GENERATING_MS = 5000;

export function useInterviewSetup() {
  const { getIdToken } = useAuth();

  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [quotaIsAnon, setQuotaIsAnon] = useState(false);

  const jdWordCount = jobDescription.trim()
    ? jobDescription.trim().split(/\s+/).length
    : 0;

  const canGenerate =
    companyName.trim().length >= 2 && jobTitle.trim().length >= 2 && jdWordCount >= 50;

  const fetchJobUrl = useCallback(async (url) => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch job posting');
      if (data.text) setJobDescription(data.text);
      // Auto-fill title and company if not already set
      if (data.jobTitle) setJobTitle((prev) => prev || data.jobTitle);
      if (data.companyName) setCompanyName((prev) => prev || data.companyName);
      // Partial result — site was blocked but we got metadata from the URL
      if (data.partial && data.message) {
        setError(data.message);
      }
    } catch (err) {
      setError(err.message || 'Could not fetch that URL. Try pasting the description manually.');
    } finally {
      setFetching(false);
    }
  }, []);

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
      const token = await getIdToken();
      const result = await generateInterview(jobDescription, companyName, jobTitle, token);

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
      setProgress(0);

      if (err.isQuotaError) {
        setQuotaExceeded(true);
        setQuotaIsAnon(err.isAnon ?? false);
        return null;
      }

      setError(err.message || 'Failed to generate interview. Please try again.');
      return null;
    }
  }, [jobDescription, companyName, jobTitle, getIdToken]);

  const clearQuota = useCallback(() => {
    setQuotaExceeded(false);
    setQuotaIsAnon(false);
  }, []);

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
    fetchJobUrl,
    fetching,
    quotaExceeded,
    quotaIsAnon,
    clearQuota,
  };
}
