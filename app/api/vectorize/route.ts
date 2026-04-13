// SVG 벡터화 프록시 — Vectorizer.ai / Recraft AI

const VECTORIZER_API = "https://api.vectorizer.ai/api/v1/vectorize";
const RECRAFT_API = "https://external.api.recraft.ai/v1/images/vectorize";

export async function POST(req: Request) {
  const form = await req.formData();
  const image = form.get("image") as File | null;
  const provider = (form.get("provider") as string) || "vectorizer";

  if (!image) {
    return new Response("image required", { status: 400 });
  }

  if (provider === "recraft") {
    return vectorizeWithRecraft(image);
  }
  return vectorizeWithVectorizer(image);
}

async function vectorizeWithVectorizer(image: File): Promise<Response> {
  const apiId = process.env.VECTORIZER_API_ID;
  const apiSecret = process.env.VECTORIZER_API_SECRET;
  if (!apiId || !apiSecret) {
    return new Response("VECTORIZER_API_ID/SECRET not configured", { status: 500 });
  }

  const form = new FormData();
  form.append("image", image);
  form.append("output.file_format", "svg");
  form.append("output.svg.version", "svg_1_1");
  form.append("processing.max_colors", "0"); // auto

  const resp = await fetch(VECTORIZER_API, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${apiId}:${apiSecret}`),
    },
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.text();
    return new Response(`Vectorizer.ai error: ${err}`, { status: resp.status });
  }

  const svg = await resp.text();
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
  // Recraft returns { data: [{ b64_json: "..." }] }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    // URL 형태 응답 fallback
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
