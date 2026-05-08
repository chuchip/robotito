# Long-term memory feature

Branch: `feature/long-term-memory`

Adds cross-conversation memory so Robotito "knows" the user across sessions:
a free-form profile paragraph plus a structured facts table, both auto-curated
by the LLM at the end of each session and periodically during long
conversations. The user can view, edit, and delete everything from a new
"What Robotito remembers about you" page.

---

## Pre-deploy steps

1. Re-run `back/init_db.sql` against Postgres (idempotent, uses `IF NOT EXISTS` /
   `ADD COLUMN IF NOT EXISTS`).
2. Optional env var: `MEMORY_CONSOLIDATE_EVERY=20` controls how often memory is
   refreshed during a long conversation (counted in user turns). Set to `0` to
   disable mid-conversation refresh; logout-time consolidation always runs.

No front-end build config changes; just `ng build` / `ng serve` as usual.

---

## Database schema (`back/init_db.sql`)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_facts (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,        -- 'profile' | 'preference' | 'mistake' | 'goal' | 'instruction'
    key TEXT NOT NULL,             -- e.g. 'age', 'hobby:football', 'mistake:past_tense'
    value TEXT NOT NULL,
    confidence REAL DEFAULT 0.7,
    hit_count INT NOT NULL DEFAULT 1,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, category, key)
);
CREATE INDEX IF NOT EXISTS user_facts_user_idx ON user_facts (user_id, category);
```

---

## Backend

### `back/src/ai_models.py`
- New Pydantic models `MemoryFact` and `MemoryExtraction` (output schema for
  the consolidation chain).

### `back/src/ai_chains.py`
- New `memory` chain (`_prompt_memory_str`) that takes the existing profile,
  the existing facts (JSON), and the recent transcript, and returns an updated
  profile + a list of structured facts. Registered in `build_chains()`.

### `back/src/ai_service.py`
- New `_consolidate_every` config (env `MEMORY_CONSOLIDATE_EVERY`, default 20).
- `call_llm()` now lazy-loads the user's long-term memory once per session and
  prepends it to the system prompt (no DB hit per turn after the first).
- `load_long_term_memory(user_id) -> str` builds the system-prompt block from
  `users.profile` + top facts, grouped by category. Returns `""` if the user
  has memory disabled or nothing stored.
- `consolidate_memory(uuid)` reads existing memory, runs the LLM extraction
  chain on the current chat history, upserts profile + facts, and refreshes
  the in-memory cache.
- `schedule_consolidation_if_due(uuid)` increments a per-session turn counter
  and triggers a background `consolidate_memory()` when the threshold is
  reached.

### `back/src/memory.py`
- `memoryDTO` gained `long_term_memory` (cached system-prompt block) and
  `turns_since_consolidation`, plus accessors. `clear()` resets both.

### `back/src/persistence.py`
New helpers:
- `get_user_profile(user_id)` → `{profile, memory_enabled}`
- `set_user_profile(user_id, profile)`
- `set_memory_enabled(user_id, enabled)`
- `upsert_user_fact(user_id, category, key, value, confidence)` — `ON CONFLICT`
  bumps `hit_count` and `last_seen`, keeps highest confidence.
- `get_user_facts(user_id, limit)` — ordered by `hit_count DESC, last_seen DESC`.
- `delete_user_fact(user_id, fact_id)`
- `delete_all_user_facts(user_id)`

### `back/src/api/memory.py` (new)
`memory_bp` blueprint mounted at `/api/memory`:

| Method | Path                       | Purpose                                           |
|--------|----------------------------|---------------------------------------------------|
| GET    | `/api/memory`              | Returns `{profile, memoryEnabled, facts[]}`       |
| PUT    | `/api/memory/profile`      | Save the free-form profile text                   |
| PUT    | `/api/memory/enabled`      | Toggle the whole feature per user                 |
| DELETE | `/api/memory/fact/<id>`    | Forget a single fact                              |
| DELETE | `/api/memory`              | Wipe profile + all facts for the current user     |
| POST   | `/api/memory/consolidate`  | Force a consolidation now (used by "Update now")  |

Auth follows the same `uuid` + `Authorization` header pattern as the rest of
the API. Every write also clears the in-memory LTM cache so the change is
visible on the next turn.

### `back/src/api/security.py`
- `logout` now calls `consolidate_memory(uuid)` **before** `mem.clear()` so
  whatever the user just shared is remembered next time they log in.

### `back/src/api/conversation.py`
- `conversation_saveId` calls `schedule_consolidation_if_due(uuid)` on user
  turns (`type == 'H'`). The counter ignores assistant replies so a turn
  doesn't double-count.

### `back/src/robotito_ai.py`
- Imports and registers `memory_bp` at `/api/memory`.
- Re-exports `consolidate_memory`, `load_long_term_memory`,
  `schedule_consolidation_if_due` for `import robotito_ai as ai` callers.

---

## Front-end

### New page: `front/src/app/memory/`
- `memory-page.component.ts` — standalone Angular component, mirrors the
  `notes` page pattern. Loads memory via `ApiBackService`, groups facts by
  category, supports save/edit profile, delete individual facts, "forget
  everything", toggle memory on/off, and "Update now" (forces consolidation).
- `memory.component.html` — header with toggle + actions; profile textarea;
  facts list grouped by category with per-row delete.
- `memory.component.scss` — same visual language as `notes.component.scss`
  (dark teal header, white cards, matches existing app aesthetic).

### `front/src/app/app.routes.ts`
- New route `{ path: 'memory', component: MemoryPageComponent }`.

### `front/src/app/services/api-back.service.ts`
Six new methods, all using the existing `firstValueFrom(http.*)` pattern and
the `authInterceptor` for headers:
- `getMemory()`
- `saveMemoryProfile(profile)`
- `setMemoryEnabled(enabled)`
- `deleteMemoryFact(factId)`
- `forgetAllMemory()`
- `consolidateMemoryNow()`

### `front/src/app/conversation/conversation.component.{ts,html}`
- New `memoryWindow` field and `openMemory()` method (same popup pattern as
  Notes / Dictionary / Review).
- New toolbar button next to Dictionary, using the `psychology` material icon
  and tooltip "What Robotito remembers about you".

---

## Behaviour

- **First message of a session**: the assistant's system prompt now includes
  any previously stored profile + top facts, formatted as
  `Profile: ...\nProfile: name: ...; age: ...\nInstruction: ...\n`.
- **During a long conversation**: every `MEMORY_CONSOLIDATE_EVERY` user turns
  (default 20) the chat history is sent to the memory chain in the background;
  new/changed facts are upserted, the profile is rewritten by the LLM, and the
  in-memory cache is refreshed so the next turn already sees the update.
- **At logout**: a final consolidation runs before the in-memory session is
  cleared. The DB row outlives the session, so re-login restores the memory.
- **User control**: the brain icon opens the memory page where the user can
  edit/delete anything. Disabling memory globally via the toggle stops both
  reads (no system-prompt injection) and writes (no consolidation).

---

## Files changed / added

Backend:
- `back/init_db.sql` (modified)
- `back/src/ai_chains.py` (modified)
- `back/src/ai_models.py` (modified)
- `back/src/ai_service.py` (modified)
- `back/src/api/conversation.py` (modified)
- `back/src/api/memory.py` (new)
- `back/src/api/security.py` (modified)
- `back/src/memory.py` (modified)
- `back/src/persistence.py` (modified)
- `back/src/robotito_ai.py` (modified)

Front-end:
- `front/src/app/app.routes.ts` (modified)
- `front/src/app/conversation/conversation.component.html` (modified)
- `front/src/app/conversation/conversation.component.ts` (modified)
- `front/src/app/memory/memory-page.component.ts` (new)
- `front/src/app/memory/memory.component.html` (new)
- `front/src/app/memory/memory.component.scss` (new)
- `front/src/app/services/api-back.service.ts` (modified)

Documentation:
- `changes.MD` (this file)

---

# Conversation list: notes/dictionary indicators + filter

Adds visual indicators and a filter to the conversation history side panel:

- Each conversation row now shows a small icon when it has saved **notes**
  (amber `note_alt`) and/or **dictionary words** (sky-blue `library_books`).
- Two new toggle buttons sit next to "Review words" in the side panel: filter
  to only show conversations that have notes, that have dictionary words, or
  both (AND when both are active).

## Backend

### `back/src/persistence.py`
- `conversation_get_list(user)` SQL extended with two derived booleans:
  - `has_notes` — true when `conversation_notes` row exists with non-empty text.
  - `has_words` — true when at least one `dictionary_words` row exists.
- Returned dicts now include `hasNotes` and `hasWords`.

No new endpoint — same `GET /api/conversation/user/<user>` route, now richer.

## Front-end

### `front/src/app/model/conversationHistory.dto.ts`
- DTO gains optional `hasNotes` and `hasWords` flags.

### `front/src/app/conversation-history/conversation-history.component.ts`
- New component state `filterNotes`, `filterWords`.
- New computed getter `filteredConversations` applied to the list.
- `toggleFilterNotes()` / `toggleFilterWords()` handlers.

### `front/src/app/conversation-history/conversation-history.component.html`
- Two new toggle buttons (`history__filter`) inside `.history__tools`,
  each sporting the corresponding material icon and an `aria-pressed` state.
- Each conversation row renders a `history__badges` span with up to two
  badges (`note_alt`, `library_books`) when the corresponding flag is true.
- The list iterates `filteredConversations` instead of `conversations`.
- New empty-state message when filters hide every entry.

### `front/src/app/conversation-history/conversation-history.component.scss`
- New rules: `.history__filters`, `.history__filter`,
  `.history__filter--active`, `.history__badges`, `.history__badge`,
  `.history__badge--notes`, `.history__badge--words`. Visual style matches
  the existing `.history__tool` look.

## Behaviour

- The conversation list is already reloaded when the sidebar is opened
  (`getConversationsHistory()` in `conversation.component.ts`), so badges
  refresh naturally after adding/removing notes or dictionary words — no
  extra wiring required.
- Filters are local to the component (not persisted). Closing/re-opening the
  sidebar resets them, which keeps the UI predictable.

---

# Gemini model: env-driven, default `gemini-3.1-flash-lite`

## Why

Gemini 3 is out. `gemini-3.1-flash-lite` is **stable**, cheaper than
`gemini-2.5-flash` ($0.25 / $1.50 per 1M in/out vs $0.30 / $2.50), and Google
markets it as "frontier-class". `gemini-3-flash-preview` is more capable but
still preview — handy to A/B test for memory extraction / quiz grading.

## Changes

### `back/src/robotito_ai.py`
- New env var `GEMINI_MODEL` overrides the model id used for both the chat
  client and the structured-output LLM.
- Default changed from `gemini-2.5-flash` → `gemini-3.1-flash-lite`.
- Startup log now prints the resolved model name, e.g.
  `Model API: gemini (gemini-3.1-flash-lite)`.

```python
gemini_model = os.getenv("GEMINI_MODEL") or "gemini-3.1-flash-lite"
client_text = ai_providers.configGeminiAI(gemini_model)
llm_text    = ai_providers.configGeminiAI(gemini_model, 0.0)
```

## How to test `gemini-3-flash-preview`

```bash
export GEMINI_MODEL=gemini-3-flash-preview
python src/flask_server.py
```

To switch back:
```bash
export GEMINI_MODEL=gemini-2.5-flash    # previous default
# or unset to use the new default
unset GEMINI_MODEL
```

No code changes; just restart the back-end.

---

# Smart-model split (`GEMINI_MODEL_SMART`)

Lets you run the heavy structured chains on a more capable model while keeping
chat streaming and the cheap chains on the fast model. Memory extraction and
vocabulary review grading benefit most from a stronger model; everything else
doesn't.

## Changes

### `back/src/ai_chains.py`
- `build_chains(llm_text, llm_smart=None)`. The `review` and `memory` chains
  use `llm_smart`; the rest stay on `llm_text`. If `llm_smart` is omitted,
  both fall back to `llm_text` (no behaviour change).

### `back/src/robotito_ai.py`
- New env var `GEMINI_MODEL_SMART`. When set and different from
  `GEMINI_MODEL`, a second `ChatGoogleGenerativeAI` client is built and passed
  to `build_chains` as `llm_smart`.
- Startup log now reports both, e.g.
  `Model API: gemini (gemini-3.1-flash-lite + smart=gemini-3-flash-preview)`.

## How to use

Default (single model, cheapest):
```bash
# unset both — uses gemini-3.1-flash-lite for everything
```

Test `gemini-3-flash-preview` only on memory + review:
```bash
export GEMINI_MODEL=gemini-3.1-flash-lite
export GEMINI_MODEL_SMART=gemini-3-flash-preview
```

Test the preview everywhere:
```bash
export GEMINI_MODEL=gemini-3-flash-preview
unset GEMINI_MODEL_SMART
```

## Cost note

Memory consolidation runs every `MEMORY_CONSOLIDATE_EVERY` user turns
(default 20) plus once on logout. Review grading runs only when the user takes
a quiz. So `GEMINI_MODEL_SMART=gemini-3-flash-preview` adds maybe a handful of
calls per session — negligible vs the per-turn chat traffic.

---

# Notes page: speak selected text aloud

Mirrors the dictionary page's "select + speak" UX.

## Changes

### `front/src/app/notes/notes-page.component.ts`
- Imports `HostListener` and `SelectionMenuComponent`.
- New state: `audio`, `selectedText`, `statusMessage`, `humanVoice`.
- Loads the user's stored alternative voice via `getLastUser()` in `ngOnInit`.
- New methods: `handleKeydown` (F4 / Shift+F4 / Esc), `getSelectedText`,
  `stopAudio`, `onSelectionMenuSpeak`, `speakSelectedText` — copied/adapted
  from `dictionary-page.component.ts`.

### `front/src/app/notes/notes.component.html`
- Adds `<app-selection-menu>` at the top so the floating "speak" button
  appears when text is selected.
- Adds a `status-message` span in the header for "Playing..." feedback.
- Updates the textarea placeholder to advertise the F4 shortcut.

### `front/src/app/notes/notes.component.scss`
- Adds `.status-message` colour to match the existing `.save-message`.

## How to use

1. Open a conversation's notes (Notes button or `/notes/:id`).
2. Select any text inside the editor or the preview.
3. Either click the floating speak button from the selection menu, or press
   **F4** (primary voice) / **Shift+F4** (alternative voice).
4. **Esc** stops playback.

---

# Translate selected text

Adds a "Translate" button to the floating selection menu. Uses the existing
Gemini LLM (no extra API key, ~$0.66/year at typical usage — cheaper than
Google Cloud Translation API which charges per character).

## Backend

### `back/src/ai_service.py`
- New `translate_text(text, target_language='Spanish')` — calls
  `call_llm_internal` with a one-shot prompt; returns the translation as a
  plain string.

### `back/src/robotito_ai.py`
- Re-exports `translate_text` for `import robotito_ai as ai`.

### `back/src/api/principal.py`
- New endpoint `POST /api/translate` taking `{text, target?}` and returning
  `{translation, target}`.

## Front-end

### `front/src/app/services/api-back.service.ts`
- New `translatePhrase(text, target='Spanish')` calling `POST /api/translate`.

### `front/src/app/selection-menu/`
- New `[translateFn]` `@Input` — optional `(text) => Promise<string>` callback.
- New "Translate" button in the menu (material icon `translate`).
- New floating **translation popover** anchored next to the selection,
  showing "Translating…" then the result. Auto-dismisses when the user
  clicks outside or presses Esc; can also be closed with the × button.
- New SCSS rules: `.selection-translation*`.

### `front/src/app/{conversation,notes,dictionary,review}/...`
- Each page binds `[translateFn]="translateSelection"` on
  `<app-selection-menu>` and exposes a one-line arrow-function field
  `translateSelection = (text) => this.back.translatePhrase(text)`.
- No per-page popover/banner code needed — the popover lives inside
  `SelectionMenuComponent`.

## How to use

1. Select any text inside the conversation, dictionary, notes, or review page.
2. Click the **Translate** button in the floating selection menu.
3. A small popover appears next to the selection with the Spanish
   translation. Click anywhere outside, press **Esc**, or click the × to
   dismiss.
