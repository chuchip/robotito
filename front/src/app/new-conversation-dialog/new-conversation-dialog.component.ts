import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { contextDTO } from '../model/context.dto';
import { ApiBackService } from '../services/api-back.service';

/**
 * Result returned by the new-conversation dialog.
 *   - `context`    : the chosen / newly-created context profile to apply
 *                    to the LLM for this conversation.
 *   - `reviewMode` : true when the user clicked the "Review words" button;
 *                    the caller is responsible for picking the words and
 *                    building the review context.
 * `null` means the user cancelled.
 */
export interface NewConversationDialogResult {
  context?: contextDTO;
  reviewMode?: boolean;
}

/**
 * Dialog shown when the user starts a new conversation.
 *
 * Lets them either pick an existing context profile (and optionally edit
 * its text) or create a brand new one with its own label and text, OR
 * start a vocabulary-review session that picks 10 random words from the
 * user's dictionary as the context.
 */
@Component({
  selector: 'app-new-conversation-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatTooltipModule],
  templateUrl: './new-conversation-dialog.component.html',
  styleUrls: ['./new-conversation-dialog.component.scss']
})
export class NewConversationDialogComponent {
  contexts: contextDTO[] = [];
  // 'new' represents the "+ Add new" option; any other value is a context id.
  selectedId: string = '';
  // Working copy of the selected/edited context.
  label: string = '';
  text: string = '';
  // When true, the user is creating a brand-new context (label is editable).
  isNew: boolean = false;
  saving = false;
  errorMsg = '';

  constructor(
    public dialogRef: MatDialogRef<NewConversationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { contexts: contextDTO[]; current?: contextDTO },
    private back: ApiBackService,
  ) {
    this.contexts = data?.contexts || [];
    const current = data?.current;
    if (current && current.id) {
      this.selectedId = current.id;
      this.label = current.label || '';
      this.text = current.text || '';
    } else if (this.contexts.length > 0) {
      const first = this.contexts[0];
      this.selectedId = first.id;
      this.label = first.label || '';
      this.text = first.text || '';
    } else {
      this.selectedId = 'new';
      this.isNew = true;
    }
  }

  onSelectChange() {
    if (this.selectedId === 'new') {
      this.isNew = true;
      this.label = '';
      this.text = '';
      return;
    }
    this.isNew = false;
    const found = this.contexts.find(c => c.id === this.selectedId);
    if (found) {
      this.label = found.label || '';
      this.text = found.text || '';
    }
  }

  onCancel() {
    this.dialogRef.close(null);
  }

  /**
   * Dedicated "Review words" action: closes the dialog signalling a
   * review-mode start. The caller picks the words and builds the
   * context; the dialog does not need any label/text from the user.
   */
  onReview() {
    this.dialogRef.close({ reviewMode: true } as NewConversationDialogResult);
  }

  /**
   * Persist the (possibly edited or brand-new) context and return it to the
   * caller. The caller is responsible for applying it as the active LLM
   * context for the new conversation.
   */
  async onAccept() {
    const label = (this.label || '').trim();
    const text = (this.text || '').trim();
    if (this.isNew && !label) {
      this.errorMsg = 'Please choose a label for the new context.';
      return;
    }
    if (!label) {
      this.errorMsg = 'Context label is required.';
      return;
    }
    this.saving = true;
    this.errorMsg = '';
    try {
      // Save the context profile so it sticks around in the user's list.
      // Preserve existing `remember` if we're editing an existing context;
      // the dialog itself no longer exposes that field.
      const existing = this.contexts.find(c => c.id === this.selectedId);
      const remember = existing?.remember || '';
      const dto: contextDTO = {
        id: this.isNew ? '' : (existing?.id || ''),
        label,
        text,
        remember,
        maxLengthAnswer: existing?.maxLengthAnswer ?? 70,
      } as contextDTO;
      const resp: any = await this.back.contextSend(dto);
      // The backend may return the new id under different fields; fall back
      // to looking it up from a fresh list to stay robust.
      let savedId = resp?.id || resp?.data?.id || dto.id;
      if (!savedId) {
        const listResp: any = await this.back.contextsUserList();
        const found = (listResp?.contexts || []).find((c: contextDTO) => c.label === label);
        if (found) savedId = found.id;
      }
      const result: contextDTO = { ...dto, id: savedId || dto.id } as contextDTO;
      this.dialogRef.close({ context: result } as NewConversationDialogResult);
    } catch (e) {
      console.error('Failed to save context:', e);
      this.errorMsg = 'Could not save context. Please try again.';
    } finally {
      this.saving = false;
    }
  }
}
