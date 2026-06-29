import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0a0f",
          900: "#0e0e16",
          850: "#13131d",
          800: "#181826",
          700: "#20202f",
          600: "#2a2a3d",
          500: "#3a3a52",
        },
        // Uçuş Saati brand blue (secondary color)
        brand: {
          50: "#E6F6FB",
          100: "#C8ECF6",
          200: "#9FE0F1",
          300: "#6FD0EA",
          400: "#4BC5E8",
          500: "#31AFD9",
          600: "#1F8AAD",
          700: "#1A7592",
          800: "#155F78",
          900: "#10485B",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Fira Sans", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
        glow: "0 0 0 1px rgba(49,175,217,0.45), 0 0 22px rgba(49,175,217,0.22)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
