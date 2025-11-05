// src/services/llmService.ts
import type { Ai } from "@cloudflare/workers-types";

/**
 * PaymentIntent is the normalized object we expect back from the LLM or our fallback parser.
 */
export interface PaymentIntent {
  action: "send" | "unknown";
  amount: string; // numeric string, e.g., "5" or "10.00"
  currency: "USDC";
  recipient: string; // alias like @CoolStreamer or hex address
}

/**
 * System prompt (keeps output strict JSON)
 */
const systemPrompt = `You are a strict parser. Given a plain user instruction about sending money, return ONLY a single JSON object and nothing else.

Schema:
{"action":"send"|"unknown", "amount":"<numeric string or null>", "currency":"USDC"|"null", "recipient":"<alias starting with @ or hex address or empty>"}

Rules:
- Normalize currency to "USDC" where implied.
- Amount: return as numeric string without commas or symbols (e.g. "10", "5.50"). If you cannot find an amount, set "amount":"null".
- recipient: return the alias exactly (e.g., "@CoolStreamer") or a hex address (0x...). If not present, set to empty string "".
- If ambiguous or you can't confidently parse, set action to "unknown".
`;

/**
 * Attempts to parse AI output. Supports different ai.run shapes.
 */
function extractTextFromAiResponse(aiResp: any): string | null {
  if (!aiResp) return null;
  // Cloudflare AI older shape: { response: '...' }
  if (typeof aiResp.response === "string") return aiResp.response;
  // Newer shape: { output: [{ content: '...' }, ...] }
  if (Array.isArray(aiResp.output) && aiResp.output.length > 0) {
    const first = aiResp.output[0];
    if (typeof first?.content === "string") return first.content;
    if (typeof first === "string") return first;
  }
  // Some SDKs return output_text
  if (typeof aiResp.output_text === "string") return aiResp.output_text;
  return null;
}

/**
 * Fallback regex extractor if AI returns garbage.
 * Finds first number and first @alias or 0x address.
 */
function fallbackExtract(transcription: string): PaymentIntent {
  const amountMatch = transcription.match(/([0-9]+(?:\.[0-9]+)?)/);
  const aliasMatch = transcription.match(/@[\w-]{1,64}/i);
  const hexMatch = transcription.match(/0x[a-fA-F0-9]{40}/);
  const amount = amountMatch ? amountMatch[1] : "null";
  const recipient = aliasMatch ? aliasMatch[0] : hexMatch ? hexMatch[0] : "";
  const action = /send|transfer|pay/i.test(transcription) ? "send" : "unknown";
  return {
    action: action as "send" | "unknown",
    amount: amount === "null" ? "null" : String(Number(amount)),
    currency: "USDC",
    recipient,
  };
}

/**
 * parseIntent: calls the AI if available; otherwise falls back to regex parsing.
 * - ai: the Workers AI binding (pass c.env.AI)
 * - transcription: input text from user
 */
export async function parseIntent(
  ai: Ai | undefined,
  transcription: string
): Promise<PaymentIntent> {
  if (!transcription || typeof transcription !== "string") {
    throw new Error("No transcription provided");
  }

  // If no AI binding provided, fallback immediately
  if (!ai) {
    return fallbackExtract(transcription);
  }

  try {
    const aiResponse = await ai.run?.("@cf/mistral/mistral-7b-instruct-v0.1", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcription },
      ],
      // keep the response concise
      max_output_tokens: 200,
    });

    const text = extractTextFromAiResponse(aiResponse);
    if (!text) {
      return fallbackExtract(transcription);
    }

    // Try to locate JSON in the text
    const jsonMatch = text.trim().match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        // Validate and normalize
        const action = parsed.action === "send" ? "send" : "unknown";
        const amount =
          parsed.amount && !isNaN(Number(parsed.amount))
            ? String(Number(parsed.amount))
            : "null";
        const currency = "USDC";
        const recipient = parsed.recipient ? String(parsed.recipient) : "";
        return {
          action: action as "send" | "unknown",
          amount,
          currency: "USDC",
          recipient,
        };
      } catch (e) {
        // parsing failed -> fallback below
      }
    }

    // If we couldn't parse JSON, attempt to extract JSON-like fields via regex
    return fallbackExtract(text);
  } catch (e) {
    // If AI call fails for any reason, fallback
    console.error("LLM parseIntent error:", e);
    return fallbackExtract(transcription);
  }
}
