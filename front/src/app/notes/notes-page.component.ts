import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';
import { SelectionMenuComponent } from '../selection-menu/selection-menu.component';
import { marked } from 'marked';

@Component({
  selector: 'app-notes-page',
  imports: [CommonModule, FormsModule, SelectionMenuComponent],
  templateUrl: './notes.component.html',
  styleUrls: ['./notes.component.scss'],
})
export class NotesPageComponent implements OnInit {
  conversationId: string = '';
  notes: string = '';
  isSaving: boolean = false;
  saveMessage: string = '';
  isPreview: boolean = true;

  // Audio playback for "speak selected text" — same pattern as the
  // dictionary page (F4 / Shift+F4 / floating selection menu).
  audio: HTMLAudioElement | null = null;
  selectedText: string = '';
  statusMessage: string = '';
  /** Voice for the alternative-voice action (Shift+F4 / menu). */
  humanVoice: string = 'af_heart';

  get renderedNotes(): string {
    return marked(this.notes) as string;
  }

  constructor(
    private route: ActivatedRoute,
    public back: ApiBackService,
    public persistence: PersistenceService
  ) {}

  async ngOnInit() {
    this.persistence.restoreFromLocalStorage();
    this.conversationId = this.route.snapshot.paramMap.get('id') ?? '';
    if (this.conversationId) {
      this.notes = await this.back.getNotes(this.conversationId);
    }
    // Pull the user's stored alternative voice so Shift+F4 / the menu's
    // "Alternative voice" button uses the same voice as the main app.
    try {
      const data = await this.back.getLastUser();
      if (data && data.human_voice) {
        this.humanVoice = data.human_voice;
      }
    } catch {
      // Ignore — stay with the default.
    }
  }

  async saveNotes() {
    if (!this.conversationId) return;
    this.isSaving = true;
    this.saveMessage = '';
    try {
      await this.back.saveNotes(this.conversationId, this.notes);
      this.saveMessage = 'Saved!';
      setTimeout(() => this.saveMessage = '', 2000);
    } catch {
      this.saveMessage = 'Error!';
    } finally {
      this.isSaving = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.stopAudio();
    }
    if (event.key === 'F4') {
      event.preventDefault();
      this.getSelectedText();
      if (this.selectedText.trim() !== '') {
        // F4 = primary voice (backend uses the user's selectVoice),
        // Shift+F4 = alternative (human) voice.
        const voice = event.shiftKey ? this.humanVoice : '';
        this.speakSelectedText(this.selectedText, voice);
      }
    }
  }

  stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.statusMessage = '';
  }

  getSelectedText() {
    const selection = window.getSelection();
    this.selectedText = selection ? selection.toString().trim() : '';
  }

  /** Called by the floating <app-selection-menu>. */
  onSelectionMenuSpeak(payload: { text: string; alt: boolean }) {
    const voice = payload.alt ? this.humanVoice : '';
    this.speakSelectedText(payload.text, voice);
  }

  async onSelectionMenuTranslate(payload: { text: string }) {
    this.statusMessage = 'Translating...';
    try {
      const tr = await this.back.translatePhrase(payload.text);
      this.statusMessage = tr ? `🇪🇸 ${tr}` : 'No translation';
      // Stays visible long enough to read; click anywhere to dismiss.
      setTimeout(() => { if (this.statusMessage.startsWith('🇪🇸')) this.statusMessage = ''; }, 8000);
    } catch {
      this.statusMessage = 'Translate error';
    }
  }

  async speakSelectedText(text: string, voice: string = '') {
    try {
      const response = await this.back.text_to_sound(text, voice);
      this.statusMessage = 'Playing...';

      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }

      this.audio = await this.back.playAudioFromResponse(response);
      this.audio.onended = () => {
        this.statusMessage = '';
      };
    } catch (error) {
      console.error('Failed to read aloud:', error);
      this.statusMessage = 'Error playing audio';
    }
  }
}
