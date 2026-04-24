import { describe, expect, it } from "vitest";
import type { Guideline } from "../types";
import {
  extractDesignSystemForOpenAI,
  formatOpenAiDesignSystem,
} from "./design-system-openai";
import {
  BASELINE_CONSTRAINTS_OPENAI,
  buildMasterKvPromptOpenAI,
  buildProductionPromptOpenAI,
} from "./prompts-openai";

const sampleGuideline: Guideline = {
  event_summary: {
    name: "제4회 KTOA 벤처리움 데모데이",
    name_en: "4th KTOA Ventureum Demoday",
    date: "2026.05.20",
    venue: "코엑스 C홀",
    organizer: "KTOA",
    theme: "연결",
    slogan: "다시, 무대 위로",
  },
  color_palette: {
    primary: { hex: "#0A2540", usage: "headline" },
    accent: { hex: "#F0B429", usage: "highlight" },
    background: { hex: "#FFFFFF", usage: "surface" },
  },
  typography: {
    headline: { font: "Pretendard Bold", size_range: "80-120pt", note: "bold condensed sans-serif, high x-height" },
    subheading: { font: "Pretendard", size_range: "32-48pt", note: "" },
    body: { font: "Pretendard", size_range: "14-18pt", note: "regular weight, neutral" },
    caption: { font: "Pretendard", size_range: "10-12pt", note: "" },
  },
  graphic_motifs: {
    style: "geometric",
    elements: ["grid", "radial burst"],
    texture: "matte",
    icon_style: "outline",
  },
  logo_usage: {},
  mood: { keywords: ["confident", "forward", "refined"], tone: "dynamic" },
  guide_items_to_visualize: [],
};

describe("extractDesignSystemForOpenAI", () => {
  it("returns structured palette with role/hex pairs", () => {
    const ds = extractDesignSystemForOpenAI(sampleGuideline);
    expect(ds.palette).toEqual([
      { role: "primary", hex: "#0A2540" },
      { role: "accent", hex: "#F0B429" },
      { role: "background", hex: "#FFFFFF" },
    ]);
  });

  it("builds event identity line with name/date/venue/slogan", () => {
    const ds = extractDesignSystemForOpenAI(sampleGuideline);
    expect(ds.eventLine).toContain("제4회 KTOA 벤처리움 데모데이");
    expect(ds.eventLine).toContain("2026.05.20");
    expect(ds.eventLine).toContain("다시, 무대 위로");
  });

  it("joins motif style + elements + texture", () => {
    const ds = extractDesignSystemForOpenAI(sampleGuideline);
    expect(ds.motif).toContain("geometric");
    expect(ds.motif).toContain("grid, radial burst");
    expect(ds.motif).toContain("matte");
  });

  it("joins mood tone with keywords", () => {
    const ds = extractDesignSystemForOpenAI(sampleGuideline);
    expect(ds.mood).toBe("dynamic — confident, forward, refined");
  });

  it("extracts typography mood from headline/body notes (no font names)", () => {
    const ds = extractDesignSystemForOpenAI(sampleGuideline);
    expect(ds.typographyMood).toContain("bold condensed sans-serif");
    expect(ds.typographyMood).not.toContain("Pretendard");
  });

  it("handles empty palette entries gracefully", () => {
    const empty: Guideline = {
      ...sampleGuideline,
      color_palette: { primary: { hex: "", usage: "" } },
    };
    const ds = extractDesignSystemForOpenAI(empty);
    expect(ds.palette).toEqual([]);
  });
});

describe("formatOpenAiDesignSystem", () => {
  it("formats into role-labeled block", () => {
    const ds = extractDesignSystemForOpenAI(sampleGuideline);
    const out = formatOpenAiDesignSystem(ds);
    expect(out).toContain("Event:");
    expect(out).toContain("Design system:");
    expect(out).toContain("  - Palette:");
    expect(out).toContain("  - Motif:");
    expect(out).toContain("  - Mood:");
    expect(out).toContain("  - Typography mood:");
  });
});

