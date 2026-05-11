import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { conversationHistoryDTO } from '../model/conversationHistory.dto';

/**
 * Side panel that lists previous conversations.
 *
 * It is always visible but has two states:
 *  - collapsed: narrow rail showing icons only
 *  - expanded: full width showing conversation names
 *
 * It is purely presentational: emits events to the parent
 * so the parent keeps ownership of the data.
 */
@Component({
  selector: 'app-conversation-history',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './conversation-history.component.html',
  styleUrls: ['./conversation-history.component.scss']
})
export class ConversationHistoryComponent {
  @Input() conversations: conversationHistoryDTO[] = [];
  @Input() expanded = false;
  @Input() activeId: string = '';

  @Output() toggle = new EventEmitter<void>();
  @Output() choose = new EventEmitter<{ id: string; idContext: string }>();
  @Output() remove = new EventEmitter<{ event: Event; id: string }>();
  @Output() clear = new EventEmitter<void>();
  @Output() review = new EventEmitter<void>();
  @Output() rename = new EventEmitter<{ id: string; name: string }>();

  // Filter toggles. When both are off, all conversations are shown.
  // When both are on, only conversations that have BOTH notes and dictionary words show.
  filterNotes = false;
  filterWords = false;

  // Inline edit state. When `editingId` matches a conversation row, that row
  // shows a text input bound to `editingName` instead of the static title.
  editingId: string = '';
  editingName: string = '';

  get filteredConversations(): conversationHistoryDTO[] {
    if (!this.filterNotes && !this.filterWords) return this.conversations;
    return this.conversations.filter(c =>
      (!this.filterNotes || !!c.hasNotes) &&
      (!this.filterWords || !!c.hasWords)
    );
  }

  toggleFilterNotes() { this.filterNotes = !this.filterNotes; }
  toggleFilterWords() { this.filterWords = !this.filterWords; }

  onToggle() {
    this.toggle.emit();
  }

  onChoose(line: conversationHistoryDTO) {
    if (this.editingId) return; // ignore selection clicks while editing
    this.choose.emit({ id: line.id, idContext: line.idContext });
  }

  onRemove(event: Event, id: string) {
    event.stopPropagation();
    this.remove.emit({ event, id });
  }

  onClear() {
    this.clear.emit();
  }

  onReview() {
    this.review.emit();
  }

  startEdit(event: Event, line: conversationHistoryDTO) {
    event.stopPropagation();
    this.editingId = line.id;
    this.editingName = line.name || '';
  }

  cancelEdit(event?: Event) {
    if (event) event.stopPropagation();
    this.editingId = '';
    this.editingName = '';
  }

  commitEdit(event?: Event) {
    if (event) event.stopPropagation();
    const name = (this.editingName || '').trim();
    const id = this.editingId;
    if (!id) return;
    const current = this.conversations.find(c => c.id === id);
    if (name && current && name !== current.name) {
      this.rename.emit({ id, name });
    }
    this.cancelEdit();
  }

  onEditKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitEdit(event);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit(event);
    } else {
      event.stopPropagation();
    }
  }

  getFormattedDate(dateString: string): Date {
    return new Date(dateString);
  }

  trackById(_: number, item: conversationHistoryDTO) {
    return item.id;
  }
}
