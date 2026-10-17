import type { Config } from "tailwindcss";

export default {
    content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
            },
        },
    },
    plugins: [],
} satisfies Config;
