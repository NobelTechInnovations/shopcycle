import { revalidatePath } from "next/cache";

/** Called by the API when Super admin saves a plan or the pricing settings,
 * so the home page's prices update at once (not up to a minute later).
 * Needs REVALIDATE_SECRET, the same value on the API and on this site. */
export async function POST(request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  revalidatePath("/");
  return Response.json({ revalidated: true });
}
