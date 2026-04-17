export interface Env {
  EPIC_DB: D1Database;
  EPIC_KV: KVNamespace;
  GEMINI_API_KEY: string;
  OPENROUTER_API_KEY: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
  EPIC_SEARCH_URL: string;
  EPIC_SEARCH_API_KEY: string;
  VECTORIZER_API_ID: string;
  VECTORIZER_API_SECRET: string;
  RECRAFT_API_TOKEN: string;
}

// OpenRouter / Gemini configuration. OPENROUTER_MODEL is the "Nano Banana 2"
// identifier that Epic-Studio uses for chat/vision.
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_MODEL = "google/gemini-3.1-flash-image-preview";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://epic-studio.epicstage.co.kr",
  "https://epic-studio-cpb.pages.dev",
  "https://main.epic-studio-cpb.pages.dev",
];
