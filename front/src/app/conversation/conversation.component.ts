import { Component, ViewChild,HostListener, ElementRef } from '@angular/core';
import { SoundPlayingComponent } from '../sound-playing/sound-playing.component';
import { SoundRecordingComponent } from '../sound-recording/sound-recording.component';
import { RatingPhraseComponent } from '../rating-phrase/rating-phrase.component';
import {LoadingComponent} from "../loading/loading.component"
import { SummaryComponent } from '../summary/summary.component';
import { ApiBackService } from '../services/api-back.service';
import { SoundService } from '../services/sound.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { marked } from 'marked';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { PersistenceService } from '../services/persistence.service';
import { contextDTO } from '../model/context.dto';
import { conversationHistoryDTO } from '../model/conversationHistory.dto';
import { Router } from '@angular/router';
import { RatingPhrase } from '../model/ratingPhrase';
@Component({  
  selector: 'app-conversation',   
  imports: [CommonModule, MatTooltipModule, MatCheckboxModule, FormsModule,
    MatButtonModule, MatIconModule, SoundPlayingComponent, SoundRecordingComponent,
    MatSliderModule, LoadingComponent,SummaryComponent,RatingPhraseComponent], 
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.scss']
})

/**
 * Conversation component
 */
export class ConversationComponent {
  selectedText: string = '';
  isLoading=false;
  pressEscape=false
  xPos = 0
  yPos =0
  textSpeakAloud=""
  responseTextToSound: Response | null = null;
  audioUrl = '';
  playbackSpeed=1
  isPlayingSound=false
  semaphoreStopAudio:number=0
  private readonly backendUrl = 'http://localhost:5000'; 
  ttsArray:Response[]=[]
  ttsStart=false
  isSidebarOpen = false;
  
  clicksWindow=0;
  conversationHistory:conversationHistoryDTO[]=[];
  conversationId=""
  context:contextDTO={id:"",label:"",text:"",remember:""}
  contexts:contextDTO[]=[]
  
  @ViewChild('input') divInputElement!: ElementRef;
  @ViewChild('human_input') inputElement!: ElementRef;
  @ViewChild('context') contextElement!: ElementRef;
  @ViewChild('conversation') conversationElement!: ElementRef;
  @ViewChild('configuration_window') configurationWinElement!: ElementRef;
  @ViewChild('summary_window') summaryWinElement!: ElementRef;
  @ViewChild('rating_window') ratingWinElement!: ElementRef;

  
  responseBack: string=""
  chatHistory:{line: number,type: string,msg: string,msgClean:string}[]=[]
  ratingHistory:RatingPhrase[]=[]
  swRating=false;
  ratingPhrase: RatingPhrase | null = null; 
  numberLine:number=0
  defaultGreeting:string="Hello, I'm robotito. Do you want to talk?"
  responseMessage:string="Hello, I'm robotito. Do you want to talk?"
  inputText: string = '';
  showRecord=false
  showLanguageOptions=false
  error: any;
  modeConversation: boolean= false;
  swSaveConversation:boolean=true
  swTalkResponse: Boolean= true;
  audio: HTMLAudioElement | null = null;
  selectContext:string = 'default';
  selectLanguage: string = 'a';
  selectLanguageDesc:string="American English"
  selectVoice: string = 'af_heart';  
  languageOptions:{label:string, value:string}[] = []
  voiceOptions:{language:string, label:string,gender:string}[] = []
   
