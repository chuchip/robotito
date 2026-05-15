import { Component, ViewChild,HostListener, ElementRef } from '@angular/core';
import { SoundPlayingComponent } from '../sound-playing/sound-playing.component';
import { SoundRecordingComponent } from '../sound-recording/sound-recording.component';
import { RatingPhraseComponent } from '../rating-phrase/rating-phrase.component';
import {LoadingComponent} from "../loading/loading.component"
import { SummaryComponent } from '../summary/summary.component';
import { AvatarComponent } from '../avatar/avatar.component';
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
import { AvatarService } from '../services/avatar.service';
import { Observable } from 'rxjs';
import { contextDTO } from '../model/context.dto';
import { conversationHistoryDTO } from '../model/conversationHistory.dto';
import { Router } from '@angular/router';
import { RatingPhrase } from '../model/ratingPhrase';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { ConversationHistoryComponent } from '../conversation-history/conversation-history.component';
import { SettingsComponent } from '../settings/settings.component';
import { SelectionMenuComponent } from '../selection-menu/selection-menu.component';
@Component({
  selector: 'app-conversation',
  imports: [CommonModule, MatTooltipModule, MatCheckboxModule, FormsModule,
    MatButtonModule, MatIconModule, SoundPlayingComponent, SoundRecordingComponent,
    MatSliderModule, LoadingComponent, SummaryComponent, RatingPhraseComponent, AvatarComponent, MatDialogModule,
    ConversationHistoryComponent, SettingsComponent, SelectionMenuComponent],
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.scss']
})

/**
 * Conversation component
 */
export class ConversationComponent {
  selectedText: string = '';
  human_voice='af_heart'  // default secondary voice; overwritten by getLastUser()
  isLoading=false;
  pressEscape=false
  xPos = 0
  yPos =0
  textSpeakAloud=""
  voiceSpeakAloud=""  // voice used for the cached `responseTextToSound`; part of the cache key
  responseTextToSound: Blob | null = null;
  audioUrl = '';
  playbackSpeed=1
  isPlayingSound=false
  semaphoreStopAudio:number=0
  avatarTalking$: Observable<boolean> = new Observable();
  private readonly backendUrl = 'http://localhost:5000';
  ttsArray:Promise<Blob>[]=[]
  ttsStart=false
  // ----- TTS dispatch throttling / cancellation -----
  // Keep at most TTS_MAX_CONCURRENT requests in flight against the backend
  // at the same time. Extra dispatches wait in ttsRequest() for a slot.
  private readonly TTS_MAX_CONCURRENT = 3
  private ttsActiveCount = 0
  // Set to true by stopAudio() (ESC) so any queued TTS dispatch bails out
  // before hitting the network. Reset at the start of each new sendData()
  // / speak_aloud_response() turn.
  private ttsAbort = false
  isSidebarOpen = false;
  isRobotVisible: boolean = true;
  
  clicksWindow=0;
  conversationHistory:conversationHistoryDTO[]=[];
  conversationId=""
  context:contextDTO={id:"",label:"",text:"",remember:"",maxLengthAnswer:70}
  contexts:contextDTO[]=[]
  
  @ViewChild('input') divInputElement!: ElementRef;
  @ViewChild('human_input') inputElement!: ElementRef;
  @ViewChild('conversation') conversationElement!: ElementRef;
  @ViewChild('configuration_window', { read: ElementRef }) configurationWinElement!: ElementRef;
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
  swTalkResponse: boolean = true;
  audio: HTMLAudioElement | null = null;
  selectLanguage: string = 'a';
  selectVoice: string = 'af_heart';
  contextUrl: string = '';
  languageOptions:{label:string, value:string}[] = []
  voiceOptions:{language:string, label:string,gender:string}[] = []
  notesWindow: Window | null = null;
  dictionaryWindow: Window | null = null;
  reviewWindow: Window | null = null;
  memoryWindow: Window | null = null;
   
