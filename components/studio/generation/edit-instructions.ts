// Phase C — shared builder for the "EDIT INSTRUCTIONS" prompt block. Both the
// Gemini and OpenAI 2nd-pass paths emit identical text here so the model sees
// the same per-region directive regardless of provider; keep this in one place
// to avoid drift.

import type { EditRegion } from "../types";

export function buildEditInstructionsBlock(
  regions: EditRegion[],
  globalInstruction?: string,
): string {
  const lines: string[] = [
    "=== EDIT INSTRUCTIONS ===",
    "The attached image is the current artwork. Modify ONLY the listed rectangular regions; preserve the rest of the image pixel-for-pixel where possible. Output the full modified image at the same dimensions and aspect.",
  ];
  regions.forEach((r, i) => {
    lines.push(
      `Region ${i + 1} at (x=${Math.round(r.x)}px, y=${Math.round(r.y)}px, width=${Math.round(r.width)}px, height=${Math.round(r.height)}px): "${r.instruction}"`,
    );
  });
  const trimmedGlobal = globalInstruction?.trim();
  if (trimmedGlobal) {
    lines.push(`Global (applies outside the listed regions): "${trimmedGlobal}"`);
  }
  return lines.join("\n");
}
