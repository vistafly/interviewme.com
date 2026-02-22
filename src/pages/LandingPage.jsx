import { useState, useCallback, useEffect } from 'react';
import { tokens } from '../styles/tokens';
import { loadHistory, loadHistoryForUser } from '../lib/storage';
import { setTransitionState } from '../lib/perfProfiler';
import { useAuth } from '../contexts/AuthContext';
import NavBar from '../components/NavBar';
import Button from '../components/Button';
import Orb from '../components/Orb';
import RotatingText from '../components/RotatingText';
import HistoryPanel from '../components/HistoryPanel';
import GradualBlur from '../components/GradualBlur';
import FloatingSessionButton from '../components/FloatingSessionButton';
import AuthCard from '../components/AuthCard';
import UserMenu from '../components/UserMenu';
import ScrambleText from '../components/ScrambleText';

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

export default function LandingPage({ onStart, onAnalytics }) {
  const { user, loading } = useAuth();
  const [history, setHistory] = useState(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [panelSide, setPanelSide] = useState('right');
  const [ctaHover, setCtaHover] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authAutoShown, setAuthAutoShown] = useState(false);

  // Load history from Firestore for signed-in users
  useEffect(() => {
    if (loading) return;
    loadHistoryForUser(user?.uid).then(setHistory);
  }, [user, loading]);

  // Auto-show auth card after 2s for first-time unauthenticated visitors
  useEffect(() => {
    if (loading || user || authAutoShown) return;
    if (sessionStorage.getItem('auth_dismissed')) return;
    const t = setTimeout(() => {
      setAuthOpen(true);
      setAuthAutoShown(true);
    }, 2000);
    return () => clearTimeout(t);
  }, [loading, user, authAutoShown]);

  const handleCtaEnter = useCallback(() => {
    setCtaHover(true);
    setTransitionState({ name: 'ctaHover', active: true, filter: HOVER_FILTER, transform: 'scale(1.03)' });
  }, []);

  const handleCtaLeave = useCallback(() => {
    setCtaHover(false);
    setTransitionState({ name: 'ctaHover', active: false, filter: BASE_FILTER, transform: 'scale(1)' });
  }, []);

  return (
    <div className="page-enter" style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
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

      <NavBar
        left={
          <span
            style={{
              fontFamily: tokens.font.body,
              fontWeight: 600,
              fontSize: 14,
              color: tokens.color.text,
              letterSpacing: 0.5,
            }}
          >
            ◉ VoicePrep
          </span>
        }
        right={
          user ? (
            <UserMenu />
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              style={{
                fontFamily: tokens.font.body,
                fontSize: 12,
                fontWeight: 500,
                color: tokens.color.textSecondary,
                background: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: tokens.radius.full,
                padding: '6px 16px',
                cursor: 'pointer',
                letterSpacing: 0.3,
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
              Sign in
            </button>
          )
        }
      />

      {/* Welcome text — centered on orb */}
      {!loading && (
        <div
          style={{
            position: 'fixed',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
            pointerEvents: 'none',
            textAlign: 'center',
            animation: 'fadeIn 2s ease both',
          }}
        >
          <p
            style={{
              fontFamily: tokens.font.body,
              fontSize: 'clamp(14px, 1.8vw, 20px)',
              fontWeight: 300,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: 3,
              textTransform: 'uppercase',
              margin: 0,
              whiteSpace: 'nowrap',
              textShadow: '0 0 30px rgba(62,232,181,0.15), 0 0 60px rgba(62,232,181,0.06)',
            }}
          >
            Welcome,{' '}
            {user?.displayName ? (
              user.displayName.split(' ')[0]
            ) : (
              <ScrambleText
                words={WELCOME_NAMES}
                interval={3000}
                charDelay={80}
              />
            )}
          </p>
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
          }}
        >
          AI questions &middot; Voice or text &middot; Instant grading
        </p>

        <div
          className="delay-4"
          style={{
            animation: 'fadeUp 0.8s var(--ease-snappy) 0.2s both',
            pointerEvents: 'auto',
          }}
        >
          <Button
            variant="ghost"
            onClick={onStart}
            onMouseEnter={handleCtaEnter}
            onMouseLeave={handleCtaLeave}
            style={{
              padding: '14px 40px',
              fontSize: 14,
              letterSpacing: 0.5,
              color: ctaHover ? '#fff' : 'rgba(255,255,255,0.7)',
              border: ctaHover
                ? '1px solid rgba(255,255,255,0.35)'
                : '1px solid rgba(255,255,255,0.12)',
              background: ctaHover
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(255,255,255,0.05)',
              boxShadow: ctaHover
                ? '0 0 24px rgba(255,255,255,0.08), 0 0 60px rgba(180,200,255,0.06)'
                : 'none',
              transition: ctaHover
                ? 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                : 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            Get Started
          </Button>
        </div>
      </div>

      {/* Floating session button */}
      {history.length > 0 && (
        <FloatingSessionButton
          count={history.length}
          onClick={() => setHistoryOpen(true)}
          onSideChange={setPanelSide}
        />
      )}

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

      {/* Auth Card (non-intrusive floating sign-in) */}
      <AuthCard
        open={authOpen && !user}
        onClose={() => {
          setAuthOpen(false);
          sessionStorage.setItem('auth_dismissed', '1');
        }}
      />
    </div>
  );
}