describe("buildProductionPromptOpenAI", () => {
  const ds = extractDesignSystemForOpenAI(sampleGuideline);

  it("emits sections in the Cookbook-recommended order", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Horizontal banner",
      useCase: "Outdoor print, aspect 3:1",
      scene: "Clean ground with subtle radial light from center-left",
      subject: "Bold event title paired with a geometric accent motif",
      designSystem: ds,
      texts: [
        { role: "HEADLINE", script: "Korean", value: "제4회 KTOA 벤처리움 데모데이" },
        { role: "DATE", script: "Latin", value: "2026.05.20" },
      ],
      layout: "Headline centered, date bottom-right, generous left-side negative space",
    });

    const artifactIdx = out.indexOf("Artifact:");
    const useCaseIdx = out.indexOf("Use case:");
    const sceneIdx = out.indexOf("Scene:");
    const subjectIdx = out.indexOf("Subject:");
    const designIdx = out.indexOf("Design system:");
    const textIdx = out.indexOf("Text (render EXACTLY");
    const layoutIdx = out.indexOf("Layout:");
    const constraintsIdx = out.indexOf("Constraints:");

    expect(artifactIdx).toBeGreaterThanOrEqual(0);
    expect(useCaseIdx).toBeGreaterThan(artifactIdx);
    expect(sceneIdx).toBeGreaterThan(useCaseIdx);
    expect(subjectIdx).toBeGreaterThan(sceneIdx);
    expect(designIdx).toBeGreaterThan(subjectIdx);
    expect(textIdx).toBeGreaterThan(designIdx);
    expect(layoutIdx).toBeGreaterThan(textIdx);
    expect(constraintsIdx).toBeGreaterThan(layoutIdx);
  });

  it("labels Korean vs Latin texts and wraps values in quotes", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Poster",
      useCase: "A2 print",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [
        { role: "HEADLINE", script: "Korean", value: "다시, 무대 위로" },
        { role: "DATE", script: "Latin", value: "2026.05.20" },
      ],
    });
    expect(out).toContain('- HEADLINE (Korean): "다시, 무대 위로"');
    expect(out).toContain('- DATE (Latin): "2026.05.20"');
  });

  it("omits Layout section when not provided", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Poster",
      useCase: "A2 print",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [],
    });
    expect(out).not.toMatch(/\nLayout:/);
  });

  it("includes the Korean-filler-prevention baseline constraint", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Poster",
      useCase: "A2 print",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [],
    });
    expect(out).toMatch(/do not invent Korean.*filler text/);
  });

  it("includes the no-logos baseline constraint", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Poster",
      useCase: "A2 print",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [],
    });
    expect(out).toMatch(/NO LOGOS/);
  });

  it("emits reference image roles with interaction text", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Ticket",
      useCase: "Event entry ticket",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [],
      refRoles: [
        {
          identity: "Master KV",
          interaction: "Apply its palette and motif; recompose for this ticket format.",
        },
      ],
    });
    expect(out).toMatch(/Reference images \(in attached order\):/);
    expect(out).toMatch(/Image 1: Master KV\. Apply its palette and motif/);
  });

  it("inserts CI brief with explicit no-logo instruction when provided", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Poster",
      useCase: "A2 print",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [],
      ciBrief: '{"palette_hex":["#0A2540"],"visual_tone":"차분"}',
    });
    expect(out).toMatch(/Brand CI cues \(text-only — no logo is attached\):/);
    expect(out).toMatch(/DO NOT draw, invent, or render any logo/);
  });

  it("emits empty-text placeholder when no text strings are provided", () => {
    const out = buildProductionPromptOpenAI({
      artifact: "Abstract backdrop",
      useCase: "Stage screen background",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [],
    });
    expect(out).toMatch(/Text: \(none — visual only/);
  });

  it("has no cargo-culted Gemini-era mood adjectives in the baseline", () => {
    const joined = BASELINE_CONSTRAINTS_OPENAI.join(" ");
    expect(joined).not.toMatch(/stunning|premium|masterpiece|incredible/i);
  });
});

describe("buildMasterKvPromptOpenAI", () => {
  const ds = extractDesignSystemForOpenAI(sampleGuideline);

  it("uses kvLabel as the artifact and adds hero-framing constraints", () => {
    const out = buildMasterKvPromptOpenAI({
      kvLabel: "Master Key Visual — Poster 1:1",
      useCase: "Hero KV, aspect 1:1",
      scene: "x",
      subject: "y",
      designSystem: ds,
      texts: [
        { role: "HEADLINE", script: "Korean", value: "제4회 KTOA 벤처리움 데모데이" },
      ],
    });
    expect(out).toContain("Artifact: Master Key Visual — Poster 1:1");
    expect(out).toMatch(/hero master key visual/);
    expect(out).toMatch(/all production variants will be derived/);
  });
});
