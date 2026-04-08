export const API_BASE = "https://epic-studio-api.pd-302.workers.dev";

export const isLocal = () =>
  typeof window !== "undefined" && window.location.hostname === "localhost";

// dev: Next.js proxy, prod: Worker 직접
export const CHAT_URL = () => isLocal() ? "/api/chat/" : `${API_BASE}/api/chat`;
export const IMAGE_URL = () => isLocal() ? "/api/generate-image/" : `${API_BASE}/api/generate`;
export const ANALYZE_REFS_URL = () => isLocal() ? "/api/analyze-refs/" : `${API_BASE}/api/generate`;
export const SEARCH_URL = () => isLocal() ? "/api/search/" : `${API_BASE}/api/search/smart-references`;
