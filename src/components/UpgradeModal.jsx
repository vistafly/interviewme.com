import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, LogIn } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { useAuth } from '../contexts/AuthContext';
import { createCheckoutSession } from '../lib/api';

const SNAPPY = [0.16, 1, 0.3, 1];

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 400,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  padding: 24,
};

const cardStyle = {
  position: 'relative',
  width: '100%',
  maxWidth: 380,
  padding: '36px 32px 32px',
  background: 'rgba(10,10,14,0.75)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: tokens.radius.xl,
  boxShadow: '0 0 0 1px rgba(255,255,255,0.02), 0 32px 80px rgba(0,0,0,0.5)',
};

const btnBase = {
  width: '100%',
  padding: '11px 0',
  fontSize: 13,
  fontWeight: 400,
  fontFamily: tokens.font.body,
  borderRadius: tokens.radius.full,
  cursor: 'pointer',
  letterSpacing: 0.3,
  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  border: 'none',
};

export default function UpgradeModal({ open, isAnon, onClose }) {
  const { signInWithGoogle, getIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleGoogle = async () => {
    setBusy(true);
    setErr('');
    try {
      await signInWithGoogle();
      onClose();
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') setErr('Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpgrade = async () => {
    setBusy(true);
    setErr('');
    try {
      const token = await getIdToken();
      const { url } = await createCheckoutSession(token);
      window.location.href = url;
    } catch (e) {
      setErr(e.message || 'Could not start checkout. Try again.');
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={overlayStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            style={cardStyle}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.3, ease: SNAPPY }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.2)',
                cursor: 'pointer',
                padding: 4,
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
            >
              <X size={14} />
            </button>

            {isAnon ? (
              /* ── Anonymous: prompt to sign in ──────────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <p style={{
                    fontFamily: tokens.font.display,
                    fontSize: 20,
                    fontWeight: 600,
                    color: tokens.color.text,
                    margin: '0 0 8px',
                    lineHeight: 1.3,
                  }}>
                    You've used your 3 free interviews
                  </p>
                  <p style={{
                    fontFamily: tokens.font.body,
                    fontSize: 13,
                    color: tokens.color.textSecondary,
                    margin: 0,
                    lineHeight: 1.6,
                    letterSpacing: 0.2,
                  }}>
                    Sign in to unlock 2 more free interviews per day — no card required.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Google sign-in */}
                  <button
                    onClick={handleGoogle}
                    disabled={busy}
                    style={{
                      ...btnBase,
                      color: 'rgba(255,255,255,0.75)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    {busy ? 'Signing in…' : 'Continue with Google'}
                  </button>

                  {/* Skip / dismiss */}
                  <button
                    onClick={onClose}
                    style={{
                      ...btnBase,
                      color: 'rgba(255,255,255,0.3)',
                      background: 'none',
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            ) : (
              /* ── Logged-in free: prompt to upgrade ──────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <p style={{
                    fontFamily: tokens.font.display,
                    fontSize: 20,
                    fontWeight: 600,
                    color: tokens.color.text,
                    margin: '0 0 8px',
                    lineHeight: 1.3,
                  }}>
                    You've used your 5 free interviews today
                  </p>
                  <p style={{
                    fontFamily: tokens.font.body,
                    fontSize: 13,
                    color: tokens.color.textSecondary,
                    margin: 0,
                    lineHeight: 1.6,
                    letterSpacing: 0.2,
                  }}>
                    Upgrade to Pro for <strong style={{ color: tokens.color.text }}>30 interviews/day</strong> — $9.99/month, cancel anytime.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Upgrade CTA */}
                  <button
                    onClick={handleUpgrade}
                    disabled={busy}
                    style={{
                      ...btnBase,
                      color: '#08080a',
                      background: tokens.color.accent,
                      fontWeight: 500,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    <Zap size={13} strokeWidth={2} />
                    {busy ? 'Redirecting…' : 'Upgrade to Pro — $9.99/mo'}
                  </button>

                  {/* Dismiss */}
                  <button
                    onClick={onClose}
                    style={{
                      ...btnBase,
                      color: 'rgba(255,255,255,0.3)',
                      background: 'none',
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            )}

            {err && (
              <p style={{
                fontFamily: tokens.font.body,
                fontSize: 11,
                color: 'rgba(255,82,82,0.8)',
                margin: '12px 0 0',
                letterSpacing: 0.2,
              }}>
                {err}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
