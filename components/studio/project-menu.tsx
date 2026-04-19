"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "./use-store";
import { saveProject, loadProject, listProjects, deleteProject, saveSetting, loadSetting } from "./use-indexeddb";
import type { NamedImageData, Version, Production } from "./types";

// ─── ZIP 에셋 분리 ──────────────────────────────────────────────────────────
// 이미지/바이너리는 project.json에 base64로 박지 않고 zip 내 assets/*로 분리.
// project.json 안에는 "file:<경로>" 문자열만 남긴다. 구 포맷(임베디드)은
// __assetFormat 마커 부재로 자동 감지되어 그대로 로드된다(하위 호환).

const FILE_PREFIX = "file:";
const ASSET_FORMAT = "v1";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg",
  "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  "application/pdf": "pdf",
};
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf",
};

function parseDataUrl(s: string): { mime: string; base64: string } | null {
  const m = s.match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mime: m[1], base64: m[2] } : null;
}

function externalizeAssets(state: any): { manifest: any; assets: Array<{ path: string; base64: string }> } {
  const assets: Array<{ path: string; base64: string }> = [];
  let n = 0;
  const addRaw = (mime: string, base64: string, hint: string) => {
    const safe = (hint || "x").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const path = `assets/${safe}_${(n++).toString(36)}.${MIME_TO_EXT[mime] || "bin"}`;
    assets.push({ path, base64 });
    return FILE_PREFIX + path;
  };
  const fromDataUrl = (url: string, hint: string): string => {
    if (typeof url !== "string" || !url || url.startsWith(FILE_PREFIX)) return url;
    const p = parseDataUrl(url);
    return p ? addRaw(p.mime, p.base64, hint) : url;
  };
  const fromNamed = (img: NamedImageData, hint: string): NamedImageData => {
    if (!img?.base64 || img.base64.startsWith(FILE_PREFIX)) return img;
    return { ...img, base64: addRaw(img.mime || "application/octet-stream", img.base64, `${hint}_${img.id || ""}`) };
  };

  const m: any = JSON.parse(JSON.stringify(state));
  m.ciImages = (m.ciImages || []).map((x: NamedImageData) => fromNamed(x, "ci"));
  m.ciDocs = (m.ciDocs || []).map((x: NamedImageData) => fromNamed(x, "cidoc"));
  m.refFiles = (m.refFiles || []).map((x: NamedImageData) => fromNamed(x, "ref"));

  if (Array.isArray(m.versions)) {
    m.versions = m.versions.map((v: Version) => {
      const nv: any = { ...v };
      if (v.guideImages) {
        const gi: Record<string, string> = {};
        for (const [k, url] of Object.entries(v.guideImages)) gi[k] = fromDataUrl(url as string, `guide_${v.id}_${k}`);
        nv.guideImages = gi;
      }
      if (v.masterKv?.imageUrl) nv.masterKv = { ...v.masterKv, imageUrl: fromDataUrl(v.masterKv.imageUrl, `master_${v.id}`) };
      return nv;
    });
  }
  if (Array.isArray(m.productions)) {
    m.productions = m.productions.map((p: Production) => {
      const np: any = { ...p };
      if (p.imageUrl) np.imageUrl = fromDataUrl(p.imageUrl, `prod_${p.id}_img`);
      if (p.noTextUrl) np.noTextUrl = fromDataUrl(p.noTextUrl, `prod_${p.id}_notext`);
      if (p.upscaleUrl) np.upscaleUrl = fromDataUrl(p.upscaleUrl, `prod_${p.id}_up`);
      if (p.upscaleRawUrl)
        np.upscaleRawUrl = fromDataUrl(p.upscaleRawUrl, `prod_${p.id}_up_raw`);
      return np;
    });
  }
  m.__assetFormat = ASSET_FORMAT;
  return { manifest: m, assets };
}

