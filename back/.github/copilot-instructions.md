# Robotito Backend - AI Coding Agent Instructions

## Project Overview
**Robotito** is a conversational AI assistant with real-time speech-to-text (STT) and text-to-speech (TTS) capabilities. The backend is an async Python service using **Quart** (async Flask alternative) that integrates LangChain with OpenAI/Google Generative AI models, PostgreSQL persistence, and multi-modal audio processing.

## Architecture Summary

### Three Core Layers
1. **API Layer** (`src/api/`): Quart blueprints handling HTTP requests
2. **Business Logic** (`src/robotito_ai.py`): LangChain prompt chains and LLM orchestration
3. **Persistence** (`src/persistence.py` + `src/dbtables.py`): PostgreSQL async operations via Quart-DB

### Data Flow
```
HTTP Request → API Blueprint → Memory (session-based) → robotito_ai (LLM) → persistence (DB) → Response
Audio (STT/TTS) → sound_google.py or sound_openai.py → File output to audio/ folder
```

## Key Components

### Session & Memory Management (`src/memory.py`)
- **`memoryDTO`**: Per-session state container holding user, chat history, context, audio settings
- **`Context` class**: Reusable prompt snippets with "remember every N turns" feature
- **`AudioData`**: Language/voice settings (currently supports 3 languages: en-US, en-GB, es-ES)
- Accessed globally via `memory.getMemory(uuid)` where uuid comes from request headers

### Database Schema (`src/dbtables.py`)
- **users**: user_id (PK), language, voice, role (admin/user), max_length_answer
- **context**: label + context text + remember interval for system prompts
- **conversation**: Linked to users + contexts; contains conversation_lines (human/AI messages)
- **user_session**: uuid (PK) → user_id mapping for request authentication

### API Blueprints
| Module | Routes | Pattern |
|--------|--------|---------|
| `principal.py` | `/api/send-question`, `/api/max_length_answer`, `/api/summary`, `/api/rating_phrase`, `/api/clear` | Chat orchestration + config |
| `context.py` | `/api/context/*` | CRUD context (system prompts) |
| `conversation.py` | `/api/conversation/*` | Load/save conversation history |
| `audio.py` | `/api/audio/stt`, `/api/audio/tts`, `/api/audio/languages`, `/api/audio/voices` | Audio processing |
| `security.py` | `/api/security/login`, `/api/security/get_uuid` | Auth (token validation) |

## Critical Patterns & Conventions

### 1. Async-First Architecture
- All endpoint handlers are `async def`
- Database calls use `await g.connection.fetch_one()` or `await g.connection.execute()`
- Never use blocking I/O in routes—use `aiofiles` for file operations
- **Example**: `src/api/audio.py` line ~75 uses `f = await request.files` not `request.files`

### 2. Security via UUID + Authorization Headers
- Every request requires `uuid` header (session identifier)
- Sensitive endpoints require `Authorization` header (token)
- `principal_bp.before_request` enforces auth before route execution
- Routes get UUID via: `uuid = request.headers.get("uuid")`
- **Bypass**: `clear`, `get_uuid`, `login` endpoints skip auth

### 3. LLM Integration with LangChain
- **Multiple backends**: OpenAI (`ChatOpenAI`) or Google Generative AI (`ChatGoogleGenerativeAI`)
- **Context injection**: System prompts from DB contexts injected into every LLM call
- **Output parsing**: Use `PydanticOutputParser` for structured JSON responses (see `SumaryResume`, `AnalizePhrase` models)
- **Response streaming**: `call_llm()` is async generator—yields messages as they arrive
- **Chat history**: Maintained in `memoryDTO.chat_history` as `HumanMessage`/`AIMessage` objects

### 4. Audio Processing
- **STT**: `sound_google.py` → Google Cloud Speech-to-Text (WEBM_OPUS at 48kHz)
- **TTS**: `sound_google.py` or `sound_openai.py` → outputs to `audio/output_{uuid}.webm`
- **Language codes**: Hardcoded in `src/api/audio.py` (en-US, en-GB, es-ES); voice names vary by provider
- **SSML support**: TTS uses SSML wrapping for formatting; escape HTML entities first

