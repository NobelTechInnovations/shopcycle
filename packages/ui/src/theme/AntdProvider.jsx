"use client";

// AntD v5 officially targets React 16-18; this patches its internals for
// React 19's changed rendering entry points. Side-effect import — must run
// before any AntD component mounts.
import "@ant-design/v5-patch-for-react-19";
import { ConfigProvider, App as AntdApp, theme as antdTheme } from "antd";
import { tokens } from "./tokens";

/** Wraps AntD's ConfigProvider so every component (Table, Button, Modal,
 * Drawer, Tag...) picks up the ShopCycle tokens instead of AntD defaults,
 * and the compact algorithm gives the dense "admin dashboard" density this
 * app calls for instead of AntD's default comfortable spacing. */
export function AntdProvider({ children }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.compactAlgorithm,
        token: {
          colorPrimary: tokens.colors.brand,
          colorSuccess: tokens.colors.success,
          colorWarning: tokens.colors.warning,
          colorError: tokens.colors.danger,
          colorInfo: tokens.colors.info,
          colorBgLayout: tokens.colors.appBg,
          colorBorder: tokens.colors.border,
          colorText: tokens.colors.textPrimary,
          colorTextSecondary: tokens.colors.textMuted,
          borderRadius: tokens.radius.md,
          fontFamily: tokens.fontFamily,
        },
        components: {
          Table: { borderRadiusLG: tokens.radius.md, headerBg: tokens.colors.appBg },
          Button: { borderRadius: tokens.radius.sm },
          Card: { borderRadiusLG: tokens.radius.md },
          Modal: { borderRadiusLG: tokens.radius.lg },
          Drawer: {},
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