async function internalizeAssets(manifest: any, zip: any): Promise<any> {
  if (!manifest?.__assetFormat) return manifest;
  const readRef = async (ref: string) => {
    if (typeof ref !== "string" || !ref.startsWith(FILE_PREFIX)) return null;
    const path = ref.slice(FILE_PREFIX.length);
    const f = zip.file(path);
    if (!f) return null;
    const base64 = await f.async("base64");
    const ext = (path.split(".").pop() || "").toLowerCase();
    return { mime: EXT_TO_MIME[ext] || "application/octet-stream", base64 };
  };
  const toDataUrl = async (ref: string) => {
    if (typeof ref !== "string" || !ref.startsWith(FILE_PREFIX)) return ref;
    const a = await readRef(ref);
    return a ? `data:${a.mime};base64,${a.base64}` : "";
  };
  const toNamed = async (img: NamedImageData) => {
    if (!img?.base64 || !img.base64.startsWith(FILE_PREFIX)) return img;
    const a = await readRef(img.base64);
    return a ? { ...img, mime: img.mime || a.mime, base64: a.base64 } : { ...img, base64: "" };
  };

  const m: any = JSON.parse(JSON.stringify(manifest));
  m.ciImages = await Promise.all((m.ciImages || []).map(toNamed));
  m.ciDocs = await Promise.all((m.ciDocs || []).map(toNamed));
  m.refFiles = await Promise.all((m.refFiles || []).map(toNamed));

  if (Array.isArray(m.versions)) {
    m.versions = await Promise.all(m.versions.map(async (v: any) => {
      const nv = { ...v };
      if (v.guideImages) {
        const gi: Record<string, string> = {};
        for (const [k, url] of Object.entries(v.guideImages)) gi[k] = await toDataUrl(url as string);
        nv.guideImages = gi;
      }
      if (v.masterKv?.imageUrl) nv.masterKv = { ...v.masterKv, imageUrl: await toDataUrl(v.masterKv.imageUrl) };
      return nv;
    }));
  }
  if (Array.isArray(m.productions)) {
    m.productions = await Promise.all(m.productions.map(async (p: any) => {
      const np = { ...p };
      if (p.imageUrl) np.imageUrl = await toDataUrl(p.imageUrl);
      if (p.noTextUrl) np.noTextUrl = await toDataUrl(p.noTextUrl);
      if (p.upscaleUrl) np.upscaleUrl = await toDataUrl(p.upscaleUrl);
      if (p.upscaleRawUrl) np.upscaleRawUrl = await toDataUrl(p.upscaleRawUrl);
      return np;
    }));
  }
  delete m.__assetFormat;
  return m;
}

interface ProjectEntry {
  id: string;
  name: string;
  lastModifiedAt: number;
  step: number;
  versionCount: number;
}

/** Store에서 직렬화 가능한 전체 상태를 추출 */
function getSerializableState() {
  const s = useStore.getState();
  return {
    eventInfo: s.eventInfo,
    tier: s.tier,
    step: s.step,
    styleOverride: s.styleOverride,
    versions: s.versions,
    activeVersionId: s.activeVersionId,
    selectedVersionId: s.selectedVersionId,
    selectedItems: Array.from(s.selectedItems),
    productions: s.productions,
    productionPlan: s.productionPlan,
    refAnalysis: s.refAnalysis,
    ciImages: s.ciImages,
    ciDocs: s.ciDocs,
    refFiles: s.refFiles,
    selectedRefs: s.selectedRefs,
  };
}

/** 저장된 데이터를 store에 복원 */
function restoreState(saved: any) {
  const s = useStore.getState();
  // 기존 상태 초기화
  s.setEventInfo(saved.eventInfo || "");
  s.setTier(saved.tier || "self");
  s.setStyleOverride(saved.styleOverride || "");
  s.setRefAnalysis(saved.refAnalysis || "");

  // versions — 기존 것 교체 (addVersion 누적 아님)
  useStore.setState({
    versions: saved.versions || [],
    activeVersionId: saved.activeVersionId || null,
    selectedVersionId: saved.selectedVersionId || null,
    selectedItems: new Set(saved.selectedItems || []),
    productions: saved.productions || [],
    productionPlan: saved.productionPlan || null,
    ciImages: saved.ciImages || [],
    ciDocs: saved.ciDocs || [],
    refFiles: saved.refFiles || [],
    selectedRefs: saved.selectedRefs || [],
  });

  if (saved.step) s.setStep(saved.step);
}

