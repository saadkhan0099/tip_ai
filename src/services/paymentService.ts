// src/services/paymentService.ts
import type { Bindings } from "../bindings";

/**
 * Worker-friendly payment service that POSTs to:
 * https://api.circle.com/v1/w3s/developer/transactions/transfer
 * (See Circle docs: developer transfer endpoint.) :contentReference[oaicite:2]{index=2}
 */

export type PaymentResult =
  | { success: true; txId: string; explorer?: string }
  | { success: false; error: string; code?: string; details?: any };

type SendOpts = { userId: string; traceId?: string };

async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle === "object") {
    const data = new TextEncoder().encode(input);
    const hash = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // fallback
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    h = (h << 5) - h + chr;
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(32, "0");
}

function resolveRecipient(recipient: string, env: Bindings): string | null {
  if (!recipient) return null;
  try {
    const raw =
      env.RECIPIENT_MAP ?? (globalThis as any).process?.env?.RECIPIENT_MAP;
    if (!raw) return null;
    const map = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (map[recipient]) return map[recipient];
    const foundKey = Object.keys(map).find(
      (k) => k.toLowerCase() === recipient.toLowerCase()
    );
    if (foundKey) return map[foundKey];
    if (!recipient && map["default_recipient"]) return map["default_recipient"];
  } catch (e) {
    console.warn("RECIPIENT_MAP parse failed:", e);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fireAndForgetLog(env: Bindings, payload: any) {
  try {
    if ((env as any).EVENT_LOG_URL) {
      await fetch((env as any).EVENT_LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ts: new Date().toISOString(), ...payload }),
      });
    } else {
      console.log(
        "LOG:",
        JSON.stringify({ ts: new Date().toISOString(), ...payload })
      );
    }
  } catch (e) {
    console.warn("log failed", e);
  }
}

export async function sendTip(
  amountStr: string,
  currency: string,
  recipientAliasOrAddress: string,
  env: Bindings,
  opts: SendOpts
): Promise<PaymentResult> {
  const amountNum = Number(amountStr);
  if (isNaN(amountNum) || amountNum <= 0)
    return { success: false, error: "invalid_amount", code: "INVALID_AMOUNT" };
  if (currency.toUpperCase() !== "USDC")
    return {
      success: false,
      error: "unsupported_currency",
      code: "UNSUPPORTED_CURRENCY",
    };

  const recipientAddress = /^0x[a-fA-F0-9]{40}$/.test(recipientAliasOrAddress)
    ? recipientAliasOrAddress
    : resolveRecipient(recipientAliasOrAddress, env);
  if (!recipientAddress)
    return {
      success: false,
      error: "unknown_recipient",
      code: "RECIPIENT_UNKNOWN",
    };

  const MAX_SINGLE = 10000;
  if (amountNum > MAX_SINGLE)
    return {
      success: false,
      error: "amount_exceeds_limit",
      code: "AMOUNT_LIMIT",
    };

  const idempotencySeed = `${
    opts.userId
  }|${recipientAddress}|${amountNum}|${currency}|${opts.traceId ?? ""}`;
  const idempotencyKey = await sha256Hex(idempotencySeed);

  // Demo mode if no Circle API key (safe for hackathon demos)
  if (!env.CIRCLE_API_KEY) {
    const fakeTxId = `demo-${idempotencyKey.slice(0, 12)}`;
    const explorer = `https://explorer.arc.network/tx/${fakeTxId}`;
    fireAndForgetLog(env, {
      event: "simulated_transfer",
      userId: opts.userId,
      recipientAddress,
      amount: amountNum,
      txId: fakeTxId,
    });
    return { success: true, txId: fakeTxId, explorer };
  }

  // Build Circle developer transfer payload (based on Circle docs). :contentReference[oaicite:3]{index=3}
  // NOTE: Circle's exact payload shape can vary by product version — adapt if your account requires extra fields.
  const payload: any = {
    idempotencyKey,
    amount: { amount: String(amountNum), currency: "USDC" },
    // You must send either walletId or walletAddress + blockchain
    // Use CIRCLE_WALLET_ID if you have a wallet ID; otherwise use walletAddress and blockchain.
    walletId: env.CIRCLE_WALLET_ID ?? undefined,
    walletAddress:
      env.CIRCLE_WALLET_ID && env.CIRCLE_WALLET_ID.startsWith("0x")
        ? env.CIRCLE_WALLET_ID
        : undefined,
    blockchain: "ARC-T",
    to: {
      address: recipientAddress,
      chain: "ARC-T",
    },
    metadata: { traceId: opts.traceId ?? "", note: "voice-micropayment" },
  };

  // If your Circle setup expects token or tokenAddress, add it:
  if ((env as any).ARC_USDC_TOKEN_ADDRESS) {
    payload.tokenAddress = (env as any).ARC_USDC_TOKEN_ADDRESS;
  }

  const CIRCLE_URL =
    "https://api.circle.com/v1/w3s/developer/transactions/transfer"; // per docs. :contentReference[oaicite:4]{index=4}
  const headers = {
    Authorization: `Bearer ${env.CIRCLE_API_KEY}`,
    "Content-Type": "application/json",
  };

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(CIRCLE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let parsed: any;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (e) {
        parsed = { raw: text };
      }

      if (!res.ok) {
        // retry on rate-limits / 5xx
        if (
          [429, 502, 503, 504].includes(res.status) &&
          attempt < MAX_RETRIES - 1
        ) {
          await sleep(2 ** attempt * 200);
          continue;
        }
        await fireAndForgetLog(env, {
          event: "circle_error",
          status: res.status,
          body: parsed,
          userId: opts.userId,
        });
        return {
          success: false,
          error: "circle_error",
          code: "CIRCLE_ERROR",
          details: parsed,
        };
      }

      // Circle success shape usually includes data.id or transactionId
      const txId =
        parsed?.data?.id ||
        parsed?.transactionId ||
        parsed?.id ||
        parsed?.transferId ||
        null;
      const explorer = txId
        ? `https://explorer.arc.network/tx/${txId}`
        : undefined;
      fireAndForgetLog(env, {
        event: "transfer_success",
        userId: opts.userId,
        txId,
        payload,
      });
      return {
        success: true,
        txId: txId ?? JSON.stringify(parsed).slice(0, 64),
        explorer,
      };
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(2 ** attempt * 200);
        continue;
      }
      await fireAndForgetLog(env, {
        event: "network_error",
        err: String(err),
        userId: opts.userId,
      });
      return {
        success: false,
        error: "network_error",
        code: "NETWORK_ERROR",
        details: String(err),
      };
    }
  }

  return { success: false, error: "unexpected_failure", code: "UNKNOWN" };
}
