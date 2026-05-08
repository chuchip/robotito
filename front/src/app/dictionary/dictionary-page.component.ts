import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';
import { SelectionMenuComponent } from '../selection-menu/selection-menu.component';

interface Word {
  id?: string;
  word: string;
  translation: string;
  examples: Array<{ english_phrase: string, spanish_phrase: string }>;
  createdDate?: string;
  repeated?: boolean;
}

@Component({
  selector: 'app-dictionary-page',
  imports: [CommonModule, FormsModule, SelectionMenuComponent],
  templateUrl: './dictionary-page.components.html',
  styleUrls: [ './dictionary-page.components.scss' ]
})
export class DictionaryPageComponent implements OnInit {
  conversationId: string = '';
  statusPlaying: string = 'Loading...';
  words: Word[] = [];
  filteredWords: Word[] = [];
  searchTerm: string = '';
  newWord: string = '';
  isAdding: boolean = false;
  editingId: string | null = null;
  statusMessage: string = '';
  audio: HTMLAudioElement | null = null;
  selectedText: string = '';
  readingAloudWordId: string | null = null;
  expandedWordIds: Set<string> = new Set<string>();

  /** Voice used for the alternative-voice action (Shift+F4 / menu button).
   *  Loaded from the user's persisted preferences; falls back to 'af_heart'
   *  when the user has not set one yet. */
  humanVoice: string = 'af_heart';

  constructor(
    private route: ActivatedRoute,
    private back: ApiBackService,
    private persistence: PersistenceService
  ) {}

  async ngOnInit() {
    this.persistence.restoreFromLocalStorage();
    this.conversationId = this.route.snapshot.paramMap.get('id') || '';
    if (this.conversationId) {
      await this.loadWords();
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

  async loadWords() {
    try {
      const data = await this.back.getWords(this.conversationId);
      this.words = data || [];
      this.filteredWords = this.words;
    } catch (error) {
      console.error('Failed to load words:', error);
      this.statusMessage = 'Error loading words';
    }
  }

  filterWords() {
    const term = this.searchTerm.toLowerCase();
    this.filteredWords = this.words.filter(w => 
      w.word.toLowerCase().includes(term) || 
      w.translation.toLowerCase().includes(term)
    );
  }

  async addWord() {
    if (!this.newWord.trim() || !this.conversationId) return;

    this.isAdding = true;
    this.statusMessage = 'Translating...';

    try {
      const word = await this.back.addWord(this.conversationId, this.newWord.trim());
      this.words.push(word);
      this.filterWords();
      this.newWord = '';
      if (word && word.repeated) {
        this.statusMessage = 'Word already in your dictionary (not saved again)';
        setTimeout(() => this.statusMessage = '', 3000);
      } else {
        this.statusMessage = 'Word added!';
        setTimeout(() => this.statusMessage = '', 2000);
      }

      setTimeout(() => {
        const wordsList = document.querySelector('.words-list') as HTMLElement | null;
        if (wordsList) {
          wordsList.scrollTop = wordsList.scrollHeight;
        }
      }, 0);
    } catch (error) {
      console.error('Failed to add word:', error);
      this.statusMessage = 'Error adding word';
    } finally {
      this.isAdding = false;
    }
  }

  toggleEdit(word: Word) {
    if (this.editingId === word.id) {
      this.saveWord(word);
    } else {
      this.editingId = word.id || null;
    }
  }

  async saveWord(word: Word) {
    try {
      await this.back.updateWord(this.conversationId, word.id!, word);
      this.editingId = null;
      this.statusMessage = 'Word updated!';
      setTimeout(() => this.statusMessage = '', 2000);
    } catch (error) {
      console.error('Failed to save word:', error);
      this.statusMessage = 'Error saving word';
    }
  }

  async deleteWord(wordId: string) {
    if (!confirm('Are you sure you want to delete this word?')) return;

    try {
      await this.back.deleteWord(this.conversationId, wordId);
      this.words = this.words.filter(w => w.id !== wordId);
      this.filteredWords = this.filteredWords.filter(w => w.id !== wordId);
      this.statusMessage = 'Word deleted!';
      setTimeout(() => this.statusMessage = '', 2000);
    } catch (error) {
      console.error('Failed to delete word:', error);
      this.statusMessage = 'Error deleting word';
    }
  }

  toggleExamples(word: Word) {
    if (!word.id) {
      return;
    }
    if (this.expandedWordIds.has(word.id)) {
      this.expandedWordIds.delete(word.id);
    } else {
      this.expandedWordIds.add(word.id);
    }
  }

  isExamplesExpanded(word: Word): boolean {
    return word.id ? this.expandedWordIds.has(word.id) : false;
  }

  async readAloud(word: Word) {
    try {
      this.readingAloudWordId = word.id || null;
      this.statusMessage = 'Preparing audio...';
      this.statusPlaying = 'Loading audio';
      
      // Combine word with all English examples
      const englishExamples = word.examples
        .map((ex,i) => `${i+1}: ${ex.english_phrase}  \n `)        
        .join('. ');
      
      const textToSpeak = englishExamples ? `${word.word}. ". Examples: " ${englishExamples}` : word.word;
      const response = await this.back.text_to_sound(textToSpeak, '');
      this.statusMessage = 'Playing...';

      // Stop previous audio if playing
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }
      this.statusPlaying = 'Playing...';
      this.audio = await this.back.playAudioFromResponse(response);
      this.audio.onended = () => {
        this.statusMessage = '';
        this.readingAloudWordId = null;
      };
    } catch (error) {
      console.error('Failed to read aloud:', error);
      this.statusMessage = 'Error playing audio';
      this.readingAloudWordId = null;
    }
  }

  closeWindow() {
    window.close();
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
        // Consistent convention with the rest of the app: F4 = primary
        // voice (let the backend pick the user's selectVoice), Shift+F4 =
        // alternative (human) voice.
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
    this.readingAloudWordId = null;
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
      setTimeout(() => { if (this.statusMessage.startsWith('🇪🇸')) this.statusMessage = ''; }, 8000);
    } catch {
      this.statusMessage = 'Translate error';
    }
  }

  async speakSelectedText(text: string, voice: string = '') {
    try {
      const response = await this.back.text_to_sound(text, voice);
      this.statusMessage = 'Playing...';

      // Stop previous audio if playing
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }

      this.audio = await this.back.playAudioFromResponse(response);
      this.readingAloudWordId = null;
      this.audio.onended = () => {
        this.statusMessage = '';
      };
    } catch (error) {
      console.error('Failed to read aloud:', error);
      this.statusMessage = 'Error playing audio';
      this.readingAloudWordId = null;
    }
  }
}
