import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";

const TOPAZ_BASE = "https://api.topazlabs.com/image/v1";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 110_000; // < 120s Worker wall-clock

// Valid Gigapixel model identifiers as of the current Topaz Developer API.
const MODELS = new Set([
  "Standard V2",
  "High Fidelity V2",
  "Low Resolution V2",
  "CGI",
  "Text Refine",
]);

interface UpscaleBody {
  imageBase64?: string;
  mime?: string;
  imageUrl?: string; // data: URL is accepted; remote http(s) URLs are fetched
  targetHeight?: number; // optional, passed to Topaz as output_height
  model?: string; // Gigapixel model; defaults to "Standard V2"
  outputFormat?: "jpeg" | "png";
  faceEnhance?: boolean;
  faceEnhancementStrength?: number; // 0–1, required if faceEnhance=true
  faceEnhancementCreativity?: number; // 0–1, required if faceEnhance=true
  sharpen?: number; // 0–1
  denoise?: number; // 0–1
  fixCompression?: number; // 0–1
  strength?: number; // 0.01–1
}

interface TopazSubmitResponse {
  process_id: string;
}

interface TopazStatusResponse {
  status: "Processing" | "Completed" | "Failed" | "Cancelled";
}

interface TopazDownloadResponse {
  url: string;
}

export const upscaleRoutes = new Hono<{ Bindings: Env }>();

// Upscale via Topaz Gigapixel API (async enhance → poll → signed download).
// Accepts a data-URL or a raw base64+mime pair; always returns `{ imageUrl }`
// as a self-contained data URL so the client doesn't race Topaz's signed URL
// expiry. Exact W×H resizing happens on the client via canvas — we pass
// `output_height` to Topaz as a hint but don't rely on it for precision.
upscaleRoutes.post("/api/upscale", async (c) => {
  const key = c.env.TOPAZ_API_KEY;
  if (!key) {
    throw new HTTPException(500, { message: "TOPAZ_API_KEY not configured" });
  }

  const body = await c.req.json<UpscaleBody>();
  const { bytes, mime } = await resolveImageInput(body);
  const outputFormat: "jpeg" | "png" = body.outputFormat ?? "png";
  const model = body.model && MODELS.has(body.model) ? body.model : "Standard V2";

  // Build multipart form per Topaz spec.
  const form = new FormData();
  form.append("model", model);
  form.append("output_format", outputFormat);
  form.append(
    "image",
    new Blob([bytes], { type: mime }),
    `input.${extFromMime(mime)}`,
  );
  if (body.targetHeight && Number.isFinite(body.targetHeight) && body.targetHeight > 0) {
    form.append("output_height", String(Math.round(body.targetHeight)));
  }
  if (body.faceEnhance) {
    form.append("face_enhancement", "true");
    form.append(
      "face_enhancement_strength",
      String(clamp01(body.faceEnhancementStrength ?? 0.5)),
    );
    form.append(
      "face_enhancement_creativity",
      String(clamp01(body.faceEnhancementCreativity ?? 0.5)),
    );
  }
  if (body.sharpen !== undefined) form.append("sharpen", String(clamp01(body.sharpen)));
  if (body.denoise !== undefined) form.append("denoise", String(clamp01(body.denoise)));
  if (body.fixCompression !== undefined)
    form.append("fix_compression", String(clamp01(body.fixCompression)));
  if (body.strength !== undefined)
    form.append("strength", String(clampRange(body.strength, 0.01, 1)));

  // 1. Submit.
  const submit = await fetch(`${TOPAZ_BASE}/enhance/async`, {
    method: "POST",
    headers: { "X-API-KEY": key },
    body: form,
  });
  if (!submit.ok) {
    const err = await submit.text();
    throw new HTTPException(submit.status as 400, {
      message: `Topaz submit error: ${err.slice(0, 500)}`,
    });
  }
  const { process_id } = (await submit.json()) as TopazSubmitResponse;
  if (!process_id) {
    throw new HTTPException(502, { message: "Topaz submit: missing process_id" });
  }

  // 2. Poll.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status: TopazStatusResponse["status"] = "Processing";
  while (status === "Processing") {
    if (Date.now() > deadline) {
      throw new HTTPException(504, { message: "Topaz timeout" });
    }
    await sleep(POLL_INTERVAL_MS);
    const poll = await fetch(`${TOPAZ_BASE}/status/${process_id}`, {
      headers: { "X-API-KEY": key },
    });
    if (!poll.ok) {
      if (poll.status === 429) continue; // transient rate limit; retry next tick
      const err = await poll.text();
      throw new HTTPException(poll.status as 400, {
        message: `Topaz status error: ${err.slice(0, 300)}`,
      });
    }
    status = ((await poll.json()) as TopazStatusResponse).status;
  }

  if (status !== "Completed") {
    throw new HTTPException(500, { message: `Topaz upscale ${status}` });
  }

  // 3. Download.
  const dl = await fetch(`${TOPAZ_BASE}/download/${process_id}`, {
    headers: { "X-API-KEY": key },
  });
  if (!dl.ok) {
    const err = await dl.text();
    throw new HTTPException(dl.status as 400, {
      message: `Topaz download error: ${err.slice(0, 300)}`,
    });
  }
  const { url } = (await dl.json()) as TopazDownloadResponse;
  if (!url) {
    throw new HTTPException(502, { message: "Topaz download: missing URL" });
  }

  // Inline the signed S3 result as a data URL. Topaz's signed URLs are short
  // lived and the frontend persists upscaleUrl alongside the project — a
  // non-expiring payload avoids broken images on reload.
  const imgResp = await fetch(url);
  if (!imgResp.ok) {
    throw new HTTPException(502, { message: "Topaz: failed to fetch signed URL" });
  }
  const ct = imgResp.headers.get("content-type") ?? `image/${outputFormat}`;
  const b64 = arrayBufferToBase64(await imgResp.arrayBuffer());

  return c.json({ imageUrl: `data:${ct};base64,${b64}` });
});

async function resolveImageInput(
  body: UpscaleBody,
): Promise<{ bytes: Uint8Array; mime: string }> {
  if (body.imageBase64 && body.mime) {
    return { bytes: base64ToBytes(body.imageBase64), mime: body.mime };
  }
  if (body.imageUrl) {
    const match = body.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
      return { bytes: base64ToBytes(match[2]), mime: match[1] };
    }
    const r = await fetch(body.imageUrl);
    if (!r.ok) throw new HTTPException(400, { message: "imageUrl fetch failed" });
    const mime = r.headers.get("content-type") ?? "image/png";
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime };
  }
  throw new HTTPException(400, {
    message: "imageBase64+mime or imageUrl required",
  });
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampRange(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
