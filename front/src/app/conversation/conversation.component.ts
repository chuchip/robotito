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
import { MatSliderModule } from '@angular/material/slider';
import { PersistenceService } from '../services/persistence.service';
@Component({  
  selector: 'app-conversation',   
  imports: [CommonModule, MatTooltipModule, MatCheckboxModule,FormsModule,
     MatButtonModule, MatIconModule, 
    MatProgressSpinnerModule,MatSliderModule], // 
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.scss']
})

/**
 * Conversation component
 */
export class ConversationComponent {
  xPos = 0
  yPos =0
  textSpeakAloud=""
  responseTextToSound: Response | null = null;
  audioUrl = '';
  playbackSpeed=1
  semaphoreStopAudio:number=0
  private readonly backendUrl = 'http://localhost:5000'; 
  ttsArray:Response[]=[]
  ttsStart=false
  isSidebarOpen = false;
  isSoundLoading=false
  clicksWindow=0;
  conversationHistory:{"id":string,"user":string,"label":string,
    "name":string,"initial_time": string,"final_date":string}[]=[];
  conversationId=""
  labelContext:string=""
  isLoading=false;
  contextValue=""
  contexts:{"label":string,"context":string,"last_timestamp":string}[]=[]
  
  @ViewChild('input') divInputElement!: ElementRef;
  @ViewChild('human_input') inputElement!: ElementRef;
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

