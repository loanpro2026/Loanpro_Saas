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
      /**
       * Six rungs, not seventeen.
       *
       * The design reference works in half-pixels — 12.5px labels, 13.5px card
       * headings — and the app reproduced every step faithfully. Measured
       * across app/ and components/, that left 481 of 491 sized elements
       * inside a 5.5px band (10px to 15.5px) spread over twelve sizes. Two of
       * them were the same pixel value under two names: text-xs and text-12
       * were both 12px, text-sm and text-14 both 14px.
       *
       * A type scale works by contrast. Half a pixel is not contrast — nobody
       * can see it — so every piece of text on a screen carried the same
       * weight and the eye had nothing to follow. That reads as noise, and it
       * is the real reason the screens felt crowded: with nothing leading, the
       * only way to find a number was to read all of them.
       *
       * So the ramp is collapsed onto six real rungs at roughly a 1.15–1.3
       * ratio. Every old name is kept and re-pointed rather than removed, so
       * this is one edit instead of 491 — and no screen can be left behind on
       * a size that no longer exists.
       *
       *   micro  11.5  uppercase column heads, kickers
       *   meta   13    supporting text, sub-labels, captions
       *   body   14.5  the reading size — table cells, field values, buttons
       *   lead   16.5  card titles, emphasised values
       *   title  21    page titles
       *   figure 26    the one number a screen is about
       *
       * Line heights are set per rung and are deliberately generous. Cramped
       * leading was doing as much damage as the sizes.
       */
      fontSize: {
        // ── micro ──
        '2xs':  ['0.719rem',  { lineHeight: '1rem' }],
        '10':   ['0.719rem',  { lineHeight: '1rem' }],
        '10.5': ['0.719rem',  { lineHeight: '1rem' }],
        '11':   ['0.719rem',  { lineHeight: '1rem' }],
        '11.5': ['0.719rem',  { lineHeight: '1rem' }],
        // ── meta ──
        '12':   ['0.8125rem', { lineHeight: '1.125rem' }],
        '12.5': ['0.8125rem', { lineHeight: '1.125rem' }],
        'xs':   ['0.8125rem', { lineHeight: '1.125rem' }],
        // ── body ──
        '13':   ['0.90625rem', { lineHeight: '1.375rem' }],
        '13.5': ['0.90625rem', { lineHeight: '1.375rem' }],
        '14':   ['0.90625rem', { lineHeight: '1.375rem' }],
        '14.5': ['0.90625rem', { lineHeight: '1.375rem' }],
        'sm':   ['0.90625rem', { lineHeight: '1.375rem' }],
        // ── lead ──
        '15':   ['1.03125rem', { lineHeight: '1.5rem' }],
        '15.5': ['1.03125rem', { lineHeight: '1.5rem' }],
        'base': ['1.03125rem', { lineHeight: '1.5rem' }],
        // ── subhead ──
        '17':   ['1.125rem',  { lineHeight: '1.625rem' }],
        'lg':   ['1.125rem',  { lineHeight: '1.625rem' }],
        // ── title ──
        '19':   ['1.3125rem', { lineHeight: '1.75rem' }],
        'xl':   ['1.3125rem', { lineHeight: '1.75rem' }],
        // ── figure ──
        '22':   ['1.625rem',  { lineHeight: '1.875rem' }],
        '2xl':  ['1.625rem',  { lineHeight: '1.875rem' }],
        // ── display: marketing only ──
        '3xl':  ['2rem',      { lineHeight: '2.375rem' }],
        '4xl':  ['2.5rem',    { lineHeight: '2.875rem' }],
        '5xl':  ['3.25rem',   { lineHeight: '1.1' }],
        '6xl':  ['4rem',      { lineHeight: '1.05' }],
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
