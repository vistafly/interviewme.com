import { useState, useCallback, useEffect } from 'react';
import { tokens } from '../styles/tokens';
import { loadHistory, loadHistoryForUser } from '../lib/storage';
import { loadUsageDoc } from '../lib/firestore';
import { setTransitionState } from '../lib/perfProfiler';
import { useAuth } from '../contexts/AuthContext';
import { User } from 'lucide-react';
import Button from '../components/Button';
import Orb from '../components/Orb';
import RotatingText from '../components/RotatingText';
import HistoryPanel from '../components/HistoryPanel';
import GradualBlur from '../components/GradualBlur';
import FloatingSessionButton from '../components/FloatingSessionButton';
import AuthCard from '../components/AuthCard';
import UserMenu from '../components/UserMenu';
import ScrambleText from '../components/ScrambleText';
import PrivacyPage from './PrivacyPage';

const HOVER_FILTER = 'brightness(1.8) saturate(0.35) contrast(1.1)';
const BASE_FILTER = 'brightness(1) saturate(1)';

const WELCOME_NAMES = [
  'Alex', 'Priya', 'Jordan', 'Sofia', 'Marcus', 'Aisha', 'Liam', 'Mei',
  'Carlos', 'Fatima', 'Noah', 'Yuki', 'Ethan', 'Zara', 'Oliver', 'Anya',
  'Diego', 'Leila', 'Samuel', 'Ines', 'Ryan', 'Amara', 'Daniel', 'Noor',
  'Lucas', 'Elena', 'James', 'Sana', 'Kai', 'Mira', 'Theo', 'Hana',
  'Victor', 'Chloe', 'Ravi', 'Luna', 'Oscar', 'Isla', 'Mateo', 'Aria',
  'Hassan', 'Freya', 'Leo', 'Naomi', 'Samir', 'Iris', 'Felix', 'Layla',
  'Adrian', 'Zuri', 'Nathan', 'Dina', 'Caleb', 'Maya', 'Andre', 'Nadia',
  'Hugo', 'Selma', 'Aiden', 'Kira', 'Elias', 'Tara', 'Marco', 'Ivy',
  'Javier', 'Rosa', 'Dominic', 'Lina', 'Ezra', 'Vera', 'Roman', 'Yara',
  'Micah', 'Emi', 'Axel', 'Ayla', 'Rohan', 'Eva', 'Omar', 'Nina',
  'Jasper', 'Alina', 'Finn', 'Esme', 'Idris', 'Clara', 'Dante', 'Lena',
  'Malik', 'Stella', 'Silas', 'Thea', 'Nico', 'Jade', 'Asher', 'Talia',
  'Gabriel', 'Mina', 'Julian', 'Sara', 'Vincent', 'Ava', 'Tariq', 'Alma',
  'Sebastian', 'Ingrid', 'Hamza', 'Suki', 'Rafael', 'Demi', 'Ibrahim', 'Pia',
  'Anton', 'Reina', 'Kofi', 'Elif', 'Henrik', 'Wren', 'Arjun', 'Nyla',
  'Emilio', 'Seren', 'Bodhi', 'Rio', 'Kenji', 'Sage', 'Cyrus', 'Maren',
];

const getUserFirstName = (user) => {
  if (user?.displayName) return user.displayName.split(' ')[0];
  if (user?.email) return user.email.split('@')[0];
  return null;
};

// ── Quota indicator ───────────────────────────────────────────────────────────
// Orb exact colors: purple #9c43fe (156,67,254), cyan #4cc2e9 (76,194,233)
const ORB_GLOW = {
  display: 'inline-block',
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: 'radial-gradient(circle, #9c43fe 0%, #4cc2e9 50%, #101499 100%)',
  transition: 'all 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
};

const ORB_BRIGHT = {
  display: 'inline-block',
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: 'radial-gradient(circle, #ffffff 0%, #dce8ff 50%, #a8bce0 100%)',
  boxShadow: '0 0 5px rgba(255,255,255,0.95), 0 0 12px rgba(210,225,255,0.8), 0 0 22px rgba(180,200,255,0.45)',
  transition: 'all 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
};

