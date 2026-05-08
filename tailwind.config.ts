import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: "#0a0a0a",
        bg: "#fafaf9",
        accent: "#e11d48",
        muted: "#737373",
      },
    },
  },
  plugins: [],
} satisfies Config;
