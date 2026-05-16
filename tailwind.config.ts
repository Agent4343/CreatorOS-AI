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
        ink: "#0f172a",
        bg: "#f8fafc",
        "bg-2": "#eef2f7",
        accent: "#0284c7",
        muted: "#64748b",
        ok: "#16a34a",
        warn: "#d97706",
        err: "#dc2626",
      },
    },
  },
  plugins: [],
} satisfies Config;
