import { redirect } from "next/navigation";
import { currentPartner } from "./api";

/** The signed-in developer, or off to sign in. */
export async function requirePartner(next) {
  const partner = await currentPartner();
  if (!partner) redirect(`/partners/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return partner;
}

export const STATUS = {
  draft: ["Draft", ""],
  in_review: ["In review", "badge--amber"],
  approved: ["Listed", "badge--green"],
  rejected: ["Changes needed", "badge--red"],
  suspended: ["Taken down", "badge--red"],
};