  constructor(private router: Router,public sound: SoundService,public back: ApiBackService,public persistence: PersistenceService,private avatarService: AvatarService, private dialog: MatDialog) {
    this.isLoading=true
    this.avatarTalking$ = this.avatarService.talking$;
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
        if (data.role) {
          this.persistence.setRole(data.role)
        }
        if (data.human_voice) {
          this.human_voice = data.human_voice
        }

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
        this.context.maxLengthAnswer=(await this.back.getMaxLengthAnswer()).maxLength
        await this.loadContextUrl()
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
        this.ttsAbort=false
        while (true) {          
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          this.responseMessage+= chunk.replace(/\n/g, '');
          pFin=this.findNextPunctuation(this.responseMessage,pIni)          
          if (pFin!=-1) {
            txt+=this.responseMessage.substring(pIni,pFin+1)
            if (txt.length>200){            
              setTimeout(() => this.scrollToBottom(), 0)  
              if (this.swTalkResponse && !this.ttsAbort) {
                const cleanText=this.back.cleanText(txt)
                // Throttled dispatch: ttsRequest will wait for a free slot
                // (max TTS_MAX_CONCURRENT in flight) before hitting the
                // backend, and reject early if ESC was pressed.
                this.ttsArray.push(this.ttsRequest(cleanText))
                if (swStart)
                {
                  this.ttsStart=true                
                  swStart=false
                  this.ttsWait()         
                }
              }
              txt=""
            }
            pIni=pFin+1
          }          
        }
        if (this.responseMessage.length>pFin) {              
          txt+=this.responseMessage.substring(pIni)
          const cleanText=this.back.cleanText(txt)
          if (cleanText.length>0 && this.swTalkResponse && !this.ttsAbort) {        
            this.ttsArray.push(this.ttsRequest(cleanText))
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
        await this.getConversationsHistory();
      }
      if (this.swSaveConversation) 
      {
        // Save sequentially (await each call) so the human line is committed
        // strictly before the robot line. Firing them in parallel was racing
        // them on time_msg, which together with the backend's ORDER BY
        // time_msg made loaded conversations appear in the wrong order.
        const savedHuman: any = await this.back.saveConversation(this.conversationId, "H",this.inputText);
        await this.back.saveConversation(this.conversationId, "R",this.responseMessage);
        // The backend regenerates the conversation title from the first 3
        // user messages. When it returns a refreshed name, update the local
        // history entry so the side panel reflects the new title without
        // requiring a full refresh.
        if (savedHuman && savedHuman.name) {
          this.applyConversationName(this.conversationId, savedHuman.name);
        }
      }  
      this.chatHistory.push({line:this.numberLine,type: "R",msg: msg,msgClean:this.responseMessage})
      this.responseMessage="";
      this.numberLine++
      this.inputText=""
      setTimeout(() => {
        this.resetInputHeight()
        this.scrollToBottom()
      }, 0)
    }
  }
  async speak_aloud_response(event:MouseEvent,i:number,type_line:string, all_text:boolean=false){    
    var voice=this.selectVoice
    if (type_line =="H") {
      voice=this.human_voice
    } 
    if (this.selectedText.trim()!='' && !all_text)
    {
      this.speakAloud(this.selectedText,voice);
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
    this.ttsAbort=false
    
    while (pFin!=-1 && pFin<cleanText.length) {
    
      pFin=this.findNextPunctuation(cleanText,pIni)
      if (pFin!=-1) {
        txt+=cleanText.substring(pIni,pFin+1)
        
        if (txt.length>150 && !this.ttsAbort){                      
          // Throttled dispatch (max TTS_MAX_CONCURRENT in flight, ESC-aware).
          this.ttsArray.push(this.ttsRequest(txt,voice))
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
      if (txt.length>0 && !this.ttsAbort) {        
        this.ttsArray.push(this.ttsRequest(txt,voice))
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

  /**
   * Dispatch a single TTS request, respecting the concurrency cap and the
   * abort flag. Returned Promise:
   *   - resolves with the synthesised Blob, or
   *   - rejects if ESC was pressed before the request actually fired.
   *
   * The Promise is the value pushed into ttsArray, so ttsWait() awaits it
   * in the playback loop. Rejected Promises are caught there and skipped.
   */
  private async ttsRequest(text: string, voice: string = ''): Promise<Blob> {
    // Wait for an open slot, but bail early if the user already pressed ESC.
    while (this.ttsActiveCount >= this.TTS_MAX_CONCURRENT) {
      if (this.ttsAbort) {
        throw new Error('TTS aborted before dispatch')
      }
      await this.sleep(50)
    }
    if (this.ttsAbort) {
      throw new Error('TTS aborted before dispatch')
    }
    this.ttsActiveCount++
    try {
      return await this.back.text_to_sound(text, voice)
    } finally {
      this.ttsActiveCount--
    }
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
      // ttsArray now holds Promises that resolve to the synthesised Blob.
      // Awaiting here blocks only the playback loop (not the LLM read loop)
      // and is a no-op if the request already finished.
      const responsePromise=this.ttsArray[i];
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
      let response: Blob
      try {
        response = await responsePromise
      } catch (err) {
        console.error('TTS request failed, skipping chunk:', err)
        i++
        continue
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
    // Split on real sentence/clause boundaries ( ?, !, :, ,)
    // so each TTS chunk is a natural piece of speech. The 200/150-char
    // thresholds in sendData() / speak_aloud_response() still keep us from
    // dispatching tiny chunks for every comma.
    const substring = text.substring(startIndex);
    const match = substring.match(/[.;:?!]/);
    return match ? startIndex + match.index! : -1;
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
  async speakAloud(inputText:string,voice:string="") {    
    this.stopAudio()
    this.showSoundLoading() 
    if (voice=="" )  {
      voice=this.selectVoice
    }    
    if (inputText.trim()!='') {      
      // Cache key is (text, voice). Replaying with the same text but a
      // different voice (e.g. F4 then Shift+F4) was wrongly hitting the
      // cache and replaying the previous voice's audio.
      if (this.textSpeakAloud!=inputText || this.voiceSpeakAloud!=voice) {
        this.textSpeakAloud=inputText
        this.voiceSpeakAloud=voice
        this.responseTextToSound= await this.back.text_to_sound(this.back.cleanText(inputText),voice);       
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

  async prepareAudio(audioBlob: Blob) {
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
    // start talking animation
    this.avatarService.setTalking(true);
    this.avatarService.connectAudio(this.audio);
    this.audio.play();
    this.audio.onended = () => {
      // Add your custom logic here
      this.isPlayingSound = false; // Example: Reset the playing state
      // stop talking animation
      this.avatarService.setTalking(false);
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
    // ensure avatar stops talking when audio is killed
    this.avatarService.setTalking(false);
    if (this.sound.isRecording && ! this.sound.chating) {           
      this.sound.stopRecording()
    }
    else
    {
      // Cancel any queued TTS dispatch that hasn't hit the network yet.
      // Requests already in flight will resolve in the background; their
      // Blobs are simply ignored because the playback loop has been told to
      // stop (semaphoreStopAudio = -1) and ttsArray is reset on the next
      // sendData() / speak_aloud_response() turn.
      this.ttsAbort = true
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
    // Close notes and dictionary windows
    if (this.notesWindow) {
      this.notesWindow.close();
      this.notesWindow = null;
    }
    if (this.dictionaryWindow) {
      this.dictionaryWindow.close();
      this.dictionaryWindow = null;
    }
    if (this.reviewWindow) {
      this.reviewWindow.close();
      this.reviewWindow = null;
    }
    const response=await this.back.clearConversation();    
    this.put_message(response)
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

  async loadContextUrl() {
    try {
      const response = await this.back.contextGetUrl();
      this.contextUrl = response?.url || '';
    } catch (error) {
      this.contextUrl = '';
    }
  }

  /** Show a transient message in the top system banner (used by children). */
  showSystemMessage(msg: string) {
    this.responseBack = msg;
    setTimeout(() => { this.responseBack = ''; }, 3000);
  }

  async toggleSidebar() {
    if (! this.isSidebarOpen)
    {
      this.getConversationsHistory()
    }
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  toggleRobotVisibility() {
    this.isRobotVisible = !this.isRobotVisible;
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
    this.contextUrl = response.url || '';
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
    // Reload notes and dictionary windows if open
    if (this.notesWindow && !this.notesWindow.closed) {
      this.notesWindow.location.href = `/notes/${this.conversationId}`;
    }
    if (this.dictionaryWindow && !this.dictionaryWindow.closed) {
      this.dictionaryWindow.location.href = `/dictionary/${this.conversationId}`;
    }
    if (this.reviewWindow && !this.reviewWindow.closed) {
      this.reviewWindow.location.href = `/review`;
    }
    this.inputText = ""
    this.isLoading=false
    setTimeout(() => this.resetInputHeight(), 0)
  }
  async hystoryDelete(event: Event, id: string)
  {
    event.stopPropagation();
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '300px',
      data: { message: 'Are you sure you want to delete this conversation?' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.back.conversation_delete_by_id(id).then(response => {
          this.put_message(response);
          this.getConversationsHistory();
          this.isLoading = false;
        });
      }
    });
  }

  /** Persist a user-edited conversation title and reflect it locally. */
  async historyRename(id: string, name: string) {
    const trimmed = (name || '').trim();
    if (!id || !trimmed) return;
    try {
      await this.back.renameConversation(id, trimmed);
      this.applyConversationName(id, trimmed);
    } catch (err) {
      console.error('Rename conversation failed:', err);
      this.showSystemMessage('Could not rename conversation');
    }
  }

  /** Update the cached `conversationHistory` entry for `id` with a new name. */
  private applyConversationName(id: string, name: string) {
    if (!id || !name) return;
    const entry = this.conversationHistory.find(c => c.id === id);
    if (entry && entry.name !== name) {
      entry.name = name;
      // Replace the array reference so OnPush-style consumers (and Angular's
      // default change detection) reliably re-render the side panel.
      this.conversationHistory = [...this.conversationHistory];
    }
  }
  getFormattedDate(dateString: string): Date {
    return new Date(dateString);
  }

  speakOnF4(event: KeyboardEvent, text: string) {
      if (event.key === 'F4' || event.key === 'F5') {
        // Reset the text+voice cache so the textarea always re-fetches; the
        // text changes as the user types, but reusing the cache could
        // otherwise replay stale audio for the same content.
        this.textSpeakAloud=""
        event.preventDefault();
        // Convention across the app: F4 = primary voice, F5 = alternative.
        if (event.key === 'F5') {
          this.speakAloud(text, this.human_voice);
        } else {
          this.speakAloud(text);
        }
        this.focusInputElement();
      }
  }
  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (this.clicksWindow==0){
      this.clicksWindow++;
      return
    }
    if (this.showLanguageOptions   && this.configurationWinElement && !this.configurationWinElement.nativeElement.contains(event.target)) {
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
    if ((event.key === 'F4' || event.key === 'F5') && activeElement.tagName !== 'TEXTAREA') {
      event.preventDefault();
      // this.textSpeakAloud=""
      if (this.selectedText.trim()!='')
        if (event.key === 'F5') {
          this.speakAloud(this.selectedText,this.human_voice);
        } else {
          this.speakAloud(this.selectedText);
        }
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

  /** Collapse the input textarea back to the height that matches its current
   *  (possibly empty) content. The inline style set by `adjustHeight` keeps
   *  the box big until we recompute it. We re-run the same shrink-then-grow
   *  trick used during typing so the layout matches "user pressed a key". */
  resetInputHeight() {
    const textArea = this.inputElement?.nativeElement as HTMLTextAreaElement | undefined;
    const container = this.divInputElement?.nativeElement as HTMLElement | undefined;
    if (!textArea) {
      if (container) container.style.height = '';
      return;
    }
    // First clear so scrollHeight reflects content, not the previous inline value.
    textArea.style.height = 'auto';
    if (container) container.style.height = 'auto';
    // Then apply the same formula adjustHeight uses on every keystroke.
    const newHeight = textArea.scrollHeight + 20;
    textArea.style.height = newHeight + 'px';
    if (container) container.style.height = newHeight + 'px';
  }
  
  getSelectedText() {
    const selection = window.getSelection();
    this.selectedText = selection ? selection.toString().trim() : '';
  }

  /**
   * Triggered by the floating <app-selection-menu>. `alt` is true when the
   * user clicked the alternative-voice option (or pressed Shift+F4).
   */
  onSelectionMenuSpeak(payload: { text: string; alt: boolean }) {
    const text = payload.text.trim();
    if (text === '') return;
    this.selectedText = text;
    if (payload.alt) {
      this.speakAloud(text, this.human_voice);
    } else {
      this.speakAloud(text);
    }
  }

  /** Bound as a property so `this` is preserved when the selection menu
   *  invokes it. The menu shows the result inline in a popover. */
  translateSelection = (text: string): Promise<string> =>
    this.back.translatePhrase(text);
  async sumary_conversation()
  {
    this.clicksWindow=0
    this.persistence.showSummary=true         
  }

  openNotes()
  {
    if (!this.conversationId) return;
    this.persistence.saveToLocalStorage();
    this.notesWindow = window.open(`/notes/${this.conversationId}`, 'robotito_notes', 'width=680,height=750,resizable=yes');
  }

  openDictionary()
  {
    if (!this.conversationId) return;
    this.persistence.saveToLocalStorage();
    this.dictionaryWindow = window.open(`/dictionary/${this.conversationId}`, 'robotito_dictionary', 'width=800,height=700,resizable=yes');
  }

  openReview()
  {
    this.persistence.saveToLocalStorage();
    this.reviewWindow = window.open(`/review`, 'robotito_review', 'width=800,height=750,resizable=yes');
  }

  openMemory()
  {
    this.persistence.saveToLocalStorage();
    this.memoryWindow = window.open(`/memory`, 'robotito_memory', 'width=720,height=750,resizable=yes');
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
