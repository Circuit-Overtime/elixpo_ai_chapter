/**
 * Centralised background/product video clips used across the homepage.
 *
 * Self-hosted under `public/videos/` (compressed with ffmpeg for fast loads)
 * and served as static assets, so there's no external CDN dependency.
 */
export const VIDEOS = {
  // Ambient backgrounds
  hero: "/videos/breeze.mp4", // first hero clip
  about: "/videos/headphones.mp4", // "Built in the open, together" panel
  contact: "/videos/paddy-sky.mp4", // contact / newsletter section

  // Product clips (Projects grid) - only products with a clip are shown
  sketch: "/videos/sketch.mp4",
  blogs: "/videos/blogs.mp4",
  accounts: "/videos/accounts.mp4",
  portfolio: "/videos/portfolio.mp4",
  oreo: "/videos/oreo.mp4",
  url: "/videos/url.mp4",
};
