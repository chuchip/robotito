import { Injectable } from '@angular/core';
import { ApiBackService } from './api-back.service';

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private mediaRecorder!: MediaRecorder;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private audioUrl: string | null = null; // Property to store the audio URL
  audio !: HTMLAudioElement;
  constructor(private back: ApiBackService) { }
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }

  async stopRecording(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.mediaRecorder && this.isRecording) {
        this.mediaRecorder.onstop = async () => {
          try {
            const message = await this.back.uploadAudio(this.audioChunks);
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.audioUrl = URL.createObjectURL(audioBlob); // Create an object URL for the audio
            this.audioChunks = [];
            resolve(message);
          } catch (error) {
            reject('Upload failed');
          }
        };

        this.mediaRecorder.stop();
        this.isRecording = false;
      } else {
        resolve('No active recording to stop');
      }
    });
  }
  playAudio() {
    if (this.audioUrl) {
      if (this.audio) {
        this.audio.pause();
      }
      this.audio = new Audio(this.audioUrl);

      this.audio.play();
    } else {
      console.error('No audio available to play');
    }
  }
}