const ORB_DIM = {
  display: 'inline-block',
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.03)',
  boxShadow: 'none',
  border: '1px solid rgba(255,255,255,0.06)',
  transition: 'all 0.7s cubic-bezier(0.4,0,0.2,1)',
};

const LABEL = {
  fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
  fontSize: 10,
  color: 'rgba(255,255,255,0.2)',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  marginLeft: 7,
};

function QuotaIndicator({ usage, isAnon, ctaHover }) {
  const FREE_LIMIT = 5;
  const ANON_LIMIT = 3;
  const activeOrb = ctaHover ? ORB_BRIGHT : ORB_GLOW;
  const activeClass = ctaHover ? '' : 'quota-orb';

  if (isAnon) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 11 }}>
        {Array.from({ length: ANON_LIMIT }).map((_, i) => (
          <span key={i} className={activeClass} style={activeOrb} />
        ))}
        <span style={LABEL}>3 free · sign in for 5</span>
      </div>
    );
  }

  // No usage doc yet = 0 used today
  const { count = 0, isPro = false } = usage ?? {};
  const limit = isPro ? 30 : FREE_LIMIT;
  const remaining = Math.max(0, limit - count);

  if (isPro) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11 }}>
        <span style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 9,
          fontWeight: 500,
          color: 'rgba(76,194,233,0.65)',
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          border: '1px solid rgba(76,194,233,0.2)',
          borderRadius: 4,
          padding: '2px 7px',
          boxShadow: '0 0 8px rgba(76,194,233,0.12)',
          textShadow: '0 0 6px rgba(76,194,233,0.5)',
        }}>
          Pro
        </span>
        <span style={LABEL}>{remaining} of {limit} today</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 11 }}>
      {Array.from({ length: FREE_LIMIT }).map((_, i) => (
        <span key={i} className={i < count ? '' : activeClass} style={i < count ? ORB_DIM : activeOrb} />
      ))}
      <span style={{
        ...LABEL,
        color: remaining === 0 ? 'rgba(255,82,82,0.4)' : 'rgba(255,255,255,0.2)',
        transition: 'color 0.7s ease',
      }}>
        {remaining === 0 ? 'limit reached' : `${remaining} left today`}
      </span>
    </div>
  );
}

