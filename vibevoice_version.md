# VibeVoice integration

This document summarizes the changes made to add Microsoft's
[VibeVoice-Realtime](https://github.com/microsoft/VibeVoice) as a second TTS
engine alongside Kokoro, with low-latency streaming playback, while upgrading
the project to Python 3.12.

## Goals

1. Keep Kokoro working exactly as before.
2. Add VibeVoice-Realtime as an additional TTS engine the user can pick from
   the front-end settings panel.
3. Expose VibeVoice's streaming capability so the user hears the first audio
   in ~200-300 ms instead of waiting for the full sentence to be synthesised.
4. Move the project to Python 3.12.

## High-level design

- `TTS` env var = **default** engine. Backwards compatible.
- `TTS_ENGINES` env var (comma-separated) = additional engines that can be
  enabled simultaneously. The default is always implicitly enabled. Example:
  `TTS=kokoro TTS_ENGINES=kokoro,vibevoice`.
- Each user's `AudioData` keeps a `tts_engine` override (session-only, not
  persisted in the DB). The settings panel lets the user pick one of the
  enabled engines.
- For the regular blob-based engines (`kokoro`, `gemini`, `openai`), the
  `/api/audio/tts` endpoint stays unchanged: returns a finished webm/opus
  blob, the frontend plays it via an `<audio>` element.
- For VibeVoice, a new `/api/audio/tts/stream` endpoint streams raw PCM16 LE
  @ 24 kHz mono via chunked HTTP. The frontend decodes each chunk with the
  Web Audio API and schedules sample-accurate gapless playback.

## Backend changes

### New file: `back/src/sound_vibevoice.py`

Wraps the `vibevoice` package with two entry points:

- `synthesize_to_webm(text, speaker_name, uuid)` — drop-in replacement for
  `getAudioFromKokoro`. Generates the full waveform, transcodes to webm/opus,
  returns the file path. Used as a fallback path if needed.
- `synthesize_streaming(text, speaker_name, ...) -> Iterator[bytes]` — yields
  PCM16 LE bytes as audio is generated. Generation runs on a background
  thread; the main thread pulls float32 chunks from VibeVoice's
  `AudioStreamer.get_stream(0)`, normalises peaks, converts to int16, and
  yields the bytes. Closing the generator stops the worker thread cleanly via
  `stop_event.set()`.

Model and processor are lazy-loaded once and reused. Device selection follows
the demo:

| Device | dtype     | attention            |
|--------|-----------|----------------------|
| CUDA   | bfloat16  | `flash_attention_2` (falls back to `sdpa`) |
| MPS    | float32   | `sdpa`               |
| CPU    | float32   | `sdpa`               |

Voice presets are `.pt` files looked up by lower-cased filename (matches the
demo's behaviour). `VIBEVOICE_VOICES_DIR` lets the user override the search
path. The demo's noise scheduler tuning (`sde-dpmsolver++` +
`squaredcos_cap_v2`) is applied for better realtime quality.

Environment overrides:

- `VIBEVOICE_MODEL` (default `microsoft/VibeVoice-Realtime-0.5B`)
- `VIBEVOICE_VOICES_DIR`
- `VIBEVOICE_CFG_SCALE` (default `1.5`)

### `back/src/audio_service.py`

Replaced the single `_tts` global with a multi-engine dispatcher:

- `_default_tts: str` — server-wide default.
- `_enabled_tts: set[str]` — every engine that can be picked.
- `init(stt, tts, local_whisper, logger, enabled_tts=None)` — additionally
  accepts a list of enabled engines.
- `get_default_engine()`, `get_enabled_engines()` — used by the API layer.
- `_resolve_engine(audioData)` — picks `audioData.tts_engine` if set and
  enabled, else the default.
- `getAudioFromVibevoice(text, audioData, uuid, voice_name)` — delegates to
  `sound_vibevoice.synthesize_to_webm`.
- `getAudioFromText(...)` — dispatches based on the resolved engine.
- `set_engine(audioData, engine)` — per-session override.
- `set_language(...)` — only rebuilds the Kokoro pipeline when Kokoro is
  actually enabled (avoids unnecessary work when the user is on VibeVoice).

### `back/src/memory.py`

Added `tts_engine = None` to `AudioData`. `None` means "use the default".

### `back/src/robotito_ai.py`

- Reads `TTS_ENGINES` env var; computes `tts_engines` list.
- Initializes the cloud TTS clients only for engines that need them
  (`gemini` → `texttospeech.TextToSpeechClient`, `openai` → `OpenAI`).
