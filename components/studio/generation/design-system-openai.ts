import type { Guideline } from "../types";

/**
 * OpenAI GPT Image 2 prefers structured, role-labeled design system input over
 * the prose block that Gemini accepts. This extractor returns a typed object
 * consumed by `buildProductionPromptOpenAI` / `buildMasterKvPromptOpenAI`,
 * which format it as a four-line block inside the prompt.
 *
 * Keep this separate from `extractDesignSystemForProduction` — that function
 * emits a Gemini-optimized prose block and downstream Gemini prompts rely on
 * its exact shape.
 */

export interface OpenAiDesignSystem {
  /** Event identity line (name / date / venue / slogan). */
  eventLine: string;
  /** Palette entries — `{name, hex}` pairs, skips empties. */
  palette: Array<{ role: string; hex: string }>;
  /** One-line motif description. */
  motif: string;
  /** Concrete mood words — tone + keywords, comma-joined. */
  mood: string;
  /** Typography mood — weight/proportion, NOT font names. */
  typographyMood: string;
}

function joinNonEmpty(parts: Array<string | undefined>, sep: string): string {
  return parts.filter((p) => p && p.trim()).join(sep);
}

/**
 * Build the OpenAI design system object from a Guideline. Pure — safe to call
 * per-variant without side effects.
 */
export function extractDesignSystemForOpenAI(guideline: Guideline): OpenAiDesignSystem {
  const g = guideline;
  const c = g.color_palette || {};
  const t = g.typography || {};
  const m = g.graphic_motifs || {};
  const mood = g.mood || ({} as Guideline["mood"]);
  const event = g.event_summary || ({} as Guideline["event_summary"]);

  const eventLine = joinNonEmpty(
    [
      event.name ? `"${event.name}"` : undefined,
      event.name_en ? `/ "${event.name_en}"` : undefined,
      event.date,
      event.venue,
      event.organizer,
      event.slogan ? `— "${event.slogan}"` : undefined,
    ],
    " ",
  );

  const palette = Object.entries(c)
    .filter(([, v]) => v?.hex)
    .map(([role, v]) => ({ role, hex: v.hex }));

  const motif = joinNonEmpty(
    [
      m.style,
      m.elements?.length ? `elements: ${m.elements.join(", ")}` : undefined,
      m.texture ? `texture: ${m.texture}` : undefined,
      m.icon_style ? `icons: ${m.icon_style}` : undefined,
    ],
    ". ",
  );

  const moodParts = joinNonEmpty(
    [mood.tone, mood.keywords?.length ? mood.keywords.join(", ") : undefined],
    " — ",
  );

  // Typography mood: describe weight/proportion, not font names. We derive it
  // from the headline's `note` when present (the guideline author writes mood
  // there), falling back to font weight hints.
  const headlineNote = t.headline?.note?.trim();
  const bodyNote = t.body?.note?.trim();
  const typographyMood = joinNonEmpty(
    [
      headlineNote ? `headline: ${headlineNote}` : undefined,
      bodyNote ? `body: ${bodyNote}` : undefined,
    ],
    "; ",
  );

  return {
    eventLine,
    palette,
    motif,
    mood: moodParts,
    typographyMood,
  };
}

/**
 * Format the design system object as the block embedded in the prompt body.
 * Kept separate from the extractor so tests can assert shape + format
 * independently.
 */
export function formatOpenAiDesignSystem(ds: OpenAiDesignSystem): string {
  const lines: string[] = [];
  lines.push(`Event: ${ds.eventLine || "(unspecified)"}`);
  lines.push("Design system:");
  if (ds.palette.length > 0) {
    const paletteStr = ds.palette.map((p) => `${p.role} ${p.hex}`).join(", ");
    lines.push(`  - Palette: ${paletteStr}`);
  }
  if (ds.motif) lines.push(`  - Motif: ${ds.motif}`);
  if (ds.mood) lines.push(`  - Mood: ${ds.mood}`);
  if (ds.typographyMood) lines.push(`  - Typography mood: ${ds.typographyMood}`);
  return lines.join("\n");
}
