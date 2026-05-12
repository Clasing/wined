import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wined: { 50: '#fdf2f5', 500: '#9b1c3a', 700: '#6e0f24' },
      },
    },
  },
  plugins: [],
} satisfies Config;
