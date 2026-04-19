export interface Env {
  EPIC_DB: D1Database;
  EPIC_KV: KVNamespace;
  GEMINI_API_KEY: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
  EPIC_SEARCH_URL: string;
  EPIC_SEARCH_API_KEY: string;
  QUIVERAI_API_KEY: string;
  RECRAFT_API_TOKEN: string;
  TOPAZ_API_KEY: string;
}

// Routed through a Supabase Edge Function pinned to Seoul (ap-northeast-2)
// so the outbound fetch to Google originates from a Korean IP. The CF
// Worker itself frequently lands in HKG colo, which Google blocks for the
// public Gemini API. The function is a plain pass-through — same paths,
// same auth (API key in query string), same request/response shape.
export const GEMINI_BASE =
  "https://sznthxhennxbqhdogxoy.supabase.co/functions/v1/gemini/v1beta";

export const CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://epic-studio.epicstage.co.kr",
  "https://epic-studio-cpb.pages.dev",
  "https://main.epic-studio-cpb.pages.dev",
];
