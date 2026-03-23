import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, ChevronDown, Check } from 'lucide-react';
import { tokens } from '../styles/tokens';
import { createMicAnalyser } from '../lib/audioAnalyser';
import {
  getAudioInputDevices,
  switchDevice,
  getPreferredDeviceId,
  requestMicStream,
} from '../lib/micStream';

// ---------------------------------------------------------------------------
// Reusable chip button (Language / Input Mode)
// ---------------------------------------------------------------------------

function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: tokens.font.body,
        fontSize: 12,
        fontWeight: 500,
        padding: '5px 12px',
        borderRadius: tokens.radius.full,
        border: `1px solid ${active ? tokens.color.accent : tokens.color.borderLight}`,
        background: active ? 'rgba(62,232,181,0.1)' : 'transparent',
        color: active ? tokens.color.accent : tokens.color.textSecondary,
        cursor: 'pointer',
        transition: `all 0.2s ${tokens.ease.snappy}`,
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: tokens.color.textSecondary,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini orb — matches main Orb purple/cyan palette, transitions to checkmark
// on sustained input. Checkmark uses CTA hover glow (white + purple/cyan).
// ---------------------------------------------------------------------------

// Accent palette — mint tones matching the panel's chip / button styling
const MINT   = '62,232,181';
const TEAL   = '40,200,170';
const DEEP   = '20,80,65';

const ORB_SIZE = 40;
const GLOW_SIZE = 80;
const CONFIRM_THRESHOLD = 0.08; // amplitude to count as "solid input"
const CONFIRM_SECONDS   = 0.7;  // sustained duration before checkmark

