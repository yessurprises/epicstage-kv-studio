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
  /** Whether Step 2 guide images were attached as reference on generation. */
  includedGuideImages?: boolean;
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

export type ImageProviderId = "gemini" | "openai";

export interface Version {
  id: string;
  num: number;
  label: string;
  guideline: Guideline;
  preview: VersionPreview;
  guideImages: Record<string, string>;
  masterKv?: MasterKv;
  svgCandidates?: SvgCandidate[];
  /**
   * Image-generation provider for Step 2/3/4 of this version. Optional for
   * backward compatibility — existing versions default to "gemini" when
   * absent.
   */
  provider?: ImageProviderId;
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
  /** Per-generation operator inputs from the Step 4 plan-item editor. */
  userInput?: ProductionUserInput;
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
  /** Operator inputs copied from the originating plan item. */
  userInput?: ProductionUserInput;
  /** Phase C — set on a 2nd-pass variant; references the originating production id. */
  parentId?: string;
  /** Phase C — rectangles + instructions used to derive this variant. */
  editRegions?: EditRegion[];
  /** Phase C — global instruction applied outside of any rectangle. */
  globalEditInstruction?: string;
}

export interface LogEntry {
  time: string;
  message: string;
  type?: string;
}

/** Physical dimensions in millimeters — used for print-grade items. */
export interface PhysicalSize {
  widthMm: number;
  heightMm: number;
}

/**
 * Fractional bounding box for safeZone (areas that must remain empty because
 * PPT, live video, overlay text, or CSV-driven name overlays will be composited
 * on top). All four numbers are in the 0~1 range relative to the rendered
 * image's natural width/height. Resolution-agnostic — same catalog default
 * works whether the model emits a 1K, 2K, or 4K bucket — and converts cleanly
 * to either pixel offsets (Canvas overlay) or percentages (HTML/EDM CTA).
 */
export interface SafeZoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Per-rectangle edit instruction for Phase C 2nd-pass regeneration. Coordinates
 * are at the source image's natural resolution (not display resolution) so the
 * prompt's pixel coordinates match what the model sees attached as a reference.
 */
export interface EditRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  instruction: string;
}

/**
 * Per-catalog-item configuration. Most fields are optional flags driving
 * prompt-builder branches and UI-input shape. See
 * `docs/gpt-image-2-catalog-spec.md` section 4 for the canonical definitions.
 *
 * Phase B simplification: the `noDefaultText` / `ciReferenceRequired` /
 * `customFields` flags were dropped because the same outcome is achieved with
 * (a) `customTextUI` + per-item `extraConstraints` for "blank center" items,
 * (b) auto-attaching the existing CI image when `logoCentric`, and
 * (c) deferring per-item structured fields until an item actually needs them.
 *
 * `safeZone` / `safeZoneRequired` types remain reserved but the prompt
 * builder does NOT emit them — re-enable when a UI editor lands.
 */
export interface CatalogItem {
  /** Stable code reference (C01~C29). */
  id?: string;
  /** Original item numbers (1~84) this entry consolidates from — debug/trace. */
  sourceRefs?: number[];
  name: string;
  ratio: string;
  category: string;
  /**
   * 본질 그룹명. 같은 group을 공유하는 항목들은 Step 4 UI에서 하나의 카드로
   * 묶이고 variant 칩으로 세분화된다. 없으면 단독 카드.
   */
  group?: string;

