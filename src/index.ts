import { Hono } from "hono";
import voiceRoute from "./routes/voice";
import healthRoute from "./routes/health";
import type { Bindings } from "./bindings";

const app = new Hono<{ Bindings: Bindings & { ASSETS: Fetcher } }>();

app.get("/health", healthRoute);
app.post("/voice", voiceRoute);

app.get("/message", (c) => {
  return c.text("Hello from your Hono server!");
});

app.get("/*", (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
