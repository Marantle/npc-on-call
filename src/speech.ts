import { config } from "./config.ts";
import { toAzureWav, from24kMono, BYTES_PER_SECOND } from "./audio.ts";

const { azureKey, azureRegion, language } = config;

interface RecognitionResult {
  RecognitionStatus: string;
  DisplayText?: string;
}

// The free tier allows one transcription at a time, so requests wait in line.
let queue: Promise<unknown> = Promise.resolve();

export function transcribe(pcm: Buffer): Promise<string> {
  const job = queue.then(() => recognize(pcm));
  queue = job.catch(() => {});
  return job;
}

async function recognize(pcm: Buffer): Promise<string> {
  const url = `https://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=simple`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": azureKey,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    body: toAzureWav(pcm),
  });
  if (!res.ok) throw new Error(`Azure STT ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as RecognitionResult;
  return data.RecognitionStatus === "Success" ? (data.DisplayText ?? "") : "";
}

const GAP = Buffer.alloc(BYTES_PER_SECOND * 0.3);

// "{He smiles.} [cold] Welcome." The narrator reads the braces, the character
// the rest. Returns audio ready for Discord (48 kHz stereo raw PCM).
export async function synthesize(line: string, signal?: AbortSignal): Promise<Buffer> {
  const parts = line
    .split(/(\{[^}]*\})/)
    .map((s) => s.trim())
    .filter(Boolean);
  const clips = await Promise.all(
    parts.map((p) =>
      p.startsWith("{")
        ? tts(p.slice(1, -1), config.narratorVoiceId ?? config.voiceId, signal)
        : tts(p, config.voiceId, signal),
    ),
  );
  return Buffer.concat(clips.flatMap((c, i) => (i ? [GAP, c] : [c])));
}

// The Starter plan allows 3 requests at once.
const MAX_AT_ONCE = 3;
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running < MAX_AT_ONCE) running++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await job();
  } finally {
    // hand the slot straight to the next in line
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

function tts(text: string, voiceId: string, signal?: AbortSignal): Promise<Buffer> {
  return limited(async () => {
    signal?.throwIfAborted();
    // pcm_24000 because the 44.1 kHz formats need a Pro plan
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`;
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": config.elevenLabsKey, "Content-Type": "application/json" },
        // v4 turbo understands audio tags like [whispers], flash would read them out loud
        body: JSON.stringify({ text, model_id: "eleven_v4_turbo" }),
        signal,
      });
      if (res.ok) return from24kMono(Buffer.from(await res.arrayBuffer()));
      // over the plan's limit after all, give it a moment
      if (res.status === 429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    }
  });
}
