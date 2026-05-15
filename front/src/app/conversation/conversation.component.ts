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
import { NewConversationDialogComponent, NewConversationDialogResult } from '../new-conversation-dialog/new-conversation-dialog.component';
import { firstValueFrom } from 'rxjs';
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
  responseMessage:string=""
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

  /**
   * First robot line announcing the chosen context (e.g. "Context of this
   * conversation: ..."). It is added to `chatHistory` for display but is
   * NOT persisted until the conversation is actually initialised in the
   * backend (i.e. the user sends their first message or opens notes /
   * dictionary). We keep it here so we can flush it as the first saved
   * line at that moment.
   */
  pendingContextLine: string = '';

  /**
   * True after a conversation was initialised with the placeholder name
   * "Empty conversation" (because the user opened notes/dictionary before
   * writing anything). When the user eventually writes their first
   * message, we rename the conversation to reflect it.
   */
  isEmptyConversation: boolean = false;

  /**
   * Active vocabulary-review session, mirrored from the backend after
   * `POST /api/review/start`. While non-null:
   *   - user turns are routed through `back.reviewTurn` (streamed) instead
   *     of `back.sendQuestion`;
   *   - the review toolbar is shown above the input;
   *   - `last_verdict` is updated from the trailing `[[VERDICT:...]]`
   *     marker on each turn and drives the highlighted state of the
   *     "Next word" button.
   * The shape matches `ReviewSession.public_state()` on the backend.
   */
  reviewState: {
    active: boolean;
    index: number;
    total: number;
    current_word: string | null;
    last_verdict: string | null;
    is_finished: boolean;
    resolved: { word: string; translation: string; status: string }[];
  } | null = null;
   
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
        // On boot we silently reset the local state — no dialog. The user
        // sees the previously selected conversation (loaded below), or the
        // default greeting if there is no history.
        this._resetConversationState()
        await this.list_context()
        await this.getConversationsHistory()
        if  (this.conversationHistory.length>0)
        {
          // Open the most recent conversation automatically on login. The
          // backend orders `conversation_get_list` by `final_date desc`, so
          // entry [0] is the last one the user worked on. `historyChoose`
          // handles resetting state, loading lines, setting the context and
          // synchronising the active conversation id.
          const last = this.conversationHistory[0]
          await this.historyChoose(last.id, last.idContext)
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
    // Intentionally a no-op: the initial "Hello, I'm robotito..." greeting
    // has been removed. The method is kept (and still called from the
    // reset / history-load flows) so we can reintroduce a greeting later
    // without re-wiring all call sites.
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
      // Pick the right backend route: review sessions stream through
      // `/review/turn` (per-word teacher prompt + trailing verdict marker)
      // while everything else goes through the normal `/send-question`.
      const inReview = !!this.reviewState
      const response = inReview
        ? await this.back.reviewTurn(this.inputText)
        : await this.back.sendQuestion(this.inputText)
    
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
        // Review-mode verdict marker accumulators. The backend appends
        // `\n[[VERDICT:<value>]]` at the end of the stream; we strip it
        // before it ever reaches `responseMessage` (so it's never shown or
        // TTS'd) and apply the parsed value to `reviewState.last_verdict`
        // once the stream completes. The marker may straddle two chunks,
        // hence the running buffer.
        let inVerdict = false
        let verdictBuffer = ''
        while (true) {          
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          
          let displayChunk = chunk
          if (inReview) {
            if (inVerdict) {
              verdictBuffer += chunk
              displayChunk = ''
            } else {
              // Look for the marker spanning the existing message + this chunk.
              const probe = this.responseMessage + chunk
              const idx = probe.indexOf('[[VERDICT:')
              if (idx >= 0) {
                const startInChunk = idx - this.responseMessage.length
                displayChunk = startInChunk > 0 ? chunk.slice(0, startInChunk) : ''
                verdictBuffer = chunk.slice(Math.max(0, startInChunk))
                inVerdict = true
              }
            }
          }
          this.responseMessage+= displayChunk.replace(/\n/g, '');
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
        // Parse the trailing verdict marker (if any) and update the local
        // review-state mirror. Wrong/missing markers are silently treated
        // as off_topic so the toolbar doesn't get stuck.
        if (inReview) {
          this._applyVerdictMarker(verdictBuffer)
        }
      }
      else{
        console.log("No reader")
      }  
      this.isLoading=false
      this.numberLine++
      const msg=await this.toHtml(this.responseMessage,"R")
      let wasEmpty = this.isEmptyConversation
      if (this.conversationId=="")
      {
        var conversation=await this.back.initConversation( this.inputText);        
        this.conversationId=conversation.id
        await this.getConversationsHistory();
        // Flush the pending "Context of this conversation: ..." line as
        // the very first message of the new conversation so it shows up
        // in the saved history too.
        if (this.swSaveConversation && this.pendingContextLine) {
          await this.back.saveConversation(this.conversationId, "R", this.pendingContextLine);
          this.pendingContextLine = ''
        }
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
        // If the conversation was created as "Empty conversation" (e.g.
        // because the user opened notes/dictionary before writing), the
        // backend won't auto-rename it after the first user turn. Do it
        // here from the first message so the side panel reflects what the
        // conversation is actually about.
        if (wasEmpty) {
          const derived = this._deriveTitleFromMessage(this.inputText)
          if (derived) {
            try {
              await this.back.renameConversation(this.conversationId, derived)
              this.applyConversationName(this.conversationId, derived)
            } catch (e) {
              console.error('Rename after empty conversation failed:', e)
            }
          }
          this.isEmptyConversation = false
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
    // Ask the user for the context (theme) of the new conversation before
    // wiping the current one. If they cancel, we leave the current
    // conversation untouched.
    const result = await this.askNewConversationContext();
    if (!result) {
      // user cancelled the dialog (Cancel button or backdrop click)
      return;
    }
    if (result.reviewMode) {
      await this._startReviewConversation();
      return;
    }
    if (!result.context) return;
    await this._resetConversationState();
    // Apply the chosen context to the LLM for this new conversation.
    this.setContext(result.context);
    try {
      await this.back.contextSet(result.context.id);
    } catch (e) {
      console.error('Could not set active context:', e);
    }
    // Refresh the contexts list so the side state stays in sync (the
    // dialog may have created a new profile).
    await this.list_context();
    // Show the chosen context as the first robot line, but don't persist
    // it yet — we only save it when the conversation actually starts.
    const text = (result.context.text || '').trim();
    if (text) {
      const line = `Context of this conversation: ${text}`;
      this.chatHistory.push({ line: this.numberLine, type: 'R', msg: line, msgClean: line });
      this.pendingContextLine = line;
      this.numberLine++;
    }
  }

  /**
   * Start a new conversation in vocabulary-review mode by asking the
   * backend to pick 10 random words and initialise a `ReviewSession`. The
   * words themselves are kept server-side; the frontend only sees the
   * CURRENT word at any moment (`reviewState.current_word`). User turns
   * during the review are routed through `back.reviewTurn` (streamed),
   * which also returns a structured verdict the toolbar uses to highlight
   * the "Next word" button.
   *
   * As with the normal new-conversation flow, nothing is persisted until
   * the user writes their first message (or opens notes/dictionary).
   */
  private async _startReviewConversation() {
    // If a previous review was active, drop the local mirror first so
    // `_resetConversationState` doesn't try to end the session we are
    // about to recreate (backend `/review/start` already overwrites any
    // existing session for this user).
    this.reviewState = null

    let resp: any
    try {
      resp = await this.back.reviewStart()
    } catch (e: any) {
      // The 400 "no words" case bubbles up as an HttpErrorResponse with the
      // message in `error.message`; surface it gently instead of throwing.
      const msg = e?.error?.message || 'Could not start review session.'
      console.error('reviewStart failed:', e)
      this.showSystemMessage(msg)
      return
    }
    if (!resp || !resp.state || !resp.state.current_word) {
      this.showSystemMessage('No words available to review.')
      return
    }

    await this._resetConversationState()
    this.reviewState = resp.state
    // Push the intro line as the first robot message — and store it in
    // `pendingContextLine` so it's saved when the conversation is later
    // initialised in the backend (first user turn, or open notes/dict).
    const intro = (resp.intro || '').trim()
    if (intro) {
      this.chatHistory.push({ line: this.numberLine, type: 'R', msg: intro, msgClean: intro })
      this.pendingContextLine = intro
      this.numberLine++
    }
  }

  // ---------------------------------------------------------------------
  // Review session toolbar handlers
  // ---------------------------------------------------------------------

  /** Advance to the next word. The backend marks the current one as
   *  learned (`known=true`) so the end-of-session summary reflects the
   *  user's actual progress. Also pushes the new word's intro line into
   *  the chat. */
  async reviewNext() {
    if (!this.reviewState) return
    await this._reviewAdvance(true)
  }

  /** Skip the current word (records it as `skipped` in the summary). */
  async reviewSkip() {
    if (!this.reviewState) return
    try {
      const resp: any = await this.back.reviewSkip()
      this._applyReviewAdvanceResponse(resp)
    } catch (e) {
      console.error('reviewSkip failed:', e)
      this.showSystemMessage('Could not skip word')
    }
  }

  /** End the active review session and post a short summary as a robot
   *  line. The conversation continues afterwards as a normal chat. */
  async reviewEndSession() {
    if (!this.reviewState) return
    try {
      const resp: any = await this.back.reviewEnd()
      const summary = resp?.summary
      this.reviewState = null
      if (summary) {
        const total = summary.total ?? 0
        const known = summary.known ?? 0
        const skipped = summary.skipped ?? 0
        const unknown = summary.unknown ?? 0
        const missed = (summary.history || [])
          .filter((h: any) => h.status !== 'known')
          .map((h: any) => h.word)
        let line = `Review finished! You got ${known} / ${total} right.`
        if (skipped) line += ` Skipped: ${skipped}.`
        if (unknown) line += ` Didn't know: ${unknown}.`
        if (missed.length) line += ` Words to revisit: ${missed.join(', ')}.`
        this.chatHistory.push({ line: this.numberLine, type: 'R', msg: line, msgClean: line })
        this.numberLine++
        // Save the summary line too if the conversation already exists.
        if (this.conversationId && this.swSaveConversation) {
          try { await this.back.saveConversation(this.conversationId, 'R', line) } catch (e) { console.error(e) }
        }
      }
    } catch (e) {
      console.error('reviewEnd failed:', e)
      this.showSystemMessage('Could not end review')
    }
  }

  /** Parse a `[[VERDICT:<value>]]` marker (possibly preceded/followed by
   *  whitespace) and write the value into `reviewState.last_verdict`. The
   *  marker may have been split across chunks, so we only look at the
   *  accumulated buffer here at end-of-stream. */
  private _applyVerdictMarker(buffer: string) {
    if (!this.reviewState) return
    const m = (buffer || '').match(/\[\[VERDICT:([a-z_]+)\]\]/i)
    if (!m) {
      this.reviewState.last_verdict = 'off_topic'
      return
    }
    this.reviewState.last_verdict = m[1].toLowerCase()
  }

  private async _reviewAdvance(known: boolean) {
    try {
      const resp: any = await this.back.reviewAdvance(known)
      this._applyReviewAdvanceResponse(resp)
    } catch (e) {
      console.error('reviewAdvance failed:', e)
      this.showSystemMessage('Could not advance to next word')
    }
  }

  /** Common post-processing for /advance and /skip: update the local
   *  mirror, push the new word's intro line into the chat, and persist it
   *  if the conversation already exists. */
  private async _applyReviewAdvanceResponse(resp: any) {
    if (!resp || !resp.state) return
    this.reviewState = resp.state
    const intro = (resp.intro || '').trim()
    if (this.reviewState && this.reviewState.is_finished) {
      // No more words; offer to end the session.
      const done = 'That was the last word. Click "End review" when you want to see your summary.'
      this.chatHistory.push({ line: this.numberLine, type: 'R', msg: done, msgClean: done })
      this.numberLine++
      if (this.conversationId && this.swSaveConversation) {
        try { await this.back.saveConversation(this.conversationId, 'R', done) } catch (e) { console.error(e) }
      }
      return
    }
    if (intro) {
      this.chatHistory.push({ line: this.numberLine, type: 'R', msg: intro, msgClean: intro })
      this.numberLine++
      if (this.conversationId && this.swSaveConversation) {
        try { await this.back.saveConversation(this.conversationId, 'R', intro) } catch (e) { console.error(e) }
      } else {
        // No conversation yet — keep the line pending so it's flushed when
        // the first real user turn (or notes/dictionary) initialises one.
        this.pendingContextLine = intro
      }
    }
  }

  /**
   * Reset all per-conversation state (chat history, ratings, summary
   * flags, child windows, pending context line, ...). Does NOT touch the
   * active LLM context — callers do that explicitly after a successful
   * dialog round-trip.
   */
  private async _resetConversationState() {
    this.chatHistory.length = 0
    this.ratingHistory.length = 0
    this.numberLine = 1
    this.conversationId = ''
    this.showLanguageOptions = false
    this.persistence.showSummary = false
    this.swRating = false
    this.pendingContextLine = ''
    this.isEmptyConversation = false
    // If a backend review session is still running from the previous
    // conversation, end it server-side so the next turn doesn't get routed
    // back to /review/turn by mistake. We don't need its summary here —
    // the user is moving on.
    if (this.reviewState) {
      try { await this.back.reviewEnd() } catch (e) { console.error('reviewEnd cleanup failed:', e) }
    }
    this.reviewState = null
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
    const response = await this.back.clearConversation();
    this.put_message(response)
  }

  /**
   * Open the "new conversation" dialog and return the chosen result, or
   * `null` if the user cancelled / closed via backdrop.
   */
  private async askNewConversationContext(): Promise<NewConversationDialogResult | null> {
    if (!this.dialog) return null;
    const ref = this.dialog.open(NewConversationDialogComponent, {
      width: '560px',
      data: {
        contexts: this.contexts,
        current: this.context,
      },
      disableClose: false,
    });
    const result = await firstValueFrom(ref.afterClosed());
    return (result as NewConversationDialogResult) || null;
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
    // Loading a saved conversation always exits review mode, both locally
    // and on the backend (the picked conversation has no live review
    // session attached to it).
    if (this.reviewState) {
      try { await this.back.reviewEnd() } catch (e) { console.error('reviewEnd cleanup failed:', e) }
    }
    this.reviewState = null
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
    this.persistence.saveToLocalStorage();
    this._ensureConversationInitialized().then(id => {
      if (!id) return;
      this.notesWindow = window.open(`/notes/${id}`, 'robotito_notes', 'width=680,height=750,resizable=yes');
    });
  }

  openDictionary()
  {
    this.persistence.saveToLocalStorage();
    this._ensureConversationInitialized().then(id => {
      if (!id) return;
      this.dictionaryWindow = window.open(`/dictionary/${id}`, 'robotito_dictionary', 'width=800,height=700,resizable=yes');
    });
  }

  /**
   * Make sure there is a backend conversation we can attach notes /
   * dictionary entries to. If the user opened notes/dictionary before
   * writing anything, we create the conversation now with the placeholder
   * title "Empty conversation" and flush the pending context line. The
   * title will be refined to the user's first real message later (see
   * `sendData`).
   */
  private async _ensureConversationInitialized(): Promise<string> {
    if (this.conversationId) return this.conversationId;
    try {
      const conv: any = await this.back.initConversation('Empty conversation');
      this.conversationId = conv?.id || '';
      if (!this.conversationId) return '';
      this.isEmptyConversation = true;
      // Persist the pending context line, if any, as the first robot line.
      if (this.swSaveConversation && this.pendingContextLine) {
        try {
          await this.back.saveConversation(this.conversationId, 'R', this.pendingContextLine);
        } catch (e) {
          console.error('Failed to save pending context line:', e);
        }
        this.pendingContextLine = '';
      }
      await this.getConversationsHistory();
      return this.conversationId;
    } catch (e) {
      console.error('Failed to init empty conversation:', e);
      this.showSystemMessage('Could not start conversation');
      return '';
    }
  }

  /**
   * Derive a short conversation title from the user's first real message.
   * Mirrors the simple branch of the backend's `init_conversation` helper
   * (use the message as-is, capped at 9 words) so renamed conversations
   * look consistent with freshly initialised ones.
   */
  private _deriveTitleFromMessage(msg: string): string {
    const cleaned = (msg || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    const words = cleaned.split(' ');
    return words.length > 9 ? words.slice(0, 9).join(' ') : cleaned;
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
