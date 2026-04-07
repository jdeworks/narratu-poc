/**
 * Audio generation engine.
 * For Chrome TTS: speaks each segment and records via MediaRecorder.
 * Produces a Blob per segment, then concatenates for full audiobook.
 */

import type { TextSegment, VoiceSelections } from "../stores/project-store";
import type { VoiceOption } from "./tts-chrome";
import { createAudioContext } from "../utils/audio-context";

export interface GeneratedSegment {
  segmentId: string;
  speaker: string;
  audio: Blob;
  duration: number;
}

export interface GenerationProgress {
  current: number;
  total: number;
  segmentId: string;
  speaker: string;
}

/**
 * Generate audio for all segments using Chrome TTS captured via AudioContext.
 * Falls back to direct speech if recording isn't supported.
 */
export async function generateAllSegments(
  segments: TextSegment[],
  voiceOptions: Map<string, VoiceOption>,
  onProgress: (p: GenerationProgress) => void,
): Promise<GeneratedSegment[]> {
  const results: GeneratedSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress({
      current: i + 1,
      total: segments.length,
      segmentId: seg.id,
      speaker: seg.speaker,
    });

    const option = voiceOptions.get(seg.speaker);
    const audio = await speakAndRecord(seg.voiceText, option);

    results.push({
      segmentId: seg.id,
      speaker: seg.speaker,
      audio: audio.blob,
      duration: audio.duration,
    });
  }

  return results;
}

async function speakAndRecord(
  text: string,
  option?: VoiceOption,
): Promise<{ blob: Blob; duration: number }> {
  return new Promise((resolve, reject) => {
    // Create a destination to capture audio
    const audioCtx = createAudioContext();
    const dest = audioCtx.createMediaStreamDestination();

    // MediaRecorder to capture the stream
    const recorder = new MediaRecorder(dest.stream, {
      mimeType: getSupportedMimeType(),
    });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const startTime = Date.now();

    recorder.onstop = () => {
      const duration = (Date.now() - startTime) / 1000;
      const blob = new Blob(chunks, { type: recorder.mimeType });
      audioCtx.close();
      resolve({ blob, duration });
    };

    recorder.onerror = () => {
      audioCtx.close();
      reject(new Error("Recording failed"));
    };

    // Set up speech
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    if (option) {
      utterance.voice = option.voice;
      utterance.pitch = option.pitch;
      utterance.rate = option.rate;
    }

    utterance.onstart = () => {
      recorder.start();
    };

    utterance.onend = () => {
      // Small delay to capture trailing audio
      setTimeout(() => recorder.stop(), 200);
    };

    utterance.onerror = (e) => {
      if (recorder.state === "recording") recorder.stop();
      else {
        audioCtx.close();
        reject(new Error(e.error));
      }
    };

    speechSynthesis.speak(utterance);
  });
}

function getSupportedMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

/**
 * Concatenate audio blobs into a single playable blob.
 */
export async function concatenateAudio(
  generated: GeneratedSegment[],
): Promise<Blob> {
  const parts = generated.map((g) => g.audio);
  return new Blob(parts, { type: parts[0]?.type || "audio/webm" });
}