### 5. Configuration via Environment
- **Critical env vars**: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `LOG_LEVEL`, `MAX_LENGHT_ANSWERS`, `STT`
- **Provider selection**: If `STT=gemini`, use Google Generative AI; else use OpenAI
- Loaded in `robotito_ai.py` lines 36-45; Docker uses `env.sh` and `environment.yml`

## Common Workflows

### Adding a New API Endpoint
1. Create blueprint in `src/api/new_feature.py`
2. Use `@blueprint_bp.route('/path', methods=['POST'])` decorator
3. Extract UUID from headers: `uuid = request.headers.get("uuid")`
4. Access memory: `mem = memory.getMemory(uuid)`
5. Call LLM or DB async functions with `await`
6. Return `jsonify({"status": "OK", ...})`
7. Register in `robotito_ai.py` line 468+: `app.register_blueprint(blueprint_bp, url_prefix='/api/...')`

### LLM Prompt Engineering Patterns

#### Main Conversation Flow (`call_llm()`)
- **Prompt structure** (line 79-83): Three-part template with system message → chat history → user question
  ```python
  ("system", "{system_msg}"),    # Dynamic context from DB
  ("placeholder","{msgs}"),      # Chat history (HumanMessage/AIMessage)
  ("user","{question}")          # Current user input
  ```
- **System message injection**: `context_text` pulled from `memoryDTO.context.getText()` and prepended with word limit constraints
- **Chat history windowing**: Uses `max_history` variable (default from `MAX_HISTORY=10` env) to keep last N exchanges
- **Word limit enforcement**: Inserts `HumanMessage(f"Remember: {limit_words}")` into history when `max_length_answers != 0` to guide response length
- **Context "remember" feature**: Appends reminder text to question every N turns if `context.hasToRemember()` returns true

**Example flow**:
```python
# System prompt with constraints
context_text = "You are my friend Robotito. Your answer should be less than 150 words."
# Chat history window (last 10 messages)
msgs = chat_history[-10:]
# Current question with optional context reminder
question = "Tell me about Python" + (". Remember: speak like a B2 student" if rememberText)
# Result: yields message chunks via async generator
async for chunk in client_text.astream(chat_prompt):
    yield chunk.content
```

#### Structured Output Patterns (Pydantic + Parsing)
Three LLM chains with strict JSON output for grammatical analysis:

1. **Summary Analysis** (`chain_resume`, line 380-390)
   - **Input**: Concatenated list of human messages
   - **Output model**: `SumaryResume` with `rating` (overall grade) + `explication` (brief reason)
   - **Prompt key**: Instructs "don't be too harsh for B2 level, ignore punctuation/spaces"
   - **Parser**: `PydanticOutputParser(pydantic_object=SumaryResume)` enforces JSON schema

2. **Detailed Analysis** (`chain_detail`, line 393-407)
   - **Input**: Same concatenated sentences
   - **Output model**: `AnalizePhrases` wrapping list of `AnalizePhrase` objects
   - **Per-sentence output**: `sentence`, `rating` (Good/Bad), `explication`, `correction`
   - **Chain pattern**: `prompt | llm_text | parser_detail` (LangChain LCEL syntax)

3. **Single Phrase Rating** (`chain_rating`, line 410-424)
   - **Input**: Single sentence from API request
   - **Output model**: `AnalizePhrase` (same as detail, but one item)
   - **Route**: `/api/rating_phrase` POST with JSON `{"phrase": "..."}`

**Pydantic model examples** (lines 53-65):
```python
class SumaryResume(BaseModel):
    rating: str = Field(description="Overall rating of errors in sentences")
    explication: str = Field(description="Explanation of why you give this rating")

class AnalizePhrase(BaseModel):
    sentence: str = Field(description="Original sentence to analyze")
    rating: str = Field(description="Set 'Good' only if no grammatical errors")
    explication: str = Field(description="Why you gave this rating")
    correction: str = Field(description="Description of what was wrong")
```

