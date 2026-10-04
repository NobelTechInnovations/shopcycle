export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100";

async function parseBody(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Client Components: browser sends the session cookie automatically via
 * credentials: "include". The API's CORS config explicitly allows this
 * app's origin (SUPER_ADMIN_ORIGIN) with credentials — see apps/api/src/app.js. */
export async function apiFetch(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(data?.error || "Request failed", res.status, data?.details);
  }
  return data;
}

/** Server Components/layouts don't have a browser cookie jar — forward the
 * incoming request's cookies manually so the API sees the same session. */
export async function serverApiFetch(path, { method = "GET", body, headers } = {}) {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    cache: "no-store",
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      Cookie: cookieStore.toString(),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(data?.error || "Request failed", res.status, data?.details);
  }
  return data;
}

export { ApiError };
