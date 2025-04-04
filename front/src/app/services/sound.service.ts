import { Injectable } from '@angular/core';
import { ApiBackService } from './api-back.service';
import { ConversationComponent } from '../conversation/conversation.component';

@Injectable()
export class SoundService {
  private mediaRecorder!: MediaRecorder;
  private audioChunks: Blob[] = [];
  public isRecording = false;
  private audioUrl: string | null = null; // Property to store the audio URL
  audio !: HTMLAudioElement;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private silenceTimer: any;
  private readonly silenceThreshold = 0.01;
  private readonly silenceDuration = 2000; // 2 seconds of silence to stop
  conversation:ConversationComponent | null = null;

  constructor(private back: ApiBackService) { }
  async startRecording(conversation:ConversationComponent) {
    this.conversation = conversation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      if (conversation.modeConversation)
      {
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);
        this.detectSilence();
      }
      this.isRecording = true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }

  private detectSilence() {
    const bufferLength = this.analyser!.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const checkAudioLevel = () => {      
      this.analyser!.getFloatTimeDomainData(dataArray);
      const rms = Math.sqrt(dataArray.reduce((acc, val) => acc + val * val, 0) / bufferLength);
      
      if (this.conversation!=null)
      {
        if (this.conversation.pressEscape)
        {
          this.conversation.pressEscape = false;
          if (this.silenceTimer)
          {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
          return;
        }
        if (this.conversation.audio)
        {
          if ( rms > this.silenceThreshold)
          {
            console.log("Stopping audio")
            this.conversation.stopAudio()
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
            requestAnimationFrame(checkAudioLevel);
            return;
          }         
        }
        if (rms < this.silenceThreshold) {                    
          if (!this.silenceTimer) {              
            this.silenceTimer = setTimeout(() => {
              console.log('Silence detected, stopping recording');             
              this.conversation!.stopAutomaticRecording();              
            }, this.silenceDuration);
          }
        } else {          
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      }
      

      if (this.mediaRecorder?.state === 'recording') {
        requestAnimationFrame(checkAudioLevel);
      }
    };

    checkAudioLevel();
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
        this.audioContext?.close();
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
