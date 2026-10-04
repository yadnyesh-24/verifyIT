import type { Config } from "tailwindcss";

/**
 * VerifyIT design tokens.
 *
 * Every colour, radius and shadow used in the UI is declared here so the
 * screens stay consistent. The corresponding CSS variables live in
 * `app/globals.css`. Do not use hex values inside components - reference the
 * Tailwind classes (`bg-surface`, `text-ink`, `border-hairline`, etc.) so a
 * theme change is a single-file edit.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1100px" },
    },
    extend: {
      colors: {
        // Surfaces
        canvas: "hsl(var(--canvas))",
        surface: "hsl(var(--surface))",
        "surface-2": "hsl(var(--surface-2))",
        // Text
        ink: "hsl(var(--ink))",
        muted: "hsl(var(--muted))",
        subtle: "hsl(var(--subtle))",
        // Borders / focus
        hairline: "hsl(var(--hairline))",
        ring: "hsl(var(--ring))",
        // Brand
        brand: {
          DEFAULT: "hsl(var(--brand))",
          hover: "hsl(var(--brand-hover))",
          soft: "hsl(var(--brand-soft))",
          foreground: "hsl(var(--brand-foreground))",
        },
        // Status tokens - both fg and a soft chip background
        pass: { fg: "hsl(var(--pass))", soft: "hsl(var(--pass-soft))" },
        warn: { fg: "hsl(var(--warn))", soft: "hsl(var(--warn-soft))" },
        risk: { fg: "hsl(var(--risk))", soft: "hsl(var(--risk-soft))" },
        pending: { fg: "hsl(var(--pending))", soft: "hsl(var(--pending-soft))" },
      },
      fontFamily: {
        // The CSS variables are populated by `next/font` in app/layout.tsx.
        sans: "var(--font-sans)",
        hindi: "var(--font-hindi)",
      },
      fontSize: {
        // Explicit scale; nothing in the UI should go below `text-sm` (14px).
        "display-1": ["2.25rem", { lineHeight: "2.75rem", fontWeight: "700" }],
        "display-2": ["1.5rem", { lineHeight: "1.875rem", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.5rem" }],
        "body-lg": ["1.0625rem", { lineHeight: "1.625rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
      },
      borderRadius: {
        card: "var(--radius-card)",
        btn: "var(--radius-btn)",
        pill: "9999px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        md: "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.06)",
        lg: "0 12px 28px -8px rgb(15 23 42 / 0.10), 0 4px 10px -4px rgb(15 23 42 / 0.08)",
        focus: "0 0 0 4px hsl(var(--ring) / 0.18)",
      },
      transitionDuration: {
        DEFAULT: "180ms",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200px 0" },
          "100%": { backgroundPosition: "calc(200px + 100%) 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
        "scan-line": "scan-line 1800ms ease-in-out infinite",
        shimmer: "shimmer 1.4s infinite linear",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;