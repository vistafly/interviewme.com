import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  Target,
  Flame,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { tokens } from '../styles/tokens';
import { gradeColor } from '../lib/grading';
import { loadHistory, loadHistoryForUser } from '../lib/storage';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../contexts/AuthContext';
import NavBar from '../components/NavBar';
import FilterBar from '../components/FilterBar';
import StatCard from '../components/charts/StatCard';
import SectionLabel from '../components/charts/SectionLabel';
import GradeBar from '../components/charts/GradeBar';
import ScoreTimeline from '../components/charts/ScoreTimeline';
import UserMenu from '../components/UserMenu';

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

/* ---------- sub-components ---------- */

function InsightRow({ icon: Icon, iconColor, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: tokens.radius.sm,
          background: `${iconColor}14`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={14} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: tokens.color.textSecondary }}>{label}</div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: tokens.color.text,
            marginTop: 1,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function CompanyCard({ company }) {
  const grade = avgToGrade(company.avgScore);
  return (
    <div
      style={{
        padding: '14px 16px',
        background: tokens.color.elevated,
        borderRadius: tokens.radius.md,
        border: `1px solid ${tokens.color.border}`,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: tokens.color.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 6,
        }}
      >
        {company.name}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span style={{ fontSize: 11, color: tokens.color.textSecondary }}>
          {company.sessions} session{company.sessions !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11 }}>
          Avg{' '}
          <span style={{ color: gradeColor(grade), fontWeight: 600 }}>
            {company.avgScore}%
          </span>
        </span>
        <span style={{ fontSize: 11, color: tokens.color.textSecondary }}>
          {company.totalQuestions} Qs
        </span>
      </div>
    </div>
  );
}

