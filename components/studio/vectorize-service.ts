import { VECTORIZE_URL } from "./config";

export type VectorizeProvider = "arrow" | "arrow-max" | "recraft";

// 세션 내 캐시 (같은 이미지 반복 요청 방지)
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(imageDataUrl: string, provider: VectorizeProvider): string {
  // 앞 100자 + 길이로 간이 키 생성
  return `${provider}:${imageDataUrl.length}:${imageDataUrl.slice(0, 100)}`;
}

/**
 * 이미지를 SVG로 벡터화
 * @returns SVG 문자열
 */
export async function vectorizeImage(
  imageDataUrl: string,
  provider: VectorizeProvider = "arrow"
): Promise<string> {
  const key = cacheKey(imageDataUrl, provider);

  // 캐시 히트
  const cached = cache.get(key);
  if (cached) return cached;

  // 동일 요청 진행 중이면 재사용
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const blob = await (await fetch(imageDataUrl)).blob();
    const form = new FormData();
    form.append("image", blob, "image.png");
    form.append("provider", provider);

    const res = await fetch(VECTORIZE_URL(), {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`벡터화 실패 (${provider}): ${err}`);
    }

    const svgText = await res.text();
    cache.set(key, svgText);
    return svgText;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
