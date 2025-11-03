type Env = {
  ELEVENLABS_API_KEY: string;
};

const ELEVENLABS_BASE = "https://api.elevenlabs.io";

export async function transcribeVoice(
  fileUrl: string,
  env: Env
): Promise<string> {
  const resp = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-text/convert`, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "scribe_v1",
      cloud_storage_url: fileUrl,
      language_code: "eng",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ElevenLabs STT error: ${resp.status} – ${text}`);
  }

  const j = await resp.json();
  return j.text as string;
}

export async function speakResponse(
  text: string,
  voiceId: string,
  env: Env
): Promise<ArrayBuffer> {
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