export default function LandingPage({ onStart, onAnalytics, onAdmin }) {
  const { user, loading } = useAuth();
  const [history, setHistory] = useState(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelSide, setPanelSide] = useState('right');
  const [ctaHover, setCtaHover] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);
  const [quota, setQuota] = useState(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // Load history from Firestore for signed-in users
  useEffect(() => {
    if (loading) return;
    loadHistoryForUser(user?.uid).then(setHistory);
  }, [user, loading]);

  // Load quota for signed-in users
  useEffect(() => {
    if (loading || !user) { setQuota(null); return; }
    loadUsageDoc(user.uid).then(setQuota);
  }, [user, loading]);

  // Auto-proceed with onStart after successful auth from CTA
  useEffect(() => {
    if (user && pendingStart) {
      setPendingStart(false);
      onStart();
    }
  }, [user, pendingStart, onStart]);

  const handleCtaEnter = useCallback(() => {
    setCtaHover(true);
    setTransitionState({ name: 'ctaHover', active: true, filter: HOVER_FILTER, transform: 'scale(1.03)' });
  }, []);

  const handleCtaLeave = useCallback(() => {
    setCtaHover(false);
    setTransitionState({ name: 'ctaHover', active: false, filter: BASE_FILTER, transform: 'scale(1)' });
  }, []);

  const handleTouchStart = useCallback(() => {
    handleCtaEnter();
  }, [handleCtaEnter]);

  return (
    <div
      className="page-enter"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleCtaLeave}
      onTouchCancel={handleCtaLeave}
      style={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* Orb — full viewport, interactive */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          transition: ctaHover
            ? 'filter 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'filter 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
          filter: ctaHover ? HOVER_FILTER : BASE_FILTER,
          transform: ctaHover ? 'scale(1.03)' : 'scale(1)',
          transformOrigin: 'center 55%',
        }}
      >
        <Orb
          hoverIntensity={0.26}
          rotateOnHover
          hue={0}
          forceHoverState={ctaHover}
          ctaHover={ctaHover}
          backgroundColor="#08080a"
        />
        {/* Bottom blur — constrained to text area on large screens */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(100%, 800px)',
            height: '100%',
            pointerEvents: 'none',
            maskImage:
              'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
          }}
        >
          <GradualBlur
            target="parent"
            position="bottom"
            height="10rem"
            responsive
            desktopHeight="16rem"
            tabletHeight="22rem"
            mobileHeight="22rem"
            strength={3}
            divCount={10}
            curve="ease-out"
            exponential
            opacity={0.85}
          />
        </div>
      </div>

      {/* Sign in / User menu — bottom-right corner */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 2,
          animation: 'fadeIn 1s ease 0.4s both',
        }}
      >
        {user ? (
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
        ) : (
          <button
            onClick={() => setAuthOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              color: tokens.color.textSecondary,
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: tokens.radius.full,
              cursor: 'pointer',
              transition: 'color 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = tokens.color.text;
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = tokens.color.textSecondary;
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            <User size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Brand + welcome — desktop: all grouped; mobile: logo top, name in orb */}
      {!loading && (
        <div
          className="landing-brand"
          style={{
            position: 'fixed',
            top: '38%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
            pointerEvents: 'none',
            animation: 'fadeIn 2s ease both',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'clamp(14px, 2vw, 24px)',
          }}
        >
          <img
            src="/logo.png"
            alt="InterviewMe"
            style={{
              height: 'clamp(44px, 6vw, 64px)',
              width: 'auto',
              objectFit: 'contain',
              filter: ctaHover
                ? `${HOVER_FILTER} drop-shadow(0 0 20px rgba(156,67,254,0.5)) drop-shadow(0 0 40px rgba(76,194,233,0.3))`
                : 'drop-shadow(0 0 16px rgba(156,67,254,0.45)) drop-shadow(0 0 32px rgba(76,194,233,0.2))',
              transform: ctaHover ? 'scale(1.03)' : 'scale(1)',
              transformOrigin: 'center center',
              transition: ctaHover
                ? 'filter 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
                : 'filter 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
          <span
            style={{
              fontFamily: tokens.font.body,
              fontSize: 'clamp(24px, 3.5vw, 40px)',
              fontWeight: 300,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: 2,
              textShadow:
                '0 0 30px rgba(200, 154, 255, 0.2), 0 0 60px rgba(125, 223, 255, 0.1)',
              whiteSpace: 'nowrap',
            }}
          >
            Interview<span style={{ fontWeight: 500 }}>Me</span>
          </span>
          {/* Welcome — visible on desktop only (inside flex group) */}
          <div className="landing-welcome-desktop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p
              style={{
                fontFamily: tokens.font.body,
                fontSize: 'clamp(11px, 1.2vw, 14px)',
                fontWeight: 300,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: 3,
                textTransform: 'uppercase',
                margin: 0,
                whiteSpace: 'nowrap',
                textShadow: '0 0 30px rgba(62,232,181,0.15), 0 0 60px rgba(62,232,181,0.06)',
              }}
            >
              Welcome,{' '}
              {getUserFirstName(user) || (
                <ScrambleText
                  words={WELCOME_NAMES}
                  interval={3000}
                  charDelay={80}
                />
              )}
            </p>
            <QuotaIndicator usage={quota} isAnon={!user} ctaHover={ctaHover} />
          </div>
        </div>
      )}

      {/* Welcome — visible on mobile only (centered in orb) */}
      {!loading && (
        <div
          className="landing-welcome-mobile"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
            pointerEvents: 'none',
            animation: 'fadeIn 2s ease both',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p
            style={{
              fontFamily: tokens.font.body,
              fontSize: 'clamp(11px, 1.2vw, 14px)',
              fontWeight: 300,
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: 3,
              textTransform: 'uppercase',
              margin: 0,
              whiteSpace: 'nowrap',
              textShadow: '0 0 30px rgba(62,232,181,0.15), 0 0 60px rgba(62,232,181,0.06)',
            }}
          >
            Welcome,{' '}
            {getUserFirstName(user) || (
              <ScrambleText
                words={WELCOME_NAMES}
                interval={3000}
                charDelay={80}
              />
            )}
          </p>
          <QuotaIndicator usage={quota} isAnon={!user} ctaHover={ctaHover} />
          </div>
        </div>
      )}

      {/* Hero — minimal, bottom-anchored, lets the orb breathe */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          height: '100dvh',
          textAlign: 'center',
          pointerEvents: 'none',
          padding: '0 24px min(80px, 10dvh)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'auto',
          }}
        >
        <h1
          className="delay-2"
          style={{
            fontFamily: tokens.font.body,
            fontSize: 'clamp(32px, 4.5vw, 44px)',
            fontWeight: 300,
            lineHeight: 1.3,
            color: '#fff',
            margin: '0 0 14px',
            animation: 'fadeUp 0.8s var(--ease-snappy) both',
            letterSpacing: -0.5,
            textShadow: '0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)',
          }}
        >
          Paste the job.{' '}
          <RotatingText
            phrases={[
              'Practice the interview.',
              'Master the response.',
              'Land the role.',
              'Own the conversation.',
              'Nail the answer.',
              'Crush the callback.',
            ]}
          />
        </h1>

        <p
          className="delay-3"
          style={{
            animation: 'fadeUp 0.8s var(--ease-snappy) 0.1s both',
            fontFamily: tokens.font.body,
            fontSize: 13,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.4)',
            margin: '0 0 32px',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            textShadow: '0 0 16px rgba(0,0,0,0.8), 0 0 32px rgba(0,0,0,0.4)',
          }}
        >
          AI questions &middot; Voice or text &middot; Instant grading
        </p>

        <div
          className="delay-4"
          style={{
            animation: 'fadeUp 0.8s var(--ease-snappy) 0.2s both',
          }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              if (user) {
                onStart();
              } else {
                setPendingStart(true);
                setAuthOpen(true);
              }
            }}
            onMouseEnter={handleCtaEnter}
            onMouseLeave={handleCtaLeave}
            style={{
              padding: '14px 40px',
              fontSize: 14,
              letterSpacing: 0.5,
              color: ctaHover ? '#fff' : 'rgba(255,255,255,0.7)',
              border: ctaHover ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
              background: ctaHover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
              boxShadow: ctaHover ? '0 0 24px rgba(255,255,255,0.08), 0 0 60px rgba(180,200,255,0.06)' : 'none',
              transition: ctaHover ? 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            Get Started
          </Button>
        </div>
        </div>
      </div>

      {/* Floating session button — always visible for analytics access */}
      <FloatingSessionButton
        count={history.length}
        onClick={() => setHistoryOpen(true)}
        onSideChange={setPanelSide}
      />

      {/* History Panel (side drawer) */}
      <HistoryPanel
        open={historyOpen}
        history={history}
        onClose={() => setHistoryOpen(false)}
        onAnalytics={() => {
          setHistoryOpen(false);
          onAnalytics();
        }}
        side={panelSide}
      />

      {/* Auth Card */}
      <AuthCard
        open={authOpen && !user}
        onClose={() => setAuthOpen(false)}
      />

      {/* Privacy footer */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.25)',
          pointerEvents: 'none',
        }}
      >
        By using InterviewMe you agree to our{' '}
        <button
          onClick={() => setShowPrivacy(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            padding: 0,
            textDecoration: 'underline',
            pointerEvents: 'auto',
          }}
        >
          Privacy Policy
        </button>
      </div>

      {showPrivacy && <PrivacyPage onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
