import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { CORS_ORIGINS, type Env } from "./env";
import { generateRoutes } from "./routes/generate";
import { imageRoutes } from "./routes/images";
import { projectRoutes } from "./routes/projects";
import { searchRoutes } from "./routes/search";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: CORS_ORIGINS,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  }),
);

app.get("/", (c) => c.json({ status: "ok", service: "epic-studio-api" }));

app.route("/", generateRoutes);
app.route("/", projectRoutes);
app.route("/", searchRoutes);
app.route("/", imageRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[epic-studio-api]", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
