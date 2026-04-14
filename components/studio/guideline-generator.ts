import type { Guideline, Version, ProductionPlanItem } from "./use-store";
import { API_BASE, isLocal, CHAT_URL, IMAGE_URL, RECRAFT_KV_URL } from "./config";

// ─── 시스템 인스트럭션 ────────────────────────────────────────────────────

const GUIDELINE_SYSTEM = `너는 행사 브랜딩 전문 디자이너야.
사용자가 제공하는 행사 정보, CI 자료, 레퍼런스 분석, 스타일 지시를 바탕으로 디자인 가이드라인을 생성한다.
반드시 아래 JSON 스키마에 맞춰 출력하고, JSON 외 다른 텍스트는 절대 포함하지 마라.

출력 스키마:
{
  "event_summary": { "name": "", "name_en": "", "date": "", "venue": "", "organizer": "", "theme": "", "slogan": "" },
  "color_palette": {
    "primary": { "hex": "", "usage": "" }, "secondary": { "hex": "", "usage": "" },
    "accent": { "hex": "", "usage": "" }, "background": { "hex": "", "usage": "" },
    "text_dark": { "hex": "", "usage": "" }, "text_light": { "hex": "", "usage": "" }
  },
  "typography": {
    "headline": { "font": "", "size_range": "", "note": "" },
    "subheading": { "font": "", "size_range": "", "note": "" },
    "body": { "font": "", "size_range": "", "note": "" },
    "caption": { "font": "", "size_range": "", "note": "" }
  },
  "graphic_motifs": { "style": "", "elements": [], "texture": "", "icon_style": "" },
  "layout_guide": { "kv": "", "banner_horizontal": "", "sns_square": "", "sns_story": "", "stage_backdrop": "", "entrance_banner": "", "photowall": "" },
  "logo_usage": { "primary_placement": "", "min_size": "", "clear_space": "", "on_dark": "", "on_light": "" },
  "mood": { "keywords": [], "tone": "" },
  "guide_items_to_visualize": [
    { "id": "color_palette_sheet", "label": "컬러 팔레트 시트", "description": "6색 팔레트 + 사용처 표기" },
    { "id": "motif_board", "label": "그래픽 모티프 보드", "description": "패턴, 텍스처, 아이콘 스타일" },
    { "id": "layout_sketches", "label": "레이아웃 가이드 스케치", "description": "KV, 배너, SNS 레이아웃 구성" },
    { "id": "mood_board", "label": "무드 보드", "description": "전체 분위기 시각화" }
  ]
}`;

const GUIDE_IMAGE_SYSTEM =
  "You are a brand design system specialist. You create professional visual references and design guide sheets for event branding systems. Always generate an IMAGE output.";

const PRODUCTION_SYSTEM =
  "You are a professional event graphic designer. Generate production-ready artwork based on the provided design system and specifications. Output only the image.";

const PRINT_SPEC_INSTRUCTION =
  "Production-ready print artwork for direct delivery to print vendor. Flat graphic design layout only. No 3D rendering, no environmental context, no mockup perspective, no scene background, no props. Output must be the actual artwork as it would appear on the final printed/produced item.";

const PLAN_SYSTEM = `너는 행사 그래픽 디자인 전문가야.
사용자가 제공하는 행사 개요, 디자인 가이드라인, 제작 목록을 바탕으로 각 제작물의 상세 생성 계획을 만든다.
반드시 아래 JSON 스키마로만 출력하고, 다른 텍스트는 절대 포함하지 마라.

출력 스키마:
{
  "outputs": [
    {
      "num": 1,
      "name": "제작물 이름",
      "ratio": "비율",
      "headline": "메인 카피 (실제 행사 내용, 플레이스홀더 금지)",
      "subtext": "서브 카피 (null 가능)",
      "layout_note": "레이아웃 설명 (한국어)",
      "image_prompt": "Gemini 이미지 생성 프롬프트 (영어, 상세하게. 디자인 시스템의 컬러·모티프·무드를 반영)"
    }
  ]
}`;

