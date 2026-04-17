import { CHAT_URL } from "../../config";
import { REFINE_STYLE_SYSTEM } from "../prompts";

/**
 * Convert free-form user style instructions into a pure visual description so
 * later prompts don't render the literal text (e.g. brand names) onto images.
 * Returns the original input on any failure so the pipeline stays resilient.
 */
export async function refineStyleOverride(raw: string): Promise<string> {
  if (!raw.trim()) return raw;

  const resp = await fetch(CHAT_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: REFINE_STYLE_SYSTEM,
      messages: [{ role: "user", content: raw }],
    }),
  });

  if (!resp.ok) return raw;
  const data = (await resp.json()) as { reply?: string };
  return (data.reply ?? raw).trim();
}
