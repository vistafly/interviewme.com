import { useState, useRef, useEffect, useCallback } from 'react';
import { speakText, createSpeechRecognition } from '../lib/speech';
import { gradeAnswer } from '../lib/grading';
import { gradeSession } from '../lib/api';
import { useAudioAmplitude } from './useAudioAmplitude';
import { setInterviewState } from '../lib/perfProfiler';
import { requestMicStream, getCachedMicStream, releaseMicStream } from '../lib/micStream';

export function useInterview(questions, lang = 'en-US', { jobTitle, company } = {}) {
  const [phase, setPhase] = useState('pre'); // pre | speaking | listening | feedback | review
  const [questionIndex, setQuestionIndex] = useState(0);
  const [seconds, setSeconds] = useState(120);
  const [transcript, setTranscript] = useState('');
  const [gradeData, setGradeData] = useState(null);
  const [sessionData, setSessionData] = useState([]);
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [orbState, setOrbState] = useState('idle');
  const [errorMsg, setErrorMsg] = useState(null);
  const [micReady, setMicReady] = useState(false);
  const [aiGrades, setAiGrades] = useState(null);
  const [aiGrading, setAiGrading] = useState(false);
  const [aiGradeError, setAiGradeError] = useState(null);

  // Request mic permission once upfront when the interview loads.
  // This triggers the browser prompt early (before any question starts)
  // so it doesn't interrupt the interview flow.
  useEffect(() => {
    if (textMode) return;

    requestMicStream()
      .then(() => setMicReady(true))
      .catch(() => {
        // Mic denied — fall back to text mode gracefully
        setTextMode(true);
        setErrorMsg('Microphone access denied. Using text mode.');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timerRef = useRef(null);
  const recRef = useRef(null);
  const recordingRef = useRef(false);
  const startTimeRef = useRef(null);
  const speakingRafRef = useRef(null);

  const { amplitudeRef, startAnalyser, stopAnalyser } = useAudioAmplitude();

  const currentQuestion = questions?.[questionIndex] || null;

  const wordCount = (() => {
    const text = textMode ? textInput : transcript;
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  })();

  const answeredCount = sessionData.length;
  const allAnswered =
    questionIndex >= (questions?.length || 0) - 1 && phase === 'feedback';

  // Cleanup helper
  const clearAllTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speakingRafRef.current) {
      cancelAnimationFrame(speakingRafRef.current);
      speakingRafRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
  }, []);

  // Start a question
  const startQuestion = useCallback(async () => {
    if (!currentQuestion) return;

    setErrorMsg(null);
    setTranscript('');
    setTextInput('');
    setGradeData(null);
    setPhase('speaking');
    setOrbState('speaking');

    // Synthetic breathing amplitude while AI reads the question
    const speakingStart = performance.now();
    const speakingPump = (t) => {
      const elapsed = (t - speakingStart) * 0.001;
      amplitudeRef.current = Math.max(0,
        0.4 +
        0.28 * Math.sin(elapsed * 1.8) +
        0.10 * Math.sin(elapsed * 3.0 + 0.7));
      speakingRafRef.current = requestAnimationFrame(speakingPump);
    };
    speakingRafRef.current = requestAnimationFrame(speakingPump);

    // Speak the question
    await speakText(currentQuestion.q, lang);

    // TTS done — stop pump, let Orb's smoothing decay naturally
    cancelAnimationFrame(speakingRafRef.current);
    speakingRafRef.current = null;

    // Switch to listening
    setPhase('listening');
    setOrbState('listening');
    setSeconds(120);
    startTimeRef.current = Date.now();

    // Start countdown timer
    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Start real mic audio analysis using the pre-acquired stream
    if (!textMode) {
      try {
        const stream = getCachedMicStream();
        await startAnalyser(stream);
      } catch {
        // Mic permission denied — amplitudeRef stays 0, orb stays calm
      }

      setTimeout(() => {
        const rec = createSpeechRecognition(lang, {
          onResult({ fullText }) {
            setTranscript(fullText);
          },
          onError(msg) {
            setErrorMsg(msg);
            if (msg.includes('text mode')) {
              setTextMode(true);
            }
          },
          onEnd() {
            // Recognition ended permanently
          },
        });

        if (rec.isSupported) {
          recRef.current = rec;
          recordingRef.current = true;
          rec.start();
        } else {
          setTextMode(true);
          setErrorMsg('Speech recognition not supported. Using text mode.');
        }
      }, 150);  // reduced from 400ms — mic analyser is already ready
    }
  }, [currentQuestion, lang, textMode, amplitudeRef, startAnalyser]);

  // Finish the current answer
  const finishAnswer = useCallback(() => {
    // Stop timers and speech — but keep the mic analyser alive
    // so it doesn't need to be recreated (getUserMedia + AudioContext) each question
    clearAllTimers();
    stopRecording();
    window.speechSynthesis?.cancel();
    amplitudeRef.current = 0;

    const timeUsed = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : 120 - seconds;

    const answerText = textMode ? textInput : transcript;
    const result = gradeAnswer(answerText, currentQuestion?.keys || [], timeUsed)
      || { pct: 0, grade: 'F', hits: [], total: currentQuestion?.keys?.length || 0 };

    setGradeData(result);
    setSessionData((prev) => [
      ...prev,
      {
        question: currentQuestion?.q || '',
        answer: answerText,
        grade: result?.grade || 'F',
        pct: result?.pct || 0,
        hits: result?.hits || [],
        total: result?.total || 0,
        timeUsed,
        wordCount: answerText ? answerText.split(/\s+/).filter(Boolean).length : 0,
      },
    ]);
    setPhase('feedback');
    setOrbState('idle');
  }, [
    clearAllTimers,
    stopRecording,
    amplitudeRef,
    seconds,
    textMode,
    textInput,
    transcript,
    currentQuestion,
  ]);

  // Auto-finish when timer hits 0
  useEffect(() => {
    if (seconds === 0 && phase === 'listening') {
      finishAnswer();
    }
  }, [seconds, phase, finishAnswer]);

  // Next question
  const nextQuestion = useCallback(() => {
    setQuestionIndex((i) => i + 1);
    setPhase('pre');
    setSeconds(120);
    setOrbState('idle');
    amplitudeRef.current = 0;
    setGradeData(null);
    setErrorMsg(null);
  }, [amplitudeRef]);

  // Retry current question
  const retryQuestion = useCallback(() => {
    setSessionData((prev) => prev.slice(0, -1));
    setPhase('pre');
    setSeconds(120);
    setOrbState('idle');
    amplitudeRef.current = 0;
    setGradeData(null);
    setErrorMsg(null);
  }, [amplitudeRef]);

  // Bulk submit all answers at once (dev/test shortcut — skips sequential flow)
  const bulkSubmit = useCallback((answers) => {
    clearAllTimers();
    stopRecording();
    window.speechSynthesis?.cancel();
    amplitudeRef.current = 0;

    const entries = answers.map((answerText, i) => {
      const q = questions[i];
      if (!q) return null;
      const trimmed = (answerText || '').trim();
      const wc = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
      const timeUsed = 60;
      const result = gradeAnswer(trimmed, q.keys || [], timeUsed)
        || { pct: 0, grade: 'F', hits: [], total: q.keys?.length || 0 };
      return {
        question: q.q || '',
        answer: trimmed,
        grade: result?.grade || 'F',
        pct: result?.pct || 0,
        hits: result?.hits || [],
        total: result?.total || 0,
        timeUsed,
        wordCount: wc,
      };
    }).filter(Boolean);

    setSessionData(entries);
    setQuestionIndex((questions?.length || 1) - 1);
    setPhase('review');
    setOrbState('idle');

    // Fire AI grading using entries directly — sessionData hasn't updated yet in this closure
    setAiGrading(true);
    setAiGrades(null);
    setAiGradeError(null);
    gradeSession(entries, jobTitle, company)
      .then((result) => {
        if (result?.grades && Array.isArray(result.grades)) {
          setAiGrades(result);
        } else {
          setAiGradeError('Unexpected response from grading API');
        }
      })
      .catch((err) => {
        setAiGradeError(err.message);
      })
      .finally(() => setAiGrading(false));
  }, [clearAllTimers, stopRecording, questions, amplitudeRef, jobTitle, company]);

  // Show review + trigger AI grading
  const showReview = useCallback(() => {
    setPhase('review');
    setOrbState('idle');
    amplitudeRef.current = 0;

    // Fire AI grading in the background
    setAiGrading(true);
    setAiGrades(null);
    setAiGradeError(null);
    gradeSession(sessionData, jobTitle, company)
      .then((result) => {
        if (result?.grades && Array.isArray(result.grades)) {
          setAiGrades(result);
        } else {
          console.warn('[AI Grading] Unexpected response shape:', result);
          setAiGradeError('Unexpected response from grading API');
        }
      })
      .catch((err) => {
        console.error('[AI Grading] Failed:', err.message);
        setAiGradeError(err.message);
      })
      .finally(() => setAiGrading(false));
  }, [amplitudeRef, sessionData, jobTitle, company]);

  // Feed live interview metrics into the perf profiler HUD
  useEffect(() => {
    setInterviewState({
      phase,
      questionIndex,
      amplitude: amplitudeRef.current,
      wordCount,
      textMode,
    });
  }, [phase, questionIndex, wordCount, textMode, amplitudeRef]);

  // Keep amplitude updated at ~20Hz for the profiler (amplitude changes don't trigger re-renders)
  useEffect(() => {
    if (phase !== 'speaking' && phase !== 'listening') return;
    const id = setInterval(() => {
      setInterviewState({
        phase,
        questionIndex,
        amplitude: amplitudeRef.current,
        wordCount,
        textMode,
      });
    }, 50);
    return () => clearInterval(id);
  }, [phase, questionIndex, wordCount, textMode, amplitudeRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
      stopRecording();
      stopAnalyser();
      releaseMicStream();
      window.speechSynthesis?.cancel();
      setInterviewState(null);
    };
  }, [clearAllTimers, stopRecording, stopAnalyser]);

  const restart = useCallback(() => {
    clearAllTimers();
    stopRecording();
    stopAnalyser();
    window.speechSynthesis?.cancel();
    setPhase('pre');
    setQuestionIndex(0);
    setSeconds(120);
    setTranscript('');
    setGradeData(null);
    setSessionData([]);
    setTextInput('');
    setOrbState('idle');
    setErrorMsg(null);
    setAiGrades(null);
    setAiGrading(false);
    setAiGradeError(null);
  }, [clearAllTimers, stopRecording, stopAnalyser]);

  return {
    phase,
    questions,
    questionIndex,
    seconds,
    transcript,
    gradeData,
    sessionData,
    textMode,
    textInput,
    setTextInput,
    orbState,
    amplitudeRef,
    errorMsg,
    startQuestion,
    finishAnswer,
    nextQuestion,
    retryQuestion,
    bulkSubmit,
    showReview,
    answeredCount,
    allAnswered,
    currentQuestion,
    wordCount,
    setTextMode,
    micReady,
    aiGrades,
    aiGrading,
    aiGradeError,
    restart,
  };
}
