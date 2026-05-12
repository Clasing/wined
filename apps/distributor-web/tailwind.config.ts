import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wined: {
          50: "#fdf2f5",
          500: "#9b1c3a",
          700: "#6e0f24",
        },
        distributor: {
          50: "#eff6ff",
          500: "#2563eb",
          700: "#1d4ed8",
        },
      },
    },
  },
  plugins: [],
};

export default config;
