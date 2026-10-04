"use client";

import { useRouter, usePathname } from "next/navigation";
import { App } from "antd";
import { useConfirmDialog } from "@shopcycle/ui";
import { apiFetch } from "@/lib/api";
import { rupees as inr } from "@/lib/apps";
import { announceAppsChanged, appHref, detailsHref } from "@/lib/apps";

/** Install and uninstall, with the same confirmations everywhere (the
 * sidebar's ⋯ menu, the Apps page, an app's own page). */
export function useAppActions() {
  const { message } = App.useApp();
  const { confirmDialog } = useConfirmDialog();
  const router = useRouter();
  const pathname = usePathname();

  async function doInstall(app, settings = {}) {
    try {
      await apiFetch(`/api/apps/${app.key}/install`, { method: "POST", body: { settings } });
      message.success(app.installed ? `${app.name} saved` : `${app.name} installed — find it in your sidebar`);
      announceAppsChanged();
      return true;
    } catch (err) {
      message.error(err.message);
      return false;
    }
  }

  function install(app, settings = {}) {
    if (!app.priceMonthly || app.installed) return doInstall(app, settings);
    return new Promise((resolve) => {
      confirmDialog({
        title: `Install ${app.name} for ${inr(app.priceMonthly)}/month?`,
        description: `${inr(app.priceMonthly)} + GST is added to your next bill for this billing period, and to every billing period the app stays installed. Removing it stops future charges; a period already added is still payable.`,
        okText: "Install",
        onConfirm: async () => resolve(await doInstall(app, settings)),
        onCancel: () => resolve(false),
      });
    });
  }

  function uninstall(app) {
    confirmDialog({
      title: `Uninstall ${app.name}?`,
      description: app.priceMonthly
        ? `It stops on your store straight away, and so do future charges. This billing period's ${inr(app.priceMonthly)} + GST stays on your next bill. Its settings are kept if you install it again.`
        : "It stops on your store straight away. Its settings are kept if you install it again.",
      okText: "Uninstall",
      danger: true,
      onConfirm: async () => {
        try {
          await apiFetch(`/api/apps/${app.key}/uninstall`, { method: "POST" });
          message.success(`${app.name} uninstalled`);
          announceAppsChanged();
          // An app's own panel closes with it; its details page stays (it offers Install again).
          if (appHref(app) !== detailsHref(app) && pathname.startsWith(appHref(app))) router.push(detailsHref(app));
        } catch (err) {
          message.error(err.message);
        }
      },
    });
  }

  return { install, uninstall };
}
