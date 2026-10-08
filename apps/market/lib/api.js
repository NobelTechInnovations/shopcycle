import { cookies } from "next/headers";
import { API_URL, PARTNER_COOKIE } from "./config";

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** A call to the Oyklane API from this app's server. `auth: true` sends
 * the signed-in developer's token. Public data is cached for a minute. */
export async function api(path, { method = "GET", body, auth = false, raw, revalidate } = {}) {
  const headers = {};
  if (auth) {
    const token = (await cookies()).get(PARTNER_COOKIE)?.value;
    if (!token) throw new ApiError("Please sign in.", 401);
    headers.authorization = `Bearer ${token}`;
  }
  if (body !== undefined && !raw) headers["content-type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: raw || (body !== undefined ? JSON.stringify(body) : undefined),
    ...(method === "GET" && !auth && revalidate !== false ? { next: { revalidate: revalidate ?? 60 } } : { cache: "no-store" }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(data?.error || data?.message || "Something went wrong — please try again.", res.status, data?.details);
  return data;
}

/** The signed-in developer, or null. */
export async function currentPartner() {
  const token = (await cookies()).get(PARTNER_COOKIE)?.value;
  if (!token) return null;
  try {
    return (await api("/api/partners/me", { auth: true })).partner;
  } catch {
    return null;
  }
}