- Calls `audio_service.init(..., enabled_tts=tts_engines)`.
- Re-exports `set_engine` so blueprints can call `ai.set_engine(...)`.

### `back/src/api/audio.py`

Major rewrite of the engine-related endpoints:

- `_LANGUAGES_BY_ENGINE` and `_VOICES_BY_ENGINE` — per-engine catalogs for
  `kokoro`, `vibevoice`, `gemini`, `openai`.
- `_ENGINE_LABELS` — display labels for the front-end dropdown.
- New `GET /api/audio/engines` — returns
  `{default: <engine>, engines: [{value, label}, ...]}` for only the enabled
  engines.
- `GET /api/audio/languages` — accepts optional `?engine=` filter; otherwise
  returns the union flattened with an `engine` tag on each entry.
- `GET /api/audio/voices` — same shape as languages.
- `GET /api/audio/voices/<language>` — same.
- `POST /api/audio/language` — now accepts an optional `tts_engine` field
  alongside `language` and `voice`. Persists language/voice in the DB
  (existing behaviour); the engine is session-only.
- **New `POST /api/audio/tts/stream`** — streaming endpoint for VibeVoice:
  - Validates the resolved engine is `vibevoice` and enabled (returns 400
    otherwise).
  - Runs `sound_vibevoice.synthesize_streaming(...)` in a worker thread
    (`asyncio.to_thread`) so other requests aren't blocked.
  - Streams `audio/pcm` chunks via Quart's `Response(generate(), ...)`.
  - Adds `X-Audio-Sample-Rate: 24000`, `X-Audio-Channels: 1`,
    `X-Audio-Format: s16le`, `Cache-Control: no-store` headers.

### Python 3.12 upgrade

| File | Change |
|---|---|
| `back/environment.yml` | `python=3.9.21` → `python=3.12`; `kokoro==0.7.16` → `kokoro>=0.9.4`; `misaki==0.7.17` → `misaki[en]>=0.9.4`; removed `taskgroup` and `tomli` (3.10/3.11 backports); removed py39-tagged `setuptools`/`wheel` build pins; added a comment block with VibeVoice install instructions. |
| `back/Dockerfile` | `python=3.9` → `python=3.12`. |
| `back/Dockerfile-light` | `python:3.9.22-slim` → `python:3.12-slim` (both build and runtime stages). |
| `back/requirements.txt` | Fixed concatenated `zstandard==0.23.0pydantic==2.10.6` line that broke `pip install -r requirements.txt`. |
| `readme.md` | Updated Python version reference and added a "TTS engine selection" section documenting `TTS`, `TTS_ENGINES`, the VibeVoice install commands, and `VIBEVOICE_VOICES_DIR`. |

The codebase had nothing else 3.9-specific (no `from __future__`, no
`taskgroup`/`tomli`/`distutils` usage, no PEP 604 `X | None` syntax in source
that would behave differently). Verified by recompiling all touched modules
under Python 3.13.

## Frontend changes

### New file: `front/src/app/services/streaming-tts.service.ts`

`StreamingTtsService` — provided in `app.config.ts`. Plays raw PCM16 chunks
gaplessly via the Web Audio API.

- Owns a single `AudioContext` at 24 kHz, lazily created.
- `enqueueStream(response: Response): Promise<void>` reads the PCM body via
  `response.body!.getReader()`, batches incoming bytes (carrying over a
  trailing odd byte across reads), converts int16 LE → Float32, and
  schedules an `AudioBufferSourceNode` at `nextStartTime` for each chunk.
  Maintains a `nextStartTime` cursor so consecutive buffers line up
  sample-accurately with no gap.
- Internal "chain tail" promise serializes concurrent enqueues so audio
  playback order matches dispatch order (important because
  `TTS_MAX_CONCURRENT=3`). Stream N's samples only start scheduling after
  stream N-1's reader has fully drained.
- `stop()` bumps a cancel token (in-flight readers bail), stops every live
  source, resets the schedule cursor.
- `whenDrained(): Promise<void>` resolves when the queue empties — used by
  `ttsWait` and `speakAloud` to know when this turn's audio finished.
- `isPlaying` boolean for cheap external state checks.

### `front/src/app/services/api-back.service.ts`

New `text_to_sound_streaming(inputText, voice, engine, signal?)` — opens the
chunked stream via `fetch()` (HttpClient buffers full responses, so it can't
be used here). Returns the raw `Response` so callers can hand it to the
streaming player.

