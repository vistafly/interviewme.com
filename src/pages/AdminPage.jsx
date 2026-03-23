import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Check, X, Users, BarChart2, AlertTriangle, Sliders, Calendar } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { useAuth } from '../contexts/AuthContext';
import { getAdminStats, runOptimization, approveCalibration, discardCalibration } from '../lib/api';

const QUESTION_TYPES = ['behavioral', 'motivation', 'opinion', 'hypothetical', 'follow_up'];
const JOB_CATS = ['Sales', 'Tech', 'Healthcare', 'Finance', 'Customer Service', 'Management', 'Creative', 'General'];
const FEATURE_KEYS = ['clarity', 'vocabulary', 'depth', 'structure', 'relevance', 'coherence'];
const TABS = [
  { id: 'overview',     label: 'Overview',    icon: BarChart2 },
  { id: 'sessions',     label: 'Sessions',    icon: Users },
  { id: 'errors',       label: 'Error Analysis', icon: AlertTriangle },
  { id: 'calibration',  label: 'Calibration', icon: Sliders },
];

const CAT_COLORS = {
  Sales: '#5eaaff', Tech: '#3ee8b5', Healthcare: '#f0c654', Finance: '#c9a0ff',
  'Customer Service': '#ff9f7e', Management: '#7ed8f6', Creative: '#ff7eb3', General: '#8c8c9e',
};

