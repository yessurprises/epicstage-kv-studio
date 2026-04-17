import type { Guideline } from "../types";

/**
 * Repair a truncated or trailing-comma JSON string by closing any open
 * brackets. Used when Gemini returns mid-stream.
 */
export function repairJSON<T = unknown>(json: string): T {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }

  let repaired = json.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return JSON.parse(repaired) as T;
}

/**
 * Strip Markdown fences and trailing commas, then parse. Falls back to
 * `repairJSON` if standard parsing fails.
 */
export function parseJSON<T = Guideline>(text: string): T {
  const cleaned = text.replace(/```json?\n?/g, "").replace(/\n?```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("JSON 구조를 찾을 수 없습니다");

  const end = cleaned.lastIndexOf("}");
  const candidate =
    end !== -1
      ? cleaned.substring(start, end + 1).replace(/,\s*([}\]])/g, "$1")
      : cleaned.substring(start);

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return repairJSON<T>(cleaned.substring(start).replace(/,\s*([}\]])/g, "$1"));
  }
}
