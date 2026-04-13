// Dev proxy — multi-turn으로 텍스트 제거 버전(대지) 생성

const WORKER_BASE = "https://epic-studio-api.pd-302.workers.dev";

export async function POST(req: Request) {
  const { originalPrompt, imageMime, imageBase64, thoughtSignature, removeTextPrompt, system } =
    await req.json() as {
      originalPrompt: string;
      imageMime: string;
      imageBase64: string;
      thoughtSignature?: string;
      removeTextPrompt: string;
      system: string;
    };

  if (!originalPrompt || !imageBase64) {
    return Response.json({ error: "originalPrompt and imageBase64 required" }, { status: 400 });
  }

  // Multi-turn: original prompt → model image → remove text request
  const history: any[] = [
    { role: "user", parts: [{ text: originalPrompt }] },
    {
      role: "model",
      parts: [
        ...(thoughtSignature ? [{ thoughtSignature }] : []),
        { inlineData: { mimeType: imageMime, data: imageBase64 } },
      ],
    },
    { role: "user", parts: [{ text: `${system}\n\n---\n\n${removeTextPrompt}` }] },
  ];

  const resp = await fetch(`${WORKER_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: history,
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1 },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return Response.json({ error: err }, { status: resp.status });
  }

  const data = await resp.json() as any;
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];

  const imagePart = parts.find((p: any) => p.inlineData);
  if (!imagePart) {
    const textPart = parts.find((p: any) => p.text)?.text ?? "";
    return Response.json({ error: `대지 이미지 미생성: ${textPart.slice(0, 100)}` }, { status: 500 });
  }

  const newThought = parts.find((p: any) => p.thoughtSignature)?.thoughtSignature;
  const { mimeType, data: b64 } = imagePart.inlineData;

  return Response.json({
    imageUrl: `data:${mimeType};base64,${b64}`,
    thoughtSignature: newThought,
  });
}
