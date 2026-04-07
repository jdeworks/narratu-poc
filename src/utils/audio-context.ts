/**
 * Safari-safe AudioContext helpers.
 *
 * Safari/iOS starts AudioContext in "suspended" state and requires a user-gesture
 * to resume it. It can also fail on decodeAudioData if the ArrayBuffer has been
 * detached (transferred). These helpers paper over both issues.
 */

/** Create an AudioContext with webkit fallback for older Safari */
export function createAudioContext(): AudioContext {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

/** Resume a suspended AudioContext (required on Safari before any playback/decode) */
export async function ensureResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") await ctx.resume();
}

/**
 * Decode audio data safely:
 *  - Copies the buffer to avoid Safari's ArrayBuffer detachment issue
 *  - Does NOT resume the context — decodeAudioData works while suspended,
 *    and calling resume() without a user gesture hangs on Safari.
 */
export async function safeDecode(ctx: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  return ctx.decodeAudioData(buffer.slice(0));
}
