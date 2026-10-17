'use client';

import { brushPaths } from '../../lib/theme';

/**
 * BrushDivider — Wavy brush-stroke section separator.
 *
 * Usage: <BrushDivider variant="gentle" flip />
 */
export default function BrushDivider({ variant = 'gentle', flip = false, color }) {
  const d = brushPaths[variant] || brushPaths.gentle;

  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        lineHeight: 0,
        overflow: 'hidden',
        transform: flip ? 'scaleY(-1)' : undefined,
        marginTop: flip ? undefined : '-1px',
        marginBottom: flip ? '-1px' : undefined,
      }}
    >
      <svg
        viewBox="0 0 1200 60"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '40px', display: 'block' }}
      >
        <path d={d} fill={color || 'var(--color-bg-primary)'} />
      </svg>
    </div>
  );
}
