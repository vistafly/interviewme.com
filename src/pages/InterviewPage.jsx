import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Settings, Copy, Check } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { gradeAnswer, gradeColor, letterGrade } from '../lib/grading';
import { analyzeAnswer } from '../lib/answerAnalytics';
import { saveSessionForUser } from '../lib/storage';
import { storeTrainingData, inferJobCategory } from '../lib/api';
import { useInterview } from '../hooks/useInterview';
import { useAuth } from '../contexts/AuthContext';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import SettingsPanel from '../components/SettingsPanel';
import Orb from '../components/Orb';
import CountUp from '../components/CountUp';
import Magnet from '../components/Magnet';
import UserMenu from '../components/UserMenu';
import AnswerAnalytics from '../components/AnswerAnalytics';

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function timerColor(seconds) {
  if (seconds > 60) return tokens.color.accent;
  if (seconds > 30) return tokens.color.warning;
  return tokens.color.error;
}

export default function InterviewPage({ questions, company, jobTitle, onExit }) {
  const { user } = useAuth();
  const [lang, setLang] = useState('en-US');
  const [showSettings, setShowSettings] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [copiedQs, setCopiedQs] = useState(false);

  const interview = useInterview(questions, lang, { jobTitle, company });

  const {
    phase,
    questionIndex,
    seconds,
    transcript,
    gradeData,
    sessionData,
    textMode,
    textInput,
    setTextInput,
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
    aiGrades,
    aiGrading,
    aiGradeError,
    restart,
  } = interview;

  // Full analytics results for each answer — used for confidence scores, keyword debug, and Copy Results
  const analyticsResults = useMemo(() => {
    if (sessionData.length === 0) return [];
    return sessionData.map((item, i) => {
      const qObj = questions[i] || {};
      return analyzeAnswer({
        transcript: item.answer || '',
        timeUsed: item.timeUsed,
        wordCount: item.wordCount,
        keys: qObj.keys || [],
        question: qObj.q || item.question,
        textMode,
      });
    });
  }, [sessionData, questions, textMode]);

  // Confidence scores derived from analytics (used as fallback when AI grades unavailable)
  const confidenceScores = useMemo(
    () => analyticsResults.map((r, i) => r?.confidence?.score ?? sessionData[i]?.pct),
    [analyticsResults, sessionData]
  );

  // Stable session ID — groups all Q/A records from one interview together
  const sessionIdRef = useRef(Math.random().toString(36).slice(2));

  // Submit anonymized training records when AI grades are available (fire-and-forget)
  const trainingSubmittedRef = useRef(false);
  useEffect(() => {
    if (!aiGrades?.grades?.length || trainingSubmittedRef.current) return;
    trainingSubmittedRef.current = true;
    const records = sessionData.map((sd, i) => {
      const analytics = analyticsResults[i];
      const aiScore = aiGrades.grades[i]?.pct;
      if (!analytics || aiScore == null) return null;
      const hs = confidenceScores[i] ?? analytics.confidence?.score;
      const wc = analytics.wordCount ?? sd.wordCount ?? 0;
      const fillerCount = analytics.clarity?.fillerCount ?? 0;
      const carParts = [
        analytics.structure?.parts?.context,
        analytics.structure?.parts?.action,
        analytics.structure?.parts?.result,
      ].filter(Boolean).length;
      return {
        questionType: analytics.questionType || 'behavioral',
        jobCategory: inferJobCategory(jobTitle, company),
        sessionId: sessionIdRef.current,
        questionNumber: i,
        features: {
          clarity:          analytics.clarity?.score ?? 0,
          vocabulary:       analytics.vocabulary?.score ?? 0,
          depth:            analytics.depth?.score ?? 0,
          structure:        analytics.structure?.score ?? 0,
          keywords:         analytics.keywordBreakdown?.matchedCount ?? 0,
          relevance:        analytics.relevance ?? 0,
          coherence:        Math.round((analytics.coherence ?? 1) * 100),
          wordCount:        wc,
          hasNumbers:       analytics.depth?.hasNumbers ?? false,
          hasExamples:      analytics.depth?.hasExamples ?? false,
          sentenceCount:    analytics.depth?.sentences ?? 0,
          avgSentenceLen:   analytics.depth?.avgSentenceLen ?? 0,
          fillerCount,
          fillerRate:       wc > 0 ? Math.round((fillerCount / wc) * 1000) / 10 : 0,
          keywordMatchRate: analytics.keywordBreakdown?.pct ?? 0,
          carParts,
        },
        heuristicScore: hs ?? 0,
        aiScore,
        gap: (hs ?? 0) - aiScore,
        structureFlagged: analytics.structure?.score === 0 && aiScore >= 85,
        textMode: Boolean(textMode),
      };
    }).filter(Boolean);
    if (records.length > 0) storeTrainingData(records);
  }, [aiGrades]);

  // For review: AI grade is primary (stricter rubric handles variation), confidence as fallback only
  const getDisplayPct = (i) => {
    const aiPct = aiGrades?.grades?.[i]?.pct;
    if (aiPct > 0) return aiPct;
    return confidenceScores[i] ?? sessionData[i]?.pct ?? 0;
  };

  // Prefer the AI's own holistic overall; fall back to per-question average when AI hasn't loaded yet
  const overallPct = (() => {
    const aiOverall = aiGrades?.overall?.pct;
    if (aiOverall > 0) return aiOverall;
    if (sessionData.length === 0) return 0;
    return Math.round(sessionData.reduce((sum, _, i) => sum + getDisplayPct(i), 0) / sessionData.length);
  })();

  const overallGrade = letterGrade(overallPct);
  const overallFeedback = aiGrades?.overall?.fb || null;

  // Compute orb color for feedback phase (matches the confidence ring color)
  const orbColorOverride = useMemo(() => {
    // Same grade-to-RGB map used for both feedback (keyword grade) and review (AI overall grade)
    const gradeRgb = {
      'A':  [0.24, 0.91, 0.71],
      'A-': [0.24, 0.91, 0.71],
      'B+': [0.37, 0.67, 1.0],
      'B':  [0.37, 0.67, 1.0],
      'B-': [0.37, 0.67, 1.0],
      'C+': [0.94, 0.78, 0.33],
      'C':  [0.94, 0.78, 0.33],
      'C-': [0.94, 0.78, 0.33],
      'D+': [1.0, 0.49, 0.42],
      'D':  [1.0, 0.49, 0.42],
      'F':  [1.0, 0.32, 0.32],
    };
    if (phase === 'feedback') {
      return gradeData?.grade ? (gradeRgb[gradeData.grade] || null) : null;
    }
    if (phase === 'review') {
      return gradeRgb[overallGrade] || null;
    }
    return null;
  }, [phase, gradeData, overallGrade]);

  const savedRef = useRef(false);

  const saveSession = useCallback(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    const session = {
      date: new Date().toISOString(),
      company,
      jobTitle: jobTitle || '',
      pct: overallPct,
      grade: overallGrade,
      count: sessionData.length,
      total: questions.length,
      questions: sessionData.map((d, i) => {
        const pct = getDisplayPct(i);
        return {
          question: d.question,
          answer: d.answer?.slice(0, 200),
          grade: letterGrade(pct),
          pct,
          hits: d.hits,
          total: d.total,
          timeUsed: d.timeUsed,
          wordCount: d.wordCount,
          feedback: aiGrades?.grades?.[i]?.fb || null,
        };
      }),
    };
    saveSessionForUser(user?.uid, session);
  }, [company, jobTitle, overallPct, overallGrade, sessionData, questions, aiGrades, user]);

  // Auto-save when AI grading finishes (or fails) during review
  useEffect(() => {
    if (phase === 'review' && !aiGrading) {
      saveSession();
    }
  }, [phase, aiGrading, saveSession]);

  const handleExit = () => {
    if (phase === 'review') saveSession();
    onExit();
  };

  return (
    <div className="page-enter" style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Background Orb (promoted — reacts to speech) */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: phase === 'speaking' || phase === 'listening' ? 0.85
            : phase === 'feedback' || phase === 'review' ? 0.55
            : 0.35,
          transition: 'opacity 0.8s cubic-bezier(0.65, 0, 0.35, 1)',
        }}
      >
        <Orb
          hoverIntensity={phase === 'review' ? 0.3 : 0.15}
          rotateOnHover={false}
          hue={0}
          colorOverride={orbColorOverride}
          forceHoverState={phase === 'speaking' || phase === 'listening' || phase === 'feedback' || phase === 'review'}
          backgroundColor="#08080a"
          amplitudeRef={amplitudeRef}
        />
      </div>

      {/* Nav */}
      <NavBar
        left={
          <button
            onClick={handleExit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: tokens.color.textSecondary,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
              transition: `color 0.2s ${tokens.ease.snappy}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = tokens.color.text)}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = tokens.color.textSecondary)
            }
          >
            <ArrowLeft size={16} />
            {phase === 'review' ? 'Exit' : 'End'}
          </button>
        }
        center={
          <span style={{ fontSize: 12, color: tokens.color.textMuted }}>
            {company}{jobTitle ? ` · ${jobTitle}` : ''}
          </span>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {textMode && phase !== 'review' && (
              <button
                onClick={() => { setBulkText(''); setShowBulkModal(true); }}
                style={{
                  fontSize: 11,
                  color: tokens.color.textMuted,
                  background: 'none',
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: '2px 7px',
                  opacity: 0.7,
                }}
                title="Paste all answers at once"
              >
                Bulk
              </button>
            )}
            <button
              onClick={() => {
                const text = questions.map((q, i) => `${i + 1}. ${q.q}`).join('\n');
                navigator.clipboard.writeText(text).then(() => {
                  setCopiedQs(true);
                  setTimeout(() => setCopiedQs(false), 1500);
                });
              }}
              style={{
                fontSize: 11,
                color: copiedQs ? tokens.color.accent : tokens.color.textMuted,
                background: 'none',
                border: `1px solid ${tokens.color.border}`,
                borderRadius: 4,
                cursor: 'pointer',
                padding: '2px 7px',
                opacity: 0.7,
              }}
              title="Copy all questions"
            >
              {copiedQs ? 'Copied!' : 'Copy Qs'}
            </button>
            <span style={{ fontSize: 12, color: tokens.color.textSecondary }}>
              Q{questionIndex + 1}/{questions.length}
            </span>
            <button
              onClick={() => setShowSettings((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                color: tokens.color.textSecondary,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <Settings size={16} />
            </button>
            {user && <UserMenu />}
          </div>
        }
      />

      {/* Bulk Answer Import Modal */}
      {showBulkModal && (
        <div
          onClick={() => setShowBulkModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: tokens.color.surface,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 560,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: tokens.color.text }}>
              Paste All {questions.length} Answers
            </div>
            <div style={{ fontSize: 11, color: tokens.color.textMuted }}>
              Separate each answer with <code style={{ background: tokens.color.elevated, padding: '1px 4px', borderRadius: 3 }}>---</code> on its own line (one per question, in order).
            </div>
            <textarea
              autoFocus
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Answer to Q1...\n---\nAnswer to Q2...\n---\n...`}
              style={{
                width: '100%',
                height: 260,
                background: tokens.color.elevated,
                border: `1px solid ${tokens.color.border}`,
                borderRadius: 8,
                color: tokens.color.text,
                fontSize: 12,
                fontFamily: 'inherit',
                padding: 12,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBulkModal(false)}
                style={{
                  fontSize: 12, padding: '6px 14px',
                  background: 'none', border: `1px solid ${tokens.color.border}`,
                  borderRadius: 6, color: tokens.color.textSecondary, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const answers = bulkText.split(/^---$/m).map((s) => s.trim()).filter(Boolean);
                  if (answers.length === 0) return;
                  bulkSubmit(answers);
                  setShowBulkModal(false);
                }}
                style={{
                  fontSize: 12, padding: '6px 14px',
                  background: tokens.color.accent, border: 'none',
                  borderRadius: 6, color: '#000', cursor: 'pointer', fontWeight: 600,
                }}
              >
                Submit All
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          lang={lang}
          setLang={setLang}
          textMode={textMode}
          setTextMode={setTextMode}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Main Content — vertically centered over the orb */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 520,
          margin: '0 auto',
          padding: '24px',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >

        {/* === PRE STATE === */}
        {phase === 'pre' && currentQuestion && (
          <div
            style={{
              textAlign: 'center',
              animation: 'fadeUp 0.5s var(--ease-snappy) both',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                color: tokens.color.textSecondary,
                marginBottom: 12,
              }}
            >
              {questionIndex === 0 ? 'Ready when you are' : `Question ${questionIndex + 1}`}
            </div>
            <p
              style={{
                fontFamily: tokens.font.body,
                fontSize: 'clamp(20px, 3vw, 24px)',
                fontWeight: 300,
                letterSpacing: -0.3,
                color: '#fff',
                lineHeight: 1.4,
                marginBottom: 32,
              }}
            >
              {currentQuestion.q}
            </p>
            <Magnet padding={30} magnetStrength={8}>
              <Button
                variant="primary"
                onClick={startQuestion}
                style={{ padding: '14px 36px', fontSize: 15 }}
              >
                {questionIndex === 0 ? 'Begin Interview' : 'Start Question'}
              </Button>
            </Magnet>

          </div>
        )}

        {/* === SPEAKING STATE === */}
        {phase === 'speaking' && currentQuestion && (
          <div
            style={{
              textAlign: 'center',
              animation: 'fadeUp 0.5s var(--ease-snappy) both',
            }}
          >
            <p
              style={{
                fontFamily: tokens.font.body,
                fontSize: 'clamp(20px, 3vw, 24px)',
                fontWeight: 300,
                letterSpacing: -0.3,
                color: '#fff',
                lineHeight: 1.4,
                marginBottom: 24,
              }}
            >
              {currentQuestion.q}
            </p>
            <p
              style={{
                fontSize: 13,
                color: tokens.color.textSecondary,
                animation: 'pulse 2s ease-in-out infinite',
                marginBottom: 20,
              }}
            >
              Interviewer is speaking...
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                window.speechSynthesis?.cancel();
              }}
              style={{ fontSize: 12 }}
            >
              Skip to answer
            </Button>
          </div>
        )}

        {/* === LISTENING STATE === */}
        {phase === 'listening' && currentQuestion && (
          <div
            style={{
              width: '100%',
              animation: 'fadeUp 0.5s var(--ease-snappy) both',
            }}
          >
            <p
              style={{
                fontFamily: tokens.font.body,
                fontSize: 'clamp(16px, 2.5vw, 20px)',
                fontWeight: 300,
                letterSpacing: -0.3,
                color: tokens.color.textSecondary,
                lineHeight: 1.4,
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              {currentQuestion.q}
            </p>

            {errorMsg && (
              <p
                style={{
                  fontSize: 12,
                  color: tokens.color.error,
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              >
                {errorMsg}
              </p>
            )}

            {/* Content area */}
            {textMode ? (
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your answer here..."
                style={{
                  width: '100%',
                  minHeight: 140,
                  padding: '12px 16px',
                  fontSize: 15,
                  lineHeight: 1.6,
                  background: tokens.color.surface,
                  border: `1px solid ${tokens.color.borderLight}`,
                  borderRadius: tokens.radius.md,
                  color: tokens.color.text,
                  outline: 'none',
                  resize: 'vertical',
                  marginBottom: 16,
                }}
              />
            ) : transcript ? (
              <div
                style={{
                  padding: '16px 20px',
                  background: tokens.color.surface,
                  borderRadius: tokens.radius.md,
                  border: `1px solid ${tokens.color.border}`,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: tokens.color.text,
                  minHeight: 80,
                  marginBottom: 16,
                }}
              >
                {transcript}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 0',
                  fontSize: 14,
                  color: tokens.color.textSecondary,
                  animation: 'pulse 2s ease-in-out infinite',
                  marginBottom: 16,
                }}
              >
                Listening...
              </div>
            )}

            {/* HUD Row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 16,
                marginBottom: 24,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: timerColor(seconds),
                  transition: 'color 0.5s ease',
                }}
              >
                {formatTime(seconds)}
              </span>
              <span style={{ color: tokens.color.textMuted }}>·</span>
              <span style={{ color: tokens.color.textSecondary }}>
                {wordCount} words
              </span>
            </div>

            {/* Done Button */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Magnet padding={30} magnetStrength={8}>
                <Button
                  variant="stop"
                  onClick={finishAnswer}
                  style={{ padding: '12px 32px' }}
                >
                  Done
                </Button>
              </Magnet>
            </div>
          </div>
        )}

        {/* === FEEDBACK STATE === */}
        {phase === 'feedback' && gradeData && (
          <div
            style={{
              width: '100%',
              textAlign: 'center',
              animation: 'fadeUp 0.5s var(--ease-snappy) both',
            }}
          >
            <AnswerAnalytics
              transcript={sessionData[sessionData.length - 1]?.answer || ''}
              timeUsed={sessionData[sessionData.length - 1]?.timeUsed || 0}
              wordCount={sessionData[sessionData.length - 1]?.wordCount || 0}
              keys={currentQuestion?.keys || []}
              question={currentQuestion?.q || ''}
              gradeData={gradeData}
              currentQuestion={currentQuestion}
              textMode={textMode}
              showTip={showTip}
              setShowTip={setShowTip}
              retryQuestion={retryQuestion}
              nextQuestion={nextQuestion}
              showReview={showReview}
              allAnswered={allAnswered}
              answeredCount={answeredCount}
            />
          </div>
        )}

        {/* === REVIEW STATE === */}
        {phase === 'review' && (
          <div
            style={{
              width: '100%',
              textAlign: 'center',
              animation: 'fadeUp 0.5s var(--ease-snappy) both',
            }}
          >
            {/* AI Grading Loading */}
            {aiGrading && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                  pointerEvents: 'none',
                }}
              >
                <p
                  style={{
                    fontSize: 15,
                    color: '#fff',
                    animation: 'breathe 3s ease-in-out infinite',
                  }}
                >
                  Analyzing your responses...
                </p>
              </div>
            )}

            {/* Overall Grade — hidden while AI is still grading */}
            <div
              style={{
                fontFamily: tokens.font.body,
                fontSize: 76,
                fontWeight: 300,
                color: gradeColor(overallGrade),
                lineHeight: 1,
                marginBottom: 4,
                opacity: aiGrading ? 0 : 1,
                transition: 'opacity 0.4s ease',
              }}
            >
              {overallGrade}
            </div>
            <div
              style={{
                fontSize: 20,
                color: tokens.color.textSecondary,
                marginBottom: overallFeedback ? 12 : 28,
                opacity: aiGrading ? 0 : 1,
                transition: 'opacity 0.4s ease',
              }}
            >
              <CountUp to={overallPct} from={0} duration={1.5} />%
            </div>

            {/* Overall AI Feedback */}
            {overallFeedback && (
              <p
                style={{
                  fontSize: 13,
                  color: tokens.color.textSecondary,
                  marginBottom: 28,
                  lineHeight: 1.5,
                }}
              >
                {overallFeedback}
              </p>
            )}

            {/* Stats Pills */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 32,
                opacity: aiGrading ? 0 : 1,
                transition: 'opacity 0.4s ease',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  padding: '4px 12px',
                  borderRadius: tokens.radius.full,
                  background: tokens.color.surface,
                  color: tokens.color.textSecondary,
                  border: `1px solid ${tokens.color.border}`,
                }}
              >
                {sessionData.length} answered
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '4px 12px',
                  borderRadius: tokens.radius.full,
                  background: tokens.color.surface,
                  color: tokens.color.textSecondary,
                  border: `1px solid ${tokens.color.border}`,
                }}
              >
                {sessionData.reduce((s, d) => s + d.wordCount, 0)} words
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '4px 12px',
                  borderRadius: tokens.radius.full,
                  background: tokens.color.surface,
                  color: tokens.color.textSecondary,
                  border: `1px solid ${tokens.color.border}`,
                }}
              >
                {sessionData.reduce((s, d) => s + d.timeUsed, 0)}s total
              </span>
            </div>

            {/* AI Grade Error */}
            {aiGradeError && !aiGrading && (
              <p
                style={{
                  fontSize: 11,
                  color: tokens.color.warning,
                  marginBottom: 16,
                  opacity: 0.8,
                }}
              >
                AI grading unavailable ({aiGradeError}) — showing local analysis
              </p>
            )}

            {/* Question Breakdown */}
            <div
              style={{
                textAlign: 'left',
                marginBottom: 32,
                display: 'grid',
                opacity: aiGrading ? 0 : 1,
                transition: 'opacity 0.4s ease',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}
            >
              {sessionData.map((item, i) => {
                const aiGrade = aiGrades?.grades?.[i];
                const displayPct = getDisplayPct(i);
                const displayGrade = letterGrade(displayPct);
                const feedback = aiGrade?.fb || null;

                // Debug: show all grade sources
                const debugAiPct = aiGrades?.grades?.[i]?.pct;
                const debugConfPct = confidenceScores[i];
                const debugKwPct = sessionData[i]?.pct;
                const debugSource = debugAiPct > 0 ? 'ai' : debugConfPct != null ? 'conf' : 'kw';

                return (
                  <div
                    key={i}
                    style={{
                      padding: '10px 12px',
                      background: tokens.color.surface,
                      borderRadius: tokens.radius.md,
                      border: `1px solid ${tokens.color.border}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: tokens.color.textSecondary,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        Q{i + 1}
                      </span>
                      <span
                        style={{
                          fontFamily: tokens.font.body,
                          fontSize: 18,
                          fontWeight: 300,
                          color: gradeColor(displayGrade),
                        }}
                      >
                        {displayGrade}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: tokens.color.textSecondary,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {displayPct}%
                      </span>
                    </div>

                    {/* Debug row — shows all grade sources, which is being used, and keyword hits/misses */}
                    {(() => {
                      const kwBreak = analyticsResults[i]?.keywordBreakdown;
                      return (
                        <div
                          style={{
                            fontSize: 9,
                            color: tokens.color.textMuted,
                            fontFamily: 'monospace',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            borderTop: `1px solid ${tokens.color.border}`,
                            paddingTop: 4,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ color: debugSource === 'ai' ? tokens.color.accent : tokens.color.textMuted }}>
                              ai:{debugAiPct ?? '–'}
                            </span>
                            <span style={{ color: debugSource === 'conf' ? tokens.color.accent : tokens.color.textMuted }}>
                              conf:{debugConfPct ?? '–'}
                            </span>
                            <span style={{ color: debugSource === 'kw' ? tokens.color.accent : tokens.color.textMuted }}>
                              kw:{debugKwPct ?? '–'}
                            </span>
                            <span style={{ color: tokens.color.textMuted, opacity: 0.6 }}>
                              [{debugSource}]
                            </span>
                          </div>
                          {kwBreak && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {kwBreak.hits.length > 0 && (
                                <div style={{ color: '#3de88b', lineHeight: 1.3 }}>
                                  hit: {kwBreak.hits.join(' · ')}
                                </div>
                              )}
                              {kwBreak.misses.length > 0 && (
                                <div style={{ color: '#ff6b6b', lineHeight: 1.3 }}>
                                  miss: {kwBreak.misses.join(' · ')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {feedback && (
                      <p
                        style={{
                          fontSize: 11,
                          color: tokens.color.textMuted,
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {feedback}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <Magnet padding={30} magnetStrength={8}>
                <Button variant="ghost" onClick={restart} style={{ fontSize: 13 }}>
                  Restart
                </Button>
              </Magnet>
              {sessionData.length < questions.length ? (
                <Magnet padding={30} magnetStrength={8}>
                  <Button
                    variant="primary"
                    onClick={nextQuestion}
                    style={{ fontSize: 13 }}
                  >
                    Continue
                  </Button>
                </Magnet>
              ) : (
                <Magnet padding={30} magnetStrength={8}>
                  <Button
                    variant="primary"
                    onClick={handleExit}
                    style={{ fontSize: 13 }}
                  >
                    Exit
                  </Button>
                </Magnet>
              )}
            </div>

            {/* Copy Full Results */}
            {!aiGrading && (
              <button
                onClick={async () => {
                  const fullExport = {
                    session: {
                      company,
                      jobTitle,
                      date: new Date().toISOString(),
                      textMode,
                      questionsAnswered: sessionData.length,
                      questionsTotal: questions.length,
                      totalWords: sessionData.reduce((s, d) => s + d.wordCount, 0),
                      totalTime: sessionData.reduce((s, d) => s + d.timeUsed, 0),
                    },
                    overall: {
                      pct: overallPct,
                      grade: overallGrade,
                      aiFeedback: overallFeedback,
                      aiOverall: aiGrades?.overall || null,
                    },
                    questions: sessionData.map((item, i) => {
                      const qObj = questions[i] || {};
                      const keys = qObj.keys || [];
                      const keywordGrade = gradeAnswer(item.answer, keys, item.timeUsed);
                      const aiGrade = aiGrades?.grades?.[i] || null;
                      const displayPct = getDisplayPct(i);
                      // Reuse already-computed analytics to avoid double-running analyzeAnswer
                      const analytics = analyticsResults[i];

                      return {
                        number: i + 1,
                        question: qObj.q || item.question,
                        tip: qObj.tip || null,
                        answer: item.answer,
                        timeUsed: item.timeUsed,
                        wordCount: item.wordCount,
                        finalGrade: { pct: displayPct, grade: letterGrade(displayPct) },
                        keywordGrade: keywordGrade
                          ? {
                              pct: keywordGrade.pct,
                              grade: keywordGrade.grade,
                              hits: keywordGrade.hits,
                              misses: keys.filter(
                                (k) => !keywordGrade.hits.map((h) => h.toLowerCase()).includes(k.toLowerCase()),
                              ),
                              total: keywordGrade.total,
                            }
                          : null,
                        aiGrade: aiGrade ? { pct: aiGrade.pct, feedback: aiGrade.fb } : null,
                        expectedKeywords: keys,
                        analytics: analytics
                          ? {
                              confidence: analytics.confidence,
                              keywordBreakdown: analytics.keywordBreakdown,
                              pace: analytics.pace,
                              clarity: {
                                score: analytics.clarity.score,
                                label: analytics.clarity.label,
                                fillerCount: analytics.clarity.fillerCount,
                                fillers: analytics.clarity.fillers,
                              },
                              depth: analytics.depth,
                              structure: analytics.structure,
                              vocabulary: {
                                score: analytics.vocabulary.score,
                                label: analytics.vocabulary.label,
                                ratio: analytics.vocabulary.ratio,
                              },
                              relevance: analytics.relevance,
                              coherence: analytics.coherence,
                              topics: analytics.topics,
                              coaching: analytics.coaching,
                            }
                          : null,
                      };
                    }),
                    // Score summary appended at end for quick scanning
                    scoreSummary: {
                      overall: `${overallPct}% (${overallGrade})`,
                      scores: sessionData.map((_, i) => {
                        const aiPct = aiGrades?.grades?.[i]?.pct;
                        const confPct = confidenceScores[i];
                        const kwPct = sessionData[i]?.pct;
                        const source = aiPct > 0 ? 'ai' : confPct != null ? 'conf' : 'kw';
                        const displayPct = getDisplayPct(i);
                        const kwBreak = analyticsResults[i]?.keywordBreakdown;
                        return {
                          q: i + 1,
                          displayed: `${displayPct}% (${letterGrade(displayPct)})`,
                          ai: aiPct ?? null,
                          conf: confPct ?? null,
                          kw: kwPct ?? null,
                          source,
                          feedback: aiGrades?.grades?.[i]?.fb ?? null,
                          kwHits: kwBreak?.hits ?? [],
                          kwMisses: kwBreak?.misses ?? [],
                        };
                      }),
                    },
                  };

                  const json = JSON.stringify(fullExport, null, 2);
                  try {
                    await navigator.clipboard.writeText(json);
                  } catch {
                    const ta = document.createElement('textarea');
                    ta.value = json;
                    ta.style.cssText = 'position:fixed;left:-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  margin: '20px auto 0',
                  fontSize: 12,
                  color: copied ? tokens.color.accent : tokens.color.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  transition: 'color 0.2s ease',
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy Results'}
              </button>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
