import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';
import { marked } from 'marked';

@Component({
  selector: 'app-notes-page',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="header">
        <span class="title">📝 Conversation Notes</span>
        <div class="header-actions">
          <button class="toggle-btn" (click)="isPreview = !isPreview">
            {{ isPreview ? '✏️ Edit' : '👁 Preview' }}
          </button>
          <button class="save-btn" (click)="saveNotes()" [disabled]="isSaving">
            {{ isSaving ? 'Saving...' : 'Save' }}
          </button>
          <span class="save-message">{{ saveMessage }}</span>
        </div>
      </div>
      <div class="body">
        <textarea
          *ngIf="!isPreview"
          class="notes-textarea"
          [(ngModel)]="notes"
          placeholder="Write your notes in Markdown format...">
        </textarea>
        <div
          *ngIf="isPreview"
          class="notes-preview"
          [innerHTML]="renderedNotes">
        </div>
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
      padding: 10px 16px;
      background: #37474f;
      color: white;
      flex-shrink: 0;
    }

    .title { font-size: 16px; font-weight: bold; }

    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .toggle-btn, .save-btn {
      padding: 6px 14px;
      font-size: 13px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    .toggle-btn { background: #1976d2; color: white; }
    .save-btn   { background: #4caf50; color: white; }
    .save-btn:disabled { background: #aaa; cursor: not-allowed; }

    .save-message { font-size: 13px; color: #a5d6a7; min-width: 50px; }

    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 12px;
      overflow: hidden;
    }

    .notes-textarea {
      flex: 1;
      width: 100%;
      height: 100%;
      resize: none;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
      box-sizing: border-box;
      line-height: 1.6;
    }

    .notes-preview {
      flex: 1;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 12px 16px;
      background: white;
      overflow-y: auto;
      font-size: 14px;
      line-height: 1.7;
    }

    .notes-preview ::ng-deep h1, .notes-preview ::ng-deep h2, .notes-preview ::ng-deep h3 { font-weight: bold; margin: 0.6em 0 0.3em; }
    .notes-preview ::ng-deep h1 { font-size: 1.6em; }
    .notes-preview ::ng-deep h2 { font-size: 1.3em; }
    .notes-preview ::ng-deep h3 { font-size: 1.1em; }
    .notes-preview ::ng-deep ul, .notes-preview ::ng-deep ol { padding-left: 1.5em; }
    .notes-preview ::ng-deep code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
    .notes-preview ::ng-deep pre { background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; }
    .notes-preview ::ng-deep blockquote { border-left: 4px solid #90a4ae; margin: 0; padding-left: 14px; color: #546e7a; }
    .notes-preview ::ng-deep a { color: #1976d2; }
    .notes-preview ::ng-deep hr { border: none; border-top: 1px solid #ccc; }
    .notes-preview ::ng-deep table { border-collapse: collapse; width: 100%; }
    .notes-preview ::ng-deep th, .notes-preview ::ng-deep td { border: 1px solid #ccc; padding: 6px 10px; }
    .notes-preview ::ng-deep th { background: #eceff1; font-weight: bold; }
  `]
})
export class NotesPageComponent implements OnInit {
  conversationId: string = '';
  notes: string = '';
  isSaving: boolean = false;
  saveMessage: string = '';
  isPreview: boolean = true;

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
}
