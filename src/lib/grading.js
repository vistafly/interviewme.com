export function gradeAnswer(transcript, keys, timeUsed) {
  if (!transcript || !keys || keys.length === 0) return null;

  const lower = transcript.toLowerCase();
  const words = transcript.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Find keyword hits — exact match first, then stem-match for multi-word keywords
  // Use shorter 4-char stems so paraphrased answers still match
  const hits = keys.filter((k) => {
    const keyLower = k.toLowerCase();
    if (lower.includes(keyLower)) return true;
    // Stem match: significant words (4+ chars), match if ANY word stem appears
    const sigWords = keyLower.match(/\b[a-z]{4,}\b/g);
    if (!sigWords || sigWords.length === 0) return false;
    // Relaxed: count a hit if most (>= half) of the significant words match
    const matched = sigWords.filter(sw => {
      const stem = sw.length > 5 ? sw.slice(0, 5) : sw;
      return new RegExp(`\\b${stem}\\w*`, 'i').test(lower);
    });
    return matched.length >= Math.ceil(sigWords.length / 2);
  });

  // Effort base — reward answer length since people paraphrase and won't hit exact keywords.
  // This is a placeholder grade while AI grading loads; be generous.
  let base = 0;
  if (wordCount >= 100) base = 55;
  else if (wordCount >= 80) base = 45;
  else if (wordCount >= 60) base = 40;
  else if (wordCount >= 30) base = 35;
  else if (wordCount >= 20) base = 20;

  // Keyword bonus on top (max 40) — rewards hitting actual concepts
  let score = base + (hits.length / keys.length) * 40;

  // Brevity bonus
  if (timeUsed < 90 && wordCount >= 30) score += 5;

  // Very short answers capped
  if (wordCount < 20) score = Math.min(score, 20);

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { pct: score, grade: letterGrade(score), hits, total: keys.length };
}

export function letterGrade(pct) {
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
