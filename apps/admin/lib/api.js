export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

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
 * credentials: "include". */
export async function apiFetch(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    // Only set Content-Type when there's a body — Fastify's JSON parser
    // rejects application/json on a bodiless request (e.g. POST .../activate).
    headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(data?.error || "Request failed", res.status, data?.details);
  }
  return data;
}

/** Multipart upload — deliberately not routed through apiFetch, which
 * always sets Content-Type: application/json and JSON.stringifies the
 * body. A FormData body needs the browser to set its own multipart
 * boundary header, so Content-Type must be left unset here. */
export async function apiUpload(path, file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(data?.error || "Upload failed", res.status, data?.details);
  }
  return data;
}

/** Downloads a file the API serves (CSV exports) with the session cookie,
 * then hands it to the browser as a download. A plain <a href> to the API
 * can't be used for errors: a 403 ("Premium only") would just download as
 * a file instead of showing a message. */
export async function apiDownload(path, fallbackName = "download.csv") {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!res.ok) {
    const data = await parseBody(res).catch(() => null);
    throw new ApiError(data?.error || "Download failed", res.status);
  }
  const disposition = res.headers.get("content-disposition") || "";
  const name = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
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
