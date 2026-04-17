// SVG 벡터화 프록시 — Quiver Arrow 1.1 / Recraft AI

const ARROW_API = "https://api.quiver.ai/v1/svgs/vectorizations";
const RECRAFT_API = "https://external.api.recraft.ai/v1/images/vectorize";

type ArrowVectorizeResponse = {
  data?: Array<{ svg?: string; mime_type?: string }>;
  credits?: number;
};

export async function POST(req: Request) {
  const form = await req.formData();
  const image = form.get("image") as File | null;
  const provider = (form.get("provider") as string) || "arrow";

  if (!image) {
    return new Response("image required", { status: 400 });
  }

  if (provider === "recraft") {
    return vectorizeWithRecraft(image);
  }

  const model = provider === "arrow-max" ? "arrow-1.1-max" : "arrow-1.1";
  return vectorizeWithArrow(image, model);
}

async function vectorizeWithArrow(image: File, model: string): Promise<Response> {
  const apiKey = process.env.QUIVERAI_API_KEY;
  if (!apiKey) {
    return new Response("QUIVERAI_API_KEY not configured", { status: 500 });
  }

  const buf = await image.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");

  const resp = await fetch(ARROW_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      image: { base64 },
      stream: false,
      auto_crop: false,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return new Response(`Arrow error: ${err}`, { status: resp.status });
  }

  const data = (await resp.json()) as ArrowVectorizeResponse;
  const svg = data?.data?.[0]?.svg;
  if (!svg) {
    return new Response("Arrow: no SVG in response", { status: 500 });
  }

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

async function vectorizeWithRecraft(image: File): Promise<Response> {
  const token = process.env.RECRAFT_API_TOKEN;
  if (!token) {
    return new Response("RECRAFT_API_TOKEN not configured", { status: 500 });
  }

  const form = new FormData();
  form.append("file", image);
  form.append("response_format", "b64_json");

  const resp = await fetch(RECRAFT_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.text();
    return new Response(`Recraft error: ${err}`, { status: resp.status });
  }

  const data = (await resp.json()) as any;
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    const url = data?.data?.[0]?.url;
    if (url) {
      const svgResp = await fetch(url);
      const svg = await svgResp.text();
      return new Response(svg, {
        headers: { "Content-Type": "image/svg+xml" },
      });
    }
    return new Response("Recraft: no SVG in response", { status: 500 });
  }

  const svg = atob(b64);
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}
