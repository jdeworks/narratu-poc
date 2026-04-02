import { describe, it, expect } from "vitest";

/**
 * Test the MP3 encoding pipeline used by both exportAudiobook and exportMixerTimeline.
 * Verifies that @breezystack/lamejs produces valid MP3 output from known PCM input.
 */
describe("MP3 encoding", () => {
  /** Generate a mono sine wave as Float32Array */
  function generateSineWave(
    frequency: number,
    durationSec: number,
    sampleRate: number,
  ): Float32Array {
    const length = Math.floor(durationSec * sampleRate);
    const pcm = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      pcm[i] = Math.sin(2 * Math.PI * frequency * (i / sampleRate));
    }
    return pcm;
  }

  /** Replicate the exact encoding logic from export-audiobook.ts */
  async function encodeMp3(pcm: Float32Array, sampleRate: number): Promise<Uint8Array> {
    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const mp3enc = new Mp3Encoder(1, sampleRate, 192);

    const samples = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const chunks: Uint8Array[] = [];
    const blockSize = 1152;
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const mp3buf = mp3enc.encodeBuffer(chunk);
      if (mp3buf.length > 0) chunks.push(Uint8Array.from(mp3buf));
    }
    const tail = mp3enc.flush();
    if (tail.length > 0) chunks.push(Uint8Array.from(tail));

    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }

  it("produces non-empty MP3 from a 440Hz sine wave at 44100Hz", async () => {
    const pcm = generateSineWave(440, 1.0, 44100);
    const mp3 = await encodeMp3(pcm, 44100);

    // MP3 must have data
    expect(mp3.length).toBeGreaterThan(1000);

    // MP3 frame sync: first frame should start with 0xFF 0xFB (MPEG1 Layer3)
    // or 0xFF 0xF3 (MPEG2) — find the first sync word
    let foundSync = false;
    for (let i = 0; i < Math.min(mp3.length - 1, 512); i++) {
      if (mp3[i] === 0xff && (mp3[i + 1] & 0xe0) === 0xe0) {
        foundSync = true;
        break;
      }
    }
    expect(foundSync).toBe(true);
  });

  it("produces non-empty MP3 from a 440Hz sine wave at 48000Hz", async () => {
    const pcm = generateSineWave(440, 1.0, 48000);
    const mp3 = await encodeMp3(pcm, 48000);

    expect(mp3.length).toBeGreaterThan(1000);

    let foundSync = false;
    for (let i = 0; i < Math.min(mp3.length - 1, 512); i++) {
      if (mp3[i] === 0xff && (mp3[i + 1] & 0xe0) === 0xe0) {
        foundSync = true;
        break;
      }
    }
    expect(foundSync).toBe(true);
  });

  it("encodes silence without errors", async () => {
    const pcm = new Float32Array(44100); // 1s of silence
    const mp3 = await encodeMp3(pcm, 44100);
    expect(mp3.length).toBeGreaterThan(0);
  });

  it("handles edge case: very short input (< 1 frame)", async () => {
    const pcm = new Float32Array(100); // < 1152 samples
    pcm[50] = 0.5;
    const mp3 = await encodeMp3(pcm, 44100);
    expect(mp3.length).toBeGreaterThan(0);
  });

  it("float32-to-int16 conversion preserves signal polarity", () => {
    // Verify the conversion doesn't flip signs or introduce DC offset
    const testValues = [-1, -0.5, 0, 0.5, 1];
    const expected = [-0x8000, -0x4000, 0, 0x7fff * 0.5, 0x7fff];

    for (let i = 0; i < testValues.length; i++) {
      const s = Math.max(-1, Math.min(1, testValues[i]));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      expect(int16).toBeCloseTo(expected[i], 0);
    }
  });

  it("Int8Array to Uint8Array conversion preserves byte patterns", () => {
    // This is the conversion used in the export: Uint8Array.from(int8Array)
    // Verify negative Int8 values map to correct unsigned bytes
    const int8 = new Int8Array([-1, -128, 0, 127, 42]);
    const uint8 = Uint8Array.from(int8);

    expect(uint8[0]).toBe(255); // -1 → 255
    expect(uint8[1]).toBe(128); // -128 → 128
    expect(uint8[2]).toBe(0);   // 0 → 0
    expect(uint8[3]).toBe(127); // 127 → 127
    expect(uint8[4]).toBe(42);  // 42 → 42
  });
});
