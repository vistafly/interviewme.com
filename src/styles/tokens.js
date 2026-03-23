export const tokens = {
  color: {
    bg: '#08080a',
    surface: '#111114',
    elevated: '#1a1a1f',
    text: '#e8e4dd',
    textSecondary: 'rgba(255,255,255,0.35)',
    textMuted: 'rgba(255,255,255,0.15)',
    accent: '#3ee8b5',
    accentBlue: '#5eaaff',
    warning: '#f0c654',
    error: '#ff5252',
    border: 'rgba(255,255,255,0.04)',
    borderLight: 'rgba(255,255,255,0.08)',
  },
  font: {
    display: "'Playfair Display', serif",
    body: "'DM Sans', sans-serif",
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20, full: 99 },
  ease: {
    snappy: 'cubic-bezier(0.16, 1, 0.3, 1)',
    smooth: 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
};

export function gradeColor(grade) {
  const map = {
    'A':  '#3ee8b5',
    'A-': '#3ee8b5',
    'B+': '#5eaaff',
    'B':  '#5eaaff',
    'B-': '#5eaaff',
    'C+': '#f0c654',
    'C':  '#f0c654',
    'C-': '#f0c654',
    'D+': '#ff7e6b',
    'D':  '#ff7e6b',
    'F':  '#ff5252',
  };
  return map[grade] || '#666';
}
