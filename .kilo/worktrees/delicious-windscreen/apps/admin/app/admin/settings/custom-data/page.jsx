import { serverApiFetch } from "@/lib/api";
import { SettingsSectionHeader } from "../SettingsNav";
import { CustomDataSettings } from "./CustomDataSettings";

export default async function SettingsCustomDataPage() {
  const [{ role }, products, collections] = await Promise.all([
    serverApiFetch("/api/store"),
    serverApiFetch("/api/metafields?owner=product"),
    serverApiFetch("/api/metafields?owner=collection"),
  ]);
  return (
    <div>
      <SettingsSectionHeader
        title="Custom data"
        description="Add your own fields to products and collections — Fabric, Fit, Care instructions, a Size chart. Fill them in on each product; they show in the product page's Details."
      />
      <CustomDataSettings
        types={products.types}
        initial={{ product: products.definitions, collection: collections.definitions }}
        canEdit={role !== "staff"}
      />
    </div>
  );
}
