import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { analyzeAnswer } from '../lib/answerAnalytics';
import { gradeColor, letterGrade } from '../lib/grading';
import CountUp from './CountUp';
import Button from './Button';
import Magnet from './Magnet';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceRing({ score, label, color }) {
  const size = 160;
  const strokeWidth = 6;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto 8px' }}>
      {/* Glow */}
      <div
        style={{
          position: 'absolute',
          inset: -20,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />

      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tokens.color.elevated}
          strokeWidth={strokeWidth}
        />
        {/* Arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
      </svg>

      {/* Center text */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontFamily: tokens.font.body,
            fontSize: 36,
            fontWeight: 300,
            color: tokens.color.text,
            lineHeight: 1,
          }}
        >
          <CountUp to={score} from={0} duration={1.4} />
          <span style={{ fontSize: 18, color: tokens.color.textSecondary }}>%</span>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: tokens.color.textSecondary,
            marginTop: 4,
            letterSpacing: 0.5,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function GlassStatCard({ label, value, subLabel, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
      style={{
        flex: 1,
        padding: '16px 12px',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: tokens.radius.md,
        border: '1px solid rgba(255,255,255,0.06)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top glow line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '20%',
          right: '20%',
          height: 1,
          background: `linear-gradient(90deg, transparent, ${color}40, transparent)`,
        }}
      />
      <div
        style={{
          fontFamily: tokens.font.body,
          fontSize: 24,
          fontWeight: 300,
          color: color || tokens.color.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: tokens.color.textSecondary,
          marginTop: 6,
        }}
      >
        {label}
      </div>
      {subLabel && (
        <div style={{ fontSize: 10, color: tokens.color.textMuted, marginTop: 2 }}>
          {subLabel}
        </div>
      )}
    </motion.div>
  );
}

function KeywordTags({ keys, transcript, delay }) {
  if (!keys || keys.length === 0) return null;
  const lower = (transcript || '').toLowerCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        justifyContent: 'center',
        marginBottom: 20,
      }}
    >
      {keys.map((key, i) => {
        const keyLower = key.toLowerCase();
        // Relaxed stem match: mirrors keywordHitRate in answerAnalytics.js
        // so tags light up consistently with the confidence score calculation.
        const hit = (() => {
          if (lower.includes(keyLower)) return true;
          const sigWords = keyLower.match(/\b[a-z]{4,}\b/g);
          if (!sigWords || sigWords.length === 0) return false;
          const matched = sigWords.filter(sw => {
            const stem = sw.length > 5 ? sw.slice(0, 5) : sw;
            return new RegExp(`\\b${stem}\\w*`, 'i').test(lower);
          });
          return matched.length >= Math.ceil(sigWords.length / 2);
        })();
        return (
          <motion.span
            key={key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: delay + i * 0.06 }}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: tokens.radius.full,
              background: hit ? `${tokens.color.accent}12` : 'rgba(255,255,255,0.02)',
              color: hit ? tokens.color.accent : tokens.color.textMuted,
              border: `1px solid ${hit ? `${tokens.color.accent}25` : 'rgba(255,255,255,0.05)'}`,
              fontFamily: tokens.font.body,
              fontWeight: 500,
              opacity: hit ? 1 : 0.4,
              transition: 'all 0.3s ease',
            }}
          >
            {key}
          </motion.span>
        );
      })}
    </motion.div>
  );
}

