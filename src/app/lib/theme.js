/**
 * Elixpo Art — Theme Configuration
 *
 * Artsy, brushy, gradient-heavy palette for an AI art platform.
 * Import colors/gradients in JS when you need inline styles or
 * framer-motion animate values. CSS vars in globals.css mirror these.
 */

// ─── Core Palette ────────────────────────────────────────────────
export const colors = {
  // Primary — deep violet / purple
  violet:       '#8d49fd',
  violetLight:  '#a968ff',
  violetDark:   '#6a2ee0',

  // Secondary — electric blue
  blue:         '#5691f3',
  blueLight:    '#7fa8f5',
  blueDark:     '#3d6fd4',

  // Accent — mint / teal
  mint:         '#06d6a0',
  mintLight:    '#34ebc0',
  mintDark:     '#05b384',

  // Warm accents — for brushy splashes
  rose:         '#ec4899',
  roseLight:    '#f472b6',
  amber:        '#f59e0b',
  coral:        '#ff6b6b',

  // Cool accents
  cyan:         '#22d3ee',
  indigo:       '#6366f1',

  // Backgrounds — brighter dark canvas
  canvas:       '#0c1220',
  canvasAlt:    '#131b2e',
  surface:      '#1a2540',
  surfaceLight: '#222e48',
  card:         'rgba(25, 34, 56, 0.75)',
  cardHover:    'rgba(34, 46, 72, 0.85)',

  // Text
  textPrimary:   '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted:     '#64748b',

  // Borders
  border:       'rgba(255, 255, 255, 0.08)',
  borderHover:  'rgba(255, 255, 255, 0.15)',
  borderAccent: 'rgba(141, 73, 253, 0.3)',
};

// ─── Gradients ───────────────────────────────────────────────────
export const gradients = {
  // Main brand gradient — violet to blue
  primary:      'linear-gradient(135deg, #8d49fd 0%, #5691f3 100%)',
  // Warmer variant — violet to rose
  warm:         'linear-gradient(135deg, #8d49fd 0%, #ec4899 100%)',
  // Cool variant — blue to cyan
  cool:         'linear-gradient(135deg, #5691f3 0%, #22d3ee 100%)',
  // Accent — mint to cyan
  accent:       'linear-gradient(135deg, #06d6a0 0%, #22d3ee 100%)',
  // Sunset — for warm highlights
  sunset:       'linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)',
  // Canvas overlay — subtle mesh
  mesh:         `radial-gradient(ellipse at 20% 50%, rgba(141, 73, 253, 0.08) 0%, transparent 50%),
                 radial-gradient(ellipse at 80% 20%, rgba(86, 145, 243, 0.06) 0%, transparent 50%),
                 radial-gradient(ellipse at 50% 80%, rgba(236, 72, 153, 0.05) 0%, transparent 50%)`,
  // Glass surface
  glass:        'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
};

// ─── Blob Configurations ─────────────────────────────────────────
// Used by <GradientBlobs /> — each route can pick a preset or customize.
export const blobPresets = {
  default: [
    { color: '#8d49fd', size: 500, x: '-10%', y: '-15%', blur: 100, opacity: 0.15, delay: 0 },
    { color: '#ec4899', size: 400, x: '70%',  y: '10%',  blur: 120, opacity: 0.12, delay: -7 },
    { color: '#06d6a0', size: 450, x: '20%',  y: '75%',  blur: 100, opacity: 0.10, delay: -14 },
  ],
  generate: [
    { color: '#8d49fd', size: 500, x: '80%',  y: '-10%', blur: 100, opacity: 0.12, delay: 0 },
    { color: '#5691f3', size: 400, x: '-5%',  y: '60%',  blur: 110, opacity: 0.10, delay: -8 },
    { color: '#22d3ee', size: 350, x: '50%',  y: '80%',  blur: 90,  opacity: 0.08, delay: -15 },
  ],
  pricing: [
    { color: '#8d49fd', size: 550, x: '-15%', y: '20%',  blur: 120, opacity: 0.12, delay: 0 },
    { color: '#ec4899', size: 400, x: '85%',  y: '-10%', blur: 100, opacity: 0.10, delay: -6 },
    { color: '#06d6a0', size: 350, x: '50%',  y: '85%',  blur: 90,  opacity: 0.08, delay: -12 },
  ],
  creations: [
    { color: '#5691f3', size: 500, x: '-10%', y: '10%',  blur: 110, opacity: 0.12, delay: 0 },
    { color: '#a968ff', size: 400, x: '75%',  y: '60%',  blur: 100, opacity: 0.10, delay: -9 },
    { color: '#22d3ee', size: 350, x: '40%',  y: '-10%', blur: 90,  opacity: 0.08, delay: -16 },
  ],
};

// ─── Framer Motion Presets ───────────────────────────────────────
export const motion = {
  // Stagger container
  stagger: (staggerDelay = 0.08) => ({
    hidden: {},
    visible: { transition: { staggerChildren: staggerDelay } },
  }),

  // Fade up — most common entrance
  fadeUp: {
    hidden:  { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  },

  // Fade in — no vertical movement
  fadeIn: {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, ease: 'easeOut' } },
  },

  // Scale up — for cards, images
  scaleUp: {
    hidden:  { opacity: 0, scale: 0.92 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  },

  // Slide from left
  slideLeft: {
    hidden:  { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  },

  // Slide from right
  slideRight: {
    hidden:  { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  },

  // Brushy reveal — slight rotation + scale for artsy feel
  brushReveal: {
    hidden:  { opacity: 0, y: 30, rotate: -1, scale: 0.97 },
    visible: { opacity: 1, y: 0, rotate: 0, scale: 1, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
  },

  // Hover lift — for interactive cards
  hoverLift: {
    y: -6,
    transition: { duration: 0.25, ease: 'easeOut' },
  },

  // Hover glow scale
  hoverGlow: {
    scale: 1.02,
    transition: { duration: 0.25, ease: 'easeOut' },
  },

  // Page transition
  page: {
    initial:  { opacity: 0, y: 20 },
    animate:  { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
    exit:     { opacity: 0, y: -10, transition: { duration: 0.2 } },
  },
};

// ─── Typography ──────────────────────────────────────────────────
export const fonts = {
  display:  "'Playfair Display', 'Georgia', serif",
  heading:  "'Space Grotesk', 'Inter', system-ui, sans-serif",
  body:     "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  mono:     "'JetBrains Mono', 'Fira Code', monospace",
  accent:   "'Caveat', 'Segoe Script', cursive",
};

// ─── Plan Credits (deprecated — use credits.js / plans.json instead) ──
// Kept for backward compat with settings page until fully migrated.
export { DAILY_CREDITS as planLimits } from './credits';

// ─── Brush Stroke SVG Paths ──────────────────────────────────────
// Reusable wavy/brushy divider paths for section transitions.
export const brushPaths = {
  gentle:   'M0,30 Q150,5 300,28 T600,20 T900,32 T1200,25 L1200,60 L0,60 Z',
  dramatic: 'M0,40 C100,10 200,50 350,20 C500,-5 650,45 800,15 C950,-10 1100,35 1200,20 L1200,60 L0,60 Z',
  subtle:   'M0,35 Q300,20 600,30 T1200,28 L1200,60 L0,60 Z',
};
