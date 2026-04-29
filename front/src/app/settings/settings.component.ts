import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { contextDTO } from '../model/context.dto';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';

export interface LanguageOption { label: string; value: string; }
export interface VoiceOption { language: string; label: string; gender: string; }

/**
 * Modal window with application settings.
 *
 * Self-contained: owns all its own backend interactions (context CRUD,
 * language change, URL context, login...). The parent only needs to listen
 * to two outputs:
 *   - (close)    when the user dismisses the dialog
 *   - (message)  feedback string to display in the system banner
 *
 * Shared state with the parent is passed by reference (context, contexts,
 * languageOptions, voiceOptions) or through two-way bindings for primitive
 * values the parent also consumes (playback speed, language, voice, flags).
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatTooltipModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  /* ---------- two-way bindable primitives ---------- */
  @Input() swTalkResponse = true;
  @Output() swTalkResponseChange = new EventEmitter<boolean>();

  @Input() modeConversation = false;
  @Output() modeConversationChange = new EventEmitter<boolean>();

  @Input() swSaveConversation = true;
  @Output() swSaveConversationChange = new EventEmitter<boolean>();

  @Input() playbackSpeed = 1;
  @Output() playbackSpeedChange = new EventEmitter<number>();

  @Input() selectLanguage = '';
  @Output() selectLanguageChange = new EventEmitter<string>();

  @Input() selectVoice = '';
  @Output() selectVoiceChange = new EventEmitter<string>();

  /**
   * Secondary ("alternative") voice used for Shift+F4 playback and the
   * floating selection menu's alternative-voice button. Stored separately
   * from the primary voice so the user can pair an AI voice with a
   * different voice for their own lines.
   */
  @Input() selectHumanVoice = '';
  @Output() selectHumanVoiceChange = new EventEmitter<string>();

  @Input() contextUrl = '';
  @Output() contextUrlChange = new EventEmitter<string>();

  /* ---------- shared-reference inputs (mutated in place) ---------- */
  @Input() context: contextDTO = { id: '', label: '', text: '', remember: '', maxLengthAnswer: 70 };
  @Input() contexts: contextDTO[] = [];
  @Input() languageOptions: LanguageOption[] = [];
  @Input() voiceOptions: VoiceOption[] = [];

  /* ---------- parent-facing events (only 2) ---------- */
  @Output() close = new EventEmitter<void>();
  @Output() message = new EventEmitter<string>();

  /* ---------- local state ---------- */
  selectContext = '';

  /**
   * Whether the "Voice & language" subsection is expanded. Collapsed by
   * default so the settings panel stays compact; the user explicitly opens
   * it with the toggle button when they want to change voices.
   */
  voicesExpanded = false;

  constructor(
    private back: ApiBackService,
    private router: Router,
    public persistence: PersistenceService,
  ) {}

  /* ---------- derived values ---------- */
  get filteredVoiceOptions(): VoiceOption[] {
    return this.voiceOptions.filter(v => v.language === this.selectLanguage);
  }

  /**
   * Voices grouped by language (label) for the secondary-voice dropdown.
   * The user typically wants the alternative voice to be in a *different*
   * language/character than the primary, so this list is NOT filtered by
   * `selectLanguage` — it shows all voices, organised by language.
   */
  get voiceOptionsByLanguage(): { language: string; languageLabel: string; voices: VoiceOption[] }[] {
    const groups = new Map<string, { languageLabel: string; voices: VoiceOption[] }>();
    for (const v of this.voiceOptions) {
      const langLabel = this.languageOptions.find(l => l.value === v.language)?.label ?? v.language;
      if (!groups.has(v.language)) {
        groups.set(v.language, { languageLabel: langLabel, voices: [] });
      }
      groups.get(v.language)!.voices.push(v);
    }
    return Array.from(groups.entries()).map(([language, g]) => ({
      language,
      languageLabel: g.languageLabel,
      voices: g.voices,
    }));
  }

  get selectLanguageDesc(): string {
    return this.languageOptions.find(l => l.value === this.selectLanguage)?.label ?? '';
  }

  /* ---------- UI handlers ---------- */
  toggleVoices() {
    this.voicesExpanded = !this.voicesExpanded;
  }

  onSpeedInput(event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.playbackSpeed = value;
    this.playbackSpeedChange.emit(value);
  }

  async onLanguageChange() {
    if (!this.selectVoice) return;
    const response = await this.back.changeLanguage(this.selectLanguage, this.selectVoice);
    this.putMessage(response);
  }

  async onHumanVoiceChange() {
    if (!this.selectHumanVoice) return;
    const response = await this.back.changeHumanVoice(this.selectHumanVoice);
    this.putMessage(response);
  }

  async onContextChange(event: Event, id: string) {
    const select = event.target as HTMLSelectElement;
    const selectedLabel = select.options[select.selectedIndex].text;
    const found = this.contexts.find(c => c.label === selectedLabel)
                ?? this.contexts.find(c => c.id === 'default');
    if (found) this.applyContext(found);
    await this.back.contextSet(id);
  }

  async onContextDelete(id: string) {
    if (this.context.label === 'default') return;
    const response = await this.back.contextDelete(id);
    await this.reloadContexts();
    this.context.text = '';
    this.context.label = '';
    this.context.remember = '';
    this.putMessage(response);
  }

  async onContextSend(event: Event) {
    const textArea = event.target as HTMLTextAreaElement;
    if (!textArea) return;
    this.context.text = textArea.value;
    if (!this.context.text) return;

    const response = await this.back.contextSend(this.context);
    await this.reloadContexts();
    this.selectContext = this.context.label;
    this.putMessage(response);
    this.onClose();
  }

  async onContextRememberSend(event: Event) {
    const textArea = event.target as HTMLTextAreaElement;
    if (!textArea) return;
    this.context.remember = textArea.value;
    await this.back.contextSend(this.context);
    await this.reloadContexts();
    this.selectContext = this.context.label;
    this.message.emit('Changed text to remember');
  }

  async onContextUrlSend() {
    const url = this.contextUrl.trim();
    if (!url) return;
    const response = await this.back.contextSetUrl(url);
    this.putMessage(response);
    await this.refreshContextUrl();
  }

  async onContextUrlClear() {
    const response = await this.back.contextClearUrl();
    this.setContextUrl('');
    this.putMessage(response);
  }

  onMaxLengthAnswerBlur(value: string) {
    if (value.trim() === '') return;
    this.back.setMaxLengthAnswer(value);
  }

  async onLogin() {
    try {
      await this.back.logoutUser();
    } finally {
      this.persistence.logout();
      this.router.navigate(['/login']);
    }
  }

  onClose() {
    this.close.emit();
  }

  /* ---------- helpers ---------- */
  private applyContext(c: contextDTO) {
    this.context.id = c.id;
    this.context.label = c.label;
    this.context.text = c.text;
    this.context.remember = c.remember;
  }

  private async reloadContexts() {
    const response = await this.back.contextsUserList();
    // mutate in place so the parent's reference stays in sync
    this.contexts.length = 0;
    if (response?.contexts) this.contexts.push(...response.contexts);
  }

  private async refreshContextUrl() {
    try {
      const r = await this.back.contextGetUrl();
      this.setContextUrl(r?.url ?? '');
    } catch {
      this.setContextUrl('');
    }
  }

  private setContextUrl(url: string) {
    this.contextUrl = url;
    this.contextUrlChange.emit(url);
  }

  private putMessage(response: any) {
    if (!response) return;
    // ApiBackService returns parsed JSON bodies (via HttpClient) where the
    // server places a "message" field. Emit it directly when present.
    if (typeof response.message === 'string') {
      this.message.emit(response.message);
    }
  }
}
