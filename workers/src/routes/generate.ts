import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { GEMINI_BASE } from "../env";

interface InlineDataPart {
  inlineData: { mimeType: string; data: string };
}

interface TextPart {
  text: string;
}

type GeminiPart = InlineDataPart | TextPart;

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GenerateBody {
  model?: string;
  contents: GeminiContent[];
  generationConfig?: Record<string, unknown>;
  system?: string;
}

const STYLE_CATEGORIES = [
  "다크+네온",
  "화이트+미니멀",
  "우드+내추럴",
  "일러스트+플랫",
  "그라데이션+모던",
  "모노크롬",
  "레트로+빈티지",
  "럭셔리+골드",
  "테크+디지털",
  "캐주얼+팝",
];

// Chunked base64 encode (Workers runtime has no Buffer; String.fromCharCode
// on large buffers overflows the call stack without chunking).
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const generateRoutes = new Hono<{ Bindings: Env }>();

// Raw Gemini image-generation proxy. The frontend composes `contents` +
// generationConfig and this route forwards straight to Gemini (via the
// Seoul-pinned Supabase proxy configured in GEMINI_BASE).
generateRoutes.post("/api/generate", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "GEMINI_API_KEY not configured" });
  }

  const body = await c.req.json<GenerateBody>();

  const model = body.model ?? "gemini-2.0-flash-exp-image-generation";
  const geminiUrl = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

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
    throw new HTTPException(response.status as 400, {
      message: `Gemini error: ${err}`,
    });
  }

  return c.json(await response.json());
});

// Multimodal chat/design-assistant. Accepts {messages, system, ciImages,
// ciDocs} and folds CI assets + system prompt into the first user turn.
generateRoutes.post("/api/chat", async (c) => {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "GEMINI_API_KEY not configured" });
  }

  const {
    messages,
    system,
    ciImages,
    ciDocs,
  } = await c.req.json<{
    messages: Array<{ role: string; content: string }>;
    system?: string;
    ciImages?: Array<{ mime: string; base64: string }>;
    ciDocs?: Array<{ mime: string; base64: string; name?: string }>;
  }>();

  if (!messages?.length) {
    throw new HTTPException(400, { message: "messages required" });
  }

  const contents: GeminiContent[] = messages.map((m, i) => {
    const parts: GeminiPart[] = [];
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
    const text =
      i === 0 && m.role === "user" && system ? `${system}\n\n---\n\n${m.content}` : m.content;
    parts.push({ text });
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const geminiUrl = `${GEMINI_BASE}/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`;

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
    throw new HTTPException(response.status as 400, {
      message: `Gemini chat error: ${err}`,
    });
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const reply =
    (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("") || "";

  return c.json({ reply });
});

// Style classification across 10 fixed categories via Gemini vision.
// Each image URL is fetched and inlined as base64 so Google sees the
// bytes directly (avoids the "GCS-only fileData" restriction for
// remote URIs). Results optionally persisted to D1.
generateRoutes.post("/api/analyze/style", async (c) => {
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

  const results = await Promise.allSettled(
    image_urls.slice(0, 12).map(async (url) => {
      const imgResp = await fetch(url);
      if (!imgResp.ok) {
        return { image_url: url, style_tags: [], description: "이미지 fetch 실패", confidence: 0 };
      }
      const mimeType = imgResp.headers.get("content-type") ?? "image/png";
      const data = arrayBufferToBase64(await imgResp.arrayBuffer());

      const geminiResp = await fetch(
        `${GEMINI_BASE}/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Classify this event design image's style using 2-3 tags from: [${STYLE_CATEGORIES.join(", ")}]. Return ONLY valid JSON: {"tags":["tag1","tag2"],"description":"one-line Korean description","confidence":0.0-1.0}`,
                  },
                  { inlineData: { mimeType, data } },
                ],
              },
            ],
            generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
          }),
        },
      );

      if (!geminiResp.ok) {
        return { image_url: url, style_tags: [], description: "분석 실패", confidence: 0 };
      }

      const payload = (await geminiResp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text =
        (payload?.candidates?.[0]?.content?.parts ?? [])
          .map((p) => p.text ?? "")
          .join("") || "{}";

      try {
        const parsed = JSON.parse(text.replace(/```json?\n?|\n?```/g, "").trim()) as {
          tags?: string[];
          description?: string;
          confidence?: number;
        };
        return {
          image_url: url,
          style_tags: (parsed.tags ?? []).filter((t) => STYLE_CATEGORIES.includes(t)),
          description: parsed.description ?? "",
          confidence: parsed.confidence ?? 0.5,
        };
      } catch {
        return { image_url: url, style_tags: [], description: text.slice(0, 100), confidence: 0.3 };
      }
    }),
  );

  const analyzed = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { image_url: "", style_tags: [], description: "Error", confidence: 0 },
  );

  if (project_id) {
    for (const item of analyzed) {
      if (!item.image_url) continue;
      await c.env.EPIC_DB.prepare(
        `INSERT OR IGNORE INTO reference_images (id, project_id, source_url, style_tags, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
        .bind(
          crypto.randomUUID(),
          project_id,
          item.image_url,
          JSON.stringify(item.style_tags),
        )
        .run();
    }
  }

  return c.json({ results: analyzed });
});