const NO_TEXT_SYSTEM =
  "You are an image editor specializing in text removal. You preserve all visual elements — background, graphics, layout, colors, textures — while removing only text and typographic elements.";

// ─── 아이템별 선택적 guideline 필드 추출 ─────────────────────────────────

function extractGuideFieldsForItem(
  guideline: Guideline,
  itemId: string
): Partial<Guideline> {
  const g = guideline;
  switch (itemId) {
    case "color_palette_sheet":
      return { color_palette: g.color_palette, mood: g.mood };
    case "typography_sheet":
      return {
        typography: g.typography,
        color_palette: {
          primary: g.color_palette?.primary,
          background: g.color_palette?.background,
          text_dark: g.color_palette?.text_dark,
        } as any,
      };
    case "motif_board":
      return { graphic_motifs: g.graphic_motifs, color_palette: g.color_palette, mood: g.mood };
    case "layout_sketches":
      return {
        layout_guide: g.layout_guide,
        event_summary: { name: g.event_summary?.name, name_en: g.event_summary?.name_en } as any,
      };
    case "logo_usage_sheet":
      return {
        logo_usage: g.logo_usage,
        color_palette: {
          primary: g.color_palette?.primary,
          background: g.color_palette?.background,
        } as any,
      };
    case "mood_board":
      return {
        mood: g.mood,
        color_palette: g.color_palette,
        graphic_motifs: g.graphic_motifs,
        event_summary: { name: g.event_summary?.name, theme: g.event_summary?.theme } as any,
      };
    default:
      return {
        color_palette: g.color_palette,
        typography: g.typography,
        graphic_motifs: g.graphic_motifs,
        mood: g.mood,
      };
  }
}

// ─── 제작물용 디자인 시스템 추출 ────────────────────────────────────────────

function findBestLayoutMatch(prodName: string, layoutGuide: Record<string, string>): string | null {
  if (!layoutGuide) return null;
  const name = prodName.toLowerCase();
  const mapping: Record<string, string> = {
    kv: "kv", 키비주얼: "kv",
    현수막: "banner_horizontal", 배너: "banner_horizontal",
    인스타: "sns_square", sns: "sns_square", 피드: "sns_square",
    스토리: "sns_story",
    무대: "stage_backdrop", 배경: "stage_backdrop",
    입구: "entrance_banner", "x배너": "entrance_banner",
    포토월: "photowall",
  };
  for (const [kw, key] of Object.entries(mapping)) {
    if (name.includes(kw) && layoutGuide[key]) return key;
  }
  return null;
}

function extractDesignSystemForProduction(guideline: Guideline, prodName: string): string {
  const g = guideline;
  const c = g.color_palette || {};
  const t = g.typography || {};
  const m = g.graphic_motifs || {};
  const mood = g.mood || {};
  const event = g.event_summary || {};

  const layoutKey = findBestLayoutMatch(prodName, g.layout_guide || {});
  const layoutGuide = layoutKey ? g.layout_guide[layoutKey] : null;

  const colorLine = Object.entries(c)
    .filter(([, v]) => v?.hex)
    .map(([k, v]) => `${k}: ${v.hex}`)
    .join(", ");

  return `EVENT: "${event.name}"${event.name_en ? ` / "${event.name_en}"` : ""}${event.date ? `, ${event.date}` : ""}${event.venue ? `, ${event.venue}` : ""}${event.organizer ? `, ${event.organizer}` : ""}${event.slogan ? ` — "${event.slogan}"` : ""}

DESIGN SYSTEM:
Colors — ${colorLine}
Typography — Headline: ${t.headline?.font} ${t.headline?.size_range}, Sub: ${t.subheading?.font}, Body: ${t.body?.font}
Style: ${m.style}${m.elements?.length ? `. Elements: ${m.elements.join(", ")}` : ""}${m.texture ? `. Texture: ${m.texture}` : ""}${m.icon_style ? `. Icons: ${m.icon_style}` : ""}
Mood: ${mood.tone}${mood.keywords?.length ? ` (${mood.keywords.join(", ")})` : ""}
${layoutGuide ? `Layout: ${layoutGuide}` : ""}
${g.logo_usage ? `Logo: placement ${g.logo_usage.primary_placement || "auto"}, clear-space ${g.logo_usage.clear_space || "auto"}` : ""}`;
}

