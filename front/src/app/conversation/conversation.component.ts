import { Component, ViewChild,HostListener, ElementRef } from '@angular/core';
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
import { ChangeDetectorRef } from '@angular/core';
import { BehaviorSubject, timeout } from 'rxjs';
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
  private readonly backendUrl = 'http://localhost:5000'; 
  max_words_tts=250
  ttsArray:Response[]=[]
  ttsStart=false
  isSidebarOpen = false;
  clicksWindow=0;
  conversationHistory:{"id":string,"user":string,"label":string,
    "name":string,"initial_time": string,"final_date":string}[]=[];
  id_conversation=""
  labelContext:string=""
  isLoading=false;
  contextValue=""
  contexts:{"label":string,"context":string,"last_timestamp":string}[]=[]
  
  @ViewChild('inputField') inputElement!: ElementRef;
  @ViewChild('context') contextElement!: ElementRef;
  @ViewChild('conversation') conversationElement!: ElementRef;
  @ViewChild('record_text') recordElement!: ElementRef;
  @ViewChild('configuration_window') configurationWinElement!: ElementRef;
  
  response_back: string=""
  chat_history:{line: number,type: string,msg: string,msgClean:string}[]=[]
  number_line:number=0
  sttText:string=""
  responseMessage:string="Hello, I'm robotito. Do you want to talk?"
  isRecording = false;
  inputText: string = '';
  showRecord=false
  showLanguageOptions=false
  error: any;
  swSendAudio: boolean= false;
  swTalkResponse: Boolean= true;
  audio: HTMLAudioElement | null = null;
  selectContext:string = 'NEW';
  selectLanguage: string = 'a';
  selectLanguageDesc:string="American English"
  selectVoice: string = 'af_heart';  
  languageOptions:{label:string, value:string}[] = [
    { label: 'American English', value: 'a' },
    { label: 'British English', value: 'b' },
    { label: 'Spanish', value: 'e' },    
  ];
  voiceOptions = [
    { 'language':'a', label: '' }, 
    { 'language':'a', label: 'af_heart' }, 
    { 'language':'a', label: 'af_aoede' },    
    { 'language':'a', label: 'af_bella' },    
    { 'language':'a', label: 'af_sky' },    
    { 'language':'a', label: 'am_michael' },
    { 'language':'a', label: 'am_fenrir' },        
    { 'language':'a', label: 'af_kore' },    
    { 'language':'a', label: 'am_puck' },    
    { 'language':'b', label: '' }, 
    { 'language':'b', label: 'bf_emma' },    
    { 'language':'b', label: 'bm_george' },    
    { 'language':'b', label: 'bm_fable' },    
    { 'language':'e', label: '' }, 
    { 'language':'e', label: 'ef_dora' },    
    { 'language':'e', label: 'em_alex' },    
    { 'language':'e', label: 'em_santa' },    
  ]

  constructor(public back: ApiBackService,private sound: SoundService,private cdr: ChangeDetectorRef) {
    
    this.back.get_last_user()
      .then(response=> response.json())
      .then((data:any) => {        
        this.back.user=data.user
        this.selectVoice=data.voice
        this.selectLanguage=data.language
        this.back.change_language(this.selectLanguage,this.selectVoice);
        this.clearConversation()
        this.list_context()
        this.get_conversations_history()
        this.setContext("NEW","") 
        this.chat_history.push({line:this.number_line, type: "R",msg: this.responseMessage,msgClean:this.responseMessage});
        this.responseMessage=""
        this.number_line++
        })
/*    for (let n=1;n<50;n++) {

      this.chat_history.push({line:this.number_line, type: "H",
        msg: "adfaf das fasdfasdfafasd fasdfasdjkfasdfpásdfkasd asdfasdfasdf fasdfadfasdf dfadfasdf asdfasdf asdfasf asdfa dfasfd fasdf "});    
      this.number_line++    
    }*/
  }

  async toggleRecording() {
    if (this.isRecording) {     
      this.stopRecording(this.swSendAudio)
    } else {
      this.startRecording()
    }
    this.isRecording = !this.isRecording;
  }
  async startRecording()
  {
    this.sttText="Recording audio ...."
    this.showRecord=true
    this.stopAudio()
    this.sound.startRecording();
    setTimeout(() => this.recordElement.nativeElement.focus() , 0)
    
  }
  async stopRecording(swSendAudio:boolean)
  {
    this.sttText= await this.sound.stopRecording();      
    if (swSendAudio)
    {
      this.inputText=this.sttText
      this.sendData()
    }
    else{
      this.recordElement.nativeElement.focus();   
    }
  }
  async copySttToInput(text:string,pushEnter:boolean)
  {
    if (this.isRecording && pushEnter) 
    {
      await this.stopRecording(false)
      text=this.sttText
    }
    this.inputText=text
    this.focus_input()
    if (pushEnter) {
      this.isRecording=false
      this.sendData() 
      setTimeout(() =>  this.inputElement.nativeElement.focus(),0) 
    }
  }
  async sendData() {
    this.showRecord=false
    
    if (this.inputText.trim()!='') {
      this.chat_history.push({line:this.number_line, type: "H",msg: this.inputText.trim(),msgClean: this.inputText.trim()})
      this.isLoading=true
      this.responseMessage=""

      const response = await fetch(`${this.backendUrl}/send-question`, {
        method: 'POST',
        body: JSON.stringify({ text: this.inputText.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
    
      if (reader) {
        
        let pFin=0
        let pIni=0
        let txt=""
        let swStart=true
        this.ttsArray.length=0
        while (true) {          
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          this.responseMessage+= chunk;
          pFin=this.findNextPunctuation(this.responseMessage,pIni)
          //console.log(`pIni: ${pIni} pfin: ${pFin} len: ${this.responseMessage.length} `)
          if (pFin!=-1) {
            txt+=this.responseMessage.substring(pIni,pFin)
            if (txt.length>50){              
              const cleanText=this.back.cleanText(txt)
              const response=await this.back.text_to_sound(cleanText)      
              console.log(`Punctuaction in pos: ${pFin} ${cleanText}`)
              this.ttsArray.push(response)
              txt=""
              if (swStart)
              {
                this.ttsStart=true
                swStart=false
                this.ttsWait()         
              }
            }
            pIni=pFin+1
          }          
        }
        if (this.responseMessage.length>pFin) {              
          txt+=this.responseMessage.substring(pIni)
          const cleanText=this.back.cleanText(txt)
          if (cleanText.length>0) {
            console.log(`Final in pos: ${pFin} ${cleanText}`)
            const response=await this.back.text_to_sound(cleanText)      
            this.ttsArray.push(response)
            if (swStart)
            {
              this.ttsStart=true
              swStart=false
              this.ttsWait()         
            }
          }
        }
        this.ttsStart=false
      }
      else{
        console.log("No reader")
      }  
      this.isLoading=false
      this.number_line++
      const msg=await this.toHtml(this.responseMessage)
      if (this.id_conversation=="")
      {
        var conversation=await this.back.initConversation( this.inputText);        
        this.id_conversation=conversation.id
      }
      this.back.saveConversation(this.id_conversation, "H",this.inputText);      
      this.back.saveConversation(this.id_conversation, "R",this.responseMessage);
      
      this.chat_history.push({line:this.number_line,type: "R",msg: msg,msgClean:this.responseMessage})
      this.responseMessage="";
      this.number_line++
      
    /*  const numWords=this.responseMessage.split(" ").length
      if (this.swTalkResponse && numWords <this.max_words_tts) {
        this.speak_aloud_response(this.number_line-1) 
      }*/
      this.inputText=""
      setTimeout(() => this.scrollToBottom(), 0)
    }
  }

  async ttsWait()
  {
    let i=0;
   // console.log("in ttsWait---------------------------")
    while (true){
      const response=this.ttsArray[i];
     // console.log(`ttsWait ${i}:`)
      let endAudio=false;
      while (this.audio && !endAudio)
      {        
        this.audio.onended = () => {
          endAudio=true
        };
        if (!endAudio) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      this.prepareAudio(response)
      i++     
      while (this.ttsStart)
      {
        if (this.ttsArray.length<=i)  {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        else {
          break
        }
      }
      if (i>=this.ttsArray.length && !this.ttsStart)  {        
        break;
      }
    }
    //console.log("out ttsWait---------------------------")
  }
  findNextPunctuation(text: string, startIndex: number): number {
    const substring = text.substring(startIndex);
    const match = substring.match(/[.,:?!]/);
  
    return match ? startIndex + match.index! : -1;
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
  async speak_aloud(inputText:string){
    
    if (inputText.trim()!='') {      
      const response= await this.back.text_to_sound(this.back.cleanText(this.inputText));
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



  async speak_aloud_response(i:number){  
    const cleanText=this.back.cleanText( this.chat_history[i].msgClean)
    
    const response = await this.back.text_to_sound(cleanText);
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
      this.response_back = ''; 
    }, 3000);
  }
  async clearConversation()
  {
    this.chat_history.length=0
    this.number_line=0  
    this.id_conversation=""
    this.showLanguageOptions=false
    const response=await this.back.clear_conversation();
    this.put_message(response)
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
    const response= await this.back.context_get();
    this.contexts=response.contexts
    const value={"label":"NEW","context":"","last_timestamp":""}
    this.contexts.splice(0,0,value)
  }
  async context_delete(label:string)
  {
    this.isLoading=true
    const response= await this.back.context_delete(this.selectContext);    
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
      this.isLoading=true
      const response=await this.setContext(this.labelContext,
                this.contextValue);
      this.list_context()
      this.selectContext=this.labelContext
      this.isLoading=false
      this.showLanguageOptions=false
      this.put_message(response)
    }
  }
  async setContext(labelContext:string, contextValue:string)
  {
    return await this.back.context_send(labelContext,contextValue);
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
    const response=await this.back.conversation_user();
    this.conversationHistory=response.conversations;    
  }
  
  async history_choose(id:string,context:string)
  {    
    this.isLoading=true
    const response=await this.back.conversation_by_id(id);
    this.labelContext=context;   
    this.selectContext=context
    this.setTextContext(context)
    const response_context=await this.setContext(this.labelContext,this.contextValue)      
    this.context_send(this.labelContext)
    this.chat_history.length=0
    var i=0;  
    for (const c of response.conversation)
    {
      this.chat_history.push(
        {"line": i,"type": c.type,"msg": c.msg,"msgClean":c.msg}        
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
    this.get_conversations_history()
    this.isLoading=false
  }
  getFormattedDate(dateString: string): Date {
    return new Date(dateString);
  }  
  onKeydownInput(event: KeyboardEvent) {      
      if (event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault(); // Prevent default behavior if needed
        console.log('ALT + V pressed!');
        this.speak_aloud(this.inputText);
        this.inputElement.nativeElement.focus();   
      }      

  }
  async changeLanguage() {
    if (this.selectVoice=='')
      return;
    this.isLoading=true
    const response= await this.back.change_language(this.selectLanguage,this.selectVoice);    
    this.put_message(response)   
    this.selectLanguageDesc=this.getDescriptionLanguage((this.selectLanguage))
    this.isLoading=false
  }
  get filteredVoiceOptions() {
    return this.voiceOptions.filter(option => option.language === this.selectLanguage);
  }
  getDescriptionLanguage(language:string):string
  {
    return this.languageOptions.find(desc => desc.value === language)?.label || "";
  }
  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (this.clicksWindow==0){
      this.clicksWindow++;
      return
    }
    if (this.showLanguageOptions && !this.configurationWinElement.nativeElement.contains(event.target)) {
      this.showLanguageOptions = false;
    }
  }
  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'F2') {      
      event.preventDefault(); // Prevent default browser behavior (e.g., renaming files)
      this.toggleRecording()
      //console.log('F2 key pressed!');
    }
  }
}
