import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        chronos: {
          bg: '#0c0f1a',
          surface: '#111827',
          'surface-2': '#1a2235',
          border: '#1e2d45',
          'border-bright': '#2d4060',
          text: '#e2e8f0',
          muted: '#64748b',
          subtle: '#94a3b8',
          accent: '#3b82f6',
          'accent-2': '#8b5cf6',
          success: '#34d399',
          warning: '#fbbf24',
          danger: '#f87171',
          info: '#60a5fa',
        }
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'slide-in': 'slideIn 0.3s ease forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { transform: 'translateX(-10px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(59,130,246,0.15)' },
          '50%': { boxShadow: '0 0 20px rgba(59,130,246,0.3)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
