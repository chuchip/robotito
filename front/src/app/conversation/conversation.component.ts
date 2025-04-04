import { Component, ViewChild,HostListener, ElementRef } from '@angular/core';
import { SoundIndicatorComponent } from '../sound-indicator/sound-indicator.component';
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
import { MatSliderModule } from '@angular/material/slider';
import { PersistenceService } from '../services/persistence.service';
import { contextDTO } from '../model/context.dto';
import { conversationHistoryDTO } from '../model/conversationHistory.dto';
import { Router } from '@angular/router';
@Component({  
  selector: 'app-conversation',   
  imports: [CommonModule, MatTooltipModule, MatCheckboxModule,FormsModule,
     MatButtonModule, MatIconModule, SoundIndicatorComponent,
    MatProgressSpinnerModule,MatSliderModule], // 
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.scss']
})

/**
 * Conversation component
 */
export class ConversationComponent {
  selectedText: string = '';
  pressEscape=false
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
  conversationHistory:conversationHistoryDTO[]=[];
  conversationId=""
  isLoading=false;
  context:contextDTO={id:"",label:"",text:"",remember:""}
  contexts:contextDTO[]=[]
  
  @ViewChild('input') divInputElement!: ElementRef;
  @ViewChild('human_input') inputElement!: ElementRef;
  @ViewChild('context') contextElement!: ElementRef;
  @ViewChild('conversation') conversationElement!: ElementRef;
  @ViewChild('configuration_window') configurationWinElement!: ElementRef;
  
  response_back: string=""
  chat_history:{line: number,type: string,msg: string,msgClean:string}[]=[]
  number_line:number=0

  responseMessage:string="Hello, I'm robotito. Do you want to talk?"
  inputText: string = '';
  showRecord=false
  showLanguageOptions=false
  error: any;
  modeConversation: boolean= false;
  swTalkResponse: Boolean= true;
  audio: HTMLAudioElement | null = null;
  selectContext:string = 'default';
  selectLanguage: string = 'a';
  selectLanguageDesc:string="American English"
  selectVoice: string = 'af_heart';  
  languageOptions:{label:string, value:string}[] = []
  voiceOptions:{language:string, label:string}[] = []
   
  constructor(private router: Router,public back: ApiBackService,public sound: SoundService,public persistence: PersistenceService) {
    this.isLoading=true
    if (persistence.getAuthorization()=='')
    {
       this.router.navigate(['/login']); 
       return
    }
    this.back.getLastUser()
      .then(async (data:any) => {   
        this.languageOptions=await this.back.getLanguages()
        this.voiceOptions=await this.back.getVoices()
        this.selectVoice=data.voice
        this.selectLanguage=data.language
        this.selectLanguageDesc=this.getDescriptionLanguage(this.selectLanguage)
        this.selectVoice=data.voice
       
        await this.back.changeLanguage(this.selectLanguage,this.selectVoice);
        this.clearConversation()
        await this.list_context()
        await this.getConversationsHistory()        
        if  (this.conversationHistory.length>0)
        {
          this.context.id= this.conversationHistory[0].idContext
          if (this.context.id==null)
          {
            this.setDefaultContext()            
          }
          else
          {
            this.setTextContext(this.context.label)
            await this.back.contextSet(this.context.id)
          }
        }
        else
        {
          this.setDefaultContext()
        }
        this.chat_history.push({line:this.number_line, type: "R",msg: this.responseMessage,msgClean:this.responseMessage});
        this.responseMessage=""
        this.number_line++
        this.isLoading=false
        })
  }
  async setDefaultContext()
  {
    await this.back.contextSetLabel("default")
    this.context.label= "default"
    this.setTextContext("default")
  }
  async toggleRecording(shiftKey:boolean=true) {    
    if (this.sound.isRecording) {     
      this.stopRecording(this.modeConversation,shiftKey)
    } else {
      this.startRecording(shiftKey)
    }
   
  }
  changeSpeed(event: any) {
    this.playbackSpeed =event.target.value;   
  }
  async startRecording(shiftKey:boolean=false,automatic:boolean=false)
  {
    this.xPos=60;
    this.yPos=window.innerHeight-85;
    this.isSoundLoading=true
    this.showRecord=true
    if (!automatic)
      this.stopAudio()
    this.sound.startRecording(this);
    
    setTimeout(() => this.inputElement.nativeElement.focus() , 200)    
  }

  async stopAutomaticRecording()
  {
    await this.stopRecording(this.modeConversation,true)
  }
  async stopRecording(sendAudio:boolean=this.modeConversation,automatic:boolean=false)
  {
    const text= await this.sound.stopRecording();
    this.inputText=this.inputText+" "+ text
    this.isSoundLoading=false
    if (sendAudio)
    {    
      await this.sendData()
      if (automatic)
        this.startRecording(automatic=automatic)
    }
    else{
      setTimeout(() =>  this.inputElement.nativeElement.focus() ,100)  
    }
  }
  playRecorded()
  {
    this.sound.playAudio();
  }
  