// ─── 레퍼런스 분석 ───────────────────────────────────────────────────────────

const ANALYZE_REFS_SYSTEM = `너는 비주얼 디자인 분석 전문가야.
첨부된 레퍼런스 이미지들의 공통 디자인 경향성을 JSON으로 추출한다.
분석 항목: color_tendency, typography_tendency, layout_tendency, graphic_tendency, mood_tendency(키워드 3-5개), consistency_notes.
JSON만 출력.`;

export async function analyzeRefs(
  images: Array<{ mime: string; base64: string }>
): Promise<string> {
  if (isLocal()) {
    const resp = await fetch("/api/analyze-refs/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });
    if (!resp.ok) throw new Error(`분석 실패: ${resp.status}`);
    const data = await resp.json();
    return typeof data.analysis === "object"
      ? JSON.stringify(data.analysis, null, 2)
      : data.analysis;
  }

  // prod: Worker의 generate 엔드포인트 직접 호출
  const parts: any[] = images.slice(0, 8).map((img) => ({
    inlineData: { mimeType: img.mime, data: img.base64 },
  }));
  parts.push({ text: `${ANALYZE_REFS_SYSTEM}\n\n${images.length}장의 레퍼런스 이미지를 분석해줘.` });

  const resp = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!resp.ok) throw new Error(`분석 실패: ${resp.status}`);
  const data = await resp.json() as any;
  const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => p.text)
    .map((p: any) => p.text as string)
    .join("");

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try { return JSON.stringify(JSON.parse(text.substring(start, end + 1)), null, 2); } catch {}
  }
  return text;
}

// ─── 스타일 지시 정제 ─────────────────────────────────────────────────────────

/**
 * 사용자의 자유 텍스트 스타일 지시를 순수 비주얼 디스크립션으로 변환.
 * 고유명사(브로드웨이, 애플, 디즈니 등)를 시각적 속성으로 치환하여
 * 이후 단계에서 리터럴 텍스트로 렌더링되는 것을 방지.
 */
export async function refineStyleOverride(raw: string): Promise<string> {
  if (!raw.trim()) return raw;

  const resp = await fetch(CHAT_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: `너는 디자인 스타일 번역기다.
사용자가 제공하는 스타일 지시를 순수 시각적 묘사로 변환하라.
규칙:
- 고유명사(브랜드명, 지역명, 작품명 등)를 제거하고 해당 고유명사가 연상시키는 시각적 특성(색감, 조명, 질감, 구도, 타이포 스타일 등)으로 바꿀 것
- 한국어로 출력
- 변환 결과만 출력하고 다른 설명은 붙이지 말 것
- 원문의 의도와 느낌을 최대한 살릴 것

예시:
입력: "브로드웨이 뮤지컬 느낌"
출력: "화려한 무대 조명, 붉은 벨벳 질감, 금색 장식 악센트, 극적인 스포트라이트 연출, 클래식 세리프 타이포"

입력: "애플 발표회 스타일"
출력: "미니멀 다크 배경, 중앙 집중 조명, 넓은 여백, 산세리프 타이포, 차분한 그라데이션"

입력: "지브리 애니메이션 같은"
출력: "수채화 텍스처, 부드러운 파스텔톤, 자연광 느낌, 따뜻한 색감, 동화적 구도"`,
      messages: [{ role: "user", content: raw }],
    }),
  });

  if (!resp.ok) return raw; // 실패 시 원본 유지
  const data = await resp.json();
  return (data.reply ?? raw).trim();
}

// ─── API 호출 ───────────────────────────────────────────────────────────────

/**
 * 가이드라인 생성 — CI 이미지를 inlineData로 포함
 */
