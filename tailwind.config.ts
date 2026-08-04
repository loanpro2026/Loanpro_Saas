import type { Config } from 'tailwindcss'

/**
 * Theme tokens come from the LoanPro design reference
 * (`LoanPro SaaS UI design reference/LoanPro App.dc.html`).
 *
 * Every colour resolves through a CSS variable declared in app/globals.css, so
 * light and dark are the same class names against a different `:root`. The
 * legacy scales (slate-*, primary-*, gold-*, emerald-*, amber-*, red-*) are
 * kept and re-pointed at the design tokens rather than deleted — screens that
 * have not been rebuilt yet inherit the new palette instead of drifting away
 * from it.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ---- Design tokens --------------------------------------------------
        // Text: --text / --text2 / --text3
        ink: {
          DEFAULT: 'rgb(var(--text) / <alpha-value>)',
          muted:   'rgb(var(--text2) / <alpha-value>)',
          faint:   'rgb(var(--text3) / <alpha-value>)',
        },
        // Surfaces: --bg (page), --surface (card), --surface2 (subtle fill)
        surface: {
          DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
          card:    'rgb(var(--surface) / <alpha-value>)',
          border:  'rgb(var(--border) / <alpha-value>)',
          muted:   'rgb(var(--surface2) / <alpha-value>)',
        },
        line: 'rgb(var(--border) / <alpha-value>)',
        tint: 'var(--primary-tint)',

        // ---- Legacy scales, re-pointed at the tokens -------------------------
        slate: {
          50:  'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          tint: 'var(--primary-tint)',
          50:  'var(--primary-tint)',
          100: 'var(--primary-tint)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary) / <alpha-value>)',
          600: 'rgb(var(--primary) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-700) / <alpha-value>)',
          900: 'rgb(var(--primary-700) / <alpha-value>)',
          950: 'rgb(var(--primary-700) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          bg:  'var(--gold-bg)',
          50:  'var(--gold-bg)',
          100: 'var(--gold-bg)',
          200: 'var(--gold-bg)',
          300: 'rgb(var(--gold) / <alpha-value>)',
          400: 'rgb(var(--gold) / <alpha-value>)',
          500: 'rgb(var(--gold) / <alpha-value>)',
          600: 'rgb(var(--gold) / <alpha-value>)',
          700: 'rgb(var(--gold) / <alpha-value>)',
          800: 'rgb(var(--gold) / <alpha-value>)',
          900: 'rgb(var(--gold) / <alpha-value>)',
        },
        silver: {
          DEFAULT: 'rgb(var(--silver) / <alpha-value>)',
          bg: 'var(--silver-bg)',
        },
        // Money in / positive. `emerald-*` is aliased to it so screens that
        // have not been rebuilt move with the theme.
        green: {
          DEFAULT: 'rgb(var(--green) / <alpha-value>)',
          bg: 'var(--green-bg)',
        },
        emerald: {
          DEFAULT: 'rgb(var(--green) / <alpha-value>)',
          50:  'var(--green-bg)',
          100: 'var(--green-bg)',
          200: 'var(--green-bg)',
          300: 'rgb(var(--green) / <alpha-value>)',
          400: 'rgb(var(--green) / <alpha-value>)',
          500: 'rgb(var(--green) / <alpha-value>)',
          600: 'rgb(var(--green) / <alpha-value>)',
          700: 'rgb(var(--green) / <alpha-value>)',
          800: 'rgb(var(--green) / <alpha-value>)',
          900: 'rgb(var(--green) / <alpha-value>)',
        },
        amber: {
          DEFAULT: 'rgb(var(--amber) / <alpha-value>)',
          bg:  'var(--amber-bg)',
          50:  'var(--amber-bg)',
          100: 'var(--amber-bg)',
          200: 'var(--amber-bg)',
          300: 'rgb(var(--amber) / <alpha-value>)',
          400: 'rgb(var(--amber) / <alpha-value>)',
          500: 'rgb(var(--amber) / <alpha-value>)',
          600: 'rgb(var(--amber) / <alpha-value>)',
          700: 'rgb(var(--amber) / <alpha-value>)',
          800: 'rgb(var(--amber) / <alpha-value>)',
          900: 'rgb(var(--amber) / <alpha-value>)',
        },
        red: {
          DEFAULT: 'rgb(var(--red) / <alpha-value>)',
          bg:  'var(--red-bg)',
          50:  'var(--red-bg)',
          100: 'var(--red-bg)',
          200: 'var(--red-bg)',
          300: 'rgb(var(--red) / <alpha-value>)',
          400: 'rgb(var(--red) / <alpha-value>)',
          500: 'rgb(var(--red) / <alpha-value>)',
          600: 'rgb(var(--red) / <alpha-value>)',
          700: 'rgb(var(--red) / <alpha-value>)',
          800: 'rgb(var(--red) / <alpha-value>)',
          900: 'rgb(var(--red) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      // The design works in half-pixels (12.5px labels, 13.5px card headings).
      // These are its exact steps, named by pixel value.
      fontSize: {
        '2xs':  ['0.625rem',  { lineHeight: '0.875rem' }],
        '10':   ['0.625rem',  { lineHeight: '0.875rem' }],
        '10.5': ['0.656rem',  { lineHeight: '0.875rem' }],
        '11':   ['0.6875rem', { lineHeight: '1rem' }],
        '11.5': ['0.719rem',  { lineHeight: '1rem' }],
        '12':   ['0.75rem',   { lineHeight: '1rem' }],
        '12.5': ['0.781rem',  { lineHeight: '1.125rem' }],
        '13':   ['0.8125rem', { lineHeight: '1.125rem' }],
        '13.5': ['0.844rem',  { lineHeight: '1.25rem' }],
        '14':   ['0.875rem',  { lineHeight: '1.25rem' }],
        '14.5': ['0.906rem',  { lineHeight: '1.25rem' }],
        '15':   ['0.9375rem', { lineHeight: '1.375rem' }],
        '15.5': ['0.969rem',  { lineHeight: '1.375rem' }],
        '17':   ['1.0625rem', { lineHeight: '1.5rem' }],
        '19':   ['1.1875rem', { lineHeight: '1.5rem' }],
        '22':   ['1.375rem',  { lineHeight: '1.625rem' }],
        'xs':   ['0.75rem',   { lineHeight: '1rem' }],
        'sm':   ['0.875rem',  { lineHeight: '1.25rem' }],
        'base': ['1rem',      { lineHeight: '1.5rem' }],
        'lg':   ['1.125rem',  { lineHeight: '1.75rem' }],
        'xl':   ['1.25rem',   { lineHeight: '1.5rem' }],
        '2xl':  ['1.5rem',    { lineHeight: '1.75rem' }],
        '3xl':  ['1.875rem',  { lineHeight: '2.25rem' }],
        '4xl':  ['2.25rem',   { lineHeight: '2.5rem' }],
        '5xl':  ['3rem',      { lineHeight: '1' }],
        '6xl':  ['3.75rem',   { lineHeight: '1' }],
      },
      boxShadow: {
        'card':       'var(--shadow)',
        'card-hover': 'var(--shadow-hover)',
        'menu':       'var(--shadow-menu)',
        'modal':      'var(--shadow-modal)',
      },
      borderRadius: {
        'md':  '0.4375rem',   // 7px  — small controls
        'lg':  '0.5rem',      // 8px  — inputs, buttons
        'xl':  '0.625rem',    // 10px — inner panels
        '2xl': '0.75rem',     // 12px — cards
        '3xl': '1rem',
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
