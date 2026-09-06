import { serverApiFetch } from "@/lib/api";
import { MenuForm } from "../MenuForm";

export default async function EditMenuPage({ params }) {
  const { id } = await params;
  const { menu } = await serverApiFetch(`/api/menus/${id}`);
  return <MenuForm menu={menu} />;
}
