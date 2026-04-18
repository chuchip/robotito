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
  templateUrl: './notes.component.html',
  styleUrls: ['./notes.component.scss'],
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
