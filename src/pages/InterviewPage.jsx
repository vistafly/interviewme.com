import { useState } from 'react';
import { ArrowLeft, Settings, Eye, EyeOff } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { gradeColor } from '../lib/grading';
import { saveSessionForUser } from '../lib/storage';
import { useInterview } from '../hooks/useInterview';
import { useAuth } from '../contexts/AuthContext';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import SettingsPanel from '../components/SettingsPanel';
import Orb from '../components/Orb';
import CountUp from '../components/CountUp';
import Magnet from '../components/Magnet';
import UserMenu from '../components/UserMenu';

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

  const interview = useInterview(questions, lang);
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
    showReview,
    answeredCount,
    allAnswered,
    currentQuestion,
    wordCount,
    setTextMode,
  } = interview;

  // For review: compute overall grade
  const overallPct =
    sessionData.length > 0
      ? Math.round(sessionData.reduce((sum, s) => sum + s.pct, 0) / sessionData.length)
      : 0;

  const overallGrade = (() => {
    if (overallPct >= 93) return 'A';
    if (overallPct >= 87) return 'B+';
    if (overallPct >= 80) return 'B';
    if (overallPct >= 73) return 'C+';
    if (overallPct >= 65) return 'C';
    if (overallPct >= 55) return 'D';
    return 'F';
  })();

  const handleSaveAndExit = () => {
    const session = {
      date: new Date().toISOString(),
      company,
      jobTitle: jobTitle || '',
      pct: overallPct,
      grade: overallGrade,
      count: sessionData.length,
      total: questions.length,
      questions: sessionData.map((d) => ({
        question: d.question,
        answer: d.answer?.slice(0, 200),
        grade: d.grade,
        pct: d.pct,
        hits: d.hits,
        total: d.total,
        timeUsed: d.timeUsed,
        wordCount: d.wordCount,
      })),
    };
    saveSessionForUser(user?.uid, session);
    onExit();
  };

  const handleExit = () => {
    if (phase === 'review') {
      handleSaveAndExit();
    } else {
      onExit();
    }
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
          opacity: phase === 'speaking' || phase === 'listening' ? 0.85 : 0.35,
          transition: 'opacity 0.8s cubic-bezier(0.65, 0, 0.35, 1)',
        }}
      >
        <Orb
          hoverIntensity={0.15}
          rotateOnHover={false}
          hue={0}
          forceHoverState={phase === 'speaking' || phase === 'listening'}
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
            {/* Grade */}
            <div
              style={{
                fontFamily: tokens.font.body,
                fontSize: 60,
                fontWeight: 300,
                color: gradeColor(gradeData.grade),
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {gradeData.grade}
            </div>
            <div
              style={{
                fontSize: 18,
                color: tokens.color.textSecondary,
                marginBottom: 28,
              }}
            >
              <CountUp to={gradeData.pct} from={0} duration={1.2} />%
            </div>

            {/* Rubric */}
            <div
              style={{
                textAlign: 'left',
                marginBottom: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {currentQuestion?.keys?.map((key, i) => {
                const isHit = gradeData.hits.includes(key);
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                      color: isHit ? tokens.color.text : tokens.color.textMuted,
                    }}
                  >
                    <span
                      style={{
                        color: isHit ? tokens.color.accent : tokens.color.textMuted,
                        fontSize: 14,
                      }}
                    >
                      {isHit ? '✓' : '○'}
                    </span>
                    {key}
                  </div>
                );
              })}
            </div>

            {/* Coaching Tip */}
            {showTip && currentQuestion?.tip && (
              <div
                style={{
                  background: 'rgba(62,232,181,0.05)',
                  borderRadius: tokens.radius.md,
                  padding: '14px 18px',
                  marginBottom: 20,
                  textAlign: 'left',
                  animation: 'fadeUp 0.3s var(--ease-snappy) both',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: tokens.color.accent,
                    marginBottom: 6,
                  }}
                >
                  Coaching
                </div>
                <p style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.5 }}>
                  {currentQuestion.tip}
                </p>
              </div>
            )}

            {/* Stats Pills */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 24,
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
                {sessionData[sessionData.length - 1]?.wordCount || 0} words
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
                {sessionData[sessionData.length - 1]?.timeUsed || 0}s
              </span>
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <Magnet padding={25} magnetStrength={8}>
                <Button
                  variant="ghost"
                  onClick={() => setShowTip((v) => !v)}
                  style={{ fontSize: 13 }}
                >
                  {showTip ? (
                    <>
                      <EyeOff size={14} /> Hide Tip
                    </>
                  ) : (
                    <>
                      <Eye size={14} /> Show Tip
                    </>
                  )}
                </Button>
              </Magnet>
              <Magnet padding={25} magnetStrength={8}>
                <Button
                  variant="ghost"
                  onClick={retryQuestion}
                  style={{ fontSize: 13 }}
                >
                  Retry
                </Button>
              </Magnet>
              <Magnet padding={25} magnetStrength={8}>
                <Button
                  variant="primary"
                  onClick={allAnswered ? showReview : nextQuestion}
                  style={{ fontSize: 13 }}
                >
                  {allAnswered ? 'See Review' : 'Next'}
                </Button>
              </Magnet>
            </div>

            {/* Early review link */}
            {answeredCount > 1 && !allAnswered && (
              <button
                onClick={showReview}
                style={{
                  display: 'block',
                  margin: '16px auto 0',
                  fontSize: 12,
                  color: tokens.color.textSecondary,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                View results so far
              </button>
            )}
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
            {/* Overall Grade */}
            <div
              style={{
                fontFamily: tokens.font.body,
                fontSize: 76,
                fontWeight: 300,
                color: gradeColor(overallGrade),
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {overallGrade}
            </div>
            <div
              style={{
                fontSize: 20,
                color: tokens.color.textSecondary,
                marginBottom: 28,
              }}
            >
              <CountUp to={overallPct} from={0} duration={1.5} />%
            </div>

            {/* Stats Pills */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 32,
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

            {/* Question Breakdown */}
            <div
              style={{
                textAlign: 'left',
                marginBottom: 32,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {sessionData.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: tokens.color.surface,
                    borderRadius: tokens.radius.md,
                    border: `1px solid ${tokens.color.border}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: tokens.font.body,
                      fontSize: 22,
                      fontWeight: 300,
                      color: gradeColor(item.grade),
                      minWidth: 36,
                      textAlign: 'center',
                    }}
                  >
                    {item.grade}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 13,
                        color: tokens.color.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.question}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      color: tokens.color.textSecondary,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {item.pct}%
                  </span>
                </div>
              ))}
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
                <Button variant="ghost" onClick={onExit} style={{ fontSize: 13 }}>
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
                    onClick={handleSaveAndExit}
                    style={{ fontSize: 13 }}
                  >
                    Save & Exit
                  </Button>
                </Magnet>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
