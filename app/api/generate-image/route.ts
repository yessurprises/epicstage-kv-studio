// Dev proxy — CI이미지 + 가이드이미지 inlineData 포함해서 Gemini 이미지 생성

const WORKER_BASE = "https://epic-studio-api.kbm-32f.workers.dev";
const MAX_IMAGES = 6;

export async function POST(req: Request) {
  const { prompt, system, ciImages, guideImageUrls, generationConfig } = await req.json() as {
    prompt: string;
    system?: string;
    ciImages?: Array<{ mime: string; base64: string }>;
    guideImageUrls?: string[]; // data:mime;base64,... 형식
    generationConfig?: Record<string, unknown>;
  };

  if (!prompt) {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const parts: any[] = [];

  // CI 이미지 (로고 등) inlineData
  if (ciImages?.length) {
    for (const img of ciImages.slice(0, 3)) {
      parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
    }
  }

  // 가이드 산출물 이미지 inlineData (data URL → base64)
  if (guideImageUrls?.length) {
    for (const dataUrl of guideImageUrls.slice(0, MAX_IMAGES - (ciImages?.length ?? 0))) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
  }

  // 텍스트 프롬프트 (system + user)
  const fullText = system ? `${system}\n\n---\n\n${prompt}` : prompt;
  parts.push({ text: fullText });

  const resp = await fetch(`${WORKER_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      generationConfig: generationConfig ?? {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return Response.json({ error: err }, { status: resp.status });
  }

  const data = await resp.json() as any;
  const resParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];

  const imagePart = resParts.find((p: any) => p.inlineData);
  if (!imagePart) {
    const textPart = resParts.find((p: any) => p.text)?.text ?? "";
    return Response.json({ error: `이미지 미포함: ${textPart.slice(0, 100)}` }, { status: 500 });
  }

  const { mimeType, data: b64 } = imagePart.inlineData;
  return Response.json({ imageUrl: `data:${mimeType};base64,${b64}` });
}
