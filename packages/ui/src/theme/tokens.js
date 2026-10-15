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
    // Oyklane Blue (docs/brand-guidelines.md) — primary buttons, links,
    // focus rings, active nav. Sky is the logo gradient's second colour.
    accent: "#0078d4",
    accentHover: "#005A9E",
    accentSoft: "#EAF3FC",
    accent2: "#2B9FE6",
    navy: "#0F2A4A",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#2563EB",
  },
  radius: { sm: 8, md: 10, lg: 14 },
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
