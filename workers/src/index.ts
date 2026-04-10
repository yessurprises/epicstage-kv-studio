import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

export interface Env {
  EPIC_DB: D1Database;
  EPIC_STORAGE: R2Bucket;
  EPIC_KV: KVNamespace;
  GEMINI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
  EPIC_SEARCH_URL: string;
  EPIC_SEARCH_API_KEY: string;
}

// OpenRouter config — Nano Banana 2 (Gemini 3.1 Flash Image Preview)
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "google/gemini-3.1-flash-image-preview";

const app = new Hono<{ Bindings: Env }>();

// CORS — allow local dev + deployed frontend
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://epic-studio.epicstage.co.kr",
      "https://epic-studio-cpb.pages.dev",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get("/", (c) => c.json({ status: "ok", service: "epic-studio-api" }));

// ─── Gemini Proxy ────────────────────────────────────────────────────────────

// Image generation — Gemini direct only (responseModalities: ['IMAGE'] not supported by OpenRouter)
// 김병모 담당 엔드포인트. 이미지 생성 엔진 로직은 김병모가 관리.
app.post("/api/generate", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "GEMINI_API_KEY not configured" });
  }

  const body = await c.req.json();

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${
    body.model ?? "gemini-2.0-flash-exp-image-generation"
  }:generateContent?key=${apiKey}`;

  const geminiBody: Record<string, unknown> = {
    contents: body.contents,
    generationConfig: body.generationConfig,
  };
  if (body.system) {
    geminiBody.system_instruction = { parts: [{ text: body.system }] };
  }

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(geminiBody),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new HTTPException(response.status as any, { message: `Gemini error: ${err}` });
  }

  return c.json(await response.json());
});

// ─── R2 Image Storage ─────────────────────────────────────────────────────────

app.post("/api/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw new HTTPException(400, { message: "No file provided" });
  }

  const ext = file.name.split(".").pop() ?? "png";
  const key = `images/${crypto.randomUUID()}.${ext}`;

  await c.env.EPIC_STORAGE.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return c.json({ id: key, url: `/api/images/${encodeURIComponent(key)}` });
});

app.get("/api/images/:id{.+}", async (c) => {
  const key = decodeURIComponent(c.req.param("id"));
  const object = await c.env.EPIC_STORAGE.get(key);

  if (!object) {
    throw new HTTPException(404, { message: "Image not found" });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
});

// ─── Projects (D1) ───────────────────────────────────────────────────────────

app.post("/api/projects", async (c) => {
  const { name, event_info } = await c.req.json<{
    name: string;
    event_info?: Record<string, unknown>;
  }>();

  if (!name?.trim()) {
    throw new HTTPException(400, { message: "Project name is required" });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.EPIC_DB.prepare(
    `INSERT INTO projects (id, name, event_info, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, name.trim(), JSON.stringify(event_info ?? {}), now, now)
    .run();

  return c.json({ id, name, event_info, created_at: now, updated_at: now }, 201);
});

app.get("/api/projects", async (c) => {
  const { results } = await c.env.EPIC_DB.prepare(
    `SELECT id, name, event_info, created_at, updated_at
     FROM projects ORDER BY created_at DESC LIMIT 50`
  ).all<{
    id: string;
    name: string;
    event_info: string;
    created_at: string;
    updated_at: string;
  }>();

  const projects = results.map((r) => ({
    ...r,
    event_info: JSON.parse(r.event_info),
  }));

  return c.json({ projects });
});

app.get("/api/projects/:id", async (c) => {
  const id = c.req.param("id");

  const project = await c.env.EPIC_DB.prepare(
    `SELECT id, name, event_info, created_at, updated_at
     FROM projects WHERE id = ?`
  )
    .bind(id)
    .first<{
      id: string;
      name: string;
      event_info: string;
      created_at: string;
      updated_at: string;
    }>();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const generations = await c.env.EPIC_DB.prepare(
    `SELECT id, item_type, prompt, image_r2_key, size_spec, status, created_at
     FROM generations WHERE project_id = ? ORDER BY created_at DESC`
  )
    .bind(id)
    .all<{
      id: string;
      item_type: string;
      prompt: string;
      image_r2_key: string;
      size_spec: string;
      status: string;
      created_at: string;
    }>();

  return c.json({
    ...project,
    event_info: JSON.parse(project.event_info),
    generations: generations.results.map((g) => ({
      ...g,
      size_spec: JSON.parse(g.size_spec),
    })),
  });
});

// ─── Naver Search (direct API — no VPS proxy) ──────────────────────────────

