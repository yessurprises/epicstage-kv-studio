// 레퍼런스 이미지들을 Gemini로 분석 → 스타일/무드/색상 JSON 반환

const WORKER_BASE = "https://epic-studio-api.pd-302.workers.dev";

const SYSTEM = `너는 비주얼 디자인 분석 전문가야.
첨부된 레퍼런스 이미지들의 공통 디자인 경향성을 JSON으로 추출한다.
분석 항목: color_tendency, typography_tendency, layout_tendency, graphic_tendency, mood_tendency(키워드 3-5개), consistency_notes.
JSON만 출력.`;

export async function POST(req: Request) {
  const { images } = await req.json() as {
    images: Array<{ mime: string; base64: string }>;
  };

  if (!images?.length) {
    return Response.json({ error: "images required" }, { status: 400 });
  }

  // Gemini parts: 이미지들 + 분석 요청 텍스트
  const parts: any[] = images.slice(0, 8).map((img) => ({
    inlineData: { mimeType: img.mime, data: img.base64 },
  }));
  parts.push({ text: `${SYSTEM}\n\n${images.length}장의 레퍼런스 이미지를 분석해줘.` });

  const resp = await fetch(`${WORKER_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return Response.json({ error: err }, { status: resp.status });
  }

  const data = await resp.json() as any;
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => p.text)
    .map((p: any) => p.text as string)
    .join("");

  // JSON 추출
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return Response.json({ analysis: text });
  }
  try {
    const parsed = JSON.parse(text.substring(start, end + 1));
    return Response.json({ analysis: parsed, raw: text });
  } catch {
    return Response.json({ analysis: text });
  }
}
