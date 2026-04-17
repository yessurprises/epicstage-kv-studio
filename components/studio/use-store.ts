"use client";

import { create } from "zustand";
import { MASTER_CATALOG } from "./constants";

export interface Guideline {
  event_summary: { name: string; name_en: string; date: string; venue: string; organizer: string; theme: string; slogan: string };
  color_palette: Record<string, { hex: string; usage: string }>;
  typography: Record<string, { font: string; size_range: string; note: string }>;
  graphic_motifs: { style: string; elements: string[]; texture: string; icon_style: string };
  layout_guide: Record<string, string>;
  logo_usage: Record<string, string>;
  mood: { keywords: string[]; tone: string };
  recraft_prompt?: string;
  guide_items_to_visualize: Array<{ id: string; label: string; description: string }>;
}

export interface MasterKv {
  imageUrl: string;       // data:image/... base64
  ratio: string;          // "16:9" | "3:4" | "1:1"
  confirmed: boolean;
  uploadedByUser?: boolean;
}

export interface Version {
  id: string;
  num: number;
  label: string;
  guideline: Guideline;
  preview: { colors: string[]; mood: string[]; tone: string };
  guideImages: Record<string, string>; // id → base64 data URL
  masterKv?: MasterKv;
}

export interface ProductionPlanItem {
  num: number;
  name: string;
  ratio: string;
  headline: string;
  subtext: string | null;
  layout_note: string;
  image_prompt: string;
}

export interface Production {
  id: string;
  name: string;
  ratio: string;
  category: string;
  status: "pending" | "generating" | "done" | "error";
  imageUrl?: string;
  error?: string;
  headline?: string;
  subtext?: string | null;
  layoutNote?: string;
  imagePrompt?: string;
  renderInstruction?: string;
  fullPrompt?: string;
  stale?: boolean; // KV 변경 후 재생성 필요
  // no-text version
  noTextStatus?: "pending" | "generating" | "done" | "error";
  noTextUrl?: string;
  noTextError?: string;
  // upscale
  upscaleStatus?: "pending" | "done" | "error";
  upscaleUrl?: string;
}

interface StudioStore {
  step: 1 | 2 | 3 | 4;
  setStep: (s: 1 | 2 | 3 | 4) => void;

  tier: string;
  setTier: (t: string) => void;

  eventInfo: string;
  setEventInfo: (v: string) => void;
  styleOverride: string;
  setStyleOverride: (v: string) => void;
  ciImages: Array<{ id: string; name: string; mime: string; base64: string }>;
  addCiImage: (img: { id: string; name: string; mime: string; base64: string }) => void;
  removeCiImage: (id: string) => void;

  ciDocs: Array<{ id: string; name: string; mime: string; base64: string }>;
  addCiDoc: (doc: { id: string; name: string; mime: string; base64: string }) => void;
  removeCiDoc: (id: string) => void;

  selectedRefs: string[];
  toggleRef: (url: string) => void;

  // 직접 업로드한 레퍼런스 이미지
  refFiles: Array<{ id: string; name: string; mime: string; base64: string }>;
  addRefFile: (f: { id: string; name: string; mime: string; base64: string }) => void;
  removeRefFile: (id: string) => void;

  // Gemini 분석 결과
  refAnalysis: string;
  setRefAnalysis: (v: string) => void;

  versions: Version[];
  activeVersionId: string | null;
  selectedVersionId: string | null;
  addVersion: (v: Version) => void;
  setActiveVersion: (id: string) => void;
  selectVersionForStep3: (id: string) => void;
  setGuideImage: (verId: string, itemId: string, dataUrl: string) => void;
  updateColorPalette: (verId: string, palette: Record<string, { hex: string; usage: string }>) => void;
  setMasterKv: (verId: string, kv: MasterKv) => void;
  confirmMasterKv: (verId: string) => void;
  markVariationsStale: (verId: string) => void;

  customItems: Array<{ name: string; ratio: string; category: string }>;
  addCustomItem: (item: { name: string; ratio: string; category: string }) => void;
  removeCustomItem: (idx: number) => void;

  selectedItems: Set<number>;
  toggleItem: (idx: number) => void;
  selectAllItems: () => void;
  deselectAllItems: () => void;

  productionPlan: ProductionPlanItem[] | null;
  setProductionPlan: (p: ProductionPlanItem[] | null) => void;

  productions: Production[];
  setProductions: (p: Production[]) => void;
  updateProduction: (id: string, patch: Partial<Production>) => void;

  isProcessing: boolean;
  setProcessing: (v: boolean) => void;

  logs: Array<{ time: string; message: string; type?: string }>;
  addLog: (msg: string, type?: string) => void;
}

