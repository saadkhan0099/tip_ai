import { Context } from "hono";

export default (c: Context) => {
  return c.json({ status: "ok" });
};
