import type { Guideline } from "../types";

/**
 * Pick the subset of guideline fields that matters for a given guide-image
 * item (e.g. the palette sheet only needs colors + mood). Keeps the JSON sent
 * to the model small and focused.
 */
export function extractGuideFieldsForItem(
  guideline: Guideline,
  itemId: string,
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
        } as Guideline["color_palette"],
      };
    case "motif_board":
      return {
        graphic_motifs: g.graphic_motifs,
        color_palette: g.color_palette,
        mood: g.mood,
      };
    case "layout_sketches":
      return {
        layout_guide: g.layout_guide,
        event_summary: {
          name: g.event_summary?.name,
          name_en: g.event_summary?.name_en,
        } as Guideline["event_summary"],
      };
    case "logo_usage_sheet":
      return {
        logo_usage: g.logo_usage,
        color_palette: {
          primary: g.color_palette?.primary,
          background: g.color_palette?.background,
        } as Guideline["color_palette"],
      };
    case "mood_board":
      return {
        mood: g.mood,
        color_palette: g.color_palette,
        graphic_motifs: g.graphic_motifs,
        event_summary: {
          name: g.event_summary?.name,
          theme: g.event_summary?.theme,
        } as Guideline["event_summary"],
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

/**
 * Heuristic: map a production item name (Korean) to a matching layout key in
 * the guideline so the production prompt can include the right layout note.
 */
export function findBestLayoutMatch(
  prodName: string,
  layoutGuide: Record<string, string>,
): string | null {
  if (!layoutGuide) return null;
  const name = prodName.toLowerCase();
  const mapping: Record<string, string> = {
    kv: "kv",
    키비주얼: "kv",
    현수막: "banner_horizontal",
    배너: "banner_horizontal",
    인스타: "sns_square",
    sns: "sns_square",
    피드: "sns_square",
    스토리: "sns_story",
    무대: "stage_backdrop",
    배경: "stage_backdrop",
    입구: "entrance_banner",
    "x배너": "entrance_banner",
    포토월: "photowall",
  };
  for (const [kw, key] of Object.entries(mapping)) {
    if (name.includes(kw) && layoutGuide[key]) return key;
  }
  return null;
}

/**
 * Build the DESIGN SYSTEM description block that's embedded into both master
 * KV and per-production prompts. Output format is stable — downstream prompts
 * rely on it.
 */
export function extractDesignSystemForProduction(
  guideline: Guideline,
  prodName: string,
): string {
  const g = guideline;
  const c = g.color_palette || {};
  const t = g.typography || {};
  const m = g.graphic_motifs || {};
  const mood = g.mood || {};
  const event = g.event_summary || ({} as Guideline["event_summary"]);

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