function SessionRow({ session, expanded, onToggle }) {
  const hasQuestions = session.questions && session.questions.length > 0;
  return (
    <div
      style={{
        background: tokens.color.elevated,
        borderRadius: tokens.radius.md,
        border: `1px solid ${tokens.color.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Summary row */}
      <div
        onClick={hasQuestions ? onToggle : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          cursor: hasQuestions ? 'pointer' : 'default',
          transition: `background 0.15s ${tokens.ease.snappy}`,
        }}
        onMouseEnter={(e) => {
          if (hasQuestions) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <span
          style={{
            fontFamily: tokens.font.body,
            fontSize: 22,
            fontWeight: 300,
            color: gradeColor(session.grade),
            minWidth: 36,
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
          <div style={{ fontSize: 11, color: tokens.color.textSecondary, marginTop: 2 }}>
            {new Date(session.date).toLocaleDateString()} · {session.count}/{session.total} Qs ·{' '}
            {session.pct}%
          </div>
        </div>
        {hasQuestions &&
          (expanded ? (
            <ChevronUp size={16} color={tokens.color.textSecondary} />
          ) : (
            <ChevronDown size={16} color={tokens.color.textSecondary} />
          ))}
      </div>

      {/* Expanded question detail */}
      <AnimatePresence>
        {expanded && hasQuestions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                borderTop: `1px solid ${tokens.color.border}`,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {session.questions.map((q, qi) => (
                <div
                  key={qi}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    background: tokens.color.surface,
                    borderRadius: tokens.radius.sm,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 300,
                      color: gradeColor(q.grade),
                      minWidth: 28,
                      textAlign: 'center',
                      lineHeight: '20px',
                    }}
                  >
                    {q.grade}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        color: tokens.color.text,
                        lineHeight: 1.4,
                        margin: 0,
                      }}
                    >
                      {q.question}
                    </p>
                    <div
                      style={{
                        fontSize: 10,
                        color: tokens.color.textSecondary,
                        marginTop: 5,
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{q.pct}%</span>
                      <span>
                        {q.hits?.length || 0}/{q.total} keywords
                      </span>
                      <span>{q.wordCount} words</span>
                      <span>{q.timeUsed}s</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyState({ filtered, onClear }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '80px 0',
        animation: 'fadeUp 0.8s var(--ease-snappy) both',
      }}
    >
      <BarChart3
        size={40}
        color={tokens.color.textMuted}
        style={{ marginBottom: 16 }}
      />
      <p
        style={{
          fontSize: 16,
          fontWeight: 300,
          color: tokens.color.text,
          marginBottom: 8,
        }}
      >
        {filtered ? 'No matching sessions' : 'No sessions yet'}
      </p>
      <p style={{ fontSize: 13, color: tokens.color.textSecondary, marginBottom: filtered ? 16 : 0 }}>
        {filtered
          ? 'Try adjusting your filters to see results.'
          : 'Complete your first interview to start tracking progress.'}
      </p>
      {filtered && onClear && (
        <button
          onClick={onClear}
          style={{
            padding: '8px 20px',
            borderRadius: tokens.radius.full,
            border: `1px solid ${tokens.color.borderLight}`,
            background: 'none',
            color: tokens.color.accent,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: tokens.font.body,
            cursor: 'pointer',
            transition: `all 0.2s ${tokens.ease.snappy}`,
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

/* ---------- main page ---------- */

export default function AnalyticsPage({ onBack, onAdmin }) {
  const { user, loading } = useAuth();
  const [history, setHistory] = useState(() => loadHistory());
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    setHistoryLoading(true);
    loadHistoryForUser(user?.uid)
      .then(setHistory)
      .finally(() => setHistoryLoading(false));
  }, [user, loading]);
  const {
    companyFilter,
    setCompanyFilter,
    gradeFilter,
    toggleGradeFilter,
    dateRange,
    setDateRange,
    clearFilters,
    hasActiveFilters,
    companies,
    filteredHistory,
    analytics,
  } = useAnalytics(history);

  const [expandedSession, setExpandedSession] = useState(null);

  return (
    <div
      className="page-enter"
      style={{ position: 'relative', minHeight: '100vh', background: tokens.color.bg }}
    >
      <NavBar
        left={
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: tokens.color.textSecondary,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: tokens.radius.sm,
              fontFamily: tokens.font.body,
              transition: `all 0.2s ${tokens.ease.snappy}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = tokens.color.text;
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = tokens.color.textSecondary;
              e.currentTarget.style.background = 'none';
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>
        }
        center={
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              color: tokens.color.textMuted,
            }}
          >
            Analytics
          </span>
        }
        right={user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {onAdmin && (
              <button
                onClick={onAdmin}
                style={{ fontSize: 11, color: tokens.color.textMuted, background: 'none', border: `1px solid ${tokens.color.border}`, borderRadius: 4, cursor: 'pointer', padding: '3px 8px' }}
              >
                Admin
              </button>
            )}
            <UserMenu />
          </div>
        ) : null}
      />

      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '76px 24px 80px',
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontFamily: tokens.font.body,
            fontSize: 'clamp(26px, 4vw, 34px)',
            fontWeight: 300,
            color: '#fff',
            letterSpacing: -0.5,
            margin: '0 0 6px',
            animation: 'fadeUp 0.8s var(--ease-snappy) both',
          }}
        >
          Performance Analytics
        </h1>
        <p
          style={{
            fontSize: 13,
            color: tokens.color.textSecondary,
            margin: '0 0 4px',
            animation: 'fadeUp 0.8s var(--ease-snappy) 0.05s both',
          }}
        >
          Track your progress across{' '}
          <span style={{ color: tokens.color.text }}>{history.length}</span> session
          {history.length !== 1 ? 's' : ''}
        </p>

        {/* Filters */}
        {history.length > 0 && (
          <div style={{ animation: 'fadeUp 0.8s var(--ease-snappy) 0.1s both' }}>
            <FilterBar
              companies={companies}
              companyFilter={companyFilter}
              setCompanyFilter={setCompanyFilter}
              gradeFilter={gradeFilter}
              toggleGradeFilter={toggleGradeFilter}
              dateRange={dateRange}
              setDateRange={setDateRange}
              hasActiveFilters={hasActiveFilters}
              clearFilters={clearFilters}
            />
          </div>
        )}

        {/* Dashboard content */}
        {(loading || historyLoading) ? (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 0',
              animation: 'fadeUp 0.8s var(--ease-snappy) both',
            }}
          >
            <BarChart3
              size={40}
              color={tokens.color.textMuted}
              style={{ marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }}
            />
            <p style={{ fontSize: 13, color: tokens.color.textSecondary }}>
              Loading analytics…
            </p>
          </div>
        ) : analytics ? (
          <>
            {/* Overview Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
                marginBottom: 32,
                animation: 'fadeUp 0.8s var(--ease-snappy) 0.15s both',
              }}
            >
              <StatCard label="Sessions" value={analytics.totalSessions} />
              <StatCard
                label="Avg Score"
                value={`${analytics.avgScore}%`}
                color={gradeColor(avgToGrade(analytics.avgScore))}
              />
              <StatCard
                label="Best"
                value={analytics.bestSession?.grade || '-'}
                color={gradeColor(analytics.bestSession?.grade)}
              />
              <StatCard label="Questions" value={analytics.totalQuestions} />
            </div>

            {/* Score Timeline */}
            {analytics.scores.length >= 2 && (
              <div style={{ animation: 'fadeUp 0.8s var(--ease-snappy) 0.2s both' }}>
                <SectionLabel>Score Over Time</SectionLabel>
                <div
                  style={{
                    background: tokens.color.elevated,
                    borderRadius: tokens.radius.lg,
                    border: `1px solid ${tokens.color.border}`,
                    padding: 20,
                    marginBottom: 32,
                  }}
                >
                  <ScoreTimeline sessions={filteredHistory} />
                </div>
              </div>
            )}

            {/* Two-column: Grade Distribution + Insights */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 20,
                marginBottom: 32,
                animation: 'fadeUp 0.8s var(--ease-snappy) 0.25s both',
              }}
            >
              {/* Grade Distribution */}
              <div>
                <SectionLabel>Grade Distribution</SectionLabel>
                <div
                  style={{
                    background: tokens.color.elevated,
                    borderRadius: tokens.radius.lg,
                    border: `1px solid ${tokens.color.border}`,
                    padding: 20,
                  }}
                >
                  {analytics.gradeOrder.map((g) => (
                    <GradeBar
                      key={g}
                      grade={g}
                      count={analytics.gradeDist[g]}
                      maxCount={analytics.maxGradeCount}
                    />
                  ))}
                </div>
              </div>

              {/* Performance Insights */}
              <div>
                <SectionLabel>Performance Insights</SectionLabel>
                <div
                  style={{
                    background: tokens.color.elevated,
                    borderRadius: tokens.radius.lg,
                    border: `1px solid ${tokens.color.border}`,
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <InsightRow
                    icon={
                      analytics.trendDirection === 'up'
                        ? TrendingUp
                        : analytics.trendDirection === 'down'
                          ? TrendingDown
                          : Minus
                    }
                    iconColor={
                      analytics.trendDirection === 'up'
                        ? tokens.color.accent
                        : analytics.trendDirection === 'down'
                          ? tokens.color.error
                          : tokens.color.textSecondary
                    }
                    label="Trend"
                    value={`${analytics.trendDirection === 'up' ? 'Improving' : analytics.trendDirection === 'down' ? 'Declining' : 'Steady'} (${analytics.trendDelta > 0 ? '+' : ''}${analytics.trendDelta}%)`}
                  />
                  <InsightRow
                    icon={Flame}
                    iconColor={tokens.color.warning}
                    label="Best Streak (80%+)"
                    value={`${analytics.bestStreak} session${analytics.bestStreak !== 1 ? 's' : ''}`}
                  />
                  {analytics.scores.length >= 3 && (
                    <InsightRow
                      icon={Target}
                      iconColor={tokens.color.accentBlue}
                      label="Improvement Rate"
                      value={`${analytics.improvementRate > 0 ? '+' : ''}${analytics.improvementRate} pts/session`}
                    />
                  )}
                  {analytics.bestSession && (
                    <InsightRow
                      icon={Award}
                      iconColor={tokens.color.accent}
                      label="Best Session"
                      value={`${analytics.bestSession.pct}% — ${analytics.bestSession.company}`}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Company Comparison */}
            {analytics.companyBreakdown.length > 1 && (
              <div style={{ animation: 'fadeUp 0.8s var(--ease-snappy) 0.3s both', marginBottom: 32 }}>
                <SectionLabel>Company Comparison</SectionLabel>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 10,
                  }}
                >
                  {analytics.companyBreakdown.map((c) => (
                    <CompanyCard key={c.name} company={c} />
                  ))}
                </div>
              </div>
            )}

            {/* Session Drill-down */}
            <div style={{ animation: 'fadeUp 0.8s var(--ease-snappy) 0.35s both' }}>
              <SectionLabel>All Sessions</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredHistory
                  .slice()
                  .reverse()
                  .map((session, i) => (
                    <SessionRow
                      key={i}
                      session={session}
                      expanded={expandedSession === i}
                      onToggle={() =>
                        setExpandedSession(expandedSession === i ? null : i)
                      }
                    />
                  ))}
              </div>
            </div>
          </>
        ) : history.length > 0 ? (
          <EmptyState filtered onClear={clearFilters} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
