"use client";

import { create } from "zustand";
import { MASTER_CATALOG } from "./constants";
import type {
  CatalogItem,
  ColorEntry,
  DocData,
  LogEntry,
  MasterKv,
  NamedImageData,
  Production,
  ProductionPlanItem,
  SvgCandidate,
  Version,
} from "./types";

export type {
  ColorEntry,
  Guideline,
  MasterKv,
  Production,
  ProductionPlanItem,
  SvgCandidate,
  Version,
} from "./types";

interface StudioStore {
  step: 1 | 2 | 3 | 4;
  setStep: (s: 1 | 2 | 3 | 4) => void;

  tier: string;
  setTier: (t: string) => void;

  eventInfo: string;
  setEventInfo: (v: string) => void;
  styleOverride: string;
  setStyleOverride: (v: string) => void;
  ciImages: NamedImageData[];
  addCiImage: (img: NamedImageData) => void;
  removeCiImage: (id: string) => void;

  ciDocs: DocData[];
  addCiDoc: (doc: DocData) => void;
  removeCiDoc: (id: string) => void;

  selectedRefs: string[];
  toggleRef: (url: string) => void;

  // 직접 업로드한 레퍼런스 이미지
  refFiles: NamedImageData[];
  addRefFile: (f: NamedImageData) => void;
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
  updateColorPalette: (verId: string, palette: Record<string, ColorEntry>) => void;
  setMasterKv: (verId: string, kv: MasterKv) => void;
  confirmMasterKv: (verId: string) => void;
  markVariationsStale: (verId: string) => void;
  addSvgCandidates: (verId: string, items: SvgCandidate[]) => void;
  updateSvgCandidate: (verId: string, candidateId: string, patch: Partial<SvgCandidate>) => void;
  removeSvgCandidate: (verId: string, candidateId: string) => void;

  customItems: CatalogItem[];
  addCustomItem: (item: CatalogItem) => void;
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

  logs: LogEntry[];
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
  addSvgCandidates: (verId, items) =>
    set((s) => ({
      versions: s.versions.map((v) =>
        v.id === verId
          ? { ...v, svgCandidates: [...(v.svgCandidates ?? []), ...items] }
          : v,
      ),
    })),
  updateSvgCandidate: (verId, candidateId, patch) =>
    set((s) => ({
      versions: s.versions.map((v) =>
        v.id === verId
          ? {
              ...v,
              svgCandidates: (v.svgCandidates ?? []).map((c) =>
                c.id === candidateId ? { ...c, ...patch } : c,
              ),
            }
          : v,
      ),
    })),
  removeSvgCandidate: (verId, candidateId) =>
    set((s) => ({
      versions: s.versions.map((v) =>
        v.id === verId
          ? {
              ...v,
              svgCandidates: (v.svgCandidates ?? []).filter((c) => c.id !== candidateId),
            }
          : v,
      ),
    })),

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
