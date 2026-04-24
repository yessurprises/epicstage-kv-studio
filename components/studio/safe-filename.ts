// ASCII-safe filename converter for ZIP downloads. Operators ship 한글 카탈로그
// 이름 + 한글 명단을 통과시키는데, ZIP 스펙(IBM437/UTF-8 양립)·다운로드 헤더의
// `Content-Disposition`·구형 압축 해제 도구(7-Zip 16↓, Windows 탐색기 일부)가
// non-ASCII 파일명을 깨뜨려 운영자가 "파일명 깨짐"으로 오해할 수 있다. 결과는
// ASCII 안전한 short slug + 인덱스 지퍼화. 한글은 유지하지 않음 — 의도된 손실.

const RESERVED_WIN = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * Returns an ASCII-safe slug suitable for ZIP entry names. The function does
 * NOT add an extension — pass the result through `${slug}.png` or similar at
 * the call site so callers can keep their own naming pattern.
 *
 * Falls back to `fallback` (default `"row"`) when no ASCII-mappable characters
 * survive (e.g. pure Hangul name without index tokens).
 */
export function toAsciiSafeName(input: string, fallback = "row"): string {
  // Strip filesystem-illegal punctuation outright.
  let s = input.replace(/[\\/:*?"<>|]/g, "");
  // Normalize + drop combining marks (NFKD), then strip remaining non-ASCII.
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^\x20-\x7E]/g, "");
  // Collapse whitespace + leading/trailing strip.
  s = s.replace(/\s+/g, " ").trim();
  // Replace internal spaces and runs of dots with a single hyphen.
  s = s.replace(/\s/g, "-").replace(/\.{2,}/g, ".");
  // Strip leading dots (hidden files on *nix) + trailing dots/hyphens.
  s = s.replace(/^[.\-]+|[.\-]+$/g, "");
  if (!s || RESERVED_WIN.test(s)) return fallback;
  // Cap length — ZIP entries are technically 65k but most tools choke past 200.
  if (s.length > 120) s = s.slice(0, 120);
  return s;
}
