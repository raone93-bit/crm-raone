import type { Config } from "tailwindcss";

/**
 * Paleta derivada do universo do produto: pedra honed, verde serpentina como
 * acento, óxido de ferro para atenção. Ver o documento de arquitetura.
 */
const config: Config = {
  darkMode: "media",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "rgb(var(--ground) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        iron: "rgb(var(--iron) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