### `front/src/app/services/api-back.service.ts` — also

- `getEngines()` — hits `/api/audio/engines`.
- `changeLanguage(language, voice, engine?)` — third arg passes through
  `tts_engine` to the backend.

### `front/src/app/app.config.ts`

Provide `StreamingTtsService` alongside the existing services.

### `front/src/app/conversation/conversation.component.ts`

- New properties: `selectEngine`, `engineOptions`. `ttsArray` re-typed as
  `Promise<Blob | null>[]`.
- Constructor now injects `StreamingTtsService`.
- On init, calls `getEngines()` first so the engines dropdown is populated;
  defaults `selectEngine` to the server's default.
- The initial `changeLanguage(...)` call now also forwards `selectEngine`.
- `ttsRequest(text, voice)` branches:
  - `selectEngine === 'vibevoice'`: opens the streaming response, pushes it
    into the player via `streamingTts.enqueueStream(response)`, drives the
    avatar mouth via `avatarService.setTalking(true)`, returns `null`.
  - Otherwise: existing blob-based path.
- `ttsWait()` recognises the streaming `null` resolution: instead of calling
  `prepareAudio(blob)`, it `await`s `streamingTts.whenDrained()` and only
  clears the avatar talking state once the player has actually drained.
- `speakAloud()` (single-word click-to-hear) takes the streaming path when
  vibevoice is active.
- `stopAudio()` now also calls `streamingTts.stop()` so ESC immediately
  cancels both queued and currently-playing PCM.

### `front/src/app/conversation/conversation.component.html`

Passes `[(selectEngine)]` and `[engineOptions]` to `<app-settings>`.

### `front/src/app/settings/settings.component.ts`

- New inputs/outputs: `selectEngine` / `selectEngineChange`, `engineOptions`.
- New `EngineOption` type. `LanguageOption` and `VoiceOption` gain an
  optional `engine` field (the multi-engine catalogs are tagged).
- New `filteredLanguageOptions` getter — filters to `selectEngine` if the
  options carry engine tags, otherwise returns them all (backward compatible
  with single-engine deployments).
- `filteredVoiceOptions` getter — filters by both `selectLanguage` and
  `selectEngine`.
- New `onEngineChange()` — when the user picks a new engine, automatically
  falls back to the first valid language/voice for that engine before
  persisting via `changeLanguage(...)`. This keeps the UI consistent because
  the language list shrinks when switching engines.
- `onLanguageChange()` now passes `selectEngine` along so the backend
  applies the override correctly.
- `selectEngineDesc` getter for the footer info line.

### `front/src/app/settings/settings.component.html`

- New "TTS engine" `<select>` rendered only when `engineOptions.length > 1`
  (so single-engine setups look exactly as before).
- Language `<select>` switched to `filteredLanguageOptions` and now persists
  on change via `onLanguageChange()`.
- Footer info line shows the active engine.

## How the gapless streaming serialization works

```
LLM chunk 1 ─► fetch /tts/stream ─► response1 ─┐
LLM chunk 2 ─► fetch /tts/stream ─► response2 ─┼─► streamingTts.enqueueStream(...)
LLM chunk 3 ─► fetch /tts/stream ─► response3 ─┘
```

`enqueueStream(response)` internally does `await previousChain;
consumeStream(response)`. So even if chunk 2 and 3 finish on the network
before chunk 1, the player only starts pulling bytes from chunk 2 once chunk
1's stream is fully consumed (= chunk 1 has finished scheduling its samples
on the AudioContext timeline). Result: ordered, gapless playback while
network/synthesis still overlaps with reading the LLM's text stream.

## Latency

Old flow (Kokoro / Gemini / OpenAI / non-streaming VibeVoice):

1. Send full text chunk.
2. Wait for full synthesis (Kokoro: 0.5-1 s for short text; VibeVoice:
   2-3 s).
3. Wait for ffmpeg transcoding.
4. Receive blob.
5. Decode with `<audio>`.
6. Play.

New streaming flow (VibeVoice only):

