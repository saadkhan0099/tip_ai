// src/services/voiceService.ts
import type { Bindings } from "../bindings";

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

/**
 * Transcribes an audio file using ElevenLabs STT endpoint.
 * This version accepts a File/Blob and uploads it.
 */
export async function transcribeAudioFile(
  audioFile: File | Blob,
  env: Bindings
): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new Error("Missing ElevenLabs API key");

  const formData = new FormData();
  formData.append("file", audioFile, "audio.webm"); // The filename doesn't matter much
  formData.append("model_id", "eleven_multilingual_v2");

  const resp = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-text`, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      // "Content-Type" is set automatically by fetch when using FormData
    },
    body: formData,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ElevenLabs STT error: ${resp.status} – ${text}`);
  }
  const j = await resp.json();
  return j.text as string;
}

/**
 * Text to speech (returns ArrayBuffer of audio)
 */
export async function speakResponse(
  text: string,
  voiceId: string,
  env: Bindings
): Promise<ArrayBuffer> {
  if (!env.ELEVENLABS_API_KEY) throw new Error("Missing ElevenLabs API key");
  const resp = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ElevenLabs TTS error: ${resp.status} – ${t}`);
  }

  return await resp.arrayBuffer();
}
