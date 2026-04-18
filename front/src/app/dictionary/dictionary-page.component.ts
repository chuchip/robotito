import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';

interface Word {
  id?: string;
  word: string;
  translation: string;
  examples: string;
  createdDate?: string;
}

@Component({
  selector: 'app-dictionary-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="header">
        <span class="title">📚 Conversation Dictionary</span>
        <button class="close-btn" (click)="closeWindow()">Close</button>
      </div>
      
      <div class="search-section">
        <input 
          type="text" 
          class="search-input" 
          [(ngModel)]="searchTerm" 
          placeholder="Search words..."
          (keyup)="filterWords()">
      </div>

      <div class="body">
        <div class="add-word-section">
          <input 
            type="text" 
            [(ngModel)]="newWord" 
            placeholder="Enter a word to translate..."
            class="word-input"
            (keydown.enter)="addWord()">
          <button (click)="addWord()" class="add-btn" [disabled]="isAdding || !newWord.trim()">
            {{ isAdding ? 'Adding...' : 'Add Word' }}
          </button>
        </div>

        <div *ngIf="filteredWords.length === 0" class="no-words-message">
          No words added yet. Add a word to get started!
        </div>

        <div class="words-list">
          <div *ngFor="let item of filteredWords" class="word-card" [class.editing]="editingId === item.id">
            <div class="word-header">
              <strong class="word-text">{{ item.word }}</strong>
              <div class="word-actions">
                <button (click)="readAloud(item)" class="action-btn" title="Read aloud">
                  <span class="material-icons">volume_up</span>
                </button>
                <button (click)="toggleEdit(item)" class="action-btn" [title]="editingId === item.id ? 'Save' : 'Edit'">
                  <span class="material-icons">{{ editingId === item.id ? 'check' : 'edit' }}</span>
                </button>
                <button (click)="deleteWord(item.id!)" class="action-btn delete-btn" title="Delete">
                  <span class="material-icons">delete</span>
                </button>
              </div>
            </div>

            <div *ngIf="editingId !== item.id" class="word-content">
              <div class="translation">
                <strong>Translation:</strong> {{ item.translation }}
              </div>
              <div class="examples">
                <strong>Examples:</strong>
                <p>{{ item.examples }}</p>
              </div>
            </div>

            <div *ngIf="editingId === item.id" class="word-edit">
              <div>
                <label>Translation:</label>
                <textarea [(ngModel)]="item.translation" class="edit-textarea"></textarea>
              </div>
              <div>
                <label>Examples:</label>
                <textarea [(ngModel)]="item.examples" class="edit-textarea"></textarea>
              </div>
              <button (click)="toggleEdit(item)" class="save-btn">Save Changes</button>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <span class="status-message">{{ statusMessage }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; margin: 0; font-family: sans-serif; }

    .page {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #f5f5f5;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .title {
      font-size: 24px;
      font-weight: bold;
    }

    .close-btn {
      padding: 8px 16px;
      background: rgba(255,255,255,0.2);
      border: 1px solid white;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.3s;
    }

    .close-btn:hover {
      background: rgba(255,255,255,0.3);
    }

    .search-section {
      padding: 12px 16px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
    }

    .search-input {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .add-word-section {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      background: white;
      padding: 12px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .word-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .add-btn {
      padding: 10px 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      transition: background 0.3s;
    }

    .add-btn:hover:not(:disabled) {
      background: #5568d3;
    }

    .add-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .no-words-message {
      text-align: center;
      padding: 40px 16px;
      color: #999;
      font-size: 16px;
    }

    .words-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .word-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .word-card.editing {
      background: #f9f9f9;
      border-color: #667eea;
    }

    .word-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .word-text {
      font-size: 16px;
      color: #333;
    }

    .word-actions {
      display: flex;
      gap: 4px;
    }

    .action-btn {
      padding: 4px 8px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 3px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .action-btn:hover {
      background: #e0e0e0;
    }

    .action-btn.delete-btn:hover {
      background: #ffcccc;
      border-color: #ff0000;
    }

    .material-icons {
      font-size: 18px;
    }

    .word-content {
      font-size: 14px;
    }

    .translation {
      margin-bottom: 8px;
      padding: 8px;
      background: #f9f9f9;
      border-left: 3px solid #667eea;
      border-radius: 2px;
    }

    .examples {
      margin-bottom: 8px;
      padding: 8px;
      background: #f9f9f9;
      border-left: 3px solid #764ba2;
      border-radius: 2px;
    }

    .examples p {
      margin: 4px 0 0 0;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .word-edit {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
    }

    .word-edit div {
      margin-bottom: 12px;
    }

    .word-edit label {
      display: block;
      font-weight: bold;
      margin-bottom: 4px;
      color: #333;
    }

    .edit-textarea {
      width: 100%;
      min-height: 60px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      resize: vertical;
    }

    .save-btn {
      padding: 10px 16px;
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      transition: background 0.3s;
    }

    .save-btn:hover {
      background: #45a049;
    }

    .footer {
      padding: 12px 16px;
      border-top: 1px solid #e0e0e0;
      background: white;
      text-align: right;
    }

    .status-message {
      font-size: 12px;
      color: #666;
    }
  `]
})
export class DictionaryPageComponent implements OnInit {
  conversationId: string = '';
  words: Word[] = [];
  filteredWords: Word[] = [];
  searchTerm: string = '';
  newWord: string = '';
  isAdding: boolean = false;
  editingId: string | null = null;
  statusMessage: string = '';

  constructor(
    private route: ActivatedRoute,
    private back: ApiBackService,
    private persistence: PersistenceService
  ) {}

  async ngOnInit() {
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
      this.filteredWords.push(word);
      this.newWord = '';
      this.statusMessage = 'Word added!';
      setTimeout(() => this.statusMessage = '', 2000);
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

  async readAloud(word: Word) {
    try {
      const textToSpeak = `${word.word}: ${word.translation}. Examples: ${word.examples}`;
      await this.back.text_to_sound(textToSpeak, '');
      this.statusMessage = 'Playing...';
    } catch (error) {
      console.error('Failed to read aloud:', error);
      this.statusMessage = 'Error playing audio';
    }
  }

  closeWindow() {
    window.close();
  }
}
