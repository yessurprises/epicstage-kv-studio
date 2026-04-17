"use client";

import { useState } from "react";
import { useStore } from "./use-store";
import { MASTER_CATALOG, CATEGORIES } from "./constants";

export default function CatalogSelector() {
  const { selectedItems, toggleItem, selectAllItems, deselectAllItems, customItems, addCustomItem, removeCustomItem } = useStore();
  const [category, setCategory] = useState("전체");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");

  const allItems = [...MASTER_CATALOG, ...customItems];

  const filtered = category === "전체"
    ? allItems
    : allItems.filter((item) => item.category === category);

  function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

  function addCustom() {
    if (!customName.trim()) return;
    const w = parseFloat(customW) || 1;
    const h = parseFloat(customH) || 1;
    const g = gcd(Math.round(w * 10), Math.round(h * 10));
    const ratio = `${Math.round(w * 10 / g)}:${Math.round(h * 10 / g)}`;
    addCustomItem({ name: customName.trim(), ratio, category: "커스텀" });
    setCustomName("");
    setCustomW("");
    setCustomH("");
    setShowCustom(false);
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-nacelle text-sm font-semibold text-white">
          제작물 선택 <span className="text-indigo-400">({selectedItems.size}/{allItems.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[...CATEGORIES, ...(customItems.length > 0 ? ["커스텀" as const] : [])].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  category === cat
                    ? "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-gray-800" />
          <button onClick={selectAllItems} className="text-[10px] text-gray-500 hover:text-gray-300">전체선택</button>
          <button onClick={deselectAllItems} className="text-[10px] text-gray-500 hover:text-gray-300">해제</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {filtered.map((item) => {
          const globalIdx = allItems.indexOf(item);
          const isSelected = selectedItems.has(globalIdx);
          const isCustom = globalIdx >= MASTER_CATALOG.length;
          return (
            <button
              key={globalIdx}
              onClick={() => toggleItem(globalIdx)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                isSelected
                  ? "border-indigo-500/50 bg-indigo-500/5 text-indigo-300"
                  : "border-gray-800 bg-gray-950/50 text-gray-400 hover:border-gray-700 hover:text-gray-300"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] ${
                isSelected ? "border-indigo-500 bg-indigo-500 text-white" : "border-gray-700"
              }`}>
                {isSelected && "✓"}
              </span>
              <span className="truncate">{item.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-gray-600">{item.ratio}</span>
              {isCustom && (
                <span
                  onClick={(e) => { e.stopPropagation(); removeCustomItem(globalIdx - MASTER_CATALOG.length); }}
                  className="shrink-0 text-[10px] text-red-500 hover:text-red-400"
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Custom size input */}
      <div className="mt-4 border-t border-gray-800 pt-4">
        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="text-xs text-gray-500 hover:text-indigo-400"
          >
            + 커스텀 사이즈 추가
          </button>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[10px] text-gray-600">이름</label>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="예: 특대 현수막"
                className="w-32 rounded border border-gray-800 bg-gray-950 px-2 py-1.5 text-xs text-gray-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-gray-600">가로 cm</label>
              <input
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                type="number"
                placeholder="600"
                className="w-20 rounded border border-gray-800 bg-gray-950 px-2 py-1.5 text-xs text-gray-200"
              />
            </div>
            <div className="pb-1.5 text-xs text-gray-600">x</div>
            <div>
              <label className="mb-1 block text-[10px] text-gray-600">세로 cm</label>
              <input
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                type="number"
                placeholder="180"
                className="w-20 rounded border border-gray-800 bg-gray-950 px-2 py-1.5 text-xs text-gray-200"
              />
            </div>
            {customW && customH && (
              <div className="pb-1.5 font-mono text-[10px] text-indigo-400">
                = {customW}:{customH}
              </div>
            )}
            <button
              onClick={addCustom}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500"
            >
              추가
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              취소
            </button>
          </div>
        )}
      </div>

      {selectedItems.size > 0 && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <span className="text-xs text-gray-500">{selectedItems.size}종 선택됨</span>
        </div>
      )}
    </div>
  );
}
