import { revalidatePath } from "next/cache";

/** Called by the API when Super admin saves a plan or the pricing settings,
 * so the prices on the home and pricing pages update at once (not up to a minute later).
 * Needs REVALIDATE_SECRET, the same value on the API and on this site. */
export async function POST(request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  // Every page that shows plans or the app catalog.
  for (const path of ["/", "/pricing", "/apps"]) revalidatePath(path);
  return Response.json({ revalidated: true });
}
