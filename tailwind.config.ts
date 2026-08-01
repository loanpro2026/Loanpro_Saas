import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand — Deep Indigo
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Accent — Amber/Gold (pawn shop theme)
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Surface tokens
        surface: {
          DEFAULT: '#f8fafc',
          card:    '#ffffff',
          border:  '#e2e8f0',
          muted:   '#f1f5f9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs':   ['0.75rem', { lineHeight: '1rem' }],
        'sm':   ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg':   ['1.125rem', { lineHeight: '1.75rem' }],
        'xl':   ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl':  ['1.5rem', { lineHeight: '2rem' }],
        '3xl':  ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl':  ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl':  ['3rem', { lineHeight: '1' }],
        '6xl':  ['3.75rem', { lineHeight: '1' }],
      },
      boxShadow: {
        'card':  '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
        'modal': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
      borderRadius: {
        'xl':  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'shimmer':    'shimmer 1.5s infinite',
        'shake':      'shake 0.4s ease-in-out',
      },
      keyframes: {
        shake: {
          '0%, 100%':   { transform: 'translateX(0)' },
          '20%, 60%':   { transform: 'translateX(-6px)' },
          '40%, 80%':   { transform: 'translateX(6px)' },
        },
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}

export default config
