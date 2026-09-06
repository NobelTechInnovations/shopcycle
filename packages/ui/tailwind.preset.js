/**
 * Shared Tailwind tokens for every ShopCycle app. Import into an app's
 * tailwind.config.js via `presets: [require("@shopcycle/ui/tailwind.preset")]`.
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
          bg: "#F6F6F7",
          surface: "#FFFFFF",
          border: "#E3E5E7",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          muted: "#6B7280",
        },
        brand: {
          DEFAULT: "#1F2937",
        },
        status: {
          success: "#16A34A",
          warning: "#D97706",
          danger: "#DC2626",
          info: "#2563EB",
        },
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["Fira Code", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16, 24, 40, 0.05)",
      },
    },
  },
};
