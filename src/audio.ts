// Discord voice audio is 48 kHz, stereo, 16-bit.
export const RATE = 48000;
export const BYTES_PER_SECOND = RATE * 4;

// Azure short audio wants 16 kHz mono WAV, at most 60 seconds.
const AZURE_RATE = 16000;
const MAX_SECONDS = 60;

// Downmix to mono and keep every third sample, averaged with its neighbours so
// the drop to 16 kHz doesn't alias. Returns a WAV file.
export function toAzureWav(pcm: Buffer): Buffer<ArrayBuffer> {
  const frames = Math.min(Math.floor(pcm.length / 12), AZURE_RATE * MAX_SECONDS);
  const out = Buffer.alloc(44 + frames * 2);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      const at = (i * 3 + j) * 4;
      sum += pcm.readInt16LE(at) + pcm.readInt16LE(at + 2);
    }
    out.writeInt16LE(Math.round(sum / 6), 44 + i * 2);
  }
  writeWavHeader(out, AZURE_RATE, 1);
  return out;
}

function writeWavHeader(buf: Buffer, rate: number, channels: number) {
  const dataLength = buf.length - 44;
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLength, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLength, 40);
}

// ElevenLabs gives 24 kHz mono. Double the rate with a midpoint between
// samples and copy each sample to both channels.
export function from24kMono(mono: Buffer): Buffer {
  const n = Math.floor(mono.length / 2);
  const out = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) {
    const a = mono.readInt16LE(i * 2);
    const b = i + 1 < n ? mono.readInt16LE(i * 2 + 2) : a;
    const mid = (a + b) >> 1;
    out.writeInt16LE(a, i * 8);
    out.writeInt16LE(a, i * 8 + 2);
    out.writeInt16LE(mid, i * 8 + 4);
    out.writeInt16LE(mid, i * 8 + 6);
  }
  return out;
}
