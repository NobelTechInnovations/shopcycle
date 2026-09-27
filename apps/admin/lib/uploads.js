import { apiFetch, apiUpload } from "@/lib/api";

/** The image types the API actually accepts (it checks the file's bytes —
 * see apps/api/src/lib/file-type.js). Used as every file picker's `accept`
 * so the picker never offers a file the server will reject. No SVG: it can
 * carry scripts. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

let configPromise = null;
function uploadConfig() {
  if (!configPromise) {
    configPromise = apiFetch("/api/files/upload/config").catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

/**
 * Uploads an image to the store's Files library and returns the File row.
 * With a CDN configured (ImageKit/Cloudinary) the browser sends the file
 * straight to it using a signature from the API, then the API checks and
 * records it; otherwise the file goes through the API as before.
 */
export async function uploadImage(file) {
  const config = await uploadConfig();
  if (!config.direct) return (await apiUpload("/api/files/upload", file)).file;
  if (file.size > config.maxBytes) throw new Error("File is too large (max 8MB).");

  const signed = await apiFetch("/api/files/upload/sign", { method: "POST", body: {} });
  const form = new FormData();
  for (const [key, value] of Object.entries(signed.fields)) form.append(key, value);
  if (signed.storage === "imagekit") form.append("fileName", file.name || "image");
  form.append(signed.fileField, file);

  const res = await fetch(signed.uploadUrl, { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || data?.error?.message || "Upload failed. Please try again.");

  const providerFileId = signed.storage === "imagekit" ? data.fileId : data.public_id;
  const done = await apiFetch("/api/files/upload/complete", { method: "POST", body: { providerFileId, name: file.name } });
  return done.file;
}
