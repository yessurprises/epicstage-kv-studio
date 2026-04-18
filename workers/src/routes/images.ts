import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";

export const imageRoutes = new Hono<{ Bindings: Env }>();

// Chunked base64 encode — avoids call-stack overflow for large image buffers
// on the Workers runtime (no Node Buffer available).
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Recraft V4 KV generation. V4 doesn't accept `style` / `style_id` — colors
// + prompt are the only style levers.
imageRoutes.post("/api/recraft/generate-kv", async (c) => {
  const token = c.env.RECRAFT_API_TOKEN;
  if (!token) throw new HTTPException(500, { message: "RECRAFT_API_TOKEN not configured" });

  const { prompt, size, colors, vector } = await c.req.json<{
    prompt: string;
    size?: string;
    colors?: Array<{ rgb: [number, number, number] }>;
    vector?: boolean;
  }>();

  if (!prompt) throw new HTTPException(400, { message: "prompt required" });

  const body: Record<string, unknown> = {
    prompt,
    model: vector ? "recraftv4_vector" : "recraftv4",
    size: size || (vector ? "16:9" : "1344x768"),
    response_format: "b64_json",
    n: 1,
  };
  if (colors?.length) body.controls = { colors };

  const resp = await fetch("https://external.api.recraft.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return c.text(`Recraft error: ${err}`, resp.status as 400);
  }

  const data = (await resp.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = data?.data?.[0];
  if (!item) throw new HTTPException(500, { message: "Recraft: empty response" });

  return c.json({
    b64: item.b64_json,
    url: item.url,
    content_type: vector ? "image/svg+xml" : "image/png",
  });
});

// Vectorize a raster image → SVG. Providers: Quiver Arrow 1.1 (default),
// Arrow 1.1 Max (higher quality), or Recraft AI. All return `image/svg+xml`.
imageRoutes.post("/api/vectorize", async (c) => {
  const formData = await c.req.formData();
  const image = formData.get("image") as File | null;
  const provider = (formData.get("provider") as string) || "arrow";

  if (!image) {
    throw new HTTPException(400, { message: "image required" });
  }

  if (provider === "recraft") {
    const token = c.env.RECRAFT_API_TOKEN;
    if (!token) throw new HTTPException(500, { message: "RECRAFT_API_TOKEN not configured" });

    const form = new FormData();
    form.append("file", image);
    form.append("response_format", "b64_json");

    const resp = await fetch("https://external.api.recraft.ai/v1/images/vectorize", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!resp.ok) {
      const err = await resp.text();
      return c.text(`Recraft error: ${err}`, resp.status as 400);
    }
    const data = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const b64 = data?.data?.[0]?.b64_json;
    if (b64) {
      return c.text(atob(b64), 200, { "Content-Type": "image/svg+xml" });
    }
    const url = data?.data?.[0]?.url;
    if (url) {
      const svgResp = await fetch(url);
      return c.text(await svgResp.text(), 200, { "Content-Type": "image/svg+xml" });
    }
    return c.text("Recraft: no SVG in response", 500);
  }

  const apiKey = c.env.QUIVERAI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "QUIVERAI_API_KEY not configured" });
  }

  const model = provider === "arrow-max" ? "arrow-1.1-max" : "arrow-1.1";
  const buf = await image.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);

  // Stream Arrow's SSE response. Sync mode (stream:false) frequently exceeds
  // the 100s gateway timeout for full vectorizations and returns 524.
  // Streaming keeps the upstream connection alive via incremental events;
  // we accumulate the SVG from `draft` events and finalize on `content`.
  const resp = await fetch("https://api.quiver.ai/v1/svgs/vectorizations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      image: { base64 },
      stream: true,
      auto_crop: false,
    }),
  });
  if (!resp.ok || !resp.body) {
    const err = await resp.text().catch(() => "no body");
    return c.text(`Arrow error: ${err}`, resp.status as 400);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalSvg = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines. Process complete events;
    // keep the trailing partial event in the buffer.
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? "";

    for (const evt of events) {
      const dataLines: string[] = [];
      for (const line of evt.split("\n")) {
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      const payload = dataLines.join("\n");
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as { svg?: string; type?: string };
        if (obj.svg) finalSvg = obj.svg; // last svg wins (content > draft)
      } catch {
        /* ignore non-JSON (heartbeats, comments) */
      }
    }
  }

  if (!finalSvg) {
    return c.text("Arrow: no SVG in stream", 500);
  }
  return c.text(finalSvg, 200, { "Content-Type": "image/svg+xml" });
});
