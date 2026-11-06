/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Primary (Navy/Indigo) ─────────────────────────────────────────
        // Deepened from the original indigo scale for more gravitas.
        // All existing primary-* classes continue to work unchanged.
        primary: {
          50:  '#eef0ff',
          100: '#dde2ff',
          200: '#c0c8fe',
          300: '#98a3fb',
          400: '#7176f5',
          500: '#4A47C0',   // ← main accent (was #6366f1)
          600: '#3d3aaa',   // ← btn-primary bg
          700: '#312e8f',
          800: '#252375',
          900: '#1A1942',   // ← sidebar bg
          950: '#100f2a',   // ← login screen bg
        },
        // ── Gold ─────────────────────────────────────────────────────────
        // Used for logo mark, accents, and highlights
        gold: {
          300: '#EBC76A',
          400: '#D4A839',
          500: '#C9A840',
          600: '#A8882E',
        },
      },
      fontFamily: {
        // Body + UI: DM Sans (humanist, modern, readable)
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        // Headings + wordmark: Playfair Display (serif authority)
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl:  '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
