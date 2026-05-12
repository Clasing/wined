import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wined: {
          50: '#fdf2f5',
          500: '#9b1c3a',
          700: '#6e0f24',
        },
        cellar: {
          50: '#f0fdf4',
          500: '#16a34a',
          700: '#15803d',
        },
      },
    },
  },
  plugins: [],
};

export default config;
