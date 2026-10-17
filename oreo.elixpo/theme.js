// Single source of truth for the Oreo brand palette + spacing tokens.
// Imported by Tailwind config and by any component that needs runtime
// access to a colour (e.g. Framer Motion variants).
//
// Keep this file framework-neutral — plain JS, no imports — so it can
// also be loaded directly by Tailwind's CommonJS resolver and by a
// future server-side renderer without bundler help.

const theme = {
  colors: {
    // Surfaces — deep purple-black gradient anchor. Mirrors the badge's
    // home-screen background so the web/device feel like one product.
    bg:         "#0F0C1C",
    bgRaised:   "#1C1A2E",
    card:       "#1F1B33",
    cardSubtle: "#26213E",
    border:     "#2A2640",

    // Brand — Oreo pink-red. Used for primary CTAs, the live "active"
    // dot in the file-transfer page, and the wordmark accents.
    primary:    "#FF5D68",
    primaryDim: "#C8434C",

    // Accent ladder (used sparingly for category tints).
    teal:       "#3DDC97",
    gold:       "#FFD166",
    lilac:      "#A29BFE",

    // Text — warm cream on dark, deliberately not pure white so the
    // page doesn't feel like a status terminal.
    text:       "#F5E6DC",
    textDim:    "#C8B8B0",
    muted:      "#8A8294",
    mutedDeep:  "#4A4458",
  },

  // Radii / spacing — matches the badge's UI to keep visual continuity.
  radius: {
    sm: "4px",
    md: "8px",
    lg: "16px",
    pill: "999px",
  },

  // Motion presets. Imported by components that need a consistent
  // springiness across the site — keeping these centralised avoids
  // the "every animation feels slightly different" problem.
  motion: {
    softSpring:   { type: "spring", stiffness: 220, damping: 24 },
    crispSpring:  { type: "spring", stiffness: 340, damping: 28 },
    easeOut:      { type: "tween",  ease: [0.16, 1, 0.3, 1], duration: 0.55 },
    fastEaseOut:  { type: "tween",  ease: [0.16, 1, 0.3, 1], duration: 0.28 },
  },

  // The repo + canonical brand URLs, surfaced in the header / footer.
  links: {
    github:  "https://github.com/elixpo/oreo",
    discord: "",
    docs:    "https://oreo.elixpo.com/docs",
  },
};

module.exports = theme;
