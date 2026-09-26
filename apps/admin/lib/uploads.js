/** The image types the API actually accepts (it checks the file's bytes —
 * see apps/api/src/lib/file-type.js). Used as every file picker's `accept`
 * so the picker never offers a file the server will reject. No SVG: it can
 * carry scripts. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
