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
