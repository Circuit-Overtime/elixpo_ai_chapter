import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: '#ffffff',
          card: '#ffffff',
          glass: '#f8f8f8',
          'glass-hover': '#f2f2f2',
          overlay: 'rgba(255,255,255,0.96)',
        },

        // Landing-page accent palette.
        accent: {
          main: '#e53935',
          deep: '#c62828',
          light: '#e85a57',
          dim: 'rgba(229, 57, 53, 0.1)',
          border: 'rgba(229, 57, 53, 0.25)',
          glow: 'rgba(229, 57, 53, 0.25)',
        },

        text: {
          primary: '#111111',
          secondary: '#555555',
          muted: '#666666',
          subtle: '#888888',
          disabled: '#999999',
        },
        border: {
          light: '#e8e8e8',
          medium: '#dddddd',
          strong: '#cccccc',
          hover: 'rgba(229, 57, 53, 0.35)',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-geist-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          'var(--font-geist-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 12px 28px rgba(0,0,0,0.08)',
        'glow-accent': '0 0 20px rgba(229, 57, 53, 0.18)',
        button: '0 8px 24px rgba(229, 57, 53, 0.2)',
      },
      backgroundImage: {
        'gradient-card':
          'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
        'gradient-accent':
          'linear-gradient(135deg, #e53935 0%, #c62828 100%)',
        'gradient-accent-hover':
          'linear-gradient(135deg, #e85a57 0%, #d32f2f 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