**Prompt template pattern** (e.g., lines 374-376):
```python
prompt_str = """
Analyze the grammatical correctness...
{format_instructions}  # Auto-injected JSON schema by parser
Input: {input_variables}
Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}.
"""
parser = PydanticOutputParser(pydantic_object=ModelClass)
prompt = PromptTemplate(
    template=prompt_str,
    input_variables=["input_name"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)
chain = prompt | llm_text | parser
result = chain.invoke({"input_name": "value"})  # Returns parsed object, not JSON string
```

#### LLM Backend Configuration (lines 350-366)
- **`MODEL_API` env var** selects: `openai`, `gemini` (default), or `ollama`
- **Temperature tuning**: High temp (0.8) for `client_text` (creative responses), low temp (0.0) for `llm_text` (deterministic JSON parsing)
- **Streaming vs. sync**: `call_llm()` uses async streaming (`client_text.astream()`); summary/rating use sync (`llm_text.invoke()`)
- **Dual client pattern**: Separate clients for conversation (streaming) vs. structured tasks (JSON parsing)

**Config example**:
```python
if model_api == "openai":
    client_text = configOpenAI(0.8)      # Streaming, creative
    llm_text = configOpenAI(0.0)         # Deterministic parsing
elif model_api == "gemini":
    client_text = configGeminiAI()       # Default temp ~0.6-0.8
    llm_text = configGeminiAI("gemini-2.5-flash", 0.0)
```

### Modifying LLM Behavior
1. **Change system prompt**: Edit `context_text` logic in `call_llm()` (line 76) or load new contexts via `/api/context/*` endpoints
2. **Adjust response length**: Modify `MAX_LENGHT_ANSWERS` env var or use `/api/max_length_answer` endpoint
3. **Tweak chat history window**: Change `MAX_HISTORY=10` env var (more history = more context but slower)
4. **Add new structured analysis**: Create new Pydantic model + PromptTemplate + chain following `chain_rating` pattern
5. **Tune temperature**: Edit config functions (`configOpenAI(temp)`, `configGeminiAI()`) or pass env vars

### Adding Context Support
- Store in DB via `persistence.save_context(user_id, label, context_text, remember_interval)`
- Load via `persistence.get_context_by_label()` or `/api/context/*` endpoints
- Context auto-injects into prompts if `context.hasToRemember()` returns true every N turns
- Context "remember" text appends to user question periodically to reinforce instructions

## Testing & Running

### Local Development
```bash
conda activate robotito
source env.sh
python src/robotito_ai.py
# Starts Quart on default port (usually 5000)
```

### Database Setup
- Run `init_db.sql` against PostgreSQL before starting
- Default user: `user_id='default'`, password='secret'

### Docker Deployment
- `Dockerfile`: NVIDIA CUDA base + Miniconda environment
- Build: `docker build -t robotito .`
- Mount .env for secrets; expose port 5000

## File Navigation
- **Entry point**: `src/robotito_ai.py` (Quart app + blueprint registration)
- **Business logic**: `src/robotito_ai.py` → `call_llm()`, `sumary_history()`, `rating_phrase()`
- **Request routing**: `src/api/principal.py` (main chat endpoint)
- **Data access**: `src/persistence.py` (all DB queries)
- **In-memory state**: `src/memory.py` (session storage)
- **Config**: `environment.yml`, `env.sh`, `init_db.sql`

## Common Gotchas
1. **Async/await**: Missing `await` on DB calls causes hangs—always `await g.connection.*`
2. **Memory isolation**: Each UUID gets separate `memoryDTO`; clearing one doesn't affect others
3. **Chat history format**: Must use `HumanMessage`/`AIMessage` from `langchain_core.messages`, not strings
4. **Database connections**: Quart manages `g.connection` context—don't create direct psycopg connections
5. **Audio file cleanup**: Output files in `audio/` are never auto-deleted; implement cleanup if needed
