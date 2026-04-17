import { CHAT_URL } from "../../config";
import type { Guideline, ImageData, NamedImageData } from "../../types";
import { parseJSON } from "../parse";
import { GUIDELINE_SYSTEM } from "../prompts";
import { refineStyleOverride } from "./refine-style";

/**
 * Generate a brand guideline JSON from the event brief, optional CI assets,
 * and reference analysis. Diversity hints steer subsequent versions away from
 * tones already in use.
 */
export async function generateGuideline(
  eventInfo: string,
  styleOverride: string,
  existingTones: string[] = [],
  refAnalysis?: string,
  ciImages?: ImageData[],
  ciDocs?: Array<Pick<NamedImageData, "mime" | "base64" | "name">>,
): Promise<Guideline> {
  const diversityHint =
    existingTones.length > 0
      ? `\n\n## 중요: 기존 버전들과 다른 방향\n기존 무드/톤: ${existingTones.join(", ")}\n→ 완전히 다른 컬러 팔레트, 무드, 스타일로 생성할 것.`
      : "";

  // Refine the style override (strip brand proper nouns → pure visual desc).
  const refinedStyle = styleOverride ? await refineStyleOverride(styleOverride) : "";

  const hasCi = ciImages && ciImages.length > 0;
  const hasDocs = ciDocs && ciDocs.length > 0;
  const dataSections: string[] = [`## 행사 정보\n${eventInfo}`];
  if (refAnalysis) {
    const refNote = hasCi
      ? "CI 브랜드 아이덴티티를 우선하되, 아래 경향성을 분위기·레이아웃·스타일에 반영."
      : "CI 없음. 아래 경향성을 가이드라인의 주요 소스로 활용.";
    dataSections.push(`## 레퍼런스 경향성 분석\n${refNote}\n${refAnalysis}`);
  }
  if (refinedStyle) dataSections.push(`## 추가 스타일 지시\n${refinedStyle}`);
  if (hasCi) dataSections.push(`## CI 이미지\n${ciImages!.length}장 첨부됨. 로고·컬러·스타일 분석하여 반영.`);
  if (hasDocs)
    dataSections.push(
      `## CI 가이드 문서\n${ciDocs!.length}개 첨부됨. 문서의 브랜드 규정(컬러, 타이포, 레이아웃, 로고 사용법 등)을 분석하여 가이드라인에 반영.`,
    );
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
  const data = (await resp.json()) as { reply?: string };
  return parseJSON<Guideline>(data.reply ?? "");
}