function CoachingInsight({ tips, tipText, showTip, delay }) {
  const showingTip = showTip && tipText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
      style={{
        background: 'rgba(62,232,181,0.04)',
        backdropFilter: 'blur(8px)',
        borderRadius: tokens.radius.md,
        padding: '14px 18px',
        marginBottom: 20,
        textAlign: 'left',
        border: '1px solid rgba(62,232,181,0.08)',
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
        {showingTip ? 'Coaching' : 'Insight'}
      </div>
      <AnimatePresence mode="wait">
        {showingTip ? (
          <motion.p
            key="tip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.55, margin: 0 }}
          >
            {tipText}
          </motion.p>
        ) : (
          <motion.ul
            key="hints"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              margin: 0,
              paddingLeft: 16,
              listStyle: 'disc',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {(tips || []).map((t, i) => (
              <li key={i} style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.45 }}>
                {t}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AnswerAnalytics({
  transcript,
  timeUsed,
  wordCount,
  keys,
  question,
  gradeData,
  currentQuestion,
  textMode,
  showTip,
  setShowTip,
  retryQuestion,
  nextQuestion,
  showReview,
  allAnswered,
  answeredCount,
}) {
  const analytics = useMemo(
    () => analyzeAnswer({ transcript, timeUsed, wordCount, keys, question, textMode }),
    [transcript, timeUsed, wordCount, keys, question, textMode],
  );

  // Fallback for empty / failed analytics
  if (!analytics) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: tokens.font.body,
            fontSize: 48,
            fontWeight: 300,
            color: tokens.color.textMuted,
            marginBottom: 8,
          }}
        >
          --
        </div>
        <div style={{ fontSize: 14, color: tokens.color.textSecondary, marginBottom: 24 }}>
          No response detected
        </div>
        <ActionButtons
          showTip={showTip}
          setShowTip={setShowTip}
          currentQuestion={currentQuestion}
          retryQuestion={retryQuestion}
          nextQuestion={nextQuestion}
          showReview={showReview}
          allAnswered={allAnswered}
          answeredCount={answeredCount}
        />
      </div>
    );
  }

  const { confidence, pace, clarity, depth, structure, coaching } = analytics;

  // Keyword grade as placeholder; batch AI grade replaces it on the review screen
  const ringScore = gradeData?.pct ?? confidence.score;
  const ringGrade = letterGrade(ringScore);
  const ringLabel = ringGrade;
  const ringColor = gradeColor(ringGrade);

  const paceColor =
    pace.quality === 'ideal' || pace.quality === 'good'
      ? tokens.color.accent
      : pace.quality === 'slow'
        ? tokens.color.warning
        : pace.quality === 'fast'
          ? tokens.color.error
          : tokens.color.text;

  const clarityColor = clarity.score >= 75 ? tokens.color.accent : tokens.color.warning;
  const depthColor = depth.score >= 55 ? tokens.color.accentBlue : tokens.color.warning;

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      {/* Hero Ring */}
      <ConfidenceRing score={ringScore} label={ringLabel} color={ringColor} />

      {/* Structure badge */}
      {structure.label !== 'N/A' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          style={{ fontSize: 10, color: tokens.color.textMuted, marginBottom: 20 }}
        >
          {structure.label}
        </motion.div>
      )}

      {/* Glass Stat Cards */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <GlassStatCard
          label={textMode ? 'Words' : 'WPM'}
          value={textMode ? wordCount : pace.wpm}
          subLabel={textMode ? (wordCount >= 80 ? 'Detailed' : wordCount >= 40 ? 'Brief' : 'Short') : pace.label}
          color={textMode ? (wordCount >= 60 ? tokens.color.accent : tokens.color.warning) : paceColor}
          delay={0.6}
        />
        <GlassStatCard
          label="Clarity"
          value={`${clarity.score}%`}
          subLabel={clarity.label}
          color={clarityColor}
          delay={0.7}
        />
        <GlassStatCard
          label="Depth"
          value={depth.label}
          subLabel={`${depth.sentences} sentences`}
          color={depthColor}
          delay={0.8}
        />
      </div>

      {/* Keyword Tags — hit = lit, miss = dimmed */}
      <KeywordTags keys={keys} transcript={transcript} delay={0.9} />

      {/* Coaching Insight — swaps to coaching tip when Show Tip is active */}
      <CoachingInsight
        tips={coaching}
        tipText={currentQuestion?.tip}
        showTip={showTip}
        delay={1.0}
      />

      {/* Stats Pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.05, duration: 0.3 }}
        style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}
      >
        <StatPill>{wordCount} words</StatPill>
        <StatPill>{timeUsed}s</StatPill>
        {clarity.fillerCount > 0 && (
          <span
            style={{
              fontSize: 11,
              padding: '4px 12px',
              borderRadius: tokens.radius.full,
              background: `${tokens.color.warning}08`,
              color: tokens.color.warning,
              border: `1px solid ${tokens.color.warning}15`,
            }}
          >
            {clarity.fillerCount} fillers
          </span>
        )}
      </motion.div>

      {/* Action Buttons */}
      <ActionButtons
        showTip={showTip}
        setShowTip={setShowTip}
        currentQuestion={currentQuestion}
        retryQuestion={retryQuestion}
        nextQuestion={nextQuestion}
        showReview={showReview}
        allAnswered={allAnswered}
        answeredCount={answeredCount}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function StatPill({ children }) {
  return (
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
      {children}
    </span>
  );
}

function ActionButtons({
  showTip,
  setShowTip,
  currentQuestion,
  retryQuestion,
  nextQuestion,
  showReview,
  allAnswered,
  answeredCount,
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.3 }}
        style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}
      >
        <Magnet padding={25} magnetStrength={8}>
          <Button variant="ghost" onClick={() => setShowTip((v) => !v)} style={{ fontSize: 13 }}>
            {showTip ? (
              <>
                <Eye size={14} /> Show Insight
              </>
            ) : (
              <>
                <Eye size={14} /> Show Tip
              </>
            )}
          </Button>
        </Magnet>
        <Magnet padding={25} magnetStrength={8}>
          <Button variant="ghost" onClick={retryQuestion} style={{ fontSize: 13 }}>
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
      </motion.div>

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
    </>
  );
}