  async sendData() {
    
    this.showRecord=false
    this.inputText=this.inputText.trim()
    this.stopAudio()
    if (this.inputText!='') {
      this.chat_history.push({line:this.number_line, type: "H",msg: this.inputText.trim(),msgClean: this.inputText.trim()})
      this.isLoading=true
      this.responseMessage=""
      const response=await this.back.sendQuestion(this.inputText)
            
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
  async speakAloud(inputText:string){    
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
    if (this.audio  ) {
      this.audio.pause();
      this.audio.currentTime = 0;      
    }
    if (this.sound.audio) {
      this.sound.audio.pause();
    }    
  }

  stopRecordingEsc()
  {
    this.sound.isRecording=false
    this.isSoundLoading=false
    this.showRecord=false
    this.pressEscape=true
    setTimeout(() =>  this.inputElement.nativeElement.focus() ,100)  
  }

  private async put_message( response:any )
  {
    if (response ==null || !response.ok) {
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
    
    const response=await this.back.clearConversation();    
    this.put_message(response)
  }

  async onChangeContext(event:any,id :string) {    
    const selectElement = event.target as HTMLSelectElement;

    const selectedLabel = selectElement.options[selectElement.selectedIndex].text;
    this.context.label=selectedLabel

    this.setTextContext(selectedLabel)
    this.back.contextSet(id)
    setTimeout(() => this.contextElement.nativeElement.focus(),100)   
  }
  setTextContextById(id:string)  {
    for (const c of  this.contexts)
    {
      if (c.id==id)
      {
        this.setContext(c)
        return
      }
    }
    this.setTextContext("default")
  }
  setTextContext(label:string)  {       
    for (const c of  this.contexts)
    {
      if (c.label==label)
      {
        this.setContext(c)
        return
      }
    }
    this.setTextContext("default")
  }
  setContext(c:contextDTO)
  {
    this.context.id=c.id
    this.context.label=c.label
    this.context.text=c.text
    this.context.remember=c.remember
  }
  async list_context()
  {
    const response= await this.back.contextsUserList();    
    this.contexts=response.contexts
  }

  async contextDelete(id:string)
  {
    if (this.context.label=='default')
      return
    const response= await this.back.contextDelete(id);
    this.list_context()
    this.isLoading=false
    this.put_message(response)
    this.context.text=""
    this.context.label=""
    this.context.remember=""
  }

  async contextSend(event:any)    {
    const textArea = event.target as HTMLTextAreaElement;
    if (!textArea)
      return;
    this.context.text = textArea.value;
  
    if (this.context.text) {      
      this.isLoading=true
      const response=await this.back.contextSend(this.context);
      await this.list_context()
      this.selectContext=this.context.label
      this.isLoading=false
      this.showLanguageOptions=false
      this.put_message(response)
    }
  }
  async contextRememberSend(event:any)    {
    const textArea = event.target as HTMLTextAreaElement;
    if (!textArea)
      return;
    
    this.context.remember = textArea.value;
    this.isLoading=true
    await this.back.contextSend(this.context); 
    await this.list_context()
    this.selectContext=this.context.label
    this.isLoading=false 
    this.response_back="Changed text to remember"
    setTimeout(() => {
      this.response_back = ''; 
    }, 3000);
    
  }


  async toggleSidebar() {
    if (! this.isSidebarOpen)
    {
      this.getConversationsHistory()
    }
    this.isSidebarOpen = !this.isSidebarOpen;
  }
  async getConversationsHistory()
  {
    const response=await this.back.conversation_user();
    this.conversationHistory=response.conversations;    
  }

  async historyChoose(id:string,idContext:string)
  {    
    this.isLoading=true
    this.conversationId=id
    const response=await this.back.conversation_by_id(id);
    this.setTextContextById(idContext)
    await this.back.contextSet(this.context.id)
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
  async hystoryDelete(id: string)
  {
    this.isLoading=true
    const response=await this.back.conversation_delete_by_id(id);
    this.put_message(response)
    this.getConversationsHistory()
    
    setTimeout(() => this.clearConversation() , 200)    
    this.isLoading=false
  }
  getFormattedDate(dateString: string): Date {
    return new Date(dateString);
  }

  speakOnF4(event: KeyboardEvent, text: string) {      
      if (event.key === 'F4') { 
        this.textSpeakAloud=""
        event.preventDefault(); // Prevent default behavior if needed        
        this.speakAloud(text);
        setTimeout(() =>  this.inputElement.nativeElement.focus() ,100)  
      }
  }
  async changeLanguage() {
    if (this.selectVoice=='')
      return;
    this.isLoading=true
    const response= await this.back.changeLanguage(this.selectLanguage,this.selectVoice);    
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
    if (event.key === 'Enter' && this.sound.isRecording) {         
      event.preventDefault(); 
      this.stopRecording(true,false)
      return
    }
    if (event.key === 'F2') {           
      event.preventDefault(); 
      this.toggleRecording(event.shiftKey)
    }    
    if (event.key === 'F4'  && activeElement.tagName !== 'TEXTAREA') {      
      event.preventDefault(); 
      // this.textSpeakAloud=""
      if (this.selectedText.trim()!='')
        this.speakAloud(this.selectedText);
    }    
    if (event.key === 'Escape') {
      this.stopRecordingEsc()
      this.stopAudio()
    }
  }
  adjustHeight(textArea: HTMLTextAreaElement) {
    textArea.style.height = 'auto'; // Reset height
    textArea.style.height = textArea.scrollHeight + 'px'; // Set new height
    this.divInputElement.nativeElement.style.height = (textArea.scrollHeight + 20) + 'px'; // Set new height
  }
  
  getSelectedText() {
    const selection = window.getSelection();
    this.selectedText = selection ? selection.toString().trim() : '';
  }
  login()
  {
    this.persistence.clearLogin=true;
    this.router.navigate(['/login']); 
  }
}
