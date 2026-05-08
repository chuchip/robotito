import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Floating contextual menu that appears next to a text selection. Used in
 * the conversation, dictionary and review pages so the user can speak
 * selected text aloud with either the primary voice (F4) or the
 * alternative voice (Shift+F4) without having to remember the shortcut.
 *
 * Self-contained: it listens to its own document-level `mouseup`, `keyup`
 * and `click` events, manages its own visibility/positioning, and emits a
 * single `(speak)` event when the user clicks one of the buttons. The
 * parent component decides which voice to actually use based on `alt`.
 */
@Component({
  selector: 'app-selection-menu',
  standalone: true,
  imports: [CommonModule, MatTooltipModule],
  templateUrl: './selection-menu.component.html',
  styleUrls: ['./selection-menu.component.scss'],
})
export class SelectionMenuComponent {
  /** Fired when the user clicks one of the menu buttons. `alt` is true
   *  when the user picked the alternative-voice action (Shift+F4). */
  @Output() speak = new EventEmitter<{ text: string; alt: boolean }>();
  /** Optional translate function. When provided, the component calls it
   *  directly and shows the result in a small popover next to the
   *  selection — parent doesn't need to handle anything. */
  @Input() translateFn?: (text: string) => Promise<string>;

  showMenu = false;
  menuX = 0;
  menuY = 0;
  selectedText = '';

  // Translation popover state. Lives in the same component so the popover
  // can be anchored to the selection rect we already track.
  showTranslation = false;
  translationText = '';
  translationLoading = false;
  translationX = 0;
  translationY = 0;

  /** Re-evaluate the current document selection and toggle the menu. */
  private updateFromSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    this.selectedText = text;

    if (text === '' || !selection || selection.rangeCount === 0) {
      this.showMenu = false;
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) {
      this.showMenu = false;
      return;
    }

    // Approximate menu height; flip above the selection if it would
    // overflow the viewport bottom.
    const menuHeight = 40;
    const margin = 6;
    if (rect.bottom + menuHeight + margin > window.innerHeight) {
      this.menuY = Math.max(margin, rect.top - menuHeight - margin);
    } else {
      this.menuY = rect.bottom + margin;
    }
    // Clamp horizontally so the menu stays inside the viewport.
    // Estimate is generous because the menu now has 3 buttons including the
    // long "Alternative voice" label, plus material icons.
    const approxMenuWidth = 460;
    this.menuX = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, window.innerWidth - approxMenuWidth - margin),
    );
    this.showMenu = true;
  }

  @HostListener('document:mouseup')
  onMouseUp() { this.updateFromSelection(); }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    // Only react to keys that change a selection; ignore F4/Shift+F4 etc.
    // so the menu doesn't disappear right after the user uses the shortcut.
    if (event.key === 'Shift' || event.key.startsWith('Arrow') ||
        event.key === 'Home' || event.key === 'End') {
      this.updateFromSelection();
    }
  }

  /**
   * Close the menu when the user clicks somewhere that doesn't preserve
   * the selection. The menu's own buttons call `event.preventDefault()` on
   * mousedown so the selection stays alive while the click goes through.
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Don't dismiss when clicking inside the menu itself or inside the
    // translation popover — otherwise the very click that asked for the
    // translation would close the popover before it renders.
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('.selection-translation') ||
                   target.closest('.selection-menu'))) {
      return;
    }
    if (this.showTranslation) {
      this.showTranslation = false;
      this.translationText = '';
    }
    if (!this.showMenu) return;
    const sel = window.getSelection();
    const stillSelected = sel ? sel.toString().trim() : '';
    if (stillSelected === '') {
      this.showMenu = false;
      this.selectedText = '';
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.showMenu = false;
      this.showTranslation = false;
    }
  }

  onSpeak(alt: boolean) {
    const text = this.selectedText.trim();
    if (text === '') {
      this.showMenu = false;
      return;
    }
    this.speak.emit({ text, alt });
    this.showMenu = false;
  }

  async onTranslate() {
    const text = this.selectedText.trim();
    if (text === '' || !this.translateFn) {
      this.showMenu = false;
      return;
    }
    // Anchor the popover to the same coords as the menu, but slightly below
    // it so they don't overlap if the user clicked the menu's Translate.
    // Clamp horizontally too (popover is narrower).
    const approxPopoverWidth = 380;
    const margin = 6;
    this.translationX = Math.min(
      Math.max(margin, this.menuX),
      Math.max(margin, window.innerWidth - approxPopoverWidth - margin),
    );
    this.translationY = this.menuY + 44;
    this.translationLoading = true;
    this.showTranslation = true;
    this.translationText = '';
    this.showMenu = false;
    try {
      const result = await this.translateFn(text);
      this.translationText = result || '(no translation)';
    } catch {
      this.translationText = 'Translate error';
    } finally {
      this.translationLoading = false;
    }
  }

  closeTranslation() {
    this.showTranslation = false;
    this.translationText = '';
  }
}