1. Send full text chunk.
2. ~200-300 ms time-to-first-byte (VibeVoice's first audible chunk).
3. Web Audio schedules the chunk → audible immediately.
4. Subsequent samples keep playing continuously while the model is still
   generating.

## Configuration

```bash
# Default behaviour: only Kokoro, exactly as before
export TTS=kokoro

# Enable both engines, Kokoro is the default
export TTS=kokoro
export TTS_ENGINES=kokoro,vibevoice

# Or default to VibeVoice
export TTS=vibevoice
export TTS_ENGINES=kokoro,vibevoice
```

VibeVoice install (only required when `vibevoice` is in `TTS_ENGINES`):

```bash
pip install "vibevoice @ git+https://github.com/microsoft/VibeVoice.git#egg=vibevoice[streamingtts]"

# Download voice presets in the VibeVoice repo:
git clone https://github.com/microsoft/VibeVoice.git
cd VibeVoice
bash demo/download_experimental_voices.sh

# Optional: tell the backend where the voice presets live
export VIBEVOICE_VOICES_DIR=/path/to/VibeVoice/demo/voices/streaming_model
```

## API summary

| Endpoint | Behaviour |
|---|---|
| `GET /api/audio/engines` | `{default, engines: [{value, label}]}` for the enabled engines. |
| `GET /api/audio/languages` | All languages, each tagged with `engine`. Optional `?engine=` filter returns just that engine's languages. |
| `GET /api/audio/voices` | Same. |
| `GET /api/audio/voices/<language>` | Same, filtered by language. |
| `POST /api/audio/language` | Body: `{language, voice, tts_engine?}`. Persists language/voice in DB; engine is session-only. |
| `POST /api/audio/tts` | Existing blob-returning endpoint. Used for Kokoro/Gemini/OpenAI. Also works for VibeVoice (non-streaming fallback). |
| `POST /api/audio/tts/stream` | New. Streams `audio/pcm` (PCM16 LE, 24 kHz mono). Returns 400 if the resolved engine isn't `vibevoice`. |

## Files touched

### Backend

- `back/src/sound_vibevoice.py` (new)
- `back/src/audio_service.py`
- `back/src/memory.py`
- `back/src/robotito_ai.py`
- `back/src/api/audio.py`
- `back/environment.yml`
- `back/Dockerfile`
- `back/Dockerfile-light`
- `back/requirements.txt`
- `readme.md`

### Frontend

- `front/src/app/services/streaming-tts.service.ts` (new)
- `front/src/app/services/api-back.service.ts`
- `front/src/app/app.config.ts`
- `front/src/app/conversation/conversation.component.ts`
- `front/src/app/conversation/conversation.component.html`
- `front/src/app/settings/settings.component.ts`
- `front/src/app/settings/settings.component.html`

## Caveats

1. **GPU required for VibeVoice.** The realtime model is a 0.5B Qwen2.5 with
   a diffusion head. On CPU it will load but generation will be far from
   realtime. Kokoro still runs fine on CPU, so the dual-engine setup
   gracefully degrades: pick Kokoro on CPU-only machines.
2. **VibeVoice load time.** First request pays a 10-30 s model load cost on
   CUDA (longer on CPU). Subsequent requests are fast — model and processor
   are cached at module level.
3. **Voice list is hand-curated** in `_VOICES_BY_ENGINE['vibevoice']`. After
   running `download_experimental_voices.sh`, check the actual filenames
   under `demo/voices/streaming_model/` (they are in the form `name.pt`)
   and adjust `_VOICES_BY_ENGINE['vibevoice']` so the labels match.
   Resolution is case-insensitive with partial-match fallback (mirrors the
   official demo's `VoiceMapper`), so small mismatches still work but show
   a warning in the logs.
4. **AudioContext + browser autoplay policy.** Browsers require a user
   gesture before audio can play. The existing flow already triggers audio
   from click/keypress events, so the streaming `AudioContext` resumes
   normally on those interactions. No regression for typical use.
5. **Backpressure.** The frontend reader doesn't throttle; it relies on the
   network being faster than the model. Each PCM chunk is small (a few KB),
   so the buffer never grows unboundedly in practice.
6. **DB schema unchanged.** The user's TTS engine choice is session-only by
   design. Re-login restores their last persisted language/voice and the
   server's default engine. Add a `tts_engine` column to `users` if
   per-user persistence is wanted later.
7. **Existing DB rows store Kokoro language codes** (`'b'`, `'bm_fable'`,
   etc.). When the user switches to VibeVoice in the UI, `onEngineChange()`
   automatically falls back to the first valid language/voice for VibeVoice
   — no DB migration needed.
8. **Frontend types compile-checked by reading.** I couldn't run `tsc`
   without `node_modules`. Run `npm install && npm run build` after
   pulling. Backend Python is verified to compile under Python 3.13 (3.12
   has the same syntax surface area).
