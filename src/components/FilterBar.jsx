import { X, SlidersHorizontal } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { gradeColor } from '../lib/grading';

const GRADE_ORDER = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
const DATE_OPTIONS = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: 'All', value: 'all' },
];

const pillBase = {
  padding: '5px 12px',
  borderRadius: tokens.radius.full,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: tokens.font.body,
  cursor: 'pointer',
  transition: `all 0.2s ${tokens.ease.snappy}`,
  border: 'none',
  outline: 'none',
};

export default function FilterBar({
  companies,
  companyFilter,
  setCompanyFilter,
  gradeFilter,
  toggleGradeFilter,
  dateRange,
  setDateRange,
  hasActiveFilters,
  clearFilters,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '16px 0',
      }}
    >
      <SlidersHorizontal size={13} color={tokens.color.textMuted} style={{ flexShrink: 0 }} />

      {/* Company select */}
      {companies.length > 1 && (
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          style={{
            ...pillBase,
            padding: '5px 10px',
            background: companyFilter !== 'all' ? 'rgba(94,170,255,0.1)' : tokens.color.elevated,
            color: companyFilter !== 'all' ? tokens.color.accentBlue : tokens.color.textSecondary,
            border: companyFilter !== 'all'
              ? '1px solid rgba(94,170,255,0.3)'
              : `1px solid ${tokens.color.border}`,
            appearance: 'none',
            WebkitAppearance: 'none',
            paddingRight: 22,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
        >
          <option value="all">All Companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {/* Grade chips */}
      <div style={{ display: 'flex', gap: 3 }}>
        {GRADE_ORDER.map((g) => {
          const active = gradeFilter.includes(g);
          const color = gradeColor(g);
          return (
            <button
              key={g}
              onClick={() => toggleGradeFilter(g)}
              style={{
                ...pillBase,
                padding: '4px 9px',
                background: active ? `${color}18` : tokens.color.elevated,
                color: active ? color : tokens.color.textMuted,
                border: active ? `1px solid ${color}55` : `1px solid ${tokens.color.border}`,
              }}
            >
              {g}
            </button>
          );
        })}
      </div>

      {/* Date range pills */}
      <div style={{ display: 'flex', gap: 3 }}>
        {DATE_OPTIONS.map((opt) => {
          const active = dateRange === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              style={{
                ...pillBase,
                padding: '4px 11px',
                background: active ? 'rgba(62,232,181,0.08)' : tokens.color.elevated,
                color: active ? tokens.color.accent : tokens.color.textMuted,
                border: active
                  ? `1px solid rgba(62,232,181,0.3)`
                  : `1px solid ${tokens.color.border}`,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Clear */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          style={{
            ...pillBase,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            background: 'none',
            color: tokens.color.textSecondary,
            border: `1px solid ${tokens.color.border}`,
          }}
        >
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}