function MiniOrb({ analyserRef, testing, confirmed, onConfirm }) {
  const orbRef    = useRef(null);
  const innerRef  = useRef(null);
  const glowRef   = useRef(null);
  const ringRef   = useRef(null);
  const rafRef    = useRef(null);
  const smoothAmp    = useRef(0);
  const sustainedRef = useRef(0);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!testing) {
      smoothAmp.current = 0;
      sustainedRef.current = 0;
      confirmedRef.current = false;

      // Idle state — dormant purple ember
      if (orbRef.current) {
        orbRef.current.style.transition = 'filter 0.5s ease, box-shadow 0.5s ease';
        orbRef.current.style.filter = 'brightness(0.15)';
        orbRef.current.style.boxShadow = `0 0 6px 1px rgba(${MINT},0.03)`;
      }
      if (innerRef.current) innerRef.current.style.opacity = '0';
      if (glowRef.current) {
        glowRef.current.style.opacity = '0';
        glowRef.current.style.transform = 'scale(0.5)';
      }
      if (ringRef.current) {
        ringRef.current.style.opacity = '0';
        ringRef.current.style.transform = 'scale(0.85)';
      }
      return;
    }

    // Remove CSS transitions — rAF takes over
    if (orbRef.current) orbRef.current.style.transition = 'none';

    let lastTime = performance.now();

    function pump(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (!analyserRef.current) {
        rafRef.current = requestAnimationFrame(pump);
        return;
      }

      const raw = analyserRef.current.getAmplitude();
      const rate = raw > smoothAmp.current ? 18 : 6;
      smoothAmp.current += (raw - smoothAmp.current) * (1 - Math.exp(-rate * dt));
      const amp = smoothAmp.current;

      // ---- Sustained input detection ----
      if (amp > CONFIRM_THRESHOLD) {
        sustainedRef.current += dt;
        if (sustainedRef.current >= CONFIRM_SECONDS && !confirmedRef.current) {
          confirmedRef.current = true;
          onConfirm();
        }
      } else {
        sustainedRef.current = Math.max(0, sustainedRef.current - dt * 2);
      }

      if (!confirmedRef.current) {
        // ---- Normal orb: purple/cyan glow driven by amplitude ----
        if (orbRef.current) {
          const brightness = 0.15 + amp * 1.5;
          const spread = 2 + amp * 18;
          const alpha = (0.04 + amp * 0.5).toFixed(2);
          orbRef.current.style.filter = `brightness(${brightness.toFixed(2)})`;
          orbRef.current.style.boxShadow =
            `0 0 ${spread.toFixed(0)}px ${(spread * 0.4).toFixed(0)}px rgba(${MINT},${alpha})`;
        }
        if (innerRef.current) {
          innerRef.current.style.opacity = `${(amp * 1.2).toFixed(2)}`;
        }
        if (glowRef.current) {
          glowRef.current.style.opacity = `${(0.02 + amp * 0.45).toFixed(2)}`;
          glowRef.current.style.transform = `scale(${(0.6 + amp * 0.5).toFixed(2)})`;
        }
        if (ringRef.current) {
          ringRef.current.style.opacity = `${(amp * 0.3).toFixed(2)}`;
          ringRef.current.style.transform = `scale(${(0.92 + amp * 0.12).toFixed(2)})`;
        }
      } else {
        // ---- Confirmed: gentle CTA breathing on glow ----
        const breathe = 0.7 + Math.sin(now * 0.002) * 0.3;
        if (glowRef.current) {
          glowRef.current.style.opacity = `${(0.3 * breathe).toFixed(2)}`;
          glowRef.current.style.transform = `scale(${(0.75 + breathe * 0.3).toFixed(2)})`;
        }
        if (ringRef.current) {
          ringRef.current.style.opacity = `${(0.25 * breathe).toFixed(2)}`;
          ringRef.current.style.transform = `scale(${(0.95 + breathe * 0.08).toFixed(2)})`;
        }
      }

      rafRef.current = requestAnimationFrame(pump);
    }

    rafRef.current = requestAnimationFrame(pump);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [testing, analyserRef]);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '14px 0 8px',
        position: 'relative',
      }}
    >
      {/* Atmospheric glow — switches palette on confirm */}
      <div
        ref={glowRef}
        style={{
          position: 'absolute',
          width: GLOW_SIZE,
          height: GLOW_SIZE,
          borderRadius: '50%',
          background: confirmed
            ? `radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(180,200,255,0.1) 35%, rgba(${MINT},0.06) 55%, transparent 70%)`
            : `radial-gradient(circle, rgba(${MINT},0.3) 0%, rgba(${TEAL},0.12) 40%, transparent 70%)`,
          opacity: 0,
          transform: 'scale(0.5)',
          transition: testing ? 'background 0.6s ease' : 'opacity 0.5s ease, transform 0.5s ease, background 0.6s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Ring — shifts to CTA white tint on confirm */}
      <div
        ref={ringRef}
        style={{
          position: 'absolute',
          width: ORB_SIZE + 8,
          height: ORB_SIZE + 8,
          borderRadius: '50%',
          border: confirmed
            ? '1px solid rgba(255,255,255,0.15)'
            : `1px solid rgba(${MINT},0.12)`,
          opacity: 0,
          transform: 'scale(0.85)',
          transition: testing ? 'border-color 0.5s ease' : 'opacity 0.5s ease, transform 0.5s ease, border-color 0.5s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Orb core — cross-fades out when confirmed */}
      <div
        style={{
          opacity: confirmed ? 0 : 1,
          transform: confirmed ? 'scale(0.6)' : 'scale(1)',
          transition: `opacity 0.45s ease, transform 0.45s ${tokens.ease.snappy}`,
          position: 'relative',
        }}
      >
        <div
          ref={orbRef}
          style={{
            width: ORB_SIZE,
            height: ORB_SIZE,
            borderRadius: '50%',
            background:
              `radial-gradient(circle at 38% 32%,
                rgba(${MINT},0.9) 0%,
                rgba(${TEAL},0.4) 35%,
                rgba(${DEEP},0.2) 60%,
                rgba(17,17,20,0.6) 100%)`,
            filter: 'brightness(0.15)',
            boxShadow: `0 0 6px 1px rgba(${MINT},0.03)`,
            position: 'relative',
          }}
        >
          {/* Inner hot-spot */}
          <div
            ref={innerRef}
            style={{
              position: 'absolute',
              top: '22%',
              left: '28%',
              width: '36%',
              height: '36%',
              borderRadius: '50%',
              background:
                `radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(${MINT},0.3) 50%, transparent 100%)`,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
          {/* Glass highlight */}
          <div
            style={{
              position: 'absolute',
              top: '12%',
              left: '22%',
              width: '32%',
              height: '22%',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Checkmark — cross-fades in when confirmed, CTA hover glow */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: ORB_SIZE,
          height: ORB_SIZE,
          borderRadius: '50%',
          background: confirmed
            ? 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, rgba(180,200,255,0.03) 50%, transparent 70%)'
            : 'transparent',
          opacity: confirmed ? 1 : 0,
          transform: confirmed ? 'scale(1)' : 'scale(0.4)',
          transition: `opacity 0.5s ${tokens.ease.snappy}, transform 0.5s ${tokens.ease.snappy}`,
          boxShadow: confirmed
            ? `0 0 16px 4px rgba(255,255,255,0.08), 0 0 40px 8px rgba(180,200,255,0.06)`
            : 'none',
          filter: confirmed
            ? `drop-shadow(0 0 8px rgba(${MINT},0.45)) drop-shadow(0 0 18px rgba(${TEAL},0.28))`
            : 'none',
          pointerEvents: 'none',
        }}
      >
        <Check
          size={20}
          strokeWidth={2.5}
          color="#fff"
          style={{
            filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.5))',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SettingsPanel
// ---------------------------------------------------------------------------

export default function SettingsPanel({ lang, setLang, textMode, setTextMode, onClose }) {
  const panelRef = useRef(null);

  // Mic testing state
  const [testing, setTesting] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(getPreferredDeviceId() || '');
  const [micError, setMicError] = useState(null);
  const [micConfirmed, setMicConfirmed] = useState(false);
  const analyserRef = useRef(null);

  // ---- Click-outside to close ----
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // ---- Enumerate devices on mount ----
  useEffect(() => {
    let cancelled = false;

    async function enumerate() {
      // Need permission to get device labels — try cached stream first
      try {
        await requestMicStream();
      } catch { /* will handle in test */ }

      const list = await getAudioInputDevices();
      if (!cancelled) {
        setDevices(list);
        // If no device is selected yet, pick the current default
        if (!selectedDevice && list.length > 0) {
          setSelectedDevice(getPreferredDeviceId() || list[0].deviceId);
        }
      }
    }

    enumerate();

    // Listen for device changes (plug/unplug)
    const refresh = () => enumerate();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);

    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Clean up analyser on unmount or when panel closes ----
  useEffect(() => {
    return () => {
      if (analyserRef.current) {
        analyserRef.current.destroy();
        analyserRef.current = null;
      }
    };
  }, []);

  // ---- Device change handler ----
  const handleDeviceChange = useCallback(async (deviceId) => {
    setSelectedDevice(deviceId);
    setMicError(null);

    try {
      // Switch the singleton stream to the new device
      const stream = await switchDevice(deviceId);

      // If currently testing, restart the analyser with new stream
      if (analyserRef.current) {
        analyserRef.current.destroy();
        analyserRef.current = null;
      }
      if (testing) {
        analyserRef.current = await createMicAnalyser(stream);
      }

      // Re-enumerate (labels may have changed)
      const list = await getAudioInputDevices();
      setDevices(list);
    } catch {
      setMicError('Could not access this device');
    }
  }, [testing]);

  // ---- Test mic toggle ----
  const toggleTest = useCallback(async () => {
    if (testing) {
      // Stop test
      if (analyserRef.current) {
        analyserRef.current.destroy();
        analyserRef.current = null;
      }
      setTesting(false);
      setMicConfirmed(false);
      setMicError(null);
      return;
    }

    // Start test
    setMicError(null);
    try {
      const stream = await requestMicStream();
      analyserRef.current = await createMicAnalyser(stream);
      setTesting(true);

      // Refresh device list (we now definitely have permission → labels)
      const list = await getAudioInputDevices();
      setDevices(list);
      if (!selectedDevice && list.length > 0) {
        setSelectedDevice(getPreferredDeviceId() || list[0].deviceId);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setMicError('Mic access denied — check browser permissions');
      } else if (err.name === 'NotFoundError') {
        setMicError('No microphone found');
      } else {
        setMicError('Could not access microphone');
      }
    }
  }, [testing, selectedDevice]);

  // ---- Compute display label for devices ----
  function deviceLabel(device, index) {
    if (device.label) return device.label;
    return `Microphone ${index + 1}`;
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 56,
        right: 20,
        zIndex: 200,
        background: 'rgba(17,17,20,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 260,
        maxWidth: 300,
        animation: 'fadeUp 0.25s var(--ease-snappy) both',
      }}
    >
      {/* Language */}
      <div>
        <SectionLabel>Language</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip label="EN" active={lang === 'en-US'} onClick={() => setLang('en-US')} />
          <Chip label="ES" active={lang === 'es-ES'} onClick={() => setLang('es-ES')} />
        </div>
      </div>

      {/* Input Mode */}
      <div>
        <SectionLabel>Input</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip label="Voice" active={!textMode} onClick={() => setTextMode(false)} />
          <Chip label="Text" active={textMode} onClick={() => setTextMode(true)} />
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'rgba(255,255,255,0.04)',
          margin: '2px 0',
        }}
      />

      {/* Microphone */}
      <div>
        <SectionLabel>Microphone</SectionLabel>

        {/* Device selector */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <select
            value={selectedDevice}
            onChange={(e) => handleDeviceChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 30px 8px 12px',
              fontSize: 12,
              fontFamily: tokens.font.body,
              fontWeight: 400,
              color: tokens.color.text,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${tokens.color.borderLight}`,
              borderRadius: tokens.radius.sm,
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              transition: `border-color 0.2s ${tokens.ease.snappy}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = tokens.color.borderLight;
            }}
          >
            {devices.length === 0 && (
              <option value="">No devices found</option>
            )}
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {deviceLabel(d, i)}
              </option>
            ))}
          </select>
          {/* Custom chevron */}
          <ChevronDown
            size={13}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: tokens.color.textMuted,
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Mini orb — voice feedback */}
        <MiniOrb
          analyserRef={analyserRef}
          testing={testing}
          confirmed={micConfirmed}
          onConfirm={() => setMicConfirmed(true)}
        />

        {/* Test mic button */}
        <button
          onClick={toggleTest}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            padding: '7px 0',
            fontSize: 11,
            fontFamily: tokens.font.body,
            fontWeight: 500,
            letterSpacing: 0.3,
            color: micConfirmed
              ? tokens.color.accent
              : testing
                ? tokens.color.textSecondary
                : tokens.color.textSecondary,
            background: micConfirmed
              ? 'rgba(62,232,181,0.1)'
              : testing
                ? 'rgba(255,255,255,0.03)'
                : 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              micConfirmed
                ? 'rgba(62,232,181,0.25)'
                : testing
                  ? 'rgba(62,232,181,0.12)'
                  : tokens.color.borderLight
            }`,
            borderRadius: tokens.radius.full,
            cursor: 'pointer',
            transition: `all 0.35s ${tokens.ease.snappy}`,
          }}
          onMouseEnter={(e) => {
            if (micConfirmed) {
              e.currentTarget.style.background = 'rgba(62,232,181,0.15)';
              e.currentTarget.style.borderColor = 'rgba(62,232,181,0.35)';
            } else if (!testing) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = tokens.color.text;
            } else {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.borderColor = 'rgba(62,232,181,0.18)';
            }
          }}
          onMouseLeave={(e) => {
            if (micConfirmed) {
              e.currentTarget.style.background = 'rgba(62,232,181,0.1)';
              e.currentTarget.style.borderColor = 'rgba(62,232,181,0.25)';
              e.currentTarget.style.color = tokens.color.accent;
            } else if (!testing) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.borderColor = tokens.color.borderLight;
              e.currentTarget.style.color = tokens.color.textSecondary;
            } else {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.borderColor = 'rgba(62,232,181,0.12)';
            }
          }}
        >
          {micConfirmed ? (
            <>
              <Check size={12} />
              Mic Working
            </>
          ) : testing ? (
            <>
              <Mic size={12} style={{ animation: 'pulse 2s ease-in-out infinite' }} />
              Listening...
            </>
          ) : (
            <>
              <MicOff size={12} />
              Test Microphone
            </>
          )}
        </button>

        {/* Error message */}
        {micError && (
          <p
            style={{
              fontSize: 11,
              color: tokens.color.error,
              marginTop: 8,
              lineHeight: 1.4,
            }}
          >
            {micError}
          </p>
        )}
      </div>
    </div>
  );
}
