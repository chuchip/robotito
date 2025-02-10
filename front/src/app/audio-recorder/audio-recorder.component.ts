import { Component } from '@angular/core';
import { AudioRecorderService } from '../services/audio-recorder.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LinebreaksPipe } from '../linebreaks.pipe';
@Component({
  selector: 'app-record',
  imports: [CommonModule, FormsModule,LinebreaksPipe], // 
  templateUrl: './audio-recorder.component.html',
  styleUrls: ['./audio-recorder.component.scss']
})
export class RecordComponent {
  
  chat_history:{line: number,type: string,msg: string}[]=[]
  number_line:number=0
  audio_to_text:string=""
  responseMessage:string="Hello, I'm robotito. Do you want to talk?"
  isRecording = false;
  inputText: string = '';
  response: any;
  error: any;
  sw_send_audio: Boolean= false;
  sw_talk_response: Boolean= false;
  audio: HTMLAudioElement | null = null;
  selectedValue: string = 'a';
  options = [
    { label: 'American English', value: 'a' },
    { label: 'British English', value: 'b' },
    { label: 'Spanish', value: 'e' },    
  ];
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
      this.chat_history.push({line:this.number_line, type: "H",msg: this.inputText.trim()})
      this.responseMessage= await this.audioRecorderService.sendMsg(this.inputText.trim());
      this.number_line++
      this.chat_history.push({line:this.number_line,type: "R",msg: this.responseMessage})
      this.number_line++
      if (this.sw_talk_response) {
        this.speak_aloud_response(this.number_line-1)
      }

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

  async onChangeLanguage() {
    const response= await this.audioRecorderService.change_language(this.selectedValue);
  }
  async speak_aloud_response(i:number){  
      const response = await this.audioRecorderService.text_to_sound(this.chat_history[i].msg);
      this.prepareAudio(response)
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
