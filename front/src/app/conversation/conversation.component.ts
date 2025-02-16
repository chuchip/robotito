import { Component, ViewChild, ElementRef } from '@angular/core';
import { ApiBackService } from '../services/api-back.service';
import { SoundService } from '../services/sound.service';
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

/**
 * Conversation component
 */
export class ConversationComponent {
  isSidebarOpen = false;
  conversationHistory:{"id":string,"user":string,"label":string,
    "name":string,"initial_time": string,"final_date":string}[]=[];
  labelContext:string=""
  isLoading=false;
  contextValue=""
  contexts:{"label":string,"context":string,"last_timestamp":string}[]=[]
  showContext=false;
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
  
  error: any;
  sw_send_audio: Boolean= false;
  sw_talk_response: Boolean= true;
  audio: HTMLAudioElement | null = null;
  selectContext:string = 'NEW';
  selectLanguage: string = 'a';
  options = [
    { label: 'American English', value: 'a' },
    { label: 'British English', value: 'b' },
    { label: 'Spanish', value: 'e' },    
  ];
  user:string=''
  constructor(private back: ApiBackService,private sound: SoundService ) {
    this.chat_history.push({line:this.number_line, type: "R",msg: this.responseMessage});
    this.number_line++
    this.back.get_last_user()
      .then(response=> response.json())
      .then((data:any) => {        
        this.user=data.user
        this.clearConversation()
        this.list_context()
        this.get_conversations_history()
        this.setContext(this.user,"NEW","") 
        })
/*    for (let n=1;n<50;n++) {

      this.chat_history.push({line:this.number_line, type: "H",
        msg: "adfaf das fasdfasdfafasd fasdfasdjkfasdfpásdfkasd asdfasdfasdf fasdfadfasdf dfadfasdf asdfasdf asdfasf asdfa dfasfd fasdf "});    
      this.number_line++    
    }*/
  }

  async toggleRecording() {
    if (this.isRecording) {     
      this.audio_to_text= await this.sound.stopRecording();      
      if (this.sw_send_audio)
      {
        this.inputText=this.audio_to_text
        this.sendData()
      }
      else{
        this.recordElement.nativeElement.focus();   
      }
    } else {
      // Start recording
      this.audio_to_text="Recording audio ...."
      this.showRecord=true
      this.stopAudio()
      this.sound.startRecording();
      this.inputElement.nativeElement.focus();   
    }
    this.isRecording = !this.isRecording;
  }
  async sendData() {
    this.showRecord=false
    
    if (this.inputText.trim()!='') {
      this.chat_history.push({line:this.number_line, type: "H",msg: this.inputText.trim()})
      this.isLoading=true
      this.responseMessage= await this.back.sendMsg(this.inputText.trim());
      //responseMessage= await marked(this.responseMessage)
      this.isLoading=false
      this.number_line++
      this.chat_history.push({line:this.number_line,type: "R",msg: this.responseMessage})
      this.number_line++
      const numWords=this.responseMessage.split(" ").length
      if (this.sw_talk_response && numWords <100) {
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
      const response= await this.back.text_to_sound(this.inputText.trim());
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
    this.isLoading=true
    const response= await this.back.change_language(this.selectContext);    
    this.put_message(response)   
    this.isLoading=false
  }

  async speak_aloud_response(i:number){  
      const response = await this.back.text_to_sound(this.chat_history[i].msg);
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
  copy_to_input(text:string)
  {
    this.inputText=text
    this.focus_input()
  }
  focus_input()
  {
    this.showRecord=false
    setTimeout(() => {
      this.inputElement.nativeElement.focus();   
    },100)
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
    const response=await this.back.clear_conversation();
    this.put_message(response)
  }

  // Context functions
  setVisibleContext()
  {
    this.showContext=true    
    setTimeout(() => {
      this.contextElement.nativeElement.focus();
    }, 200);
   
  }
  async onChangeContext(event:any) {
    const textArea = event.target as HTMLTextAreaElement;
    const label = textArea.value;
    this.setTextContext(label)    
    this.contextElement.nativeElement.focus();   
  }

  setTextContext(label:string)  {   
    this.labelContext=label=='NEW'?"":label;    
    for (const c of  this.contexts)
    {
      if (c['label']==label)
      {
        this.contextValue=c['context']
      }
    }
  }
  async list_context()
  {
    const response= await this.back.context_get(this.user);
    this.contexts=response.contexts
    const value={"label":"NEW","context":"","last_timestamp":""}
    this.contexts.splice(0,0,value)
  }
  async context_delete(label:string)
  {
    this.isLoading=true
    const response= await this.back.context_delete(this.user,this.selectContext);    
    this.list_context()
    this.isLoading=false
    this.put_message(response)
    this.contextValue=""
    this.labelContext=""
  }
  async context_send(event:any)    {
    const textArea = event.target as HTMLTextAreaElement;
    this.contextValue = textArea.value;
  
    if (this.contextValue) {
      this.showContext=false
      this.isLoading=true
      const response=await this.setContext(this.user,this.labelContext,
                this.contextValue);
      this.list_context()
      this.selectContext=this.labelContext
      this.isLoading=false
      this.put_message(response)
    }
  }
  async setContext(user:string,labelContext:string, contextValue:string)
  {
    return await this.back.context_send(user,labelContext,contextValue);
  }
  


  async toggleSidebar() {
    if (! this.isSidebarOpen)
    {
      this.get_conversations_history()
    }
    this.isSidebarOpen = !this.isSidebarOpen;
  }
  async get_conversations_history()
  {
    const response=await this.back.conversation_user(this.user);
    this.conversationHistory=response.conversations;    
  }
  
  async history_choose(id:string,context:string)
  {    
    this.isLoading=true
    const response=await this.back.conversation_by_id(id);
    this.labelContext=context;   
    this.selectContext=context
    this.setTextContext(context)
    const response_context=await this.setContext(this.user,this.labelContext,this.contextValue)      
    this.context_send(this.labelContext)
    this.chat_history.length=0
    var i=0;  
    for (const c of response.conversation)
    {
      this.chat_history.push(
        {"line": i,"type": c.type,"msg": c.msg}        
      )
      i+=1
    }    
    this.number_line=i
    this.isLoading=false
  }
  async history_delete(id: string)
  {
    this.isLoading=true
    const response=await this.back.conversation_delete_by_id(id);
    const msg=await response.json()
    this.put_message(msg)
    this.isLoading=false
  }
  getFormattedDate(dateString: string): Date {
    return new Date(dateString);
  }  
}