function timeStr() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export const useStore = create<StudioStore>((set) => ({
  step: 1,
  setStep: (s) => set({ step: s }),

  tier: "self",
  setTier: (t) => set({ tier: t }),

  eventInfo: "",
  setEventInfo: (v) => set({ eventInfo: v }),
  styleOverride: "",
  setStyleOverride: (v) => set({ styleOverride: v }),
  ciImages: [],
  addCiImage: (img) => set((s) => ({ ciImages: [...s.ciImages, img] })),
  removeCiImage: (id) => set((s) => ({ ciImages: s.ciImages.filter((i) => i.id !== id) })),

  ciDocs: [],
  addCiDoc: (doc) => set((s) => ({ ciDocs: [...s.ciDocs, doc] })),
  removeCiDoc: (id) => set((s) => ({ ciDocs: s.ciDocs.filter((d) => d.id !== id) })),

  selectedRefs: [],
  toggleRef: (url) =>
    set((s) => ({
      selectedRefs: s.selectedRefs.includes(url)
        ? s.selectedRefs.filter((u) => u !== url)
        : [...s.selectedRefs, url],
    })),

  refFiles: [],
  addRefFile: (f) => set((s) => ({ refFiles: [...s.refFiles, f] })),
  removeRefFile: (id) => set((s) => ({ refFiles: s.refFiles.filter((f) => f.id !== id) })),

  refAnalysis: "",
  setRefAnalysis: (v) => set({ refAnalysis: v }),

  versions: [],
  activeVersionId: null,
  selectedVersionId: null,
  addVersion: (v) =>
    set((s) => ({
      versions: s.versions.some((ev) => ev.id === v.id) ? s.versions : [...s.versions, v],
      activeVersionId: v.id,
    })),
  setActiveVersion: (id) => set({ activeVersionId: id }),
  selectVersionForStep3: (id) =>
    set((s) => ({
      selectedVersionId: s.selectedVersionId === id ? null : id,
    })),
  setGuideImage: (verId, itemId, dataUrl) =>
    set((s) => ({
      versions: s.versions.map((v) =>
        v.id === verId ? { ...v, guideImages: { ...v.guideImages, [itemId]: dataUrl } } : v
      ),
    })),
  updateColorPalette: (verId, palette) =>
    set((s) => ({
      versions: s.versions.map((v) =>
        v.id === verId && v.guideline
          ? { ...v, guideline: { ...v.guideline, color_palette: palette } }
          : v
      ),
    })),
  setMasterKv: (verId, kv) =>
    set((s) => ({
      versions: s.versions.map((v) => (v.id === verId ? { ...v, masterKv: kv } : v)),
    })),
  confirmMasterKv: (verId) =>
    set((s) => ({
      versions: s.versions.map((v) =>
        v.id === verId && v.masterKv ? { ...v, masterKv: { ...v.masterKv, confirmed: true } } : v
      ),
    })),
  markVariationsStale: (verId) =>
    set((s) => {
      // 해당 버전의 selectedVersionId가 맞는 경우에만 productions에 stale 표시
      if (s.selectedVersionId !== verId) return {};
      return {
        productions: s.productions.map((p) => ({ ...p, stale: true })),
      };
    }),

  customItems: [],
  addCustomItem: (item) =>
    set((s) => {
      const newCustom = [...s.customItems, item];
      const newIdx = MASTER_CATALOG.length + newCustom.length - 1;
      const next = new Set(s.selectedItems);
      next.add(newIdx);
      return { customItems: newCustom, selectedItems: next };
    }),
  removeCustomItem: (idx) =>
    set((s) => ({ customItems: s.customItems.filter((_, i) => i !== idx) })),

  selectedItems: new Set(),
  toggleItem: (idx) =>
    set((s) => {
      const next = new Set(s.selectedItems);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { selectedItems: next };
    }),
  selectAllItems: () => set((s) => ({ selectedItems: new Set(Array.from({ length: MASTER_CATALOG.length + s.customItems.length }, (_, i) => i)) })),
  deselectAllItems: () => set({ selectedItems: new Set() }),

  productionPlan: null,
  setProductionPlan: (p) => set({ productionPlan: p }),

  productions: [],
  setProductions: (p) => set({ productions: p }),
  updateProduction: (id, patch) =>
    set((s) => ({
      productions: s.productions.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  isProcessing: false,
  setProcessing: (v) => set({ isProcessing: v }),

  logs: [],
  addLog: (msg, type) =>
    set((s) => ({
      logs: [...s.logs, { time: timeStr(), message: msg, type }],
    })),
}));
