"use client";

import { Alert } from "antd";
import { WaTemplates } from "@shopcycle/ui";
import { apiFetch, API_URL } from "@/lib/api";

/** The store's templates — or, on Oyklane's shared number, Oyklane's (read-only). */
export default function Templates({ canEdit }) {
  return (
    <WaTemplates
      apiFetch={apiFetch}
      apiUrl={API_URL}
      base="/api/whatsapp"
      canEdit={canEdit}
      managedNotice={
        <Alert
          type="info"
          showIcon
          message="These are Oyklane's templates"
          description="Your store sends from Oyklane's shared WhatsApp number, so your customers get these messages — order updates and sign-in codes, with your store's name in them. Oyklane manages them. Connect your own WhatsApp number to create your own templates."
        />
      }
    />
  );
}
