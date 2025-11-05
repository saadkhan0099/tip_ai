// src/bindings.ts
export type Bindings = {
  ELEVENLABS_API_KEY: string;
  CIRCLE_API_KEY?: string;
  CIRCLE_WALLET_ID?: string;
  CIRCLE_ENTITY_SECRET?: string;
  ARC_USDC_TOKEN_ADDRESS?: string;
  RECIPIENT_MAP?: string; // JSON string, e.g. {"@CoolStreamer":"0xabc...","default_recipient":"0x..."}
  EVENT_LOG_URL?: string;
  // The AI binding name in wrangler.jsonc is "AI"
  AI?: any;
};
