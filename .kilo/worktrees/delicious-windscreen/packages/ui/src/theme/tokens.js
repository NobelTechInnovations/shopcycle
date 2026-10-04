// Single source of truth for the two places these values are needed:
// the Tailwind preset (utility classes) and the AntD ConfigProvider
// (component theming). Keep this file and tailwind.preset.js in sync.
export const tokens = {
  colors: {
    appBg: "#F7F7F8",
    surface: "#FFFFFF",
    border: "#E6E6EA",
    textPrimary: "#111114",
    textMuted: "#6B6B76",
    // Primary actions — near-black, the convention premium commerce admins
    // use so the store's own content (product photos, theme colors) is what
    // carries color, not the chrome around it.
    brand: "#111114",
    // Oyklane's brand gradient (see apps/www's logo mark) — used sparingly:
    // the logo mark, focus rings, active nav, progress. Never for body text.
    accent: "#7C5CFF",
    accentSoft: "#F1EEFF",
    accent2: "#2DD4BF",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#2563EB",
  },
  radius: { sm: 8, md: 10, lg: 14 },
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
