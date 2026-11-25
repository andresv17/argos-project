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
        // Paleta oficial Tipi (D10-02, REQ-TIP10-003): ÚNICO lugar de los valores. Regla de Neo (Terracota, opción a): `terracota` solo en acentos
        // decorativos, títulos grandes (>= 24 px, o 18.66 px en negrita), íconos grandes y el anillo de foco; NUNCA en texto normal, enlaces ni botones con etiqueta normal.
        primary: { DEFAULT: '#1F3D36', hover: '#16302A' },
        cream: '#EFE8D8',
        terracota: '#C4552D',
        // Derivados del Bosque y la Crema (sin colores de marca nuevos).
        secondary: '#2F5248',
        accent: { DEFAULT: '#E0D6BD', soft: '#F6F1E4' },
        sky: '#F7F3E8',
        meadow: '#E8E6D5',
        'surface-solid': '#ffffff',
        'text-primary': '#14231F',
        'text-muted': '#475569',
        'border-strong': '#64748b',
        danger: '#b91c1c',
        pastel: { mint: '#DCE8DD', cream: '#fbf5dc', sky: '#dbeafe' },
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
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['Nunito', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
