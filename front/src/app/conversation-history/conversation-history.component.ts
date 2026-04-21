import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, MatTooltipModule],
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

  onToggle() {
    this.toggle.emit();
  }

  onChoose(line: conversationHistoryDTO) {
    this.choose.emit({ id: line.id, idContext: line.idContext });
  }

  onRemove(event: Event, id: string) {
    event.stopPropagation();
    this.remove.emit({ event, id });
  }

  onClear() {
    this.clear.emit();
  }

  getFormattedDate(dateString: string): Date {
    return new Date(dateString);
  }

  trackById(_: number, item: conversationHistoryDTO) {
    return item.id;
  }
}
