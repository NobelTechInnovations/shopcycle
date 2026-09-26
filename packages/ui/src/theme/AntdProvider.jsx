"use client";

// AntD v5 officially targets React 16-18; this patches its internals for
// React 19's changed rendering entry points. Side-effect import — must run
// before any AntD component mounts.
import "@ant-design/v5-patch-for-react-19";
import { ConfigProvider, App as AntdApp, theme as antdTheme } from "antd";
import { tokens } from "./tokens";

const c = tokens.colors;

/** Wraps AntD's ConfigProvider so every component (Table, Button, Modal,
 * Drawer, Tag...) picks up the Oyklane tokens instead of AntD defaults,
 * and the compact algorithm gives the dense "admin dashboard" density this
 * app calls for instead of AntD's default comfortable spacing. */
export function AntdProvider({ children }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.compactAlgorithm,
        token: {
          colorPrimary: c.brand,
          colorLink: c.accent,
          colorLinkHover: "#6A48F5",
          colorSuccess: c.success,
          colorWarning: c.warning,
          colorError: c.danger,
          colorInfo: c.info,
          colorBgLayout: c.appBg,
          colorBorder: c.border,
          colorBorderSecondary: "#EEEEF1",
          colorText: c.textPrimary,
          colorTextSecondary: c.textMuted,
          // Violet focus ring on every input/select — the one place the
          // brand accent shows up on every screen, quietly.
          controlOutline: "rgba(124, 92, 255, 0.18)",
          colorPrimaryHover: "#2A2A30",
          borderRadius: tokens.radius.sm,
          borderRadiusLG: tokens.radius.md,
          fontFamily: tokens.fontFamily,
          boxShadowTertiary: "0 1px 2px 0 rgba(17,17,20,0.04), 0 1px 3px 0 rgba(17,17,20,0.04)",
        },
        components: {
          Table: { borderRadiusLG: tokens.radius.md, headerBg: "#FAFAFB", headerColor: c.textMuted },
          Button: { borderRadius: tokens.radius.sm, fontWeight: 500, primaryShadow: "none", defaultShadow: "none" },
          Card: { borderRadiusLG: tokens.radius.lg, headerFontSize: 14 },
          Modal: { borderRadiusLG: tokens.radius.lg },
          Input: { activeBorderColor: c.accent, hoverBorderColor: "#C9C9D2" },
          Select: { activeBorderColor: c.accent, hoverBorderColor: "#C9C9D2" },
          Menu: {
            itemSelectedBg: c.accentSoft,
            itemSelectedColor: c.textPrimary,
            itemHoverBg: "#F3F3F5",
            itemBorderRadius: tokens.radius.sm,
            itemHeight: 34,
            itemMarginInline: 8,
            subMenuItemBg: "transparent",
            iconSize: 16,
          },
          Drawer: {},
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
