import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';

interface Word {
  id?: string;
  word: string;
  translation: string;
  examples: Array<{ english_phrase: string, spanish_phrase: string }>;
  createdDate?: string;
}

type DictionaryView = 'list' | 'review';
type ReviewDirection = 'en->es' | 'es->en';
type ReviewStage = 'setup' | 'quiz' | 'results';

interface ReviewQuestion {
  word: string;        // Word shown to the user (English or Spanish, depending on direction)
  expected: string;    // Reference translation
  userAnswer: string;  // User input
  isCorrect?: boolean; // Set after grading
  feedback?: string;   // Set after grading
}

@Component({
  selector: 'app-dictionary-page',
  imports: [CommonModule, FormsModule],
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

  // ----- Review mode state -----
  currentView: DictionaryView = 'list';
  reviewStage: ReviewStage = 'setup';
  reviewDirection: ReviewDirection = 'en->es';
  reviewQuestions: ReviewQuestion[] = [];
  isGrading: boolean = false;
  reviewScore: number = 0;
  readingQuestionIndex: number | null = null;
  readonly QUIZ_SIZE = 10;

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
      this.statusMessage = 'Word added!';
      setTimeout(() => this.statusMessage = '', 2000);

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
        .map(ex => ex.english_phrase)
        .filter(ex => ex && ex.trim())
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
        this.speakSelectedText(this.selectedText);
      }
    }
  }

  stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.readingAloudWordId = null;
    this.readingQuestionIndex = null;
    this.statusMessage = '';
  }

  getSelectedText() {
    const selection = window.getSelection();
    this.selectedText = selection ? selection.toString().trim() : '';
  }

  async speakSelectedText(text: string) {
    try {
      const response = await this.back.text_to_sound(text, '');
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

  // ----------------------------------------------------------------
  // Review mode
  // ----------------------------------------------------------------

  setView(view: DictionaryView) {
    if (this.currentView === view) return;
    this.currentView = view;
    if (view === 'review') {
      // Always start at the setup screen when switching into review.
      this.reviewStage = 'setup';
      this.reviewQuestions = [];
      this.reviewScore = 0;
    }
  }

  get hasEnoughWordsForReview(): boolean {
    return this.words.length > 0;
  }

  get reviewBatchSize(): number {
    return Math.min(this.QUIZ_SIZE, this.words.length);
  }

  get questionPromptIsEnglish(): boolean {
    return this.reviewDirection === 'en->es';
  }

  startReview() {
    if (!this.hasEnoughWordsForReview) {
      this.statusMessage = 'Add some words first to review.';
      return;
    }

    // Pick up to QUIZ_SIZE random words.
    const pool = [...this.words];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, Math.min(this.QUIZ_SIZE, pool.length));

    this.reviewQuestions = picked.map(w => {
      if (this.reviewDirection === 'en->es') {
        return { word: w.word, expected: w.translation, userAnswer: '' };
      }
      return { word: w.translation, expected: w.word, userAnswer: '' };
    });
    this.reviewScore = 0;
    this.reviewStage = 'quiz';
  }

  cancelReview() {
    this.stopAudio();
    this.reviewStage = 'setup';
    this.reviewQuestions = [];
    this.reviewScore = 0;
  }

  async submitReview() {
    if (this.isGrading) return;
    if (this.reviewQuestions.length === 0) return;

    this.isGrading = true;
    this.statusMessage = 'Grading your answers...';
    try {
      const payload = this.reviewQuestions.map(q => ({
        word: q.word,
        expected: q.expected,
        user_answer: q.userAnswer.trim(),
      }));
      const result = await this.back.reviewWords(this.conversationId, payload, this.reviewDirection);
      const items = (result && result.items) || [];
      this.reviewQuestions = this.reviewQuestions.map((q, i) => ({
        ...q,
        isCorrect: !!(items[i] && items[i].is_correct),
        feedback: (items[i] && items[i].feedback) || '',
      }));
      this.reviewScore = this.reviewQuestions.filter(q => q.isCorrect).length;
      this.reviewStage = 'results';
      this.statusMessage = '';
    } catch (error) {
      console.error('Failed to grade review:', error);
      this.statusMessage = 'Error grading the review';
    } finally {
      this.isGrading = false;
    }
  }

  retryReview() {
    this.reviewStage = 'setup';
    this.reviewQuestions = [];
    this.reviewScore = 0;
  }

  async playQuestionAudio(index: number) {
    const q = this.reviewQuestions[index];
    if (!q) return;
    try {
      this.readingQuestionIndex = index;
      this.statusMessage = 'Loading audio...';
      const response = await this.back.text_to_sound(q.word, '');
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }
      this.statusMessage = 'Playing...';
      this.audio = await this.back.playAudioFromResponse(response);
      this.audio.onended = () => {
        this.statusMessage = '';
        this.readingQuestionIndex = null;
      };
    } catch (error) {
      console.error('Failed to play question audio:', error);
      this.statusMessage = 'Error playing audio';
      this.readingQuestionIndex = null;
    }
  }
}
