import type { ImageData } from "./types";

/**
 * Resolve a MIME type from a raw File. Safari sometimes returns empty strings,
 * so we fall back to the file extension.
 */
export function resolveMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

/**
 * Strip the `data:<mime>;base64,` prefix so only the raw base64 payload is
 * returned. Some callers want this for APIs that expect the pure payload.
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  return commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : dataUrl;
}

/**
 * Read a file as a base64 data URL (the full `data:...` string). Works around
 * Safari quirks where FileReader occasionally omits the MIME type.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a file and return the base64 payload (without data URL prefix) plus the
 * resolved MIME. Convenient for APIs that expect `{mime, base64}` tuples.
 */
export async function fileToImageData(file: File): Promise<ImageData> {
  const dataUrl = await fileToDataUrl(file);
  return {
    mime: resolveMime(file),
    base64: stripDataUrlPrefix(dataUrl),
  };
}

/**
 * Trigger a browser download from a blob by creating and revoking an object
 * URL. Works in modern evergreen browsers.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on next tick so the browser has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Trigger a download from a data URL. Useful for base64 images returned by AI
 * APIs that we want to save as-is.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Decode a base64 string to a Uint8Array. Safe against non-ASCII payloads that
 * would otherwise crash `atob`.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Convert a data URL into a Blob so it can be uploaded or zipped.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(",");
  const mimeMatch = /data:([^;]+)/i.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  // BlobPart typing varies across TS lib versions; cast to Uint8Array<ArrayBuffer>.
  const bytes = base64ToBytes(data);
  return new Blob([bytes as unknown as BlobPart], { type: mime });
}
