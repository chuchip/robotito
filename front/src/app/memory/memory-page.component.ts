import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiBackService } from '../services/api-back.service';
import { PersistenceService } from '../services/persistence.service';

interface MemoryFact {
  id: number;
  category: string;
  key: string;
  value: string;
  confidence: number;
  hitCount: number;
  lastSeen: string;
}

@Component({
  selector: 'app-memory-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './memory.component.html',
  styleUrls: ['./memory.component.scss'],
})
export class MemoryPageComponent implements OnInit {
  profile: string = '';
  memoryEnabled: boolean = true;
  facts: MemoryFact[] = [];
  loading: boolean = false;
  saveMessage: string = '';
  isSaving: boolean = false;

  constructor(
    public back: ApiBackService,
    public persistence: PersistenceService,
  ) {}

  async ngOnInit() {
    this.persistence.restoreFromLocalStorage();
    await this.reload();
  }

  async reload() {
    this.loading = true;
    try {
      const data = await this.back.getMemory();
      this.profile = data?.profile ?? '';
      this.memoryEnabled = data?.memoryEnabled ?? true;
      this.facts = data?.facts ?? [];
    } catch {
      this.saveMessage = 'Could not load memory';
    } finally {
      this.loading = false;
    }
  }

  groupedFacts(): { category: string; items: MemoryFact[] }[] {
    const groups: Record<string, MemoryFact[]> = {};
    for (const f of this.facts) {
      (groups[f.category] = groups[f.category] || []).push(f);
    }
    const order = ['profile', 'instruction', 'preference', 'goal', 'mistake'];
    return Object.keys(groups)
      .sort((a, b) => {
        const ai = order.indexOf(a); const bi = order.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .map(category => ({ category, items: groups[category] }));
  }

  async saveProfile() {
    this.isSaving = true;
    this.saveMessage = '';
    try {
      await this.back.saveMemoryProfile(this.profile);
      this.saveMessage = 'Saved!';
      setTimeout(() => this.saveMessage = '', 2000);
    } catch {
      this.saveMessage = 'Error!';
    } finally {
      this.isSaving = false;
    }
  }

  async toggleEnabled() {
    try {
      await this.back.setMemoryEnabled(this.memoryEnabled);
    } catch {
      // Revert on failure
      this.memoryEnabled = !this.memoryEnabled;
    }
  }

  async deleteFact(fact: MemoryFact) {
    if (!confirm(`Forget "${fact.key}: ${fact.value}"?`)) return;
    try {
      await this.back.deleteMemoryFact(fact.id);
      this.facts = this.facts.filter(f => f.id !== fact.id);
    } catch {
      this.saveMessage = 'Could not delete';
    }
  }

  async forgetAll() {
    if (!confirm('This will erase the profile and ALL remembered facts. Continue?')) return;
    try {
      await this.back.forgetAllMemory();
      this.profile = '';
      this.facts = [];
      this.saveMessage = 'Memory wiped';
      setTimeout(() => this.saveMessage = '', 2000);
    } catch {
      this.saveMessage = 'Error!';
    }
  }

  async consolidateNow() {
    this.isSaving = true;
    this.saveMessage = '';
    try {
      const res = await this.back.consolidateMemoryNow();
      this.saveMessage = res?.updated ? 'Updated!' : 'Nothing to update';
      await this.reload();
      setTimeout(() => this.saveMessage = '', 2500);
    } catch {
      this.saveMessage = 'Error!';
    } finally {
      this.isSaving = false;
    }
  }
}