  constructor(private router: Router,public sound: SoundService,public back: ApiBackService,public persistence: PersistenceService) {
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
            this.setTextContextById(this.context.id)            
            await this.back.contextSet(this.context.id)
          }
        }
        else
        {
          this.setDefaultContext()
        }
        this.responseMessage=""
        this.isLoading=false
        })
  }
  putGreeting()
  {
    this.chatHistory.push({line:this.numberLine, type: "R",msg: this.defaultGreeting,msgClean:this.responseMessage});
  }
  
  async setDefaultContext()
  {
    await this.back.contextSetLabel("default")    
    this.setContextDefault()
  }
  async toggleRecording() {    
    if (this.sound.isRecording) {     
      this.stopRecording(this.modeConversation)
    } else {
      this.startRecording()
    }
   
  }
  changeSpeed(event: any) {
    this.playbackSpeed =event.target.value;   
  }
  async startRecording()
  {
    this.xPos=60;
    this.yPos=window.innerHeight-85;
    this.showRecord=true
/*    if (!automatic)
      this.stopAudio()*/
    if (this.modeConversation)
    {
      console.log("Chating ....")
      this.sound.chating=true
    }
    this.sound.startRecording(this);
    this.focusInputElement();  
  }

  focusInputElement() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (! /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
      setTimeout(() => this.inputElement.nativeElement.focus() , 200)    
    }
    else {
     console.log("Android or IOS")
    }
  }   
  async stopAutomaticRecording()
  {
    await this.stopRecording(true)
  }
  /**
   * 
   * @param sendLLM: Send the recorded text to the LLM
   * 
   */
  async stopRecording(sendLLM:boolean=false)
  {
    console.log("Stop recording: ",sendLLM)
    this.isLoading=true
    const text= await this.sound.stopRecording();
    this.isLoading=false
    this.inputText=this.inputText+" "+ text
    
    if (sendLLM) {    
      await this.sendData()
      if (this.sound.chating) {
        this.startRecording()
      }
    }
    else {
      this.focusInputElement( )
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
      this.chatHistory.push({line:this.numberLine, type: "H",msg: this.inputText.trim(),msgClean: this.inputText.trim()})
      this.getRatingTeacher(this.numberLine,this.inputText.trim())
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
      this.numberLine++
      const msg=await this.toHtml(this.responseMessage,"R")
      if (this.conversationId=="")
      {
        var conversation=await this.back.initConversation( this.inputText);        
        this.conversationId=conversation.id
      }
      if (this.swSaveConversation) 
      {
        this.back.saveConversation(this.conversationId, "H",this.inputText);      
        this.back.saveConversation(this.conversationId, "R",this.responseMessage);
      }  
      this.chatHistory.push({line:this.numberLine,type: "R",msg: msg,msgClean:this.responseMessage})
      this.responseMessage="";
      this.numberLine++
      this.inputText=""
      setTimeout(() => this.scrollToBottom(), 0)
    }
  }
  async speak_aloud_response(event:MouseEvent,i:number){
    if (this.selectedText.trim()!='')
    {
      this.speakAloud(this.selectedText);
      return;
    }
    const cleanText=this.back.cleanText( this.chatHistory[i].msgClean)
    this.xPos=event.clientX
    this.yPos=event.clientY
    let pIni=0;
    let pFin=0
    let txt=""
    let swStart=true
    this.isPlayingSound=true
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
      this.isPlayingSound=true
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
    this.isPlayingSound=false
    console.log("out ttsWait. ")
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
        console.log("1 speakAloud . playing sound false")
        this.isPlayingSound=false
      }  
      else{
        if (this.audio) {
          this.audio.playbackRate = this.playbackSpeed;                 
          this.audio.pause();
          this.audio.currentTime = 0; 
          this.audio.playbackRate = this.playbackSpeed;       
          this.audio.play(); 
          console.log("2 speakAloud . playing sound false")
          this.isPlayingSound=false
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
      console.log("Prepare audio. playing sound false")
      this.isPlayingSound=false
    }

    this.audio = new Audio(this.audioUrl);
    this.audio.playbackRate = this.playbackSpeed; 
    this.isPlayingSound=true;
    this.audio.play();
    this.audio.onended = () => {
      // Add your custom logic here
      this.isPlayingSound = false; // Example: Reset the playing state
    };
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
    this.isPlayingSound=true  
  }
  stopAudio(): void {
    if (this.sound.isRecording && ! this.sound.chating) {           
      this.sound.stopRecording()
    }
    else
    {
      if (this.semaphoreStopAudio>0)
        this.semaphoreStopAudio=-1
      if (this.audio  ) {
        console.log("stopAudio. Playing sound false ")
        this.isPlayingSound=false  
  
        this.audio.pause();
        this.audio.currentTime = 0;      
      }
      if (this.sound.audio) {
        console.log("stopAudio. Playing sound false ")
        this.isPlayingSound=false    
        this.sound.audio.pause();
      }  
    }
  }

  stopRecordingEsc()
  {
    console.log("Stop recording Esc")
    this.sound.chating=false
    this.sound.isRecording=false
    this.isPlayingSound=false
    this.showRecord=false
    this.pressEscape=true
    this.focusInputElement
  }

  private async put_message( response:any )
  {
    if (response ==null || !response.ok) {
      return
    }
    const msg=await response.json()
    
    this.responseBack=msg.message     
    setTimeout(() => {
      this.responseBack = ''; 
    }, 3000);
  }
  async clearConversation()
  {
    this.chatHistory.length=0
    this.ratingHistory.length=0
    this.numberLine=1 
    this.conversationId=""
    this.showLanguageOptions=false
    this.persistence.showSummary=false
    this.swRating=false
    this.putGreeting()
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
    this.setContextDefault()
  }
  setContextDefault() {
    this.context.label= "default"
    for (const c of  this.contexts)
    {
      if (c.id=='default')
      {
        this.setContext(c)
        return
      }
    }
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
    this.setContextDefault()
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
    this.responseBack="Changed text to remember"
    setTimeout(() => {
      this.responseBack = ''; 
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
    this.chatHistory.length=0
    this.ratingHistory.length=0
    this.putGreeting()
    var i=1;  
    for (const c of response.conversation)
    {
      this.chatHistory.push(
        {"line": i,"type": c.type,"msg": c.msg,"msgClean":c.msg}        
      )
      i+=1
    }    
    this.numberLine=i
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
        this.focusInputElement();
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
    if (this.showLanguageOptions   && !this.configurationWinElement.nativeElement.contains(event.target)) {
      this.showLanguageOptions = false;
      this.clicksWindow=0
    }
    if (this.persistence.showSummary  && !this.summaryWinElement.nativeElement.contains(event.target)) {
      this.persistence.showSummary=false
      this.clicksWindow=0
    }
    if (this.swRating  && !this.ratingWinElement.nativeElement.contains(event.target)) {
        this.swRating=false
        this.clicksWindow=0
    }
    
  }
  async pressEnter(swSendData:boolean) {
    if ( this.sound.isRecording) 
      {
        await this.stopRecording(swSendData)
        return
      }
      else {
       if (swSendData)
          this.sendData()
      }
     
  }
  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    const activeElement = document.activeElement as HTMLElement;
    if (event.key === 'Enter' && ! event.altKey  && ! event.shiftKey) {         
      console.log("Enter pressed", activeElement.id, "Alt:", event.altKey, "Shift:", event.shiftKey);
      event.preventDefault();
      this.pressEnter(activeElement.tagName === 'TEXTAREA' && activeElement.id === 'human_input');
    }
    if (event.key === 'F2') {
      if (this.modeConversation && this.sound.isRecording) {
        this.sound.chating=false
      }
      event.preventDefault();
      this.toggleRecording()
    }    
    if (event.key === 'F4'  && activeElement.tagName !== 'TEXTAREA') {      
      event.preventDefault(); 
      // this.textSpeakAloud=""
      if (this.selectedText.trim()!='')
        this.speakAloud(this.selectedText);
    }    
    if (event.key === 'Escape') {
      this.pressEsc()
    }
  }
  pressEsc() {
    this.stopRecordingEsc()
    this.stopAudio()
  }
  adjustHeight(textArea: HTMLTextAreaElement) {
    textArea.style.height = 'auto'; // Reset height
    textArea.style.height = (textArea.scrollHeight+20) + 'px'; // Set new height
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
  async sumary_conversation()
  {
    this.clicksWindow=0
    this.persistence.showSummary=true         
  }

  getBackgroundColor(posHistory:number): string {
    const pos =this.getLineRating(posHistory)
    
    if (pos<0 )
      return 'gray';
    if (this.ratingHistory[pos].value=='Good')       
        return 'green';
    else
        return 'red';
  }
  getLineRating(posHistory:number)
  {
    let i=0;
    for (const rating of this.ratingHistory)
    {
      if (rating.line==posHistory)
        return i
      i++
    }
    return -1
  }
  async getRatingTeacher(posHistory:number,phrase:string)
  {
    const rating:RatingPhrase=await this.back.ratingTeacher(phrase)
    rating.line=posHistory
    this.ratingHistory.push(rating)
  }

  async showRating(posHistory:number)
  {
    let pos =this.getLineRating(posHistory)
    
    if (pos<0 )
    {
      await this.getRatingTeacher(posHistory,this.chatHistory[posHistory].msgClean)
    }
    pos =this.getLineRating(posHistory)
    if (pos<0 )
      return    
    this.ratingPhrase=this.ratingHistory[pos]
    this.clicksWindow=0
    this.swRating=true
  }
}
