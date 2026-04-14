export const API_BASE = "https://epic-studio-api.kbm-32f.workers.dev";

export const isLocal = () =>
  typeof window !== "undefined" && window.location.hostname === "localhost";

// dev: Next.js proxy (app/api/), prod: Worker 직접 호출
export const CHAT_URL = () => isLocal() ? "/api/chat/" : `${API_BASE}/api/chat`;
export const IMAGE_URL = () => isLocal() ? "/api/generate-image/" : `${API_BASE}/api/generate`;
export const ANALYZE_REFS_URL = () => isLocal() ? "/api/analyze-refs/" : `${API_BASE}/api/generate`;
export const SEARCH_URL = () => isLocal() ? "/api/search/" : `${API_BASE}/api/search/smart-references`;
export const VECTORIZE_URL = () => isLocal() ? "/api/vectorize/" : `${API_BASE}/api/vectorize`;
export const RECRAFT_KV_URL = () => `${API_BASE}/api/recraft/generate-kv`;
