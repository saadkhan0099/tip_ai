// src/routes/voice.ts
import type { Context } from "hono";
import { parseIntent, PaymentIntent } from "../services/llmService";
import { sendTip, PaymentResult } from "../services/paymentService";
import { transcribeAudioFile, speakResponse } from "../services/voiceService"; // <--- IMPORT
import type { Bindings } from "../bindings";

// Find a voice ID you like from the ElevenLabs website.
const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Example: "Rachel"

export default async (c: Context<{ Bindings: Bindings }>) => {
  let transcription = "";
  let intent: PaymentIntent;

  try {
    // 1. GET AUDIO FROM REQUEST
    // The client must send FormData with an "audio" field
    const body = await c.req.formData();
    const audioFile = body.get("audio");

    // Allow a "text" fallback for easy testing with curl
    const textFallback = body.get("text");

    if (audioFile instanceof File) {
      // --- AUDIO PATH ---
      // 2. TRANSCRIBE (Speech-to-Text)
      transcription = await transcribeAudioFile(audioFile, c.env);
    } else if (typeof textFallback === "string") {
      // --- TEXT FALLBACK PATH ---
      transcription = textFallback;
    } else {
      throw new Error("Missing 'audio' file or 'text' field in FormData");
    }

    // 3. PARSE INTENT (LLM)
    const aiBinding = c.env.AI;
    intent = await parseIntent(aiBinding, transcription);

    // Validate the intent
    if (
      !intent ||
      intent.action !== "send" ||
      !intent.amount ||
      intent.currency !== "USDC" ||
      !intent.recipient
    ) {
      // We will generate audio for this error message below
      throw new Error("Sorry, I could not understand the payment intent.");
    }

    // 4. EXECUTE PAYMENT
    const userId = body.get("userId")?.toString() || "anonymous";
    const traceId = body.get("traceId")?.toString() || undefined;

    const result: PaymentResult = await sendTip(
      intent.amount,
      intent.currency,
      intent.recipient,
      c.env,
      { userId, traceId }
    );

    // 5. GENERATE SUCCESS RESPONSE (Text-to-Speech)
    let message = "";
    if (result.success) {
      message = `Sent ${intent.amount} ${intent.currency} to ${intent.recipient}`;
    } else {
      // We will generate audio for this error message below
      throw new Error(result.error || "Payment failed");
    }

    const audioResponse = await speakResponse(
      message,
      ELEVENLABS_VOICE_ID,
      c.env
    );

    return new Response(audioResponse, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err: any) {
    // 5b. GENERATE ERROR RESPONSE (Text-to-Speech)
    console.error("Voice route error:", err);
    const errorMessage =
      err.message === "unknown_recipient"
        ? "Sorry, I don't know that recipient."
        : err.message || "An unknown error occurred";

    const audioResponse = await speakResponse(
      errorMessage,
      ELEVENLABS_VOICE_ID,
      c.env
    );

    return new Response(audioResponse, {
      status: 500,
      headers: { "Content-Type": "audio/mpeg" },
    });
  }
};
