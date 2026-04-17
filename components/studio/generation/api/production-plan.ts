import { CHAT_URL } from "../../config";
import type { Guideline, ImageData, ProductionPlanItem } from "../../types";
import { parseJSON } from "../parse";
import { PLAN_SYSTEM } from "../prompts";

interface PlanResponse {
  outputs?: ProductionPlanItem[];
}

/**
 * Ask the model to author per-item headline/subtext/layout/image_prompt for
 * the selected production variants. Returns the `outputs` array from the
 * structured JSON reply.
 */
export async function generateProductionPlan(
  guideline: Guideline,
  items: Array<{ num: number; name: string; ratio: string }>,
  ciImages?: ImageData[],
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
  const data = (await resp.json()) as { reply?: string };
  const plan = parseJSON<PlanResponse>(data.reply ?? "");
  return plan.outputs ?? [];
}
