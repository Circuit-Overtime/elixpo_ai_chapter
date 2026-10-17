import type { Config } from "tailwindcss";
// theme.js is the single source of truth for brand tokens; Tailwind
// just re-exposes them as utility classes (bg-bg, text-primary, etc).
// Newer Next.js loads tailwind.config.ts via the native ESM loader,
// which doesn't expose `require` — use a static import instead.
import theme from "./theme.js";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand-token utilities (hand-written components use these)
        bg:           theme.colors.bg,
        "bg-raised":  theme.colors.bgRaised,
        card:         theme.colors.card,
        "card-sub":   theme.colors.cardSubtle,
        border:       theme.colors.border,
        primary:      theme.colors.primary,
        "primary-dim":theme.colors.primaryDim,
        teal:         theme.colors.teal,
        gold:         theme.colors.gold,
        lilac:        theme.colors.lilac,
        text:         theme.colors.text,
        "text-dim":   theme.colors.textDim,
        muted:        theme.colors.muted,
        "muted-deep": theme.colors.mutedDeep,

        // shadcn-compatible semantic aliases (drop-in components use
        // these). They're CSS-var-backed so the dark-mode toggle
        // story works the day we add one.
        background:           "var(--background)",
        foreground:           "var(--foreground)",
        "card-bg":            "var(--card)",
        "card-foreground":    "var(--card-foreground)",
        "popover":            "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        "primary-foreground": "var(--primary-foreground)",
        "secondary":          "var(--secondary)",
        "secondary-foreground":"var(--secondary-foreground)",
        "accent":             "var(--accent)",
        "accent-foreground":  "var(--accent-foreground)",
        "destructive":        "var(--destructive)",
        "destructive-foreground":"var(--destructive-foreground)",
        "input":              "var(--input)",
        "ring":               "var(--ring)",
      },
      borderRadius: {
        sm:   theme.radius.sm,
        md:   theme.radius.md,
        lg:   theme.radius.lg,
        pill: theme.radius.pill,
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI",
               "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas",
               "monospace"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
      },
      // Custom keyframes used by the hero / feature cards. Framer
      // Motion handles most animations but a couple of always-on
      // ambient pulses are cheaper as CSS.
      keyframes: {
        "pulse-soft": {
          "0%,100%": { opacity: "0.3" },
          "50%":     { opacity: "1" },
        },
        "float-y": {
          "0%,100%": { transform: "translateY(0px)" },
          "50%":     { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
        "float-y":    "float-y 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
