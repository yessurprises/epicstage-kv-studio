"use client";

import { useEffect, useRef, useState } from "react";
import { deleteProject, loadProject, saveProject } from "./use-indexeddb";
import { useStore } from "./use-store";

export const AUTOSAVE_ID = "__autosave__";
const DEBOUNCE_MS = 500;

interface AutosaveSnapshot {
  projectId: string;
  lastModifiedAt: number;
  step: number;
  tier: string;
  eventInfo: string;
  styleOverride: string;
  versions: ReturnType<typeof useStore.getState>["versions"];
  selectedVersionId: string | null;
  activeVersionId: string | null;
  productionPlan: ReturnType<typeof useStore.getState>["productionPlan"];
  productions: ReturnType<typeof useStore.getState>["productions"];
  selectedItems: number[];
}

function snapshot(): AutosaveSnapshot {
  const s = useStore.getState();
  return {
    projectId: AUTOSAVE_ID,
    lastModifiedAt: Date.now(),
    step: s.step,
    tier: s.tier,
    eventInfo: s.eventInfo,
    styleOverride: s.styleOverride,
    versions: s.versions,
    selectedVersionId: s.selectedVersionId,
    activeVersionId: s.activeVersionId,
    productionPlan: s.productionPlan,
    productions: s.productions,
    selectedItems: Array.from(s.selectedItems),
  };
}

function hasMeaningfulWork(snap: AutosaveSnapshot): boolean {
  return (
    snap.eventInfo.trim().length > 0 ||
    snap.versions.length > 0 ||
    snap.productions.length > 0
  );
}

/**
 * Debounced autosave of the current studio state to IndexedDB under a reserved
 * slot. Skips writes when the store has no meaningful work. Use together with
 * `useRestorableAutosave()` to offer the user a restore prompt on reload.
 */
export function useAutosave(enabled: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const unsub = useStore.subscribe((state, prev) => {
      if (state === prev) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const snap = snapshot();
        if (!hasMeaningfulWork(snap)) return;
        void saveProject(snap).catch(() => {
          /* Autosave is best-effort; silence failures so they don't spam the UI. */
        });
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled]);
}

export interface PendingAutosave {
  lastModifiedAt: number;
  eventName: string;
  versionCount: number;
}

/**
 * On mount, probe IndexedDB for a non-empty autosave snapshot. Returns either
 * null (nothing to restore) or an object with metadata + a pair of restore /
 * discard callbacks.
 */
export function useRestorableAutosave(): {
  pending: PendingAutosave | null;
  restore: () => Promise<void>;
  discard: () => Promise<void>;
} {
  const [pending, setPending] = useState<PendingAutosave | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const saved = (await loadProject(AUTOSAVE_ID)) as AutosaveSnapshot | null;
        if (!saved || !hasMeaningfulWork(saved)) return;
        const eventName =
          saved.versions?.[0]?.guideline?.event_summary?.name ||
          saved.eventInfo.substring(0, 30) ||
          "(무제)";
        setPending({
          lastModifiedAt: saved.lastModifiedAt,
          eventName,
          versionCount: saved.versions?.length ?? 0,
        });
      } catch {
        /* No autosave or IDB unavailable — proceed silently. */
      }
    })();
  }, []);

  async function restore() {
    try {
      const saved = (await loadProject(AUTOSAVE_ID)) as AutosaveSnapshot | null;
      if (!saved) return;
      const s = useStore.getState();
      s.setStep(saved.step as 1 | 2 | 3 | 4);
      s.setTier(saved.tier);
      s.setEventInfo(saved.eventInfo);
      s.setStyleOverride(saved.styleOverride ?? "");
      saved.versions.forEach((v) => s.addVersion(v));
      if (saved.activeVersionId) s.setActiveVersion(saved.activeVersionId);
      if (saved.selectedVersionId) s.selectVersionForStep3(saved.selectedVersionId);
      if (saved.productionPlan) s.setProductionPlan(saved.productionPlan);
      if (saved.productions) s.setProductions(saved.productions);
      saved.selectedItems.forEach((idx) => s.toggleItem(idx));
      setPending(null);
    } catch {
      setPending(null);
    }
  }

  async function discard() {
    try {
      await deleteProject(AUTOSAVE_ID);
    } finally {
      setPending(null);
    }
  }

  return { pending, restore, discard };
}