export default function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const store = useStore();

  useEffect(() => {
    // Restore last project on mount
    (async () => {
      try {
        const lastId = await loadSetting("lastProjectId");
        if (lastId) {
          const saved = await loadProject(lastId);
          if (saved) {
            restoreState(saved);
            store.addLog("이전 세션 복원됨", "ok");
          }
        }
      } catch (e) {
        console.warn("프로젝트 복원 실패:", e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── IndexedDB 저장/불러오기 ───

  async function handleSave() {
    const state = getSerializableState();
    const projectId = "proj_" + (state.versions[0]?.id || Date.now());
    const data = { projectId, ...state, lastModifiedAt: Date.now() };
    await saveProject(data);
    await saveSetting("lastProjectId", projectId);
    store.addLog("프로젝트 저장됨", "ok");
  }

  async function handleOpen() {
    const list = await listProjects();
    setProjects(list);
    setOpen(!open);
  }

  async function handleLoad(id: string) {
    const saved = await loadProject(id);
    if (!saved) return;
    restoreState(saved);
    await saveSetting("lastProjectId", id);
    setOpen(false);
    store.addLog("프로젝트 불러옴", "ok");
  }

  async function handleDelete(id: string) {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleNew() {
    await saveSetting("lastProjectId", "");
    window.location.reload();
  }

  // ─── ZIP 내보내기/가져오기 ───

  async function handleExportZip() {
    const state = getSerializableState();
    const { manifest, assets } = externalizeAssets(state);
    const name = state.versions[0]?.guideline?.event_summary?.name || "epic-studio";
    const safeName = name.replace(/[/\\:*?"<>|]/g, "_");

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("project.json", JSON.stringify(manifest, null, 2));
    for (const a of assets) zip.file(a.path, a.base64, { base64: true });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `${safeName}-프로젝트.zip`;
    el.click();
    URL.revokeObjectURL(url);
    store.addLog(`ZIP 내보내기 완료 — 에셋 ${assets.length}개 분리`, "ok");
  }

  async function handleImportZip(file: File) {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);
      const jsonFile = zip.file("project.json");
      if (!jsonFile) throw new Error("project.json 없음");
      const raw = JSON.parse(await jsonFile.async("string"));
      const saved = await internalizeAssets(raw, zip);
      restoreState(saved);
      store.addLog(`ZIP 불러오기 완료 — ${saved.versions?.length || 0}개 버전`, "ok");
    } catch (e: any) {
      store.addLog(`ZIP 불러오기 실패: ${e.message}`, "err");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 저장 */}
      <button
        onClick={handleSave}
        className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
      >
        저장
      </button>

      {/* ZIP 내보내기 */}
      <button
        onClick={handleExportZip}
        className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
        title="ZIP으로 내보내기"
      >
        내보내기
      </button>

      {/* ZIP 불러오기 */}
      <label
        className="cursor-pointer rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
        title="ZIP 불러오기"
      >
        불러오기
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportZip(f);
            e.target.value = "";
          }}
        />
      </label>

      {/* 프로젝트 메뉴 */}
      <div className="relative">
        <button
          onClick={handleOpen}
          className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-700 hover:text-gray-300"
        >
          프로젝트 {store.versions.length > 0 && <span className="text-indigo-400">({store.versions.length}v)</span>}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
            <div className="max-h-60 overflow-y-auto p-2">
              {projects.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-600">저장된 프로젝트 없음</div>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className="group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs hover:bg-gray-800"
                    onClick={() => handleLoad(p.id)}
                  >
                    <div>
                      <div className="text-gray-300">{p.name}</div>
                      <div className="text-gray-600">Step {p.step} · {p.versionCount}v · {new Date(p.lastModifiedAt).toLocaleDateString("ko")}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      className="text-gray-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      x
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-800 p-2">
              <button
                onClick={handleNew}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-300"
              >
                + 새 프로젝트
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
