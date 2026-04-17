"use client";

import type { PendingAutosave } from "./use-autosave";

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "방금 전";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

interface Props {
  pending: PendingAutosave;
  onRestore: () => void;
  onDiscard: () => void;
}

export default function AutosaveBanner({ pending, onRestore, onDiscard }: Props) {
  return (
    <div
      role="region"
      aria-label="자동 저장된 작업 복원"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-5 py-3 text-sm"
    >
      <div className="text-indigo-200">
        <span className="font-semibold">저장된 작업이 있습니다</span>
        <span className="ml-2 text-indigo-200/70">
          {pending.eventName} · 버전 {pending.versionCount}개 ·{" "}
          {formatRelative(pending.lastModifiedAt)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRestore}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          복원
        </button>
        <button
          onClick={onDiscard}
          className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
        >
          폐기
        </button>
      </div>
    </div>
  );
}