export async function generateGuideline(
  eventInfo: string,
  styleOverride: string,
  existingTones: string[] = [],
  refAnalysis?: string,
  ciImages?: Array<{ mime: string; base64: string }>,
  ciDocs?: Array<{ mime: string; base64: string; name: string }>
): Promise<Guideline> {
  const diversityHint =
    existingTones.length > 0
      ? `\n\n## 중요: 기존 버전들과 다른 방향\n기존 무드/톤: ${existingTones.join(", ")}\n→ 완전히 다른 컬러 팔레트, 무드, 스타일로 생성할 것.`
      : "";

  // 스타일 지시 정제 — 고유명사 → 비주얼 묘사
  const refinedStyle = styleOverride ? await refineStyleOverride(styleOverride) : "";

  const hasCi = ciImages && ciImages.length > 0;
  const hasDocs = ciDocs && ciDocs.length > 0;
  const dataSections = [`## 행사 정보\n${eventInfo}`];
  if (refAnalysis) {
    const refNote = hasCi
      ? "CI 브랜드 아이덴티티를 우선하되, 아래 경향성을 분위기·레이아웃·스타일에 반영."
      : "CI 없음. 아래 경향성을 가이드라인의 주요 소스로 활용.";
    dataSections.push(`## 레퍼런스 경향성 분석\n${refNote}\n${refAnalysis}`);
  }
  if (refinedStyle) dataSections.push(`## 추가 스타일 지시\n${refinedStyle}`);
  if (hasCi) dataSections.push(`## CI 이미지\n${ciImages!.length}장 첨부됨. 로고·컬러·스타일 분석하여 반영.`);
  if (hasDocs) dataSections.push(`## CI 가이드 문서\n${ciDocs!.length}개 첨부됨. 문서의 브랜드 규정(컬러, 타이포, 레이아웃, 로고 사용법 등)을 분석하여 가이드라인에 반영.`);
  if (diversityHint) dataSections.push(diversityHint);

  const resp = await fetch(CHAT_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: GUIDELINE_SYSTEM,
      messages: [{ role: "user", content: dataSections.join("\n\n") }],
      ciImages: ciImages ?? [],
      ciDocs: ciDocs ?? [],
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`Generate failed: ${resp.status} ${errBody.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data.reply ?? "";
  return parseJSON(text);
}

/**
 * 가이드 이미지 생성 — CI 이미지 포함, 항상 이미지 출력
 */
export async function generateGuideImage(
  guideline: Guideline,
  item: { id: string; label: string; description: string },
  refAnalysis?: string,
  ciImages?: Array<{ mime: string; base64: string }>
): Promise<string> {
  const relevantFields = extractGuideFieldsForItem(guideline, item.id);

  const userContent = `Create a visual reference for: "${item.label}"
Description: ${item.description}

RELEVANT DESIGN DATA:
${JSON.stringify(relevantFields, null, 2)}
${refAnalysis ? `\nREFERENCE STYLE ANALYSIS (apply this direction):\n${refAnalysis}` : ""}

INSTRUCTION:
- Generate a clean, professional IMAGE for this design guideline item.
- Clean white background, professional design guide style.
- Aspect ratio: 4:3 horizontal
- Always output as an IMAGE.`;

  const url = IMAGE_URL();

  let resp: Response;
  if (isLocal()) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system: GUIDE_IMAGE_SYSTEM,
        ciImages: ciImages ?? [],
      }),
    });
  } else {
    const parts: any[] = [];
    (ciImages ?? []).slice(0, 3).forEach((img) => {
      parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
    });
    parts.push({ text: `${GUIDE_IMAGE_SYSTEM}\n\n---\n\n${userContent}` });
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1, imageConfig: { imageSize: "2K" } },
      }),
    });
  }

  if (!resp.ok) throw new Error(`Image gen failed: ${resp.status}`);
  const data = await resp.json() as any;

  if (isLocal()) {
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const resParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = resParts.find((p: any) => p.inlineData);
  if (!imagePart) throw new Error("이미지 미포함 응답");
  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

/**
 * 제작 계획 생성 — headline, subtext, image_prompt per item
 */
export async function generateProductionPlan(
  guideline: Guideline,
  items: Array<{ num: number; name: string; ratio: string }>,
  ciImages?: Array<{ mime: string; base64: string }>
): Promise<ProductionPlanItem[]> {
  const planData = {
    event: guideline.event_summary,
    design_system: {
      color_palette: guideline.color_palette,
      typography: guideline.typography,
      graphic_motifs: guideline.graphic_motifs,
      mood: guideline.mood,
      layout_guide: guideline.layout_guide,
    },
    production_list: items,
  };

  const resp = await fetch(CHAT_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: PLAN_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(planData, null, 2) }],
      ciImages: ciImages ?? [],
    }),
  });

  if (!resp.ok) throw new Error(`Plan failed: ${resp.status}`);
  const data = await resp.json();
  const text = data.reply ?? "";
  const plan = parseJSON(text);
  return (plan as any).outputs ?? [];
}

/**
 * 마스터 KV 생성
 */
export async function generateMasterKV(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  ciImages?: Array<{ mime: string; base64: string }>,
  refAnalysis?: string
): Promise<string> {
  const designSystem = extractDesignSystemForProduction(guideline, "kv");

  const userContent = `Professional event key visual (master KV). Production-ready.
Aspect ratio: ${ratio}.
Type: ${kvName}

${designSystem}

=== TEXTS TO RENDER ===
- HEADLINE: "${guideline.event_summary?.name}"
${guideline.event_summary?.date ? `- DATE: "${guideline.event_summary.date}"` : ""}
${guideline.event_summary?.slogan ? `- SLOGAN: "${guideline.event_summary.slogan}"` : ""}

=== VISUAL STYLE ===
This is the MASTER Key Visual. Make it bold, memorable, and visually striking.
All graphic motifs, colors, and mood from the design system must be fully expressed.
${refAnalysis ? `Reference direction: ${refAnalysis}` : ""}

RENDERING:
${PRINT_SPEC_INSTRUCTION}

REQUIREMENTS:
- This is the hero image — highest visual impact
- Render ONLY the text listed above
- Professional print/digital quality`;

  const url = IMAGE_URL();

  let resp: Response;
  if (isLocal()) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system: PRODUCTION_SYSTEM,
        ciImages: ciImages ?? [],
        guideImageUrls: [],
      }),
    });
  } else {
    const parts: any[] = [];
    (ciImages ?? []).slice(0, 3).forEach((img) => {
      parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
    });
    parts.push({ text: `${PRODUCTION_SYSTEM}\n\n---\n\n${userContent}` });
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1, imageConfig: { imageSize: "2K" } },
      }),
    });
  }

  if (!resp.ok) throw new Error(`KV 생성 실패: ${resp.status}`);
  const data = await resp.json() as any;

  if (isLocal()) {
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const resParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = resParts.find((p: any) => p.inlineData);
  if (!imagePart) throw new Error("KV 이미지 미포함 응답");
  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

// ─── Recraft KV 생성 (대지 전용 — 텍스트 없이 비주얼만) ─────────────────

// V4 Vector는 비율 문자열, 래스터는 V4 지원 픽셀 사이즈
const RATIO_TO_RECRAFT_SIZE: Record<string, string> = {
  "16:9": "1344x768",
  "3:4": "896x1216",
  "1:1": "1024x1024",
};

export async function generateRecraftKV(
  guideline: Guideline,
  ratio: string,
  kvName: string,
  vector: boolean,
  _styleId?: string,
  _refImages?: Array<{ mime: string; base64: string }>,
  refAnalysis?: string
): Promise<{ imageUrl: string; isSvg: boolean }> {
  // 가이드라인에서 컬러 추출
  const colors: Array<{ rgb: [number, number, number] }> = [];
  const palette = guideline.color_palette;
  if (palette) {
    for (const key of ["primary", "secondary", "accent"] as const) {
      const hex = (palette as any)[key]?.hex;
      if (hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if (!isNaN(r)) colors.push({ rgb: [r, g, b] });
      }
    }
  }

  // 프롬프트 구성 — 대지 전용 (텍스트 렌더링 없음, 한글 없음)
  const motifs = guideline.graphic_motifs;
  const mood = guideline.mood;
  const prompt = [
    `Professional event key visual background artwork. No text, no letters, no typography.`,
    kvName ? `Type: ${kvName}.` : "",
    motifs?.style ? `Style: ${motifs.style}.` : "",
    motifs?.elements?.length ? `Elements: ${motifs.elements.join(", ")}.` : "",
    motifs?.texture ? `Texture: ${motifs.texture}.` : "",
    mood?.keywords?.length ? `Mood: ${mood.keywords.join(", ")}.` : "",
    mood?.tone ? `Tone: ${mood.tone}.` : "",
    refAnalysis ? `Reference direction: ${refAnalysis}` : "",
    "Bold, memorable, visually striking. Clean artboard without any text overlay. Production-ready print quality.",
  ].filter(Boolean).join(" ");

  // V4 Vector는 비율 문자열 사용
  const size = vector
    ? ratio
    : (RATIO_TO_RECRAFT_SIZE[ratio] || "1344x768");

  const body: Record<string, unknown> = {
    prompt,
    vector,
    size,
  };
  // style_id는 V4에서 미지원이므로 전달하지 않음
  if (colors.length) body.colors = colors;

  const resp = await fetch(RECRAFT_KV_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Recraft KV 생성 실패: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = await resp.json() as any;
  const isSvg = data.content_type === "image/svg+xml";
  const mime = isSvg ? "image/svg+xml" : "image/png";
  const imageUrl = data.b64
    ? `data:${mime};base64,${data.b64}`
    : data.url || "";

  return { imageUrl, isSvg };
}

/**
 * 제작물 이미지 생성 — 마스터 KV 기반
 */
export async function generateProductionImage(
  guideline: Guideline,
  prod: {
    name: string;
    ratio: string;
    category: string;
    headline?: string;
    subtext?: string | null;
    layoutNote?: string;
    imagePrompt?: string;
    renderInstruction?: string;
  },
  ciImages?: Array<{ mime: string; base64: string }>,
  masterKvUrl?: string,
  refAnalysis?: string
): Promise<string> {
  const designSystem = extractDesignSystemForProduction(guideline, prod.name);

  // 렌더링할 텍스트 목록
  const textLines: string[] = [];
  if (prod.headline) textLines.push(`- HEADLINE: "${prod.headline}"`);
  if (prod.subtext) textLines.push(`- SUBTEXT: "${prod.subtext}"`);

  const kvRef = masterKvUrl
    ? `\nMASTER KV REFERENCE (attached image): Extract ALL visual elements — color palette, graphic motifs, background style, typography mood, compositional language — and apply them faithfully to this ${prod.ratio} format. Recompose the layout for the new dimensions. Do NOT invent new design elements beyond what is in the KV.`
    : "";

  const userContent = `Professional event graphic design. Production-ready.
Aspect ratio: ${prod.ratio}.
Type: ${prod.name}
${kvRef}

${designSystem}

=== TEXTS TO RENDER ===
Render ONLY these exact strings as visible text in the image.
Do NOT add, modify, or render any other text beyond this list.
${textLines.length > 0 ? textLines.join("\n") : "(no text — visual only)"}

=== VISUAL STYLE (DO NOT RENDER AS TEXT) ===
The following describes visual mood, composition, and style only.
These words must NEVER appear as readable text in the image.
${prod.imagePrompt || ""}
${prod.layoutNote ? `Layout: ${prod.layoutNote}` : ""}
${refAnalysis ? `Reference direction: ${refAnalysis}` : ""}

RENDERING:
${PRINT_SPEC_INSTRUCTION}${prod.renderInstruction ? "\n" + prod.renderInstruction : ""}

REQUIREMENTS:
- Render ONLY the text listed in TEXTS TO RENDER — nothing else as text
- Text must be legible with proper hierarchy
- Professional print/digital quality
- No placeholder text
- Match the design system and master KV precisely`;

  const url = IMAGE_URL();

  let resp: Response;
  if (isLocal()) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userContent,
        system: PRODUCTION_SYSTEM,
        ciImages: ciImages ?? [],
        guideImageUrls: masterKvUrl ? [masterKvUrl] : [],
      }),
    });
  } else {
    const parts: any[] = [];
    (ciImages ?? []).slice(0, 2).forEach((img) => {
      parts.push({ inlineData: { mimeType: img.mime, data: img.base64 } });
    });
    // 마스터 KV를 첫 번째 비주얼 레퍼런스로
    if (masterKvUrl) {
      const match = masterKvUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    parts.push({ text: `${PRODUCTION_SYSTEM}\n\n---\n\n${userContent}` });
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1 },
      }),
    });
  }

  if (!resp.ok) throw new Error(`이미지 생성 실패: ${resp.status}`);
  const data = await resp.json() as any;

  if (isLocal()) {
    if (data.error) throw new Error(data.error);
    return data.imageUrl ?? "";
  }

  const resParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = resParts.find((p: any) => p.inlineData);
  if (!imagePart) throw new Error("이미지 미포함 응답");
  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

/**
 * 대지(No-text) 버전 생성 — 단일 턴으로 텍스트 제거
 */
export async function generateNoTextVersion(
  originalImageUrl: string
): Promise<string> {
  const url = IMAGE_URL();
  const removeTextPrompt = `Remove ALL text, numbers, and typographic elements from this image.
Preserve 100% of: backgrounds, colors, graphic shapes, textures, patterns, decorative elements.
Output only the text-free artboard/canvas version.`;

  const match = originalImageUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const [, imgMime, imgData] = match;

  if (isLocal()) {
    const resp = await fetch("/api/generate-notext/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalPrompt: removeTextPrompt,
        imageMime: imgMime,
        imageBase64: imgData,
        removeTextPrompt,
        system: NO_TEXT_SYSTEM,
      }),
    });
    if (!resp.ok) throw new Error(`No-text failed: ${resp.status}`);
    const data = await resp.json() as any;
    if (data.error) throw new Error(data.error);
    return data.imageUrl;
  }

  // 단일 턴: 원본 이미지 + 텍스트 제거 지시 (Pro 모델로 최대 품질)
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-3.1-flash-image-preview",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: imgMime, data: imgData } },
          { text: removeTextPrompt },
        ],
      }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1, imageConfig: { imageSize: "2K" } },
    }),
  });

  if (!resp.ok) throw new Error(`대지 생성 실패: ${resp.status}`);
  const data = await resp.json() as any;
  const resParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = resParts.find((p: any) => p.inlineData);
  if (!imagePart) throw new Error("대지 이미지 미생성");
  const { mimeType, data: b64 } = imagePart.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function repairJSON(json: string): any {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }

  let repaired = json.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return JSON.parse(repaired);
}

function parseJSON(text: string): Guideline {
  let cleaned = text.replace(/```json?\n?/g, "").replace(/\n?```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("JSON 구조를 찾을 수 없습니다");

  const end = cleaned.lastIndexOf("}");
  const candidate = end !== -1
    ? cleaned.substring(start, end + 1).replace(/,\s*([}\]])/g, "$1")
    : cleaned.substring(start);

  try {
    return JSON.parse(candidate);
  } catch {
    return repairJSON(cleaned.substring(start).replace(/,\s*([}\]])/g, "$1"));
  }
}

export function createVersion(num: number, guideline: Guideline): Version {
  return {
    id: "ver_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    num,
    label: `Ver.${num}`,
    guideline,
    preview: {
      colors: Object.values(guideline.color_palette || {})
        .slice(0, 4)
        .map((c: any) => c.hex)
        .filter(Boolean),
      mood: guideline.mood?.keywords?.slice(0, 3) || [],
      tone: guideline.mood?.tone || "",
    },
    guideImages: {},
  };
}
