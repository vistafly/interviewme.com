import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { gradeColor } from '../lib/grading';
import StatCard from './charts/StatCard';
import GradeBar from './charts/GradeBar';
import SectionLabel from './charts/SectionLabel';
import Sparkline from './charts/Sparkline';
import './HistoryPanel.css';

/* ---------- analytics ---------- */

function computeAnalytics(history) {
  if (!history.length) return null;

  const avgScore = Math.round(
    history.reduce((sum, s) => sum + s.pct, 0) / history.length,
  );

  const gradeOrder = ['A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
  const gradeDist = {};
  gradeOrder.forEach((g) => (gradeDist[g] = 0));
  history.forEach((s) => {
    if (gradeDist[s.grade] !== undefined) gradeDist[s.grade]++;
  });
  const maxGradeCount = Math.max(...Object.values(gradeDist), 1);

  const mid = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, mid || 1);
  const secondHalf = history.slice(mid);
  const avgFirst = firstHalf.reduce((s, h) => s + h.pct, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, h) => s + h.pct, 0) / secondHalf.length;
  const trendDelta = Math.round(avgSecond - avgFirst);
  const trendDirection = trendDelta > 2 ? 'up' : trendDelta < -2 ? 'down' : 'flat';

  const byCompany = {};
  history.forEach((s) => {
    if (!byCompany[s.company]) byCompany[s.company] = { sessions: 0, totalPct: 0, totalQs: 0 };
    byCompany[s.company].sessions++;
    byCompany[s.company].totalPct += s.pct;
    byCompany[s.company].totalQs += s.count;
  });
  const companyBreakdown = Object.entries(byCompany)
    .map(([name, data]) => ({
      name,
      sessions: data.sessions,
      avgScore: Math.round(data.totalPct / data.sessions),
      totalQuestions: data.totalQs,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    avgScore,
    gradeOrder,
    gradeDist,
    maxGradeCount,
    trendDelta,
    trendDirection,
    companyBreakdown,
    totalSessions: history.length,
    totalQuestions: history.reduce((sum, s) => sum + s.count, 0),
    scores: history.map((s) => s.pct),
  };
}

function avgToGrade(pct) {
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 65) return 'D';
  return 'F';
}

/* ---------- main component ---------- */

const SNAPPY = [0.16, 1, 0.3, 1];

