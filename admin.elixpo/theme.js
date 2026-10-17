// Elixpo design tokens — shared across the suite (copied from accounts/payouts).
export const colors = {
    bg: {
        deep: "#0f1117",
        page: "#0b0d12",
        card: "rgba(16, 24, 12, 0.8)",
        cardGlass: "rgba(255,255,255,0.05)",
        cardGlassHover: "rgba(255,255,255,0.08)",
        overlay: "rgba(20, 26, 22, 0.95)",
    },
    lime: {
        main: "#9b7bf7",
        light: "#b69aff",
        deep: "#7c5cff",
        dim: "rgba(155, 123, 247, 0.15)",
        border: "rgba(155, 123, 247, 0.3)",
        glow: "rgba(155, 123, 247, 0.6)",
    },
    sage: {
        main: "#86efac",
        dim: "rgba(134, 239, 172, 0.15)",
        border: "rgba(134, 239, 172, 0.3)",
    },
    honey: {
        main: "#fbbf24",
        dim: "rgba(251, 191, 36, 0.15)",
        border: "rgba(251, 191, 36, 0.3)",
    },
    sky: { main: "#5fb6ff" },
    rose: { main: "#ff6a8a" },
    text: {
        primary: "#f5f5f4",
        secondary: "rgba(245, 245, 244, 0.8)",
        muted: "rgba(245, 245, 244, 0.7)",
        subtle: "rgba(255, 255, 255, 0.5)",
        disabled: "rgba(255, 255, 255, 0.4)",
    },
    border: {
        light: "rgba(255, 255, 255, 0.1)",
        soft: "rgba(255, 255, 255, 0.08)",
        medium: "rgba(255, 255, 255, 0.15)",
        strong: "rgba(255, 255, 255, 0.2)",
        hover: "rgba(255, 255, 255, 0.3)",
    },
    status: {
        success: {
            main: "#4ade80",
            bg: "rgba(34, 197, 94, 0.1)",
            border: "rgba(34, 197, 94, 0.3)",
        },
        warning: {
            main: "#fbbf24",
            bg: "rgba(251, 191, 36, 0.1)",
            border: "rgba(251, 191, 36, 0.3)",
        },
        error: {
            main: "#f87171",
            bg: "rgba(239, 68, 68, 0.1)",
            border: "rgba(239, 68, 68, 0.3)",
        },
        info: {
            main: "#818cf8",
            bg: "rgba(88, 101, 242, 0.15)",
            border: "rgba(88, 101, 242, 0.3)",
        },
        neutral: {
            main: "#d1d5db",
            bg: "rgba(156, 163, 175, 0.1)",
            border: "rgba(156, 163, 175, 0.2)",
        },
    },
};

export const gradients = {
    cardAccent: "linear-gradient(90deg, #9b7bf7, #86efac, #fbbf24)",
    textHeading: "linear-gradient(to bottom right, #f5f5f4, #a1a1aa)",
    textHero:
        "linear-gradient(135deg, #f5f5f4 0%, #9b7bf7 30%, #86efac 60%, #fbbf24 100%)",
    textAccent:
        "linear-gradient(135deg, #9b7bf7 0%, #86efac 50%, #fbbf24 100%)",
    bgPage: "linear-gradient(135deg, #0f1117 0%, #131922 50%, #0f1117 100%)",
    bgCard: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
    buttonPrimary: "linear-gradient(180deg, #a98cff 0%, #7c5cff 100%)",
};

export const shadows = {
    card: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
    cardHover: "0 20px 40px -10px rgba(0,0,0,0.4)",
    glowLime: "0 0 20px rgba(155, 123, 247, 0.6)",
    button: "0 8px 25px rgba(0,0,0,0.3)",
};

export const fonts = {
    body: "var(--font-geist-sans), -apple-system, sans-serif",
    display: "var(--font-geist-sans), sans-serif",
    mono: "var(--font-geist-mono), monospace",
};

export const sx = {
    card: {
        background: gradients.bgCard,
        backdropFilter: "blur(20px)",
        border: `1px solid ${colors.border.soft}`,
        borderRadius: "16px",
        color: colors.text.primary,
        transition: "all 0.3s ease",
    },
};

export default { colors, gradients, shadows, fonts, sx };