app.post("/api/search/references", async (c) => {
  const { query, limit = 20 } = await c.req.json<{
    query: string;
    limit?: number;
  }>();

  if (!query?.trim()) {
    throw new HTTPException(400, { message: "Query is required" });
  }

  // Direct Naver blog/news search
  const naverResults = await naverSearch(c.env, query, Math.min(limit, 20));
  return c.json({ results: naverResults, total: naverResults.length, query });
});

async function naverSearch(env: Env, query: string, limit: number) {
  const clientId = env.NAVER_CLIENT_ID;
  const clientSecret = env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const headers = {
    "X-Naver-Client-Id": clientId,
    "X-Naver-Client-Secret": clientSecret,
  };

  const results: any[] = [];

  // Search blog + image in parallel
  const [blogResp, imageResp] = await Promise.allSettled([
    fetch(`https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${limit}`, { headers }),
    fetch(`https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=${limit}`, { headers }),
  ]);

  if (blogResp.status === "fulfilled" && blogResp.value.ok) {
    const data: any = await blogResp.value.json();
    for (const item of (data.items ?? [])) {
      results.push({
        title: item.title?.replace(/<[^>]+>/g, "") ?? "",
        url: item.link ?? "",
        thumbnail: item.thumbnail ?? "",
        source: "naver_blog",
      });
    }
  }

  if (imageResp.status === "fulfilled" && imageResp.value.ok) {
    const data: any = await imageResp.value.json();
    for (const item of (data.items ?? [])) {
      results.push({
        title: item.title?.replace(/<[^>]+>/g, "") ?? "",
        url: item.link ?? "",
        thumbnail: item.thumbnail ?? item.link ?? "",
        source: "naver_image",
      });
    }
  }

  return results.slice(0, limit);
}

// ─── AI Style Analysis (Gemini Vision) ──────────────────────────────────────

const STYLE_CATEGORIES = [
  "다크+네온", "화이트+미니멀", "우드+내추럴", "일러스트+플랫",
  "그라데이션+모던", "모노크롬", "레트로+빈티지", "럭셔리+골드",
  "테크+디지털", "캐주얼+팝",
];

