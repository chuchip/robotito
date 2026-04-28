import { Injectable } from '@angular/core';

/**
 * Plays raw PCM16 audio chunks gaplessly via the Web Audio API.
 *
 * The backend `/api/audio/tts/stream` endpoint returns little-endian int16 PCM
 * at a fixed sample rate (24 kHz mono for vibevoice). This service decodes
 * each incoming `Uint8Array` chunk to `Float32Array` and schedules it on a
 * single shared `AudioContext` so consecutive chunks line up sample-accurately
 * with no perceivable gap.
 *
 * The service is also concurrency-aware via `enqueueStream(...)`: when a turn
 * produces several text chunks, every chunk's stream is consumed in dispatch
 * order and only starts producing audible samples after the previous one
 * finishes. That gives the right perceived "gapless turn" behaviour even when
 * the upstream LLM emits chunks faster than the model can synthesize them.
 */
@Injectable()
export class StreamingTtsService {
  private static readonly SAMPLE_RATE = 24000;
  private static readonly INT16_BYTES = 2;
  private static readonly INT16_SCALE = 1 / 32768;

  private ctx: AudioContext | null = null;
  /** Absolute AudioContext time at which the next buffer should start. */
  private nextStartTime = 0;
  /** Sources that have been scheduled and may still be playing. */
  private liveSources: AudioBufferSourceNode[] = [];

  /**
   * Tail Promise of the current "play this stream after the previous one" chain.
   * `enqueueStream` appends to this so callers don't have to coordinate
   * themselves.
   */
  private chainTail: Promise<void> = Promise.resolve();

  /** Token bumped on every stop() so in-flight readers know to bail out. */
  private cancelToken = 0;
  /** Externally observable: true while there is audio queued or playing. */
  isPlaying = false;
  /** Notifier callbacks invoked when the queue fully drains (used by ttsWait). */
  private drainListeners: (() => void)[] = [];

  /**
   * Append a backend stream to the playback queue. Returns a promise that
   * resolves once every PCM byte from this stream has been *scheduled*, i.e.
   * audio for this chunk is queued to play (or already playing).
   *
   * Audio for stream N only starts after stream N-1's samples have all been
   * scheduled, so callers can fire several streams concurrently and the
   * playback order matches the dispatch order.
   */
  async enqueueStream(response: Response): Promise<void> {
    const myToken = this.cancelToken;
    const previous = this.chainTail;
    let resolveDone!: () => void;
    let rejectDone!: (err: any) => void;
    const done = new Promise<void>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });
    this.chainTail = done.catch(() => undefined);

    try {
      await previous;
      if (myToken !== this.cancelToken) {
        resolveDone();
        return;
      }
      await this.consumeStream(response, myToken);
      resolveDone();
    } catch (err) {
      rejectDone(err);
      throw err;
    }
  }

  /**
   * Drain the underlying Response body, batching incoming bytes into PCM16
   * audio buffers and scheduling each one immediately.
   */
  private async consumeStream(response: Response, token: number): Promise<void> {
    if (!response.ok || !response.body) {
      throw new Error(`TTS stream response not OK (${response.status})`);
    }
    const ctx = this.ensureContext();
    const reader = response.body.getReader();

    // Carry over an odd byte across reads (PCM16 samples are 2 bytes each).
    let pending: Uint8Array | null = null;

    try {
      while (true) {
        if (token !== this.cancelToken) {
          await reader.cancel().catch(() => undefined);
          break;
        }
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;

        let bytes: Uint8Array = value;
        if (pending) {
          const merged = new Uint8Array(pending.byteLength + bytes.byteLength);
          merged.set(pending, 0);
          merged.set(bytes, pending.byteLength);
          bytes = merged;
          pending = null;
        }
        const usable = bytes.byteLength - (bytes.byteLength % StreamingTtsService.INT16_BYTES);
        if (usable < bytes.byteLength) {
          pending = bytes.subarray(usable);
        }
        if (usable === 0) continue;

        const float = this.pcm16ToFloat32(bytes, usable);
        this.scheduleBuffer(ctx, float);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* already released */ }
    }
  }

  /** Convert a slice of int16 LE bytes to Float32 samples in [-1, 1]. */
  private pcm16ToFloat32(bytes: Uint8Array, usableBytes: number): Float32Array {
    // Avoid issues with non-zero byteOffset by copying into a fresh ArrayBuffer.
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usableBytes);
    const i16 = new Int16Array(ab);
    const out = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) {
      out[i] = i16[i] * StreamingTtsService.INT16_SCALE;
    }
    return out;
  }

  /** Schedule one Float32 chunk to play right after the previous scheduled chunk. */
  private scheduleBuffer(ctx: AudioContext, samples: Float32Array): void {
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, StreamingTtsService.SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.isPlaying = true;
    this.liveSources.push(source);
    source.onended = () => {
      const idx = this.liveSources.indexOf(source);
      if (idx >= 0) this.liveSources.splice(idx, 1);
      if (this.liveSources.length === 0 && ctx.currentTime >= this.nextStartTime - 0.01) {
        this.isPlaying = false;
        this.notifyDrain();
      }
    };
  }

  /** Resolves once nothing is queued/playing (or immediately if idle). */
  whenDrained(): Promise<void> {
    if (!this.isPlaying) return Promise.resolve();
    return new Promise<void>(resolve => this.drainListeners.push(resolve));
  }

  private notifyDrain() {
    const listeners = this.drainListeners.splice(0);
    for (const cb of listeners) {
      try { cb(); } catch { /* noop */ }
    }
  }

  /** Cancel all queued/playing audio immediately (called on ESC / new turn). */
  stop(): void {
    this.cancelToken++;
    this.chainTail = Promise.resolve();
    for (const src of this.liveSources.splice(0)) {
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* noop */ }
    }
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }
    this.isPlaying = false;
    this.notifyDrain();
  }

  /** Lazily create the AudioContext on first user interaction. */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor({ sampleRate: StreamingTtsService.SAMPLE_RATE });
      this.nextStartTime = this.ctx.currentTime;
    } else if (this.ctx.state === 'suspended') {
      // No await: resuming returns a promise but scheduling still works.
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }
}