  constructor(public back: ApiBackService,private sound: SoundService,public persistence: PersistenceService) {
    
    this.back.get_last_user()
      .then(response=> response.json())
      .then((data:any) => {        
        this.persistence.user=data.user
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
  }

  async toggleRecording(shiftKey:boolean=true) {    
    if (this.isRecording) {     
      this.stopRecording(this.swSendAudio,shiftKey)
    } else {
      this.startRecording(shiftKey)
    }
    this.isRecording = !this.isRecording;
  }
  changeSpeed(event: any) {
    this.playbackSpeed =event.target.value;   
  }
  async startRecording(shiftKey:boolean=false)
  {
    if (shiftKey)
      this.sttText=""
    this.isLoading=true
    this.showRecord=true
    this.stopAudio()
    this.sound.startRecording();
    setTimeout(() => this.recordElement.nativeElement.focus() , 0)
    
  }
  async stopRecording(swSendAudio:boolean,shiftKey:boolean=true)
  {
    const text= await this.sound.stopRecording();
    this.sttText=(shiftKey?"":this.sttText)+" "+ text    
    this.isLoading=false
    if (swSendAudio)
    {
      this.inputText=  this.sttText      
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
    this.sttText = '';
    this.showRecord=false
    this.inputText=this.inputText.trim()
    if (this.inputText!='') {
      this.chat_history.push({line:this.number_line, type: "H",msg: this.inputText.trim(),msgClean: this.inputText.trim()})
      this.isLoading=true
      this.responseMessage=""
      const response = await fetch(`${this.backendUrl}/send-question`, {
        method: 'POST',
        body: JSON.stringify({ text: this.inputText }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
    
      if (reader) {
        
        let pFin=0
        let pIni=0
        let txt=""
        let swStart=true
        if (!this.swTalkResponse)
        {
          swStart=false
        }
        this.ttsArray.length=0
        while (true) {          
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          this.responseMessage+= chunk;
          pFin=this.findNextPunctuation(this.responseMessage,pIni)
          if (pFin!=-1) {
            txt+=this.responseMessage.substring(pIni,pFin)
            if (txt.length>200){            
              setTimeout(() => this.scrollToBottom(), 0)  
              const cleanText=this.back.cleanText(txt)
              const response=await this.back.text_to_sound(cleanText)      
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
      const msg=await this.toHtml(this.responseMessage,"R")
      if (this.conversationId=="")
      {
        var conversation=await this.back.initConversation( this.inputText);        
        this.conversationId=conversation.id
      }
      this.back.saveConversation(this.conversationId, "H",this.inputText);      
      this.back.saveConversation(this.conversationId, "R",this.responseMessage);
      
      this.chat_history.push({line:this.number_line,type: "R",msg: msg,msgClean:this.responseMessage})
      this.responseMessage="";
      this.number_line++
      this.inputText=""
      setTimeout(() => this.scrollToBottom(), 0)
    }
  }
  async speak_aloud_response(i:number){      
    const cleanText=this.back.cleanText( this.chat_history[i].msgClean)
    let pIni=0
    let pFin=0
    let txt=""
    let swStart=true
 
    this.ttsArray.length=0
    
    while (pFin!=-1 && pFin<cleanText.length) {
    
      pFin=this.findNextPunctuation(cleanText,pIni)
      if (pFin!=-1) {
        txt+=cleanText.substring(pIni,pFin)
        if (txt.length>150){                      
          const response=await this.back.text_to_sound(txt)      
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
      txt+=cleanText.substring(pIni)
      if (txt.length>0) {        
        const response=await this.back.text_to_sound(txt)      
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
  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  async ttsWait()
  { 
    this.semaphoreStopAudio++
    while (this.semaphoreStopAudio>1)
    {
      await this.sleep(100)
    }     
    let i=0;
   // console.log("in ttsWait---------------------------")    
    while (this.semaphoreStopAudio==1){

      const response=this.ttsArray[i];
      while (this.audio!=null && i>0 && !this.audio.paused && this.semaphoreStopAudio==1)
      {                         
        await this.sleep(100)
      }
      console.log(`prepare Audio ${i}:`)
      if (this.semaphoreStopAudio!=1)
      {
        console.log("Stopped Audio")        
        break;
      }
      await this.prepareAudio(response)
      i++     
      while (this.ttsStart && this.ttsArray.length<=i && this.semaphoreStopAudio==1)
      {
        await this.sleep(200)
      }
      if (i>=this.ttsArray.length && !this.ttsStart)  {        
        break;
      }
    }
    this.semaphoreStopAudio--
    if (this.semaphoreStopAudio<0) {
      this.semaphoreStopAudio=0
    }
    console.log("out ttsWait---------------------------")
  }
  findNextPunctuation(text: string, startIndex: number): number {
    const p=text.indexOf('\n',startIndex)
   // console.log("Find carriage return: ",p)
    return p;
    /*const substring = text.substring(startIndex);
    const match = substring.match(/[.,:?!]/);
  
    return match ? startIndex + match.index! : -1;*/
  }

  toHtml(txt: string,type:string=""){
    if (type!="R")
    {
      return "<p>"+txt.replace(/\n/g, '<br>')+"</p>";
    }
    const txt1=   marked(txt);    
    return txt1
  }
  scrollToBottom() {
    if (this.conversationElement) {
      this.conversationElement.nativeElement.scrollTop = this.conversationElement.nativeElement.scrollHeight;
    }
  }
  async speak_aloud(inputText:string){    
    this.stopAudio()
    this.showSoundLoading()
    if (inputText.trim()!='') {
      
      if (this.textSpeakAloud!=inputText ) {
        this.textSpeakAloud=inputText
        this.responseTextToSound= await this.back.text_to_sound(this.back.cleanText(inputText));
        this.isSoundLoading=false
      }  
      else{
        if (this.audio) {
          this.audio.playbackRate = this.playbackSpeed;                 
          this.audio.pause();
          this.audio.currentTime = 0; 
          this.audio.playbackRate = this.playbackSpeed;       
          this.audio.play(); 
          this.isSoundLoading=false
          return
        }
      }
      this.prepareAudio(this.responseTextToSound!)     
    }
  }

  async prepareAudio(response:Response) {
    
    if (!response.ok) {
      console.error('Error fetching audio:', response.statusText);
    }
  
    const audioBlob = await response.blob();
    this.audioUrl = URL.createObjectURL(audioBlob);   
    
     // Stop the previous audio if it’s playing
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0; // Reset to the beginning
    }

    this.audio = new Audio(this.audioUrl);
    this.audio.playbackRate = this.playbackSpeed; 
    this.isSoundLoading=false    
    this.audio.play();     
  }
  showSoundLoading()
  {    
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.xPos = rect.left;
        this.yPos = rect.top;
    }
    this.isSoundLoading=true  
  }
  stopAudio(): void {
    if (this.semaphoreStopAudio>0)
      this.semaphoreStopAudio=-1
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  focus_input()
  {
    this.isRecording=false
    this.isLoading=false
    this.showRecord=false
    setTimeout(() => {
      this.inputElement.nativeElement.focus();   
    },100)
  }

  private async put_message( response:any )
  {
    if (!response.ok) {
      return
    }
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
    this.conversationId=""
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
    if (!textArea)
      return;
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
    this.conversationId=id
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

  speakOnF4(event: KeyboardEvent, text: string) {      
      if (event.key === 'F4') { 
        this.textSpeakAloud=""
        event.preventDefault(); // Prevent default behavior if needed        
        this.speak_aloud(text);
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
    const activeElement = document.activeElement as HTMLElement;
 
    if (event.key === 'F2') {           
      event.preventDefault(); 
      this.toggleRecording(event.shiftKey)
    }    
    if (event.key === 'F4'  && activeElement.tagName !== 'TEXTAREA') {      
      event.preventDefault(); 
      // this.textSpeakAloud=""
      if (this.selectedText.trim()!='')
        this.speak_aloud(this.selectedText);
    }    
    if (event.key === 'Escape') {
      this.stopAudio()
    }
  }
  adjustHeight(textArea: HTMLTextAreaElement) {
    textArea.style.height = 'auto'; // Reset height
    textArea.style.height = textArea.scrollHeight + 'px'; // Set new height
    this.divInputElement.nativeElement.style.height = (textArea.scrollHeight + 20) + 'px'; // Set new height
  }
  selectedText: string = '';
  getSelectedText() {
    const selection = window.getSelection();
    this.selectedText = selection ? selection.toString().trim() : '';
  }
}
