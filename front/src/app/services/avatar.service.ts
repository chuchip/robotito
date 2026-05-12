import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AvatarService {
  private talkingSubject = new BehaviorSubject<boolean>(false);
  /** Observable that components can subscribe to in order to know whether the avatar should be "talking" */
  public readonly talking$ = this.talkingSubject.asObservable();

  /** Real-time audio volume level (0–1) derived from the playing audio */
  private volumeSubject = new BehaviorSubject<number>(0);
  public readonly volume$ = this.volumeSubject.asObservable();

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private volumeAnimFrame: number = 0;
  private connectedElement: HTMLAudioElement | null = null;

  /** Tell the avatar to start/stop talking. */
  setTalking(value: boolean) {
    this.talkingSubject.next(value);
    if (!value) {
      this.stopAnalysing();
    }
  }

  /**
   * Connect an HTMLAudioElement so its output volume drives the mouth.
   * Creates an AudioContext → MediaElementSource → AnalyserNode → destination chain.
   * Safe to call multiple times; reuses the context and rebinds the source.
   */
  connectAudio(audio: HTMLAudioElement): void {
    // Avoid double-connecting the same element
    if (audio === this.connectedElement && this.analyser) {
      this.startAnalysing();
      return;
    }

    // Disconnect previous source if any
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_) {}
      this.sourceNode = null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

    this.sourceNode = this.audioContext.createMediaElementSource(audio);
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination); // so we still hear the audio

    this.connectedElement = audio;
    this.startAnalysing();
  }

  private startAnalysing(): void {
    cancelAnimationFrame(this.volumeAnimFrame);

    const tick = () => {
      if (this.analyser) {
        this.analyser.getByteFrequencyData(this.analyserData);
        // Compute RMS-like average of frequency bins
        let sum = 0;
        for (let i = 0; i < this.analyserData.length; i++) {
          sum += this.analyserData[i];
        }
        const avg = sum / this.analyserData.length; // 0–255
        this.volumeSubject.next(avg / 255); // normalize to 0–1
      }
      this.volumeAnimFrame = requestAnimationFrame(tick);
    };
    this.volumeAnimFrame = requestAnimationFrame(tick);
  }

  private stopAnalysing(): void {
    cancelAnimationFrame(this.volumeAnimFrame);
    this.volumeSubject.next(0);
  }
}
