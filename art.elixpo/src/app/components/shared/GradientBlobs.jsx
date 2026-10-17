'use client';

import { blobPresets } from '../../lib/theme';

/**
 * GradientBlobs — Floating, animated gradient orbs that give each route
 * a unique ambient art feel. Drop into any page with a preset name.
 *
 * Usage: <GradientBlobs preset="pricing" />
 *        <GradientBlobs blobs={[{ color, size, x, y, blur, opacity, delay }]} />
 */
export default function GradientBlobs({ preset = 'default', blobs }) {
  const items = blobs || blobPresets[preset] || blobPresets.default;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {items.map((blob, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: blob.size,
            height: blob.size,
            left: blob.x,
            top: blob.y,
            background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
            filter: `blur(${blob.blur}px)`,
            opacity: blob.opacity,
            borderRadius: '50%',
            animation: `blobDrift 20s ease-in-out infinite`,
            animationDelay: `${blob.delay}s`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
