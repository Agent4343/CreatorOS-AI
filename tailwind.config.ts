import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        serif: ["Georgia", "ui-serif", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: "#1a1a1a",
        cream: "#f7f4ed",
        accent: "#b14a2c",
      },
    },
  },
  plugins: [],
} satisfies Config;
