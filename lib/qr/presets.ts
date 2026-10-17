// QR style catalog — the visually-selectable presets the studio renders.
// `import type` is erased at compile time, so qr-code-styling (a browser lib
// that touches the DOM) is never evaluated on the edge/SSR — only the shape
// is borrowed for type-safety.
import type { Options } from 'qr-code-styling';

export type DotType =
  | 'square'
  | 'dots'
  | 'rounded'
  | 'extra-rounded'
  | 'classy'
  | 'classy-rounded';
export type CornerSquareType = 'dot' | 'square' | 'extra-rounded';
export type CornerDotType = 'dot' | 'square';

interface Gradient {
  type: 'linear' | 'radial';
  rotation?: number;
  colorStops: { offset: number; color: string }[];
}

/** A solid color or a gradient for the dots/corners. */
type Paint = { color: string } | { gradient: Gradient };

export interface QrPreset {
  id: string;
  name: string;
  dotsType: DotType;
  cornersSquareType: CornerSquareType;
  cornersDotType: CornerDotType;
  fg: Paint;
  bg: string;
  /** CSS background for the catalog chip — a cheap visual cue. */
  swatch: string;
}

function grad(rotation: number, ...colors: string[]): Gradient {
  return {
    type: 'linear',
    rotation,
    colorStops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
  };
}

// Contrast matters — a QR only scans with strong dark/light separation, so
// every preset is dark-on-white or white-on-dark, never mid-tone on mid-tone.
export const QR_PRESETS: QrPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    dotsType: 'square',
    cornersSquareType: 'square',
    cornersDotType: 'square',
    fg: { color: '#0b0d12' },
    bg: '#ffffff',
    swatch: '#0b0d12',
  },
  {
    id: 'rounded',
    name: 'Rounded',
    dotsType: 'rounded',
    cornersSquareType: 'extra-rounded',
    cornersDotType: 'dot',
    fg: { color: '#5b3df5' },
    bg: '#ffffff',
    swatch: '#5b3df5',
  },
  {
    id: 'dots',
    name: 'Dots',
    dotsType: 'dots',
    cornersSquareType: 'dot',
    cornersDotType: 'dot',
    fg: { color: '#7c5cff' },
    bg: '#ffffff',
    swatch: '#7c5cff',
  },
  {
    id: 'classy',
    name: 'Classy',
    dotsType: 'classy',
    cornersSquareType: 'square',
    cornersDotType: 'square',
    fg: { color: '#111827' },
    bg: '#ffffff',
    swatch: '#111827',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    dotsType: 'extra-rounded',
    cornersSquareType: 'extra-rounded',
    cornersDotType: 'dot',
    fg: { gradient: grad(45, '#9b7bf7', '#5fb6ff') },
    bg: '#ffffff',
    swatch: 'linear-gradient(135deg,#9b7bf7,#5fb6ff)',
  },
  {
    id: 'inverse',
    name: 'Inverse',
    dotsType: 'rounded',
    cornersSquareType: 'extra-rounded',
    cornersDotType: 'dot',
    fg: { color: '#ffffff' },
    bg: '#0b0d12',
    swatch: 'linear-gradient(135deg,#0b0d12,#23272f)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    dotsType: 'extra-rounded',
    cornersSquareType: 'extra-rounded',
    cornersDotType: 'dot',
    fg: { gradient: grad(45, '#ff8a5c', '#ff3d77') },
    bg: '#ffffff',
    swatch: 'linear-gradient(135deg,#ff8a5c,#ff3d77)',
  },
  {
    id: 'forest',
    name: 'Forest',
    dotsType: 'classy-rounded',
    cornersSquareType: 'extra-rounded',
    cornersDotType: 'square',
    fg: { gradient: grad(45, '#34d399', '#0ea5e9') },
    bg: '#ffffff',
    swatch: 'linear-gradient(135deg,#34d399,#0ea5e9)',
  },
];

export const DEFAULT_PRESET_ID = 'rounded';

export function getPreset(id: string): QrPreset {
  return QR_PRESETS.find((p) => p.id === id) ?? QR_PRESETS[0];
}

function cornerColor(fg: Paint): string {
  return 'gradient' in fg ? fg.gradient.colorStops[0].color : fg.color;
}

/**
 * Translate a preset (+ data, optional logo) into qr-code-styling Options.
 * H-level ECC keeps the code scannable even with a center logo overlaid.
 */
export function buildQrOptions(
  preset: QrPreset,
  opts: { data: string; image?: string; size: number },
): Options {
  const { data, image, size } = opts;
  const corner = cornerColor(preset.fg);
  return {
    width: size,
    height: size,
    type: 'svg', // QR is always vector — render + export as SVG
    data,
    image: image || undefined,
    margin: 8,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { type: preset.dotsType, ...preset.fg },
    cornersSquareOptions: { type: preset.cornersSquareType, color: corner },
    cornersDotOptions: { type: preset.cornersDotType, color: corner },
    backgroundOptions: { color: preset.bg },
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 6,
      imageSize: 0.4,
      hideBackgroundDots: true,
    },
  };
}
