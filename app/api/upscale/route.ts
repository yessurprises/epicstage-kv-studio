// Dev proxy — forward upscale requests to the Cloudflare Worker which holds
// the REPLICATE_API_TOKEN. Keeps local dev from needing its own secrets copy.

const WORKER_BASE = "https://epic-studio-api.kbm-32f.workers.dev";

export async function POST(req: Request) {
  const body = await req.text();
  const resp = await fetch(`${WORKER_BASE}/api/upscale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { "Content-Type": resp.headers.get("Content-Type") ?? "application/json" },
  });
}
