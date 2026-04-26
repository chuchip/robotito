import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';

interface Word {
  id?: string;
  word: string;
  translation: string;
  examples: Array<{ english_phrase: string, spanish_phrase: string }>;
  createdDate?: string;
}

type ReviewDirection = 'en->es' | 'es->en';
type ReviewStage = 'setup' | 'quiz' | 'results';

interface ReviewQuestion {
  id?: string;        // Word id, used to update its review status server-side
  word: string;       // Word shown to the user (English or Spanish, depending on direction)
  expected: string;   // Reference translation
  userAnswer: string; // User input
  examples: Array<{ english_phrase: string, spanish_phrase: string }>;
  isCorrect?: boolean;
  feedback?: string;
}

@Component({
  selector: 'app-review-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './review-page.component.html',
  styleUrls: ['./review-page.component.scss']
})
export class ReviewPageComponent implements OnInit {
  words: Word[] = [];
  isLoading: boolean = true;
  loadError: string = '';

  reviewStage: ReviewStage = 'setup';
  reviewDirection: ReviewDirection = 'en->es';
  reviewQuestions: ReviewQuestion[] = [];
  isGrading: boolean = false;
  reviewScore: number = 0;
  statusMessage: string = '';
  readonly QUIZ_SIZE = 10;

  audio: HTMLAudioElement | null = null;
  readingQuestionIndex: number | null = null;
  expandedExampleIndices: Set<number> = new Set<number>();
  selectedText: string = '';

  constructor(
    private back: ApiBackService,
    private persistence: PersistenceService
  ) {}

  async ngOnInit() {
    this.persistence.restoreFromLocalStorage();
    try {
      this.words = await this.back.getUserWords();
    } catch (error) {
      console.error('Failed to load words:', error);
      this.loadError = 'Could not load your words.';
    } finally {
      this.isLoading = false;
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

  toggleExamples(index: number) {
    if (this.expandedExampleIndices.has(index)) {
      this.expandedExampleIndices.delete(index);
    } else {
      this.expandedExampleIndices.add(index);
    }
  }

  isExamplesExpanded(index: number): boolean {
    return this.expandedExampleIndices.has(index);
  }

  startReview() {
    if (!this.hasEnoughWordsForReview) {
      this.statusMessage = 'Add some words first to review.';
      return;
    }

    // The backend already returns words ordered by review priority
    // (untested + previously failed first). Just take the top N.
    const picked = this.words.slice(0, Math.min(this.QUIZ_SIZE, this.words.length));

    this.reviewQuestions = picked.map(w => {
      if (this.reviewDirection === 'en->es') {
        return { id: w.id, word: w.word, expected: w.translation, userAnswer: '', examples: w.examples || [] };
      }
      return { id: w.id, word: w.translation, expected: w.word, userAnswer: '', examples: w.examples || [] };
    });
    this.reviewScore = 0;
    this.expandedExampleIndices.clear();
    this.reviewStage = 'quiz';
  }

  cancelReview() {
    this.stopAudio();
    this.reviewStage = 'setup';
    this.reviewQuestions = [];
    this.reviewScore = 0;
    this.expandedExampleIndices.clear();
  }

  async submitReview() {
    if (this.isGrading) return;
    if (this.reviewQuestions.length === 0) return;

    this.isGrading = true;
    this.statusMessage = 'Grading your answers...';
    try {
      const payload = this.reviewQuestions.map(q => ({
        id: q.id,
        word: q.word,
        expected: q.expected,
        user_answer: q.userAnswer.trim(),
      }));
      const result = await this.back.reviewWords(payload, this.reviewDirection);
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

  async retryReview() {
    this.reviewStage = 'setup';
    this.reviewQuestions = [];
    this.reviewScore = 0;
    this.expandedExampleIndices.clear();
    // Refresh from the server so words just graded are re-ordered by their
    // new last_reviewed_at / last_review_correct values.
    try {
      this.statusMessage = 'Refreshing words...';
      this.words = await this.back.getUserWords();
      this.statusMessage = '';
    } catch (error) {
      console.error('Failed to refresh words:', error);
      this.statusMessage = '';
    }
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

  stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.readingQuestionIndex = null;
    this.statusMessage = '';
  }

  closeWindow() {
    window.close();
  }

  getSelectedText() {
    const selection = window.getSelection();
    this.selectedText = selection ? selection.toString().trim() : '';
  }

  async speakSelectedText(text: string) {
    try {
      const response = await this.back.text_to_sound(text, '');
      this.statusMessage = 'Playing...';

      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
      }

      this.audio = await this.back.playAudioFromResponse(response);
      this.readingQuestionIndex = null;
      this.audio.onended = () => {
        this.statusMessage = '';
      };
    } catch (error) {
      console.error('Failed to read aloud:', error);
      this.statusMessage = 'Error playing audio';
      this.readingQuestionIndex = null;
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
        this.speakSelectedText(this.selectedText);
      }
    }
  }
}
