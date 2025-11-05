// src/routes/health.ts
import type { Context } from "hono";

export default (c: Context) => {
  return c.json({ status: "ok" });
};
