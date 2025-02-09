import { Component } from '@angular/core';
import { AudioRecorderService } from '../services/audio-recorder.service';

import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-record',
  imports: [CommonModule, FormsModule], // 
  templateUrl: './audio-recorder.component.html',
  styleUrls: ['./audio-recorder.component.css']
})
export class RecordComponent {
  audio_to_text:string=""
  responseMessage:string=""
  isRecording = false;
  inputText: string = '';
  response: any;
  error: any;
  sw_send_audio: Boolean= false;
  audio: HTMLAudioElement | null = null;
  constructor(private audioRecorderService: AudioRecorderService) {}

  async toggleRecording() {
    if (this.isRecording) {
      this.audio_to_text= await this.audioRecorderService.stopRecording();
    } else {
      this.audioRecorderService.startRecording();
    }
    this.isRecording = !this.isRecording;
  }
  async sendData() {
    if (this.inputText.trim()) {
      this.responseMessage= await this.audioRecorderService.sendMsg(this.inputText.trim());
      console.log(this.response)
    }
  }

  async speak_aloud(){
    if (this.inputText.trim()) {
      const response= await this.audioRecorderService.text_to_sound(this.inputText.trim());
      this.prepareAudio(response)
    }
  }

  async prepareAudio(response:Response) {
    if (!response.ok) {
      console.error('Error fetching audio:', response.statusText);
    }
  
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);   
    this.playAudio(audioUrl);
  }

  async speak_aloud_response(){
    if (this.responseMessage.trim()) {
      const response = await this.audioRecorderService.text_to_sound(this.responseMessage.trim());
      this.prepareAudio(response)
    }
  }
  playAudio(audioUrl: string): void {
    // Stop the previous audio if it’s playing
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0; // Reset to the beginning
    }
  
    this.audio = new Audio(audioUrl);
    this.audio.play();
  }
  
  stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }
  copy_to_input()
  {
    this.inputText=this.audio_to_text
    if (this.sw_send_audio)
      this.sendData()
  }

  send_context(event:any): void    {
    const textArea = event.target as HTMLTextAreaElement;
    const text = textArea.value;
  
    if (text) {
      this.audioRecorderService.send_context(text);
    }

  }
}
