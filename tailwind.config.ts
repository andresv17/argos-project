import type { Config } from 'tailwindcss';

/**
 * Design tokens de `ui_blueprint.md` v1.1 (sección 1). Valores HEX verificados por contraste WCAG 2.1 (59 pares, 0 fallos).
 * Colores de dominio (owner-1..8 y semáforo) se mantienen con sus tonos semánticos; los colores de marca viven aquí.
 */
const config: Config = {
  content: ['./index.html', './admin.html', './src/presentation/web/**/*.{ts,tsx}', './src/presentation/admin/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1d4f3a', hover: '#173f2f' },
        secondary: '#35573f',
        accent: { DEFAULT: '#c5f35a', soft: '#e9fbc4' },
        sky: '#eaf6ff',
        meadow: '#e6f2ea',
        cream: '#f4f8ef',
        'surface-solid': '#ffffff',
        'text-primary': '#0f172a',
        'text-muted': '#475569',
        'border-strong': '#64748b',
        danger: '#b91c1c',
        pastel: { mint: '#d9f5e6', cream: '#fbf5dc', sky: '#dbeafe' },
        owner: {
          1: '#1d4ed8',
          2: '#047857',
          3: '#b91c1c',
          4: '#7e22ce',
          5: '#b45309',
          6: '#0f766e',
          7: '#be185d',
          8: '#4338ca',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(15, 23, 42, 0.06)',
      },
      minHeight: {
        touch: '3rem',
      },
    },
  },
  plugins: [],
};

export default config;
