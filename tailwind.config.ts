import type { Config } from 'tailwindcss';

/** Los tokens owner-1..8 (contraste AA, REQ-UI-007) se definen en TASK-112. */
const config: Config = {
  content: ['./index.html', './src/presentation/web/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
