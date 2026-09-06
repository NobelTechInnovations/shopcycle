// Single source of truth for the two places these values are needed:
// the Tailwind preset (utility classes) and the AntD ConfigProvider
// (component theming). Keep this file and tailwind.preset.js in sync.
export const tokens = {
  colors: {
    appBg: "#F6F6F7",
    surface: "#FFFFFF",
    border: "#E3E5E7",
    textPrimary: "#1A1A1A",
    textMuted: "#6B7280",
    brand: "#1F2937",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#2563EB",
  },
  radius: { sm: 6, md: 8, lg: 12 },
  fontFamily: "Inter, sans-serif",
};
