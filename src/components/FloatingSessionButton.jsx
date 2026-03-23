import { useState, useRef, useCallback, useEffect } from 'react';
import { tokens } from '../styles/tokens';

const BUTTON_SIZE = 40;
const EDGE_MARGIN = 12;
const DRAG_THRESHOLD = 5;

export default function FloatingSessionButton({ count, onClick, onSideChange }) {
  // Store y + side only (x is derived from side when snapped)
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fab_pos'));
      if (saved && typeof saved.y === 'number') {
        return { y: saved.y, side: saved.side || 'right' };
      }
    } catch { /* ignore */ }
    return { y: window.innerHeight - 120, side: 'right' };
  });

  const [dragPos, setDragPos] = useState(null); // { x, y } during drag only
  const [hovered, setHovered] = useState(false);
  const didDrag = useRef(false);

  const isLeft = pos.side === 'left';
  const isDragging = dragPos !== null;

  // Report side to parent
  useEffect(() => {
    onSideChange?.(pos.side);
  }, [pos.side, onSideChange]);

  // Keep in bounds on resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        ...prev,
        y: Math.max(EDGE_MARGIN, Math.min(prev.y, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Save position
  useEffect(() => {
    if (!isDragging) {
      try { localStorage.setItem('fab_pos', JSON.stringify(pos)); } catch { /* ignore */ }
    }
  }, [pos, isDragging]);

  // Pointer drag
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    // Calculate current pixel x from side
    const originX = pos.side === 'left'
      ? EDGE_MARGIN
      : window.innerWidth - BUTTON_SIZE - EDGE_MARGIN;
    const originY = pos.y;
    didDrag.current = false;

    const handleMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!didDrag.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        didDrag.current = true;
      }
      if (didDrag.current) {
        setDragPos({ x: originX + dx, y: originY + dy });
      }
    };

    const handleUp = (ev) => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      if (didDrag.current) {
        const finalX = originX + (ev.clientX - startX);
        const finalY = originY + (ev.clientY - startY);
        const midX = window.innerWidth / 2;
        const side = finalX + BUTTON_SIZE / 2 < midX ? 'left' : 'right';
        const clampedY = Math.max(EDGE_MARGIN, Math.min(finalY, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN));
        setPos({ y: clampedY, side });
      }
      setDragPos(null);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [pos.side, pos.y]);

  const handleClick = useCallback(() => {
    if (!didDrag.current) onClick();
  }, [onClick]);

  // Build positioning style
  const positionStyle = isDragging
    ? { left: dragPos.x, top: dragPos.y }
    : {
        top: pos.y,
        ...(isLeft ? { left: EDGE_MARGIN } : { right: EDGE_MARGIN }),
      };

  const label = count > 0 ? `${count} session${count !== 1 ? 's' : ''}` : 'Analytics';

  return (
    <div
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        flexDirection: isLeft ? 'row' : 'row-reverse',
        cursor: isDragging ? 'grabbing' : 'pointer',
        userSelect: 'none',
        touchAction: 'none',
        transition: isDragging
          ? 'none'
          : `all 0.35s ${tokens.ease.snappy}`,
        ...positionStyle,
      }}
    >
      {/* Circle button */}
      <div
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: tokens.radius.full,
          background: hovered
            ? 'rgba(62,232,181,0.14)'
            : 'rgba(255,255,255,0.05)',
          border: hovered
            ? '1px solid rgba(62,232,181,0.35)'
            : '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: `all 0.25s ${tokens.ease.snappy}`,
          boxShadow: hovered
            ? '0 0 24px rgba(62,232,181,0.15), 0 4px 16px rgba(0,0,0,0.4)'
            : '0 2px 10px rgba(0,0,0,0.35)',
          flexShrink: 0,
        }}
      >
        {/* Chevron arrow pointing inward (toward screen center) */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: isLeft ? 'none' : 'rotate(180deg)',
            transition: `transform 0.3s ${tokens.ease.snappy}`,
          }}
        >
          <path
            d="M6 3L11 8L6 13"
            stroke={hovered ? tokens.color.accent : 'rgba(255,255,255,0.35)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: `stroke 0.25s ${tokens.ease.snappy}` }}
          />
        </svg>
      </div>

      {/* Expandable label — slides inward from the edge */}
      <div
        style={{
          overflow: 'hidden',
          maxWidth: hovered ? 120 : 0,
          opacity: hovered ? 1 : 0,
          transition: `max-width 0.3s ${tokens.ease.snappy}, opacity 0.2s ${tokens.ease.snappy}`,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: isLeft ? '6px 12px 6px 8px' : '6px 8px 6px 12px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: tokens.font.body,
            color: tokens.color.accent,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
