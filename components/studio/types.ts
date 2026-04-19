// Shared domain types for the Studio. Centralized here so both components and
// generation modules can import without pulling in the Zustand store.

export interface ImageData {
  mime: string;
  base64: string;
}

export interface NamedImageData extends ImageData {
  id: string;
  name: string;
}

export type DocData = NamedImageData;

export interface EventSummary {
  name: string;
  name_en: string;
  date: string;
  venue: string;
  organizer: string;
  theme: string;
  slogan: string;
}

export interface ColorEntry {
  hex: string;
  usage: string;
}

export interface TypographyEntry {
  font: string;
  size_range: string;
  note: string;
}

export interface GraphicMotifs {
  style: string;
  elements: string[];
  texture: string;
  icon_style: string;
}

export interface Mood {
  keywords: string[];
  tone: string;
}

export interface GuideItem {
  id: string;
  label: string;
  description: string;
}

export interface Guideline {
  event_summary: EventSummary;
  color_palette: Record<string, ColorEntry>;
  typography: Record<string, TypographyEntry>;
  graphic_motifs: GraphicMotifs;
  layout_guide: Record<string, string>;
  logo_usage: Record<string, string>;
  mood: Mood;
  recraft_prompt?: string;
  guide_items_to_visualize: GuideItem[];
}

export interface MasterKv {
  imageUrl: string;
  ratio: string;
  confirmed: boolean;
  uploadedByUser?: boolean;
}

export interface SvgCandidate {
  id: string;
  imageUrl: string;
  ratio: string;
  createdAt: number;
  batchId: string;
  svgUrl?: string;
  svgProvider?: "arrow" | "arrow-max" | "recraft";
  svgError?: string;
}

export interface VersionPreview {
  colors: string[];
  mood: string[];
  tone: string;
}

export interface Version {
  id: string;
  num: number;
  label: string;
  guideline: Guideline;
  preview: VersionPreview;
  guideImages: Record<string, string>;
  masterKv?: MasterKv;
  svgCandidates?: SvgCandidate[];
}

export interface ProductionPlanItem {
  num: number;
  name: string;
  ratio: string;
  headline: string;
  subtext: string | null;
  layout_note: string;
  image_prompt: string;
  image_size?: "512" | "1K" | "2K" | "4K";
  temperature?: number;
  seed?: number;
  overridden?: boolean;
}

export type ProductionStatus = "pending" | "generating" | "done" | "error";
export type NoTextStatus = "pending" | "generating" | "done" | "error";
export type UpscaleStatus = "pending" | "done" | "error";

export interface Production {
  id: string;
  name: string;
  ratio: string;
  category: string;
  status: ProductionStatus;
  imageUrl?: string;
  error?: string;
  headline?: string;
  subtext?: string | null;
  layoutNote?: string;
  imagePrompt?: string;
  renderInstruction?: string;
  fullPrompt?: string;
  imageSize?: "512" | "1K" | "2K" | "4K";
  temperature?: number;
  seed?: number;
  overridden?: boolean;
  stale?: boolean;
  noTextStatus?: NoTextStatus;
  noTextUrl?: string;
  noTextError?: string;
  upscaleStatus?: UpscaleStatus;
  upscaleUrl?: string;
  upscaleRawUrl?: string; // Topaz 원본 결과 — 재크롭 시 재업스케일 없이 재사용
  upscaleTargetW?: number;
  upscaleTargetH?: number;
  upscaleError?: string;
}

export interface LogEntry {
  time: string;
  message: string;
  type?: string;
}

export interface CatalogItem {
  name: string;
  ratio: string;
  category: string;
}
