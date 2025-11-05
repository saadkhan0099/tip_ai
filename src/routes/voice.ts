// src/routes/voice.ts
import type { Context } from "hono";
import { parseIntent, PaymentIntent } from "../services/llmService";
import { sendTip, PaymentResult } from "../services/paymentService";
import type { Bindings } from "../bindings";

export default async (c: Context<{ Bindings: Bindings }>) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    // Get transcription from body
    const transcription: string | undefined =
      body && (body.transcription || body.text);

    // If no text is provided, fail immediately.
    if (!transcription) {
      return c.json(
        {
          success: false,
          error: "Missing transcription or text field in request body",
        },
        400
      );
    }

    // Parse intent using the AI binding from c.env.AI
    const aiBinding = c.env.AI;
    if (!aiBinding) {
      // In dev you may not have AI binding; we can fallback to regex parsing in parseIntent
    }

    const intent: PaymentIntent = await parseIntent(aiBinding, transcription);

    // Validate the intent strictly
    if (
      !intent ||
      intent.action !== "send" ||
      !intent.amount ||
      intent.currency !== "USDC" ||
      !intent.recipient
    ) {
      return c.json(
        {
          success: false,
          error: "Could not understand payment intent",
          intent,
        },
        400
      );
    }

    // Call payment service. supply the whole env so service can read RECIPIENT_MAP, API keys etc.
    const userId = body?.userId || "anonymous"; // in prod use authenticated user id

    // The traceId MUST come from the client to ensure idempotency.
    // Do NOT generate a random one here.
    const traceId = body?.traceId || undefined;

    const result: PaymentResult = await sendTip(
      intent.amount,
      intent.currency,
      intent.recipient,
      c.env,
      { userId, traceId } // traceId will be undefined if client doesn't send
    );

    if (result.success) {
      return c.json({
        success: true,
        message: `Sent ${intent.amount} ${intent.currency} to ${intent.recipient}`,
        txId: result.txId,
        explorer: result.explorer,
      });
    } else {
      return c.json(
        {
          success: false,
          error: result.error,
          code: result.code,
          details: result.details ?? null,
        },
        500
      );
    }
  } catch (err: any) {
    console.error("Voice route error:", err);
    return c.json({ success: false, error: err?.message ?? String(err) }, 500);
  }
};

function cryptoRandomHex(len = 8) {
  // lightweight hex id for traceId
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const arr = new Uint8Array(len);
    globalThis.crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // fallback
  return Math.random()
    .toString(16)
    .slice(2, 2 + len * 2);
}
