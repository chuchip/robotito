import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';
import { marked } from 'marked';

@Component({
  selector: 'app-notes',
  imports: [CommonModule, FormsModule],
  templateUrl: './notes.component.html',
  styleUrl: './notes.component.scss'
})
export class NotesComponent implements OnInit {
  @Input() conversationId: string = '';

  notes: string = '';
  isSaving: boolean = false;
  saveMessage: string = '';
  isPreview: boolean = false;

  get renderedNotes(): string {
    return marked(this.notes) as string;
  }

  constructor(public back: ApiBackService, public persistence: PersistenceService) {}

  async ngOnInit() {
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
      this.saveMessage = 'Error saving notes.';
    } finally {
      this.isSaving = false;
    }
  }

  closeWindow() {
    this.persistence.showNotes = false;
  }
}
