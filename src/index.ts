// src/index.ts
import { Hono } from "hono";
import voiceRoute from "./routes/voice";
import healthRoute from "./routes/health";
import type { Bindings } from "./bindings";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("Voice Micropayment Agent is running."));
// route handlers accept Context and return Response-like
app.get("/health", healthRoute);
app.post("/voice", voiceRoute);

export default app;