  // === Flag fields (spec section 4) ===
  /** Viewing distance — far drives oversized typography & high contrast. */
  displayDistance?: "near" | "mid" | "far";
  /** User-configurable physical size (e.g. acrylic POP, mic tag). */
  customSize?: PhysicalSize;
  /** Catalog-fixed physical size for items with strict print regs (e.g. badges). */
  physicalSizeMm?: PhysicalSize;
  /** Template + per-row CSV text overlay pipeline (separate, see spec section 8-2). */
  bulkCsvOverlay?: boolean;
  /** UI exposes a "show text" checkbox; default ON. Off → pattern only. */
  textToggleable?: boolean;
  /** UI exposes a separate "include subtext" checkbox; default OFF. */
  subtextToggleable?: boolean;
  /** UI exposes a free-form custom text input. */
  customTextUI?: boolean;
  /**
   * Phase D — UI exposes a stack of multi-line textareas, one per key. The
   * order in this array determines render order in the prompt. Korean labels
   * come from `MULTILINE_FIELD_LABELS` in `constants.ts`. Used by C30 브로셔.
   */
  multilineTextUI?: string[];
  /** UI exposes ratio override. */
  customRatio?: boolean;
  /** Item is logo-centric — drops "NO LOGOS" + auto-attaches the stored CI image as a reference. */
  logoCentric?: boolean;
  /** UI exposes a directional arrow dropdown (← ↑ → ↓ + diagonals). */
  directionSelector?: boolean;
  /** Render headline/subtext as a repeating tiled pattern (photo wall, honeycomb). */
  repeatPattern?: boolean;
  /**
   * Item requires a safeZone — the prompt always emits a "reserved empty zone"
   * block, and the Step 4 UI exposes safeZone editing. Catalog supplies the
   * default `safeZone` array; user can override via `userInput.safeZone`.
   */
  safeZoneRequired?: boolean;
  /** Default fractional bbox values (used when user hasn't overridden). */
  safeZone?: SafeZoneBox[];
  /**
   * Per-item constraint bullets always appended to the prompt regardless of
   * any flag (e.g. C15 안내 POP requires the central area kept clear so the
   * operator's `customTextUI` text lands cleanly).
   */
  extraConstraints?: string[];
  /**
   * Phase F — CSV column schema for `bulkCsvOverlay` items. Each entry maps a
   * column name in the uploaded CSV to a label shown in preview UI. The
   * renderer draws each value as a stacked text line centered inside the
   * item's first `safeZone` rectangle.
   */
  csvSchema?: Array<{ key: string; label: string; required?: boolean }>;
  /**
   * Phase G — default slide count for SNS cardnews items (e.g. 인스타 피드
   * 3~10장 시리즈). When set, production-card exposes a "카드뉴스" 버튼
   * that opens the per-slide editor + reference-chained generator.
   */
  cardNewsSlides?: number;
  /**
   * Phase H — when true, the production-card exposes an "EDM" button that
   * opens the hybrid HTML email editor. The catalog's first `safeZone`
   * rectangle is reused as the CTA placement target (so the existing
   * safeZone editor in plan-item-card lets the operator override it). The
   * generated HTML embeds the rendered image as the bg and absolutely
   * positions a CTA button at those coordinates.
   */
  edmTemplate?: boolean;
}

/** Direction options for `directionSelector` items (e.g. wayfinding signage). */
export type ArrowDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

/**
 * Per-generation user-supplied values for a catalog item. Populated from the
 * Step 4 UI based on the active item's flag set. All fields optional — only
 * the ones whose corresponding catalog flag is true will be read.
 */
export interface ProductionUserInput {
  /** Free-form text from `customTextUI`. */
  customText?: string;
  /**
   * User-specified physical size — applies to both `customSize` items
   * (현장 맞춤) AND `physicalSizeMm` items when the operator wants to
   * override the catalog default (e.g. 비표준 사이즈 명찰).
   */
  customSize?: PhysicalSize;
  /** User-specified ratio override for `customRatio` items (e.g. "16:9"). */
  customRatio?: string;
  /** Selected arrow direction for `directionSelector` items. */
  direction?: ArrowDirection;
  /** When true and `textToggleable` is set, suppress all text. */
  hideText?: boolean;
  /** When true and `subtextToggleable` is set, include the subtext. */
  showSubtext?: boolean;
  /**
   * Fractional bounding boxes overriding the catalog default `safeZone`. Used
   * by `safeZoneRequired` items (명찰·명패 이름 영역, PPT 본문 영역).
   */
  safeZone?: SafeZoneBox[];
  /**
   * Phase D — keyed multi-line text blocks (overview, timeline, speakers,
   * etc.). Keys must match the catalog's `multilineTextUI` array. Each value
   * is rendered into the prompt as its own role under the TEXTS section.
   */
  multilineFields?: Record<string, string>;
}