export default function AdminPage({ onBack }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [optimizing, setOptimizing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  // Date filter state
  const [datePreset, setDatePreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const getDateRange = useCallback(() => {
    if (datePreset === 'custom') return { dateFrom, dateTo };
    if (datePreset === 'all') return {};
    const now = new Date();
    const from = new Date(now);
    if (datePreset === '7d') from.setDate(from.getDate() - 7);
    else if (datePreset === '30d') from.setDate(from.getDate() - 30);
    else if (datePreset === '90d') from.setDate(from.getDate() - 90);
    return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) };
  }, [datePreset, dateFrom, dateTo]);

  // Sessions filter state
  const [filterCat, setFilterCat] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [filterGap, setFilterGap] = useState('All');
  const [sortBy, setSortBy] = useState('gap_desc');

  async function fetchStats(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      setStats(await getAdminStats(idToken, getDateRange()));
      setLastUpdated(new Date());
    } catch (e) { setError(e.message); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => {
    fetchStats();
  }, [datePreset, dateFrom, dateTo]);

  async function handleOptimize() {
    setOptimizing(true); setActionMsg(null);
    try {
      const idToken = await user.getIdToken();
      const result = await runOptimization(idToken);
      const typesComputed = QUESTION_TYPES.filter((t) => result.proposed?.[t]).length;
      if (typesComputed > 0) {
        setActionMsg(`Optimization complete — coefficients computed for ${typesComputed} question type${typesComputed > 1 ? 's' : ''}. Review below.`);
      } else {
        setActionMsg('No coefficients computed — need ≥20 samples per question type (after outlier removal).');
      }
      await fetchStats();
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    }
    finally { setOptimizing(false); }
  }

  async function handleApprove() {
    setApproving(true); setActionMsg(null);
    try {
      const idToken = await user.getIdToken();
      await approveCalibration(idToken);
      setActionMsg('Calibration approved and live.');
      await fetchStats();
    } catch (e) { setActionMsg(`Error: ${e.message}`); }
    finally { setApproving(false); }
  }

  // Filtered + sorted records for Sessions tab
  const filteredRecords = useMemo(() => {
    if (!stats?.recentRecords) return [];
    let rows = stats.recentRecords;
    if (filterCat !== 'All') rows = rows.filter((r) => r.jobCategory === filterCat);
    if (filterType !== 'All') rows = rows.filter((r) => r.questionType === filterType);
    if (filterGap === 'over5')  rows = rows.filter((r) => (r.gap ?? 0) > 5);
    if (filterGap === 'under5') rows = rows.filter((r) => (r.gap ?? 0) < -5);
    if (filterGap === 'large')  rows = rows.filter((r) => Math.abs(r.gap ?? 0) > 10);
    if (filterGap === 'flagged') rows = rows.filter((r) => r.structureFlagged);
    if (sortBy === 'gap_desc') rows = [...rows].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
    if (sortBy === 'gap_asc')  rows = [...rows].sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
    if (sortBy === 'abs_gap')  rows = [...rows].sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
    if (sortBy === 'ai_desc')  rows = [...rows].sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0));
    if (sortBy === 'ai_asc')   rows = [...rows].sort((a, b) => (a.aiScore ?? 0) - (b.aiScore ?? 0));
    if (sortBy === 'date')     rows = [...rows].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return rows;
  }, [stats?.recentRecords, filterCat, filterType, filterGap, sortBy]);

  return (
    <div style={{ minHeight: '100vh', background: tokens.color.bg, color: tokens.color.text }}>
      <style>{`@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.3} } @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 28px', borderBottom: `1px solid ${tokens.color.border}` }}>
        <button onClick={onBack} style={navBtn}>
          <ArrowLeft size={15} /> Back
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: tokens.color.text }}>Admin Dashboard</span>
        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: tokens.color.accent, flexShrink: 0, animation: 'livePulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, color: tokens.color.textMuted }}>
            {lastUpdated ? `Live · ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Connecting...'}
          </span>
        </div>
        <button onClick={() => fetchStats()} disabled={loading} style={{ ...navBtn, marginLeft: 'auto' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 28px', borderBottom: `1px solid ${tokens.color.border}` }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', fontSize: 12, fontWeight: tab === id ? 600 : 400,
              color: tab === id ? tokens.color.text : tokens.color.textSecondary,
              background: 'none', border: 'none',
              borderBottom: tab === id ? `2px solid ${tokens.color.accent}` : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s ease', marginBottom: -1,
              fontFamily: tokens.font.body,
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Date filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '12px 28px', borderBottom: `1px solid ${tokens.color.border}` }}>
        <Calendar size={13} style={{ color: tokens.color.textMuted }} />
        <span style={{ fontSize: 11, color: tokens.color.textMuted, marginRight: 4 }}>Range</span>
        {[
          { id: 'all', label: 'All Time' },
          { id: '7d',  label: '7 Days' },
          { id: '30d', label: '30 Days' },
          { id: '90d', label: '90 Days' },
          { id: 'custom', label: 'Custom' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setDatePreset(id)}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 99,
              border: `1px solid ${datePreset === id ? tokens.color.accent : tokens.color.border}`,
              background: datePreset === id ? `${tokens.color.accent}18` : 'none',
              color: datePreset === id ? tokens.color.accent : tokens.color.textSecondary,
              cursor: 'pointer', fontFamily: tokens.font.body, transition: 'all 0.15s ease',
            }}
          >
            {label}
          </button>
        ))}
        {datePreset === 'custom' && (
          <>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={dateInputStyle}
            />
            <span style={{ fontSize: 11, color: tokens.color.textMuted }}>to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={dateInputStyle}
            />
          </>
        )}
        {datePreset !== 'all' && (
          <span style={{ fontSize: 10, color: tokens.color.textMuted, marginLeft: 'auto' }}>
            {datePreset === 'custom'
              ? `${dateFrom || '…'} → ${dateTo || '…'}`
              : `Last ${datePreset}`}
          </span>
        )}
      </div>

      <div style={{ padding: '24px 28px 56px', maxWidth: 1100 }}>
        {error && <div style={{ color: tokens.color.error, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {loading && <div style={{ color: tokens.color.textMuted, fontSize: 13, paddingTop: 32, textAlign: 'center' }}>Loading...</div>}

        {!loading && stats && (
          <>
            {tab === 'overview' && <OverviewTab stats={stats} />}
            {tab === 'sessions' && (
              <SessionsTab
                records={filteredRecords}
                total={stats.recentRecords?.length ?? 0}
                filterCat={filterCat} setFilterCat={setFilterCat}
                filterType={filterType} setFilterType={setFilterType}
                filterGap={filterGap} setFilterGap={setFilterGap}
                sortBy={sortBy} setSortBy={setSortBy}
              />
            )}
            {tab === 'errors' && <ErrorsTab stats={stats} />}
            {tab === 'calibration' && (
              <CalibrationTab
                stats={stats}
                actionMsg={actionMsg}
                optimizing={optimizing}
                approving={approving}
                onOptimize={handleOptimize}
                onApprove={handleApprove}
                onDiscard={async () => {
                  setActionMsg(null);
                  try {
                    const idToken = await user.getIdToken();
                    await discardCalibration(idToken);
                    setActionMsg('Proposed calibration discarded. Training data preserved.');
                    await fetchStats();
                  } catch (e) { setActionMsg(`Error: ${e.message}`); }
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ stats }) {
  return (
    <>
      {/* User + sample summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 28 }}>
        <LiveNowCard value={stats.liveUsers ?? 0} />
        <StatCard label="Total Users" value={stats.totalUsers ?? 0} accent />
        <StatCard label="Active (7d)" value={stats.activeUsersWeek ?? 0} />
        <StatCard label="Active (30d)" value={stats.activeUsersMonth ?? 0} />
        <StatCard label="New (7d)" value={stats.newUsersWeek ?? 0} />
        <StatCard label="Total Answers" value={stats.totalSamples} accent />
        <StatCard label="Flagged" value={stats.flaggedSamples} valueColor={stats.flaggedSamples > 0 ? tokens.color.warning : undefined} />
      </div>

      {/* 30-day activity */}
      <Section title="Daily Answers — Last 30 Days">
        <Daily30Chart daily={stats.daily30} />
      </Section>

      {/* Samples by question type */}
      <Section title="Answers by Question Type">
        <HorizBar
          data={QUESTION_TYPES.map((t) => ({ label: t, value: stats.byType[t] ?? 0 }))}
          total={stats.totalSamples}
          color={tokens.color.accentBlue}
        />
      </Section>

      {/* Samples by job category */}
      <Section title="Answers by Industry">
        <HorizBar
          data={JOB_CATS.map((c) => ({ label: c, value: stats.byJobCategory[c] ?? 0, color: CAT_COLORS[c] }))}
          total={stats.totalSamples}
        />
      </Section>

      {/* Score distribution */}
      <Section title="AI Score Distribution">
        <HorizBar
          data={Object.entries(stats.scoreDistribution ?? {}).map(([label, value]) => ({ label, value }))}
          total={stats.totalSamples}
          color={tokens.color.accent}
        />
      </Section>
    </>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab({ records, total, filterCat, setFilterCat, filterType, setFilterType, filterGap, setFilterGap, sortBy, setSortBy }) {
  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <FilterSelect label="Industry" value={filterCat} onChange={setFilterCat}
          options={[{ value: 'All', label: 'All Industries' }, ...JOB_CATS.map((c) => ({ value: c, label: c }))]} />
        <FilterSelect label="Type" value={filterType} onChange={setFilterType}
          options={[{ value: 'All', label: 'All Types' }, ...QUESTION_TYPES.map((t) => ({ value: t, label: t }))]} />
        <FilterSelect label="Gap" value={filterGap} onChange={setFilterGap}
          options={[
            { value: 'All', label: 'All Gaps' },
            { value: 'over5', label: 'Overestimate >5' },
            { value: 'under5', label: 'Underestimate >5' },
            { value: 'large', label: 'Large Error >10' },
            { value: 'flagged', label: 'Flagged Only' },
          ]} />
        <FilterSelect label="Sort" value={sortBy} onChange={setSortBy}
          options={[
            { value: 'abs_gap', label: 'Biggest Error' },
            { value: 'gap_desc', label: 'Most Overestimate' },
            { value: 'gap_asc', label: 'Most Underestimate' },
            { value: 'ai_desc', label: 'Highest AI Score' },
            { value: 'ai_asc', label: 'Lowest AI Score' },
            { value: 'date', label: 'Newest First' },
          ]} />
        <span style={{ fontSize: 11, color: tokens.color.textMuted, marginLeft: 'auto' }}>
          {records.length} of {total} records
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Date', 'Industry', 'Type', 'Heuristic', 'AI Score', 'Gap', 'Flag'].map((h) => (
                <th key={h} style={{ textAlign: 'left', color: tokens.color.textMuted, fontWeight: 500, padding: '6px 12px 8px 0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.slice(0, 100).map((r, i) => {
              const absGap = Math.abs(r.gap ?? 0);
              const gapColor = absGap <= 3 ? tokens.color.accent : absGap <= 7 ? tokens.color.warning : tokens.color.error;
              return (
                <tr key={i} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.textMuted }}>{r.timestamp?.slice(0, 10) ?? '–'}</td>
                  <td style={{ padding: '7px 12px 7px 0' }}>
                    <span style={{ fontSize: 11, color: CAT_COLORS[r.jobCategory] ?? tokens.color.textSecondary, background: `${CAT_COLORS[r.jobCategory] ?? '#8c8c9e'}18`, borderRadius: 99, padding: '2px 8px' }}>
                      {r.jobCategory}
                    </span>
                  </td>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.textSecondary }}>{r.questionType}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{r.heuristicScore}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.text, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r.aiScore}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: gapColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {r.gap != null ? `${r.gap > 0 ? '+' : ''}${r.gap}` : '–'}
                  </td>
                  <td style={{ padding: '7px 0 7px 0' }}>
                    {r.structureFlagged && <span style={{ fontSize: 10, color: tokens.color.warning }}>CAR</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {records.length === 0 && (
          <div style={{ textAlign: 'center', color: tokens.color.textMuted, fontSize: 12, padding: '24px 0' }}>No records match the current filters.</div>
        )}
      </div>
    </>
  );
}

// ── Error Analysis Tab ────────────────────────────────────────────────────────
function ErrorsTab({ stats }) {
  return (
    <>
      {/* Gap histogram */}
      <Section title="Gap Distribution (heuristic − AI score)">
        <GapHistogram histogram={stats.gapHistogram} total={stats.totalSamples} />
        <p style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 8 }}>
          Negative = heuristic underestimates. Positive = heuristic overestimates. Target: centered on 0.
        </p>
      </Section>

      {/* Gap by category */}
      <Section title="Mean Gap by Industry">
        <HorizBar
          data={JOB_CATS.map((c) => {
            const g = stats.meanGapByCategory?.[c];
            return { label: c, value: g != null ? Math.abs(g) : 0, rawLabel: g != null ? `${g > 0 ? '+' : ''}${g}` : '–', color: g != null ? (Math.abs(g) <= 3 ? tokens.color.accent : Math.abs(g) <= 6 ? tokens.color.warning : tokens.color.error) : tokens.color.border };
          }).filter((d) => d.value > 0)}
          total={null}
          showRaw
        />
      </Section>

      {/* Accuracy by question type */}
      <Section title="Accuracy by Question Type">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Type', 'Samples', 'Avg AI', 'Avg Heuristic', 'Mean Gap', 'RMSE'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', color: tokens.color.textMuted, fontWeight: 500, padding: '4px 12px 8px 0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUESTION_TYPES.map((type) => {
                const n    = stats.byType[type];
                const gap  = stats.meanGapByType?.[type];
                const rmse = stats.rmseByType?.[type];
                const ai   = stats.avgAiByType?.[type];
                const hs   = stats.avgHsByType?.[type];
                const gapColor = gap == null ? tokens.color.textMuted : Math.abs(gap) <= 3 ? tokens.color.accent : Math.abs(gap) <= 6 ? tokens.color.warning : tokens.color.error;
                return (
                  <tr key={type} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
                    <td style={{ padding: '8px 12px 8px 0', color: tokens.color.text, textTransform: 'capitalize' }}>{type}</td>
                    <td style={{ padding: '8px 12px 8px 0', color: tokens.color.textSecondary }}>{n}</td>
                    <td style={{ padding: '8px 12px 8px 0', color: tokens.color.text, fontVariantNumeric: 'tabular-nums' }}>{ai ?? '–'}</td>
                    <td style={{ padding: '8px 12px 8px 0', color: tokens.color.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{hs ?? '–'}</td>
                    <td style={{ padding: '8px 12px 8px 0', color: gapColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{gap != null ? `${gap > 0 ? '+' : ''}${gap}` : '–'}</td>
                    <td style={{ padding: '8px 12px 8px 0', color: rmse != null && rmse <= 5 ? tokens.color.accent : tokens.color.warning }}>{rmse ?? '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Feature averages by type */}
      <Section title="Feature Averages by Question Type">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: tokens.color.textMuted, fontWeight: 500, padding: '4px 12px 8px 0' }}>Type</th>
                {FEATURE_KEYS.map((f) => (
                  <th key={f} style={{ textAlign: 'right', color: tokens.color.textMuted, fontWeight: 500, padding: '4px 8px 8px 0', textTransform: 'capitalize' }}>{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUESTION_TYPES.map((type) => {
                const feats = stats.featureAvgsByType?.[type];
                if (!feats) return null;
                return (
                  <tr key={type} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
                    <td style={{ padding: '7px 12px 7px 0', color: tokens.color.text, textTransform: 'capitalize' }}>{type}</td>
                    {FEATURE_KEYS.map((f) => {
                      const v = feats[f];
                      const color = v == null ? tokens.color.textMuted : v >= 75 ? tokens.color.accent : v >= 50 ? tokens.color.warning : tokens.color.error;
                      return (
                        <td key={f} style={{ padding: '7px 8px 7px 0', textAlign: 'right', color, fontVariantNumeric: 'tabular-nums' }}>
                          {v != null ? Math.round(v) : '–'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

// ── Calibration Tab ───────────────────────────────────────────────────────────
function CalibrationTab({ stats, actionMsg, optimizing, approving, onOptimize, onApprove, onDiscard }) {
  const proposedHasCoefficients = QUESTION_TYPES.some((t) => stats.proposedCalibration?.[t]);
  return (
    <>
      {actionMsg && (
        <div style={{
          fontSize: 12,
          color: actionMsg.startsWith('Error') ? tokens.color.error : tokens.color.accent,
          marginBottom: 16,
        }}>
          {actionMsg}
        </div>
      )}
      <CalibrationTable label="Live Coefficients" data={stats.liveCalibration} />

      {stats.proposedCalibration && (
        <div style={{ marginTop: 24 }}>
          <CalibrationTable label="Proposed Coefficients" data={stats.proposedCalibration} highlight />
          {proposedHasCoefficients && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <ActionButton onClick={onApprove} loading={approving} icon={<Check size={13} />} label="Approve & Go Live" color={tokens.color.accent} />
              <ActionButton onClick={onDiscard} icon={<X size={13} />} label="Discard" color={tokens.color.textSecondary} />
            </div>
          )}
        </div>
      )}

      {!proposedHasCoefficients && (
        <div style={{ marginTop: 20 }}>
          <ActionButton
            onClick={onOptimize}
            loading={optimizing}
            icon={<RefreshCw size={13} />}
            label={`Run OLS Optimization (${stats.totalSamples} samples)`}
            color={stats.totalSamples >= 10 ? tokens.color.accentBlue : tokens.color.textMuted}
            disabled={stats.totalSamples < 10}
          />
          {stats.totalSamples < 10 && (
            <p style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 6 }}>
              Need at least 10 training samples (have {stats.totalSamples}).
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────
function LiveNowCard({ value }) {
  return (
    <div style={{
      background: value > 0 ? `${tokens.color.accent}12` : tokens.color.surface,
      border: `1px solid ${value > 0 ? `${tokens.color.accent}50` : tokens.color.border}`,
      borderRadius: tokens.radius.md, padding: '12px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: value > 0 ? tokens.color.accent : tokens.color.textMuted,
          animation: value > 0 ? 'livePulse 1.5s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: 11, color: value > 0 ? tokens.color.accent : tokens.color.textMuted, fontWeight: 600, letterSpacing: 0.5 }}>LIVE NOW</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 300, color: value > 0 ? tokens.color.accent : tokens.color.textSecondary }}>{value}</div>
      <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>online right now</div>
    </div>
  );
}

function StatCard({ label, value, valueColor, accent }) {
  return (
    <div style={{
      background: accent ? `${tokens.color.accent}0d` : tokens.color.surface,
      border: `1px solid ${accent ? `${tokens.color.accent}30` : tokens.color.border}`,
      borderRadius: tokens.radius.md, padding: '12px 16px',
    }}>
      <div style={{ fontSize: 26, fontWeight: 300, color: valueColor || (accent ? tokens.color.accent : tokens.color.text) }}>{value}</div>
      <div style={{ fontSize: 11, color: tokens.color.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: tokens.color.textSecondary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>{title}</div>
      <div style={{ background: tokens.color.surface, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md, padding: '14px 16px' }}>
        {children}
      </div>
    </div>
  );
}

function HorizBar({ data, total, color, showRaw }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {data.map(({ label, value, color: c, rawLabel }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 120, fontSize: 11, color: tokens.color.textSecondary, textAlign: 'right', flexShrink: 0, textTransform: 'capitalize' }}>{label}</div>
          <div style={{ flex: 1, height: 14, background: tokens.color.elevated, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: c || color || tokens.color.accentBlue, borderRadius: 3, transition: 'width 0.4s ease', opacity: 0.85 }} />
          </div>
          <div style={{ width: 42, fontSize: 11, color: tokens.color.textMuted, flexShrink: 0 }}>
            {showRaw ? rawLabel : (total != null ? `${Math.round((value / total) * 100)}%` : value)}
          </div>
          {!showRaw && <div style={{ width: 24, fontSize: 11, color: tokens.color.textMuted, flexShrink: 0 }}>{value}</div>}
        </div>
      ))}
    </div>
  );
}

function Daily30Chart({ daily = {} }) {
  const entries = Object.entries(daily);
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 56 }}>
      {entries.map(([day, count]) => {
        const h = Math.max(3, Math.round((count / max) * 48));
        const isToday = day === new Date().toISOString().slice(0, 10);
        return (
          <div key={day} title={`${day}: ${count}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
            <div style={{ width: '100%', height: h, background: isToday ? tokens.color.accent : tokens.color.accentBlue, borderRadius: 2, opacity: 0.75 }} />
            {parseInt(day.slice(8)) % 5 === 1 && (
              <div style={{ fontSize: 8, color: tokens.color.textMuted, whiteSpace: 'nowrap' }}>{day.slice(5)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const GAP_BUCKETS = ['-20', '-15', '-10', '-5', '0', '+5', '+10'];
function GapHistogram({ histogram = {}, total }) {
  const max = Math.max(...Object.values(histogram), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
      {GAP_BUCKETS.map((bucket) => {
        const count = histogram[bucket] ?? 0;
        const h = Math.max(3, Math.round((count / max) * 60));
        const isCenter = bucket === '0';
        const pct = total > 0 ? count / total : 0;
        return (
          <div key={bucket} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
            <div style={{ fontSize: 10, color: tokens.color.textMuted }}>{count}</div>
            <div style={{ width: '100%', height: h, background: isCenter ? tokens.color.accent : pct > 0.15 ? tokens.color.error : tokens.color.elevated, borderRadius: 3, opacity: 0.85 }} />
            <div style={{ fontSize: 10, color: tokens.color.textMuted }}>{bucket}</div>
          </div>
        );
      })}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: tokens.color.textMuted }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12, background: tokens.color.surface, border: `1px solid ${tokens.color.border}`,
          borderRadius: 6, color: tokens.color.text, padding: '4px 8px', cursor: 'pointer',
          fontFamily: tokens.font.body,
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CalibrationTable({ label, data, highlight }) {
  if (!data) return <div style={{ fontSize: 12, color: tokens.color.textMuted }}>No {label.toLowerCase()} found.</div>;
  const rows = QUESTION_TYPES.filter((t) => data[t]);
  if (rows.length === 0) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: highlight ? tokens.color.warning : tokens.color.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: tokens.color.textMuted }}>No coefficients computed — need ≥10 samples per question type.</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: highlight ? tokens.color.warning : tokens.color.textMuted, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Type', 'Slope', 'Intercept', 'RMSE', 'Samples'].map((h) => (
                <th key={h} style={{ textAlign: 'left', color: tokens.color.textMuted, fontWeight: 500, padding: '4px 12px 6px 0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {QUESTION_TYPES.map((type) => {
              const row = data[type];
              if (!row) return null;
              return (
                <tr key={type} style={{ borderTop: `1px solid ${tokens.color.border}` }}>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.text, textTransform: 'capitalize' }}>{type}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{row.modelType === 'multi' ? <span style={{ fontSize: 10, color: tokens.color.accent }}>multi</span> : (row.slope ?? '–')}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{row.modelType === 'multi' ? (row.intercept_raw ?? '–') : (row.intercept ?? '–')}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: row.rmse != null && row.rmse <= 5 ? tokens.color.accent : tokens.color.warning }}>{row.rmse ?? '–'}</td>
                  <td style={{ padding: '7px 12px 7px 0', color: tokens.color.textMuted }}>{row.sampleCount ?? '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionButton({ onClick, loading, icon, label, color, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: `1px solid ${color}`,
        borderRadius: 6, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        color, fontSize: 12, padding: '6px 14px',
        opacity: disabled ? 0.4 : 1, fontFamily: tokens.font.body,
      }}
    >
      {icon} {loading ? 'Working...' : label}
    </button>
  );
}

const dateInputStyle = {
  fontSize: 12, background: tokens.color.surface, border: `1px solid ${tokens.color.border}`,
  borderRadius: 6, color: tokens.color.text, padding: '3px 8px',
  fontFamily: tokens.font.body, colorScheme: 'dark',
};

const navBtn = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'none', border: `1px solid ${tokens.color.border}`,
  borderRadius: 6, cursor: 'pointer',
  color: tokens.color.textSecondary, fontSize: 12,
  padding: '5px 10px', fontFamily: tokens.font.body,
};
