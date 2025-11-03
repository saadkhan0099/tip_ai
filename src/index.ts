import { Hono } from "hono";
import voiceRoute from "./routes/voice";
import healthRoute from "./routes/health";

type Bindings = {
  CIRCLE_API_KEY: string;
  CIRCLE_WALLET_ID: string;
};

const app = new Hono();

app.get("/", (c) => c.text("Micropayment Agent is Up"));
app.get("/health", healthRoute);
app.post("/voice", voiceRoute);

export default app;
