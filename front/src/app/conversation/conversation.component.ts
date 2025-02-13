import { Component, ViewChild, ElementRef } from '@angular/core';
import { AudioRecorderService } from '../services/audio-recorder.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { marked } from 'marked';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-conversation',   
  imports: [CommonModule, MatTooltipModule, MatCheckboxModule,FormsModule,
     MatButtonModule, MatIconModule, // Required for Angular Material animations
    MatProgressSpinnerModule], // 
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.scss']
})
export class ConversationComponent {
  isLoading=false;
  contextValue=""
  contexts:[]=[]
  @ViewChild('inputField') inputElement!: ElementRef;
  @ViewChild('context') contextElement!: ElementRef;
  @ViewChild('conversation') conversationElement!: ElementRef;
  @ViewChild('record_text') recordElement!: ElementRef;

  response_back: string=""
  chat_history:{line: number,type: string,msg: string}[]=[]
  number_line:number=0
  audio_to_text:string=""
  responseMessage:string="Hello, I'm robotito. Do you want to talk?"
  isRecording = false;
  inputText: string = '';
  showRecord=false;
  showContext=false;
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
  user:string=''
  constructor(private audioRecorderService: AudioRecorderService) {
    this.chat_history.push({line:this.number_line, type: "R",msg: this.responseMessage});
    this.number_line++
    this.audioRecorderService.get_last_user()
      .then(response=> response.json())
      .then((data:any) => {        
        this.user=data.user
        this.list_context()})
/*    for (let n=1;n<50;n++) {

      this.chat_history.push({line:this.number_line, type: "H",
        msg: "adfaf das fasdfasdfafasd fasdfasdjkfasdfpásdfkasd asdfasdfasdf fasdfadfasdf dfadfasdf asdfasdf asdfasf asdfa dfasfd fasdf "});    
      this.number_line++    
    }*/
  }

  async toggleRecording() {
    if (this.isRecording) {     
      this.audio_to_text= await this.audioRecorderService.stopRecording();      
      if (this.sw_send_audio)
      {
        this.inputText=this.audio_to_text
        this.sendData()
      }
      else{
        this.recordElement.nativeElement.focus();   
      }
    } else {
      this.audio_to_text=""
      this.showRecord=true
      this.audioRecorderService.startRecording();
      this.inputElement.nativeElement.focus();   

    }
    this.isRecording = !this.isRecording;
  }
  async sendData() {
    this.showRecord=false
    
    if (this.inputText.trim()!='') {
      this.chat_history.push({line:this.number_line, type: "H",msg: this.inputText.trim()})
      this.isLoading=true
      this.responseMessage= await this.audioRecorderService.sendMsg(this.inputText.trim());
      //responseMessage= await marked(this.responseMessage)
      this.isLoading=false
      this.number_line++
      this.chat_history.push({line:this.number_line,type: "R",msg: this.responseMessage})
      this.number_line++
      if (this.sw_talk_response) {
        this.speak_aloud_response(this.number_line-1)
      }
      this.inputText=""
      setTimeout(() => this.scrollToBottom(), 0)
    }
  }
  toHtml(txt: string) {
    const txt1=  marked(txt);    
    return txt1
  }
  scrollToBottom() {
    if (this.conversationElement) {
      this.conversationElement.nativeElement.scrollTop = this.conversationElement.nativeElement.scrollHeight;
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
    this.put_message(response)   
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
  setVisibleContext()
  {
    this.showContext=true
    setTimeout(() => {
      this.contextElement.nativeElement.focus();
    }, 200);
   
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
    this.focus_input()
  }
  focus_input()
  {
    setTimeout(() => {
      this.inputElement.nativeElement.focus();   
    },100)
  }

  async send_context(event:any)    {
    const textArea = event.target as HTMLTextAreaElement;
    this.contextValue = textArea.value;
  
    if (this.contextValue) {
      this.showContext=false
      const response=await this.audioRecorderService.send_context(this.user,'default',this.contextValue);
      this.put_message(response)
    }
  }
  private async put_message( response:any )
  {
    const msg=await response.json()
    
    this.response_back=msg.message     
    setTimeout(() => {
      this.response_back = ''; // Clear message
    }, 3000);
  }
  async clearConversation()
  {
    this.chat_history.length=0
    this.number_line=0  
    const response=await this.audioRecorderService.clear_conversation();
    this.put_message(response)
  }
  async list_context()
  {
    const response= await this.audioRecorderService.get_contexts(this.user);
    this.contexts=response.contexts    
  }
}
