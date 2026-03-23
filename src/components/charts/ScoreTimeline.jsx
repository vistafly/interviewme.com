import { useState, useRef, useEffect, useCallback } from 'react';
import { tokens } from '../../styles/tokens';
import { gradeColor } from '../../lib/grading';

const PAD = { top: 16, right: 12, bottom: 32, left: 36 };
const DOT_R = 4;

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

export default function ScoreTimeline({ sessions }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(560);
  const [hovered, setHovered] = useState(-1);
  const height = 180;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scores = sessions.map((s) => s.pct);
  const dates = sessions.map((s) =>
    new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  );

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  // Scale helpers
  const xOf = useCallback(
    (i) => PAD.left + (scores.length === 1 ? plotW / 2 : (i / (scores.length - 1)) * plotW),
    [scores.length, plotW],
  );
  const yOf = useCallback(
    (val) => PAD.top + plotH - (val / 100) * plotH,
    [plotH],
  );

  // Build polyline + area path
  const linePoints = scores.map((s, i) => `${xOf(i)},${yOf(s)}`).join(' ');
  const areaPath =
    scores.length >= 2
      ? `M${xOf(0)},${yOf(scores[0])} ` +
        scores.map((s, i) => `L${xOf(i)},${yOf(s)}`).join(' ') +
        ` L${xOf(scores.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`
      : '';

  // Mouse interaction
  const handleMouseMove = useCallback(
    (e) => {
      if (scores.length < 1) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < scores.length; i++) {
        const dist = Math.abs(xOf(i) - mx);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHovered(closest);
    },
    [scores, xOf],
  );

  if (scores.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>
          No data to display
        </span>
      </div>
    );
  }

  // Grid lines at 25, 50, 75, 100
  const gridLines = [25, 50, 75, 100];

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(-1)}
    >
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tokens.color.accent} stopOpacity={0.18} />
            <stop offset="100%" stopColor={tokens.color.accent} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="4 4"
            />
            <text
              x={PAD.left - 6}
              y={yOf(v) + 3}
              textAnchor="end"
              fill={tokens.color.textMuted}
              fontSize={9}
              fontFamily={tokens.font.body}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Area fill */}
        {scores.length >= 2 && <path d={areaPath} fill="url(#areaGrad)" />}

        {/* Line */}
        {scores.length >= 2 && (
          <polyline
            points={linePoints}
            fill="none"
            stroke={tokens.color.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Dots */}
        {scores.map((s, i) => (
          <circle
            key={i}
            cx={xOf(i)}
            cy={yOf(s)}
            r={hovered === i ? DOT_R + 2 : DOT_R}
            fill={hovered === i ? tokens.color.accent : tokens.color.surface}
            stroke={tokens.color.accent}
            strokeWidth={2}
            style={{ transition: 'r 0.15s ease' }}
          />
        ))}

        {/* Hover vertical line */}
        {hovered >= 0 && (
          <line
            x1={xOf(hovered)}
            x2={xOf(hovered)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        )}

        {/* X-axis date labels — show at most ~8 labels */}
        {scores.map((_, i) => {
          const step = Math.max(1, Math.floor(scores.length / 8));
          if (i % step !== 0 && i !== scores.length - 1) return null;
          return (
            <text
              key={`d${i}`}
              x={xOf(i)}
              y={height - 6}
              textAnchor="middle"
              fill={tokens.color.textMuted}
              fontSize={9}
              fontFamily={tokens.font.body}
            >
              {dates[i]}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: xOf(hovered),
            top: yOf(scores[hovered]) - 48,
            transform: 'translateX(-50%)',
            padding: '6px 10px',
            borderRadius: tokens.radius.sm,
            background: tokens.color.elevated,
            border: `1px solid ${tokens.color.borderLight}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: gradeColor(avgToGrade(scores[hovered])),
              fontFamily: tokens.font.body,
            }}
          >
            {scores[hovered]}%
          </span>
          <span
            style={{
              fontSize: 11,
              color: tokens.color.textSecondary,
              marginLeft: 6,
              fontFamily: tokens.font.body,
            }}
          >
            {dates[hovered]}
          </span>
        </div>
      )}
    </div>
  );
}