app.post("/api/analyze/style", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "GEMINI_API_KEY not configured" });
  }

  const { image_urls, project_id } = await c.req.json<{
    image_urls: string[];
    project_id?: string;
  }>();

  if (!image_urls?.length) {
    throw new HTTPException(400, { message: "image_urls required" });
  }

  const orKey = c.env.OPENROUTER_API_KEY || apiKey;

  const results = await Promise.allSettled(
    image_urls.slice(0, 12).map(async (url) => {
      const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${orKey}`,
          "HTTP-Referer": "https://epic-studio.epicstage.co.kr",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Analyze this event design image at URL: ${url}. Classify its style using 2-3 tags from: [${STYLE_CATEGORIES.join(", ")}]. Return ONLY valid JSON: {"tags":["tag1","tag2"],"description":"one-line Korean description","confidence":0.0-1.0}` },
              { type: "image_url", image_url: { url } },
            ],
          }],
          temperature: 0.2,
          max_tokens: 256,
        }),
      });

      if (!resp.ok) return { image_url: url, style_tags: [], description: "분석 실패", confidence: 0 };

      const data: any = await resp.json();
      const text = data?.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(text.replace(/```json?\n?|\n?```/g, "").trim());
        return {
          image_url: url,
          style_tags: (parsed.tags ?? []).filter((t: string) => STYLE_CATEGORIES.includes(t)),
          description: parsed.description ?? "",
          confidence: parsed.confidence ?? 0.5,
        };
      } catch {
        return { image_url: url, style_tags: [], description: text.slice(0, 100), confidence: 0.3 };
      }
    })
  );

  const analyzed = results.map((r) =>
    r.status === "fulfilled" ? r.value : { image_url: "", style_tags: [], description: "Error", confidence: 0 }
  );

  // Store in D1 if project_id provided
  if (project_id) {
    for (const item of analyzed) {
      if (!item.image_url) continue;
      await c.env.EPIC_DB.prepare(
        `INSERT OR IGNORE INTO reference_images (id, project_id, source_url, style_tags, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(crypto.randomUUID(), project_id, item.image_url, JSON.stringify(item.style_tags)).run();
    }
  }

  return c.json({ results: analyzed });
});

// ─── Smart Reference Search (with query building) ───────────────────────────

const QUERY_TEMPLATES: Record<string, string[]> = {
  "세미나": ["{theme} 세미나 무대 디자인", "{theme} 포럼 포토월"],
  "컨퍼런스": ["{theme} 컨퍼런스 백드롭", "{theme} 대형 행사 무대"],
  "시상식": ["{theme} 시상식 무대 연출", "{theme} 어워드 포토월"],
  "전시": ["{theme} 전시부스 디자인", "{theme} 박람회 부스 연출"],
  "네트워킹": ["{theme} 네트워킹 행사 디자인", "{theme} 밋업 공간 연출"],
  "교육": ["{theme} 교육 행사 배너", "{theme} 수료식 무대"],
  "축제": ["{theme} 페스티벌 디자인", "{theme} 축제 현장 연출"],
};

app.post("/api/search/smart-references", async (c) => {
  const { event_type, theme_keywords = [], count = 12 } = await c.req.json<{
    event_type?: string;
    theme_keywords?: string[];
    count?: number;
  }>();

  const theme = theme_keywords.join(" ") || "모던";
  const templates = QUERY_TEMPLATES[event_type ?? ""] ?? ["{theme} 행사 디자인"];
  const queries = templates.map((t) => t.replace("{theme}", theme));

  const searchBase = c.env.EPIC_SEARCH_URL ?? "http://158.247.193.215:8788";
  const allResults: any[] = [];

  for (const q of queries) {
    try {
      const items = await naverSearch(c.env, q, Math.ceil(count / queries.length));
      allResults.push(...items);
    } catch { /* skip failed queries */ }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    const key = r.url || r.link || r.source_url || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, count);

  return c.json({ images: unique, queries_used: queries });
});

// ─── Upscale Proxy (Real-ESRGAN via external or HuggingFace) ────────────────

app.post("/api/upscale", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  const scale = Number(formData.get("scale") ?? 4);

  if (!file) {
    throw new HTTPException(400, { message: "No file provided" });
  }

  // Store original in R2
  const origKey = `originals/${crypto.randomUUID()}.png`;
  const arrayBuf = await file.arrayBuffer();
  await c.env.EPIC_STORAGE.put(origKey, arrayBuf, {
    httpMetadata: { contentType: "image/png" },
  });

  // For now, return the original with metadata indicating upscale is pending
  // Real-ESRGAN integration requires a GPU endpoint (self-hosted or API)
  const upscaledKey = `upscaled/${crypto.randomUUID()}.png`;
  await c.env.EPIC_STORAGE.put(upscaledKey, arrayBuf, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { scale: String(scale), status: "pending", original: origKey },
  });

  return c.json({
    original_key: origKey,
    upscaled_key: upscaledKey,
    scale,
    status: "pending",
    message: "업스케일 대기 중 — GPU 엔드포인트 연결 시 자동 처리",
    url: `/api/images/${encodeURIComponent(upscaledKey)}`,
  });
});

// ─── Agent Chat (Gemini multimodal conversation proxy) ──────────────────────
// {system, messages, ciImages, ciDocs} 형식 수신 → Gemini contents 형식으로 변환
// local dev: Next.js /api/chat/ 프록시가 동일 변환 수행
// prod (static export): 이 Worker 엔드포인트가 직접 처리

app.post("/api/chat", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "GEMINI_API_KEY not configured" });
  }

  const { messages, system, ciImages, ciDocs } = await c.req.json<{
    messages: Array<{ role: string; content: string }>;
    system?: string;
    ciImages?: Array<{ mime: string; base64: string }>;
    ciDocs?: Array<{ mime: string; base64: string; name?: string }>;
  }>();

  if (!messages?.length) {
    throw new HTTPException(400, { message: "messages required" });
  }

  // Gemini contents 구성 — CI 이미지·문서를 첫 번째 user parts에 포함
  const contents = messages.map((m, i) => {
    const parts: any[] = [];
    if (i === 0 && m.role === "user") {
      if (ciImages?.length) {
        for (const img of ciImages.slice(0, 3)) {
          parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
        }
      }
      if (ciDocs?.length) {
        for (const doc of ciDocs.slice(0, 5)) {
          parts.push({ inlineData: { mimeType: doc.mime, data: doc.base64 } });
        }
      }
    }
    const text = i === 0 && m.role === "user" && system
      ? `${system}\n\n---\n\n${m.content}`
      : m.content;
    parts.push({ text });
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new HTTPException(response.status as any, { message: `Gemini chat error: ${err}` });
  }

  const data: any = await response.json();
  const reply: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => p.text)
    .map((p: any) => p.text as string)
    .join("") ?? "";

  return c.json({ reply });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[epic-studio-api]", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
