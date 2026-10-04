/**
 * Shared Tailwind tokens for every Oyklane app. Import into an app's
 * tailwind.config.js via `presets: [require("@shopcycle/ui/tailwind.preset")]`.
 * Mirrors src/theme/tokens.js (which drives AntD) — keep the two in sync.
 *
 * Tailwind's default spacing scale (0.25rem increments) already lands on
 * 4/8/12/16/20/24/32/40/48px at indices 1,2,3,4,5,6,8,10,12 — that's the
 * exact scale the design system calls for, so it's intentionally left
 * un-overridden here.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#F7F7F8",
          surface: "#FFFFFF",
          border: "#E6E6EA",
        },
        ink: {
          DEFAULT: "#111114",
          muted: "#6B6B76",
          subtle: "#9A9AA5",
        },
        brand: {
          DEFAULT: "#111114",
        },
        // Oyklane brand gradient endpoints — logo mark, focus, progress,
        // active states. Sparingly; the chrome stays neutral.
        accent: {
          DEFAULT: "#7C5CFF",
          soft: "#F1EEFF",
          2: "#2DD4BF",
        },
        status: {
          success: "#16A34A",
          warning: "#D97706",
          danger: "#DC2626",
          info: "#2563EB",
        },
      },
      borderRadius: {
        sm: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["Fira Code", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(17, 17, 20, 0.04), 0 1px 3px 0 rgba(17, 17, 20, 0.04)",
        raised: "0 4px 16px -4px rgba(17, 17, 20, 0.10), 0 2px 4px -2px rgba(17, 17, 20, 0.06)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7C5CFF 0%, #2DD4BF 100%)",
      },
    },
  },
};