export default function HistoryPanel({ open, history, onClose, onAnalytics, side = 'right' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  const analytics = history.length > 0 ? computeAnalytics(history) : null;
  const avgGrade = analytics ? avgToGrade(analytics.avgScore) : null;
  const isLeft = side === 'left';
  const slideFrom = isLeft ? '-100%' : '100%';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="history-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.65, 0, 0.35, 1] }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 500,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />

          {/* Panel */}
          <motion.aside
            key={`history-panel-${side}`}
            className="history-panel"
            initial={{ x: slideFrom }}
            animate={{ x: 0 }}
            exit={{ x: slideFrom }}
            transition={{ duration: 0.35, ease: SNAPPY }}
            style={{
              position: 'fixed',
              top: 0,
              [isLeft ? 'left' : 'right']: 0,
              bottom: 0,
              width: 400,
              maxWidth: '90vw',
              zIndex: 510,
              background: tokens.color.surface,
              [isLeft ? 'borderRight' : 'borderLeft']: `1px solid ${tokens.color.border}`,
              boxShadow: isLeft
                ? '8px 0 32px rgba(0,0,0,0.4)'
                : '-8px 0 32px rgba(0,0,0,0.4)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* --- Header --- */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 20px',
                borderBottom: `1px solid ${tokens.color.border}`,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: tokens.font.body,
                  fontSize: 16,
                  fontWeight: 600,
                  color: tokens.color.text,
                }}
              >
                Recent Sessions
              </span>
              <button
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: tokens.radius.sm,
                  border: 'none',
                  background: 'none',
                  color: tokens.color.textSecondary,
                  cursor: 'pointer',
                  transition: `all 0.15s ${tokens.ease.snappy}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = tokens.color.elevated;
                  e.currentTarget.style.color = tokens.color.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                  e.currentTarget.style.color = tokens.color.textSecondary;
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* --- Content --- */}
            <div style={{ padding: '0 20px 24px', flex: 1 }}>
              {analytics ? (
                <>
                  {/* View Full Analytics button */}
                  {onAnalytics && (
                    <button
                      onClick={onAnalytics}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '10px 16px',
                        marginTop: 16,
                        borderRadius: tokens.radius.md,
                        border: `1px solid ${tokens.color.borderLight}`,
                        background: 'rgba(62,232,181,0.04)',
                        color: tokens.color.accent,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: tokens.font.body,
                        letterSpacing: 0.5,
                        cursor: 'pointer',
                        transition: `all 0.2s ${tokens.ease.snappy}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(62,232,181,0.1)';
                        e.currentTarget.style.borderColor = 'rgba(62,232,181,0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(62,232,181,0.04)';
                        e.currentTarget.style.borderColor = tokens.color.borderLight;
                      }}
                    >
                      <BarChart3 size={14} />
                      View Full Analytics
                    </button>
                  )}

                  {/* Stats Row */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <StatCard
                      label="Avg Score"
                      value={`${analytics.avgScore}%`}
                      color={gradeColor(avgGrade)}
                    />
                    <StatCard label="Sessions" value={analytics.totalSessions} />
                    <StatCard label="Questions" value={analytics.totalQuestions} />
                  </div>

                  {/* Trend */}
                  {analytics.scores.length >= 2 ? (
                    <>
                      <SectionLabel>Trend</SectionLabel>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          background: tokens.color.elevated,
                          borderRadius: tokens.radius.md,
                          border: `1px solid ${tokens.color.border}`,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              marginBottom: 4,
                            }}
                          >
                            {analytics.trendDirection === 'up' && (
                              <TrendingUp size={14} color={tokens.color.accent} />
                            )}
                            {analytics.trendDirection === 'down' && (
                              <TrendingDown size={14} color={tokens.color.error} />
                            )}
                            {analytics.trendDirection === 'flat' && (
                              <Minus size={14} color={tokens.color.textSecondary} />
                            )}
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color:
                                  analytics.trendDirection === 'up'
                                    ? tokens.color.accent
                                    : analytics.trendDirection === 'down'
                                      ? tokens.color.error
                                      : tokens.color.textSecondary,
                              }}
                            >
                              {analytics.trendDirection === 'up'
                                ? 'Improving'
                                : analytics.trendDirection === 'down'
                                  ? 'Declining'
                                  : 'Steady'}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: tokens.color.textSecondary,
                              }}
                            >
                              {analytics.trendDelta > 0 ? '+' : ''}
                              {analytics.trendDelta}%
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: 11,
                              color: tokens.color.textMuted,
                              margin: 0,
                            }}
                          >
                            Comparing recent vs earlier sessions
                          </p>
                        </div>
                        <Sparkline scores={analytics.scores} />
                      </div>
                    </>
                  ) : (
                    <>
                      <SectionLabel>Trend</SectionLabel>
                      <p
                        style={{
                          fontSize: 12,
                          color: tokens.color.textMuted,
                          margin: 0,
                        }}
                      >
                        Complete more sessions to see trends.
                      </p>
                    </>
                  )}

                  {/* Grade Distribution */}
                  <SectionLabel>Grade Distribution</SectionLabel>
                  {analytics.gradeOrder.map((g) => (
                    <GradeBar
                      key={g}
                      grade={g}
                      count={analytics.gradeDist[g]}
                      maxCount={analytics.maxGradeCount}
                    />
                  ))}

                  {/* Company Breakdown */}
                  {analytics.companyBreakdown.length > 0 && (
                    <>
                      <SectionLabel>By Company</SectionLabel>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        {analytics.companyBreakdown.map((c) => (
                          <div
                            key={c.name}
                            style={{
                              padding: '10px 14px',
                              background: tokens.color.elevated,
                              borderRadius: tokens.radius.md,
                              border: `1px solid ${tokens.color.border}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: tokens.color.text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: tokens.color.textSecondary,
                                marginTop: 3,
                              }}
                            >
                              {c.sessions} session{c.sessions !== 1 ? 's' : ''} · Avg{' '}
                              <span style={{ color: gradeColor(avgToGrade(c.avgScore)) }}>
                                {c.avgScore}%
                              </span>{' '}
                              · {c.totalQuestions} questions
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* All Sessions */}
                  <SectionLabel>All Sessions</SectionLabel>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {history
                      .slice()
                      .reverse()
                      .map((session, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            background: tokens.color.elevated,
                            borderRadius: tokens.radius.md,
                            border: `1px solid ${tokens.color.border}`,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: tokens.font.body,
                              fontSize: 20,
                              fontWeight: 300,
                              color: gradeColor(session.grade),
                              minWidth: 30,
                              textAlign: 'center',
                            }}
                          >
                            {session.grade}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: tokens.color.text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {session.company}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: tokens.color.textSecondary,
                                marginTop: 2,
                              }}
                            >
                              {new Date(session.date).toLocaleDateString()} ·{' '}
                              {session.count}/{session.total} Qs · {session.pct}%
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: tokens.color.textMuted,
                    textAlign: 'center',
                    marginTop: 40,
                  }}
                >
                  No sessions yet.
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
