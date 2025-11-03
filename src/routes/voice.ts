import { Context } from "hono";
import { parseIntent } from "../services/llmService";
import { sendTip } from "../services/paymentService";
import { transcribeVoice, speakResponse } from "../services/voiceService";

export default async (c: Context<{ Bindings: any }>) => {
  // 👇 Add this to see if your secret is available
  console.log("My ElevenLabs Key:", c.env.ELEVENLABS_API_KEY);

  try {
    const body = await c.req.json();
    const transcription = body.transcription;

    // const transcription = await transcribeVoice(body.voiceData, c.env);

    const { amount, token, recipientUsername } = await parseIntent(
      transcription
    );

    const result = await sendTip(amount, token, recipientUsername, c.env);

    const message = result.success
      ? `Transaction Complete. ${amount} ${token} sent to ${recipientUsername}.`
      : `Error: ${result.error}`;

    // await speakResponse(message, "<voiceId>", c.env);

    return c.json({ message });
  } catch (err) {
    console.error("Voice route error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
};
