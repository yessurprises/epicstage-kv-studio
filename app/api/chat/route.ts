// Dev proxy — CI 이미지 inlineData 포함해서 Gemini 직접 호출

const WORKER_BASE = "https://epic-studio-api.pd-302.workers.dev";

export async function POST(req: Request) {
  const { messages, system, ciImages, ciDocs } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    system?: string;
    ciImages?: Array<{ mime: string; base64: string }>;
    ciDocs?: Array<{ mime: string; base64: string }>;
  };

  if (!messages?.length) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  // Gemini contents 구성 — CI 이미지 + 문서를 첫 번째 user parts에 포함
  const contents = messages.map((m, i) => {
    const parts: any[] = [];
    if (i === 0 && m.role === "user") {
      // CI 이미지 삽입
      if (ciImages?.length) {
        for (const img of ciImages.slice(0, 3)) {
          parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
        }
      }
      // CI 가이드 문서 삽입 (PDF 등)
      if (ciDocs?.length) {
        for (const doc of ciDocs.slice(0, 5)) {
          parts.push({ inlineData: { mimeType: doc.mime, data: doc.base64 } });
        }
      }
    }
    // system instruction을 첫 번째 user 메시지에 병합
    const text = i === 0 && m.role === "user" && system
      ? `${system}\n\n---\n\n${m.content}`
      : m.content;
    parts.push({ text });
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const body = {
    model: "gemini-3.1-flash-image-preview",
    contents,
    generationConfig: { temperature: 0.7 },
  };

  const resp = await fetch(`${WORKER_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return Response.json({ error: err }, { status: resp.status });
  }

  const data = await resp.json() as any;
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => p.text)
    .map((p: any) => p.text as string)
    .join("") ?? "";

  return Response.json({ reply: text });
}
