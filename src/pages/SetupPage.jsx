import { useMemo, useState, useCallback } from 'react';
import { ArrowLeft, ArrowRight, Link } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { useInterviewSetup } from '../hooks/useInterviewSetup';
import { useAuth } from '../contexts/AuthContext';
import DarkVeil from '../components/DarkVeil';
import Hyperspeed from '../components/Hyperspeed';
import LoadingDots from '../components/LoadingDots';
import RotatingText from '../components/RotatingText';
import UserMenu from '../components/UserMenu';
import UpgradeModal from '../components/UpgradeModal';

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

/** Strip common website boilerplate from pasted job description text */
const BOILERPLATE_RE = [
  /\bcookie\s*(categor|setting|preference|consent|policy|notice|banner)/i,
  /\bopt[- ]?out\b.*\b(cookie|ads?|banner|tracking)\b/i,
  /\b(advertising|functional(?:ity)?|strictly\s+necessary|analytics?)\s+cookies?\b/i,
  /\bcookies?\s+allow\s+(delivery|our\s+website|you)\b/i,
  /\bbrowser\s+cookies?\s+(?:also\s+)?make\b/i,
  /\b(untick|uncheck)\b.*\b(checkbox|tickbox)\b/i,
  /\bnon-?personali[sz]ed\s*(google\s*)?ads?\b/i,
  /\bbanner\s*ads?\s*(being\s+)?display/i,
  /\bpersonali[sz]ed\s+google\s+ads\b/i,
  /\benable\s+the\s+tracking\s+of\s+each\s+logged/i,
  /\bnecessary\s+cookies?\s+allow\b/i,
  /\bsite\s+cookies?\s+help\s+to\s+ensure\b/i,
  /\bsave\s*[/&]\s*update\s*(your\s*)?(setting|preference)/i,
  /\b(register|sign\s*up)\s*(here\s*)?(to\s+apply|for\s+jobs?)\b/i,
  /\b(login|log\s*in)\s+area\b/i,
  /\bpost\s+a\s+job\b/i,
  /\bsearch\s+database\s+of\b.*\bjobs?\b/i,
  /\bsearch\s+(for\s+)?(further|more)\s+jobs?\b/i,
  /\bjobs?\s+by\s+category\b/i,
  /\bapply\s+for\s+jobs?\s*-?\s*jobseeker\b/i,
  /\bjobseeker\s*\/\s*employer\b/i,
  /\bfree\s+job\s+posting\b/i,
  /\bsearch\s+categories\b/i,
  /[©\u00a9]\s*\d{4}\b/,
  /\ball\s+business\/?brand\s+names?\b/i,
  /\bregistered\s+trademarks?\s+of\s+their\b/i,
  /\bnot\s+affiliated\s+with\s+any\s+employer\b/i,
  /\btransferred\s+to\s+a\s+third[- ]party\s+website\b/i,
  /\bfind\s+&?\s*apply\s+for\s+(expat|english\s+teaching)\s+jobs?\b/i,
  /\bjob\s+posting\s+web\s+site\b/i,
  /\bgood\s+interactions\s+over\s+\d+\s+years?\b/i,
  /\bview\s+this\s+new\b.*\bopening\s+in\b/i,
  /\bapply\s+(?:now|for\s+jobs?)\s+(?:or|and)\s+learn\s+more\b/i,
  /\bto\s+apply\s+now\s+or\s+learn\s+more\b/i,
  /\bgo\s+to\s+the\s+application\s+page\b/i,
  /\bapply\s+for\s+jobs?\s+in\s+your\s+niche\b/i,
  /^(?:start\s+here\s*>*|interested\s+in\s+this\s+opportunity\s*\??|apply\s+now\s*!?|learn\s+more\s*!?|apply\s+to\s+job|post\s+a\s+job|register\s+here|login|sign\s+in|education\s*\/\s*teaching)$/i,
];
function cleanPastedJD(text) {
  return text.split('\n').filter((line) => {
    const t = line.trim();
    return !t || !BOILERPLATE_RE.some((re) => re.test(t));
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const HYPERSPEED_PRESET = {
  onSpeedUp: () => {},
  onSlowDown: () => {},
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [400 * 0.03, 400 * 0.2],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0x131318,
    brokenLines: 0x131318,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3,
  },
};

export default function SetupPage({ onBack, onReady }) {
  const { user } = useAuth();
  const {
    jobDescription,
    setJobDescription,
    jobTitle,
    setJobTitle,
    companyName,
    setCompanyName,
    generating,
    error,
    progress,
    generate,
    canGenerate,
    fetchJobUrl,
    fetching,
    quotaExceeded,
    quotaIsAnon,
    clearQuota,
  } = useInterviewSetup();
  const [btnHover, setBtnHover] = useState(false);
  const [backHover, setBackHover] = useState(false);
  const [jobUrl, setJobUrl] = useState('');

  const handleFetchUrl = useCallback(() => {
    if (!jobUrl.trim()) return;
    fetchJobUrl(jobUrl.trim());
  }, [jobUrl, fetchJobUrl]);

  const handlePasteUrl = useCallback((e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (/^https?:\/\/.+\..+/.test(pasted)) {
      e.preventDefault();
      setJobUrl(pasted);
      fetchJobUrl(pasted);
    }
  }, [fetchJobUrl]);

  const handlePasteDescription = useCallback((e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (!pasted) return;
    const cleaned = cleanPastedJD(pasted);
    if (cleaned !== pasted) {
      e.preventDefault();
      setJobDescription(cleaned);
    }
  }, [setJobDescription]);

  const effectOptions = useMemo(() => HYPERSPEED_PRESET, []);

  const handleGenerate = async () => {
    const result = await generate();
    if (result?.questions) {
      onReady(result.questions, companyName, jobTitle);
    }
  };

  const jdWordCount = jobDescription.trim()
    ? jobDescription.trim().split(/\s+/).length
    : 0;

  return (
    <div className="page-enter" style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      {!generating && (
        <>
          {/* DarkVeil canvas — full viewport, dimmed behind content */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              opacity: (btnHover || backHover) ? 0.75 : 0.45,
              filter: backHover
                ? 'brightness(1.8) saturate(0.35) contrast(1.1) hue-rotate(120deg)'
                : btnHover
                  ? 'brightness(1.8) saturate(0.35) contrast(1.1)'
                  : 'brightness(1) saturate(1)',
              transform: (btnHover || backHover) ? 'scale(1.03)' : 'scale(1)',
              transformOrigin: 'center 60%',
              transition: (btnHover || backHover)
                ? 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), filter 0s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                : 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1), filter 0s, transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
              animation: 'fadeIn 1.6s ease both',
            }}
          >
            <DarkVeil speed={0.5} />
          </div>
          {/* Edge fade — keeps center visible, darkens periphery */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(ellipse 80% 65% at 50% 40%, transparent 0%, rgba(8,8,10,0.5) 60%, rgba(8,8,10,0.92) 100%)',
            }}
          />
        </>
      )}

      {/* Hyperspeed — always mounted so WebGL context + shaders are preloaded */}
      <div
        style={
          generating
            ? {
                position: 'absolute',
                inset: 0,
                zIndex: 0,
                animation: progress >= 100
                  ? 'fadeIn 0.8s ease both, warpBurst 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards'
                  : 'fadeIn 0.8s ease both',
                transformOrigin: 'center 60%',
              }
            : {
                position: 'absolute',
                width: 0,
                height: 0,
                overflow: 'hidden',
                opacity: 0,
                pointerEvents: 'none',
              }
        }
      >
        <Hyperspeed effectOptions={effectOptions} />
      </div>

      {/* Cinematic vignette overlay — depth + readability */}
      {generating && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            background: `
              radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, rgba(8,8,10,0.4) 60%, rgba(8,8,10,0.85) 100%),
              linear-gradient(to top, rgba(8,8,10,0.7) 0%, transparent 30%)
            `,
            animation: 'fadeIn 1.2s ease both',
          }}
        />
      )}


      {/* Back + Generate buttons are rendered inside the form layout below */}

      {/* Account / UserMenu — bottom-right */}
      {user && !generating && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 100,
            animation: 'fadeIn 1s ease 0.4s both',
          }}
        >
          <UserMenu />
        </div>
      )}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 'clamp(400px, 50vw, 880px)',
          margin: '0 auto',
          height: '100dvh',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          padding: `${isMobile ? '60px' : 'clamp(64px, 7vh, 110px)'} clamp(16px, 4vw, 40px) ${isMobile ? '56px' : 'clamp(28px, 4vh, 48px)'}`,
        }}
      >
        {!generating ? (
          /* --- Form State --- */
          <>
          {/* Mobile nav row — fixed at top, outside padding */}
          {isMobile && (
            <div
              style={{
                position: 'fixed',
                top: 14,
                left: 16,
                right: 16,
                zIndex: 100,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                animation: 'fadeIn 0.6s ease 0.2s both',
              }}
            >
              <button
                onClick={onBack}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontFamily: tokens.font.body,
                  fontWeight: 400,
                  letterSpacing: 0.3,
                  color: 'rgba(255,120,120,0.5)',
                  background: 'rgba(255,80,80,0.04)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,80,80,0.08)',
                  borderRadius: tokens.radius.full,
                  cursor: 'pointer',
                  padding: '8px 16px 8px 12px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  setBackHover(true);
                  e.currentTarget.style.color = 'rgba(255,140,140,0.95)';
                  e.currentTarget.style.background = 'rgba(255,80,80,0.12)';
                  e.currentTarget.style.borderColor = 'rgba(255,80,80,0.22)';
                }}
                onMouseLeave={(e) => {
                  setBackHover(false);
                  e.currentTarget.style.color = 'rgba(255,120,120,0.5)';
                  e.currentTarget.style.background = 'rgba(255,80,80,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(255,80,80,0.08)';
                }}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontFamily: tokens.font.body,
                  fontWeight: 400,
                  letterSpacing: 0.3,
                  color: canGenerate ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
                  background: canGenerate ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: canGenerate ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
                  borderRadius: tokens.radius.full,
                  cursor: canGenerate ? 'pointer' : 'default',
                  padding: '8px 14px 8px 16px',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (canGenerate) setBtnHover(true);
                  if (!canGenerate) return;
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  setBtnHover(false);
                  if (!canGenerate) return;
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
                }}
              >
                Begin
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div
            style={{
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: tokens.radius.xl,
              padding: 'clamp(16px, 2vw, 28px) clamp(24px, 3vw, 44px)',
              animation: 'fadeUp 0.7s var(--ease-snappy) both',
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h1
              style={{
                fontFamily: tokens.font.body,
                fontSize: 'clamp(24px, 3.5vw, 42px)',
                fontWeight: 300,
                letterSpacing: -0.5,
                lineHeight: 1.3,
                color: '#fff',
                marginBottom: 4,
                textAlign: 'center',
                animation: 'fadeUp 0.8s var(--ease-snappy) both',
              }}
            >
              Set up your interview
            </h1>

            <p
              style={{
                fontSize: 'clamp(11px, 1.2vw, 14px)',
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                textAlign: 'center',
                marginBottom: 'clamp(14px, 2vw, 24px)',
                animation: 'fadeUp 0.8s var(--ease-snappy) 0.1s both',
              }}
            >
              Paste a job description · tailored mock interview
            </p>

            {/* Job URL (optional) */}
            <div
              style={{
                marginBottom: 'clamp(12px, 1.4vh, 20px)',
                animation: 'fadeUp 0.7s var(--ease-snappy) 0.11s both',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: tokens.color.textSecondary,
                  marginBottom: 8,
                }}
              >
                Job Posting URL <span style={{ color: tokens.color.textMuted, fontWeight: 400, textTransform: 'none' }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Link
                    size={14}
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: tokens.color.textMuted,
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    onPaste={handlePasteUrl}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleFetchUrl(); }}
                    placeholder="https://jobs.lever.co/company/..."
                    disabled={fetching}
                    style={{
                      width: '100%',
                      padding: 'clamp(10px, 1.2vw, 16px) clamp(12px, 1.5vw, 20px) clamp(10px, 1.2vw, 16px) 36px',
                      fontSize: 'clamp(13px, 1.4vw, 17px)',
                      background: 'rgba(17, 17, 20, 0.6)',
                      border: `1px solid ${tokens.color.borderLight}`,
                      borderRadius: tokens.radius.md,
                      color: tokens.color.text,
                      outline: 'none',
                      opacity: fetching ? 0.5 : 1,
                      transition: `border-color 0.2s ${tokens.ease.snappy}, opacity 0.2s ease`,
                    }}
                  />
                </div>
                <button
                  onClick={handleFetchUrl}
                  disabled={!jobUrl.trim() || fetching}
                  style={{
                    padding: '0 18px',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    color: (!jobUrl.trim() || fetching) ? tokens.color.textMuted : tokens.color.text,
                    background: (!jobUrl.trim() || fetching) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${(!jobUrl.trim() || fetching) ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: tokens.radius.md,
                    cursor: (!jobUrl.trim() || fetching) ? 'default' : 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fetching ? 'Fetching...' : 'Fetch'}
                </button>
              </div>
            </div>

            {/* Company Name + Job Title row */}
            <div
              style={{
                display: 'flex',
                gap: 'clamp(12px, 1.2vw, 20px)',
                marginBottom: 'clamp(12px, 1.4vh, 20px)',
                animation: 'fadeUp 0.7s var(--ease-snappy) 0.12s both',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: tokens.color.textSecondary,
                    marginBottom: 8,
                  }}
                >
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Google, Stripe"
                  style={{
                    width: '100%',
                    padding: 'clamp(10px, 1.2vw, 16px) clamp(12px, 1.5vw, 20px)',
                    fontSize: 'clamp(13px, 1.4vw, 17px)',
                    background: 'rgba(17, 17, 20, 0.6)',
                    border: `1px solid ${tokens.color.borderLight}`,
                    borderRadius: tokens.radius.md,
                    color: tokens.color.text,
                    outline: 'none',
                    transition: `border-color 0.2s ${tokens.ease.snappy}`,
                  }}
                />
              </div>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: tokens.color.textSecondary,
                    marginBottom: 8,
                  }}
                >
                  Job Title
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Frontend Engineer"
                  style={{
                    width: '100%',
                    padding: 'clamp(10px, 1.2vw, 16px) clamp(12px, 1.5vw, 20px)',
                    fontSize: 'clamp(13px, 1.4vw, 17px)',
                    background: 'rgba(17, 17, 20, 0.6)',
                    border: `1px solid ${tokens.color.borderLight}`,
                    borderRadius: tokens.radius.md,
                    color: tokens.color.text,
                    outline: 'none',
                    transition: `border-color 0.2s ${tokens.ease.snappy}`,
                  }}
                />
              </div>
            </div>

            {/* Job Description */}
            <div
              style={{
                animation: 'fadeUp 0.7s var(--ease-snappy) 0.22s both',
                flex: '1 1 auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: tokens.color.textSecondary,
                  marginBottom: 8,
                }}
              >
                Job Description
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                onPaste={handlePasteDescription}
                placeholder="Paste the full job description here..."
                style={{
                  width: '100%',
                  flex: '1 1 auto',
                  minHeight: isMobile ? 100 : 140,
                  padding: 'clamp(10px, 1.2vw, 16px) clamp(12px, 1.5vw, 20px)',
                  fontSize: 'clamp(13px, 1.4vw, 17px)',
                  lineHeight: 1.6,
                  background: 'rgba(17, 17, 20, 0.6)',
                  border: `1px solid ${tokens.color.borderLight}`,
                  borderRadius: tokens.radius.md,
                  color: tokens.color.text,
                  outline: 'none',
                  resize: 'none',
                  transition: `border-color 0.2s ${tokens.ease.snappy}`,
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: jdWordCount >= 50
                    ? tokens.color.accent
                    : jdWordCount > 0
                      ? tokens.color.warning
                      : tokens.color.textMuted,
                  marginTop: 6,
                  textAlign: 'right',
                  transition: 'color 0.2s ease',
                }}
              >
                {jdWordCount} / 50 words minimum
              </div>
            </div>


          </div>

          {/* Back — left of modal, vertically centered (desktop only) */}
          <button
            onClick={onBack}
            style={{
              position: 'fixed',
              top: '50%',
              right: 'calc(50% + clamp(200px, 25vw, 440px) + clamp(16px, 4vw, 40px) + 16px)',
              transform: 'translateY(-50%)',
              zIndex: 100,
              display: isMobile ? 'none' : 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontFamily: tokens.font.body,
              fontWeight: 400,
              letterSpacing: 0.3,
              color: 'rgba(255,120,120,0.5)',
              background: 'rgba(255,80,80,0.04)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,80,80,0.08)',
              borderRadius: tokens.radius.full,
              cursor: 'pointer',
              padding: '8px 20px 8px 14px',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              animation: 'fadeIn 0.6s ease 0.2s both',
            }}
            onMouseEnter={(e) => {
              setBackHover(true);
              e.currentTarget.style.color = 'rgba(255,140,140,0.95)';
              e.currentTarget.style.background = 'rgba(255,80,80,0.12)';
              e.currentTarget.style.borderColor = 'rgba(255,80,80,0.22)';
            }}
            onMouseLeave={(e) => {
              setBackHover(false);
              e.currentTarget.style.color = 'rgba(255,120,120,0.5)';
              e.currentTarget.style.background = 'rgba(255,80,80,0.04)';
              e.currentTarget.style.borderColor = 'rgba(255,80,80,0.08)';
            }}
          >
            <ArrowLeft size={14} />
            Back
          </button>

          {/* Begin — right of modal, vertically centered (desktop only) */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{
              position: 'fixed',
              top: '50%',
              left: 'calc(50% + clamp(200px, 25vw, 440px) + clamp(16px, 4vw, 40px) + 16px)',
              transform: 'translateY(-50%)',
              zIndex: 100,
              display: isMobile ? 'none' : 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 18px 8px 20px',
              fontSize: 13,
              fontFamily: tokens.font.body,
              fontWeight: 400,
              letterSpacing: 0.3,
              color: canGenerate ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
              background: canGenerate ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: canGenerate ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
              borderRadius: tokens.radius.full,
              cursor: canGenerate ? 'pointer' : 'default',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              animation: 'fadeIn 0.6s ease 0.2s both',
            }}
            onMouseEnter={(e) => {
              if (canGenerate) setBtnHover(true);
              if (!canGenerate) return;
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              setBtnHover(false);
              if (!canGenerate) return;
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
            }}
          >
            Begin
            <ArrowRight size={14} />
          </button>

          {/* Error / info — centered below modal */}
          {error && (
            <p style={{
              fontSize: 12,
              color: error.includes('paste the job description') || error.includes('paste the description')
                ? tokens.color.warning || '#f0a030'
                : tokens.color.error,
              margin: '8px 0 0',
              textAlign: 'center',
            }}>
              {error}
            </p>
          )}
          </>
        ) : (
          /* --- Generating State: text overlaid on Hyperspeed --- */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: 'calc(100vh - 200px)',
            }}
          >
            {/* Title — stagger 1 */}
            <h2
              style={{
                fontFamily: tokens.font.body,
                fontSize: 28,
                fontWeight: 300,
                color: '#fff',
                marginBottom: 12,
                textShadow: isMobile
                  ? '0 2px 10px rgba(0,0,0,0.8)'
                  : '0 0 40px rgba(200, 154, 255, 0.3), 0 0 80px rgba(125, 223, 255, 0.15), 0 2px 20px rgba(0,0,0,0.8)',
                animation: 'fadeUp 0.9s var(--ease-snappy) 0.3s both',
              }}
            >
              {progress >= 100 ? (
                <span
                  style={{
                    color: tokens.color.accent,
                    filter: isMobile
                      ? 'none'
                      : 'brightness(1.3) drop-shadow(0 0 12px rgba(62, 232, 181, 0.7)) drop-shadow(0 0 40px rgba(62, 232, 181, 0.35))',
                    transition: isMobile ? 'color 0.6s ease' : 'filter 0.6s ease, color 0.6s ease',
                  }}
                >
                  You're ready.
                </span>
              ) : (
                <RotatingText
                  phrases={[
                    'Reading between the lines',
                    'Mapping role expectations',
                    'Tailoring to the brief',
                    'Sharpening the questions',
                  ]}
                  interval={4000}
                  startDelay={0}
                  stagger={0.025}
                />
              )}
            </h2>

            {/* Subtitle — stagger 2 */}
            <p
              style={{
                fontSize: 14,
                textShadow: isMobile
                  ? '0 2px 8px rgba(0,0,0,0.8)'
                  : '0 0 20px rgba(200, 154, 255, 0.2), 0 2px 16px rgba(0,0,0,0.8)',
                transition: isMobile
                  ? 'color 0.6s ease'
                  : 'color 0.6s ease, filter 0.6s ease, text-shadow 0.6s ease',
                color: progress >= 100
                  ? tokens.color.accent
                  : tokens.color.textSecondary,
                filter: !isMobile && progress >= 100
                  ? 'brightness(1.2) drop-shadow(0 0 10px rgba(62, 232, 181, 0.5))'
                  : 'none',
                animation: 'fadeUp 0.9s var(--ease-snappy) 0.5s both',
              }}
            >
              {progress >= 100 ? (
                'Entering your session now'
              ) : (
                <>
                  Building for{' '}
                  <strong style={{ color: tokens.color.text }}>{companyName}</strong>
                </>
              )}
            </p>

            {/* Loading dots — stagger 3 */}
            <div
              style={{
                marginTop: 24,
                animation: 'fadeUp 0.9s var(--ease-snappy) 0.7s both',
              }}
            >
              <LoadingDots success={progress >= 100} />
            </div>
          </div>
        )}
      </div>
      <UpgradeModal open={quotaExceeded} isAnon={quotaIsAnon} onClose={clearQuota} />
    </div>
  );
}
