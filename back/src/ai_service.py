"""Business logic for the AI conversation features.

Depends on `init()` being called from the application entry point with the
configured LLM clients and chains before any other function is invoked.
"""
import asyncio
import json
import logging
import os
import re
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, AIMessage

import memory
import persistence as db
from ai_models import TranslationResult, ExamplePhrase, ReviewResult, ReviewItem


_client_text = None
_llm_text = None
_model_api = None
_chains: dict = {}
_max_history: int = 12
_logger: logging.Logger = logging.getLogger(__name__)

# How many user turns between automatic memory consolidations during a long
# conversation. 0 disables the periodic refresh (consolidation still runs at
# logout). Override with MEMORY_CONSOLIDATE_EVERY env var.
_consolidate_every: int = int(os.getenv("MEMORY_CONSOLIDATE_EVERY") or 20)


def init(client_text, llm_text, model_api: str, chains: dict, max_history: int, logger: logging.Logger):
    """Wire the service with concrete LLM clients and chains."""
    global _client_text, _llm_text, _model_api, _chains, _max_history, _logger
    _client_text = client_text
    _llm_text = llm_text
    _model_api = model_api
    _chains = chains
    _max_history = max_history
    _logger = logger


def _sanitize_json_value(value) -> str:
    """Normalize text so it can be safely embedded in a prompt and JSON payload."""
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    text = re.sub(r"[\x00-\x1F\x7F]+", "", text)
    return text.strip()


async def call_llm(state):
    memoryData = memory.getMemory(state['uuid'])
    max_length_answers = memoryData.getMaxLengthAnswer()
    limit_words = f"You answer should be less than {max_length_answers} words"
    context = memoryData.getContext()
    rememberText = ""
    if context is not None:
        rememberText = context.getRememberText()
    chat_history = memoryData.getChatHistory()
    # Lazy-load long-term memory once per session.
    if memoryData.getLongTermMemory() is None and memoryData.getUser():
        try:
            ltm = await load_long_term_memory(memoryData.getUser())
            memoryData.setLongTermMemory(ltm)
        except Exception as e:
            _logger.error(f"Could not load long-term memory: {e}")
            memoryData.setLongTermMemory("")
    long_term = memoryData.getLongTermMemory() or ""
    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system_msg}"),
        ("placeholder", "{msgs}"),
        ("user", "{question}"),
    ])
    question = state["message"]
    if question.strip() != "":
        swRemember = False
        if context is not None and rememberText != "":
            if context.hasToRemember():
                question += f". {context.getRememberText()}"
                swRemember = True
            context.incrementRememberNumber()
        # The context is normally carried as the first line of chat_history
        # (the "Context of this conversation: ..." robot line saved by the
        # frontend). We only fall back to context.getText() as the system
        # prompt when the history is still empty (very first turn of a
        # brand-new session, before that line has been persisted).
        if len(chat_history) == 0:
            context_text = context.getText() if context is not None else ""
            msgs = []
        else:
            context_text = ""
            if _max_history > 0 and len(chat_history) > _max_history:
                # Pin chat_history[0] so the context line survives history
                # truncation in long conversations.
                msgs = [chat_history[0]] + chat_history[-(_max_history - 1):]
            else:
                msgs = list(chat_history)
        if max_length_answers != 0:
            context_text = f"{limit_words}. {context_text}".strip()
            insert_pos = len(msgs) - 4
            if insert_pos > 0:
                msgs.insert(insert_pos, HumanMessage(f"Remember: {limit_words}"))
            else:
                msgs.append(HumanMessage(f"Remember: {limit_words}"))

        if long_term:
            context_text = f"{context_text}\n\n{long_term}".strip()

        url_context = memoryData.getUrlContext()
        if url_context:
            url_source = memoryData.getUrlSource()
            context_text += f"\n\nUse the following web page content as reference to answer questions. Source: {url_source}\n---\n{url_context}\n---"

        chat_prompt = prompt.format_messages(
            system_msg=context_text,
            context=[],
            msgs=msgs,
            question=HumanMessage(question),
        )
        _logger.debug(f"LLM Context: {context_text}\n Question: {question}")
        if _model_api == 'ollama':
            async for chunk in _client_text.astream(chat_prompt):
                yield _chunk_to_text(chunk)
        else:
            try:
                async for chunk in _client_text.astream(chat_prompt):
                    yield _chunk_to_text(chunk.content)
            except Exception as e:
                _logger.error(f"Error in LLM call: {e}")
                yield ""
        if swRemember:
            yield "*"
    else:
        yield " "


def _chunk_to_text(content) -> str:
    """Coerce an LLM streaming chunk into a plain string.

    Newer langchain-google-genai (and some other providers) return
    `chunk.content` as a list of content blocks like
    `[{"type": "text", "text": "Hello"}]` instead of a string.
    Quart's ASGI body field requires bytes/str, so we flatten anything
    non-string into one string before yielding.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                # OpenAI-style: {"type": "text", "text": "..."}
                # Google-style sometimes uses "content" instead of "text".
                txt = block.get("text") or block.get("content") or ""
                if isinstance(txt, str):
                    parts.append(txt)
        return "".join(parts)
    if isinstance(content, dict):
        return content.get("text") or content.get("content") or ""
    return str(content)


async def call_llm_internal(chat_prompt):
    response = await asyncio.to_thread(_llm_text.invoke, chat_prompt)
    if _model_api == 'ollama':
        return _chunk_to_text(response)
    return _chunk_to_text(response.content)


async def sumary_history(uuid, type):
    chain = _chains['resume'] if type == 'resume' else _chains['detail']
    memoryData = memory.getMemory(uuid)
    chat_history = memoryData.getChatHistory()
    msg = ""
    i = 1
    for line in chat_history:
        if isinstance(line, HumanMessage):
            msg += f'- Sentence number {i}: "{line.content}" \n'
            i += 1
    return await asyncio.to_thread(chain.invoke, {"sentences_input": msg})


async def rating_phrase(phrase):
    phrase = _sanitize_json_value(phrase)
    # phrase = _ensure_single_sentence(phrase)
    return await asyncio.to_thread(_chains['rating'].invoke, {"sentence_input": phrase})


def save_msg(uuid, type, msg):
    chat_history = memory.getMemory(uuid).getChatHistory()
    if type == 'R':
        chat_history.append(AIMessage(content=msg))
    else:
        chat_history.append(HumanMessage(content=msg))


def pop_last_turn(uuid) -> bool:
    """Remove the last (HumanMessage, AIMessage) pair from the in-memory
    chat_history of the given session. Used when the user edits their last
    message: the previous user line and the previous assistant reply are
    discarded so the next call_llm sees a clean history.

    Returns True if a pair was popped, False otherwise.
    """
    memoryData = memory.getMemory(uuid)
    if memoryData is None:
        return False
    chat_history = memoryData.getChatHistory()
    if (len(chat_history) >= 2
            and isinstance(chat_history[-1], AIMessage)
            and isinstance(chat_history[-2], HumanMessage)):
        chat_history.pop()
        chat_history.pop()
        return True
    return False


def restore_history(uuid, jsonHistory):
    chat_history = memory.getMemory(uuid).getChatHistory()
    chat_history.clear()
    for line in jsonHistory:
        if line['type'] == 'R':
            chat_history.append(AIMessage(content=line['msg']))
        else:
            chat_history.append(HumanMessage(content=line['msg']))


async def call_llm_translate(word: str):
    """Translate a word to Spanish with examples."""
    try:
        return await asyncio.to_thread(_chains['translation'].invoke, {"word_input": word})
    except Exception as e:
        _logger.error(f"Translation error for word '{word}': {str(e)}")
        return TranslationResult(
            translation=f"Translation for '{word}'",
            examples=[
                ExamplePhrase(
                    english_phrase="Example sentence in English",
                    spanish_phrase="Oración de ejemplo en español",
                )
            ],
        )


async def translate_text(text: str, target_language: str = "Spanish") -> str:
    """Translate a free-form snippet of text to `target_language`.

    Uses the cheap chat LLM directly (no structured output parser) because
    the answer is a single short string. Returns the translation, or an
    empty string on error.
    """
    text = (text or "").strip()
    if not text:
        return ""
    prompt = (
        f"Translate the following text to {target_language}. "
        "Return ONLY the translation, no quotes, no commentary, no original. "
        "Keep the tone and register (formal/informal) of the source.\n\n"
        f"Text:\n{text}"
    )
    try:
        return _chunk_to_text(await call_llm_internal(prompt))
    except Exception as e:
        _logger.error(f"translate_text error: {e}")
        return ""


async def call_llm_review(items: list, direction: str):
    """Evaluate a list of vocabulary quiz answers using the LLM.

    `items` is a list of dicts with keys: word, expected, user_answer.
    `direction` is one of "en->es" or "es->en".
    """
    payload = json.dumps(items, ensure_ascii=False)
    try:
        return await asyncio.to_thread(
            _chains['review'].invoke,
            {"direction": direction, "items_input": payload},
        )
    except Exception as e:
        _logger.error(f"Review error: {str(e)}")
        # Fallback: do a simple case-insensitive comparison so the user still gets feedback.
        fallback = []
        for it in items:
            expected = (it.get('expected') or '').strip().lower()
            answer = (it.get('user_answer') or '').strip().lower()
            is_correct = bool(answer) and answer in expected.split(',')[0].split('/')[0].strip().split()
            fallback.append(ReviewItem(
                word=it.get('word', ''),
                user_answer=it.get('user_answer', ''),
                is_correct=bool(answer) and answer == expected,
                feedback="Could not reach the AI grader; showing a basic comparison.",
            ))
        return ReviewResult(items=fallback)


# ---------------------------------------------------------------------------
# Long-term memory
# ---------------------------------------------------------------------------
async def load_long_term_memory(user_id: str) -> str:
    """Build the system-prompt block that lets the assistant 'know' the user.

    Returns an empty string if the user has memory disabled or has nothing
    stored yet. Otherwise returns a short labelled block that can be appended
    to the existing context text.
    """
    if not user_id:
        return ""
    try:
        profile_data = await db.get_user_profile(user_id)
    except Exception as e:
        _logger.error(f"load_long_term_memory: could not read profile: {e}")
        return ""
    if not profile_data.get("memory_enabled", True):
        return ""
    profile_text = (profile_data.get("profile") or "").strip()
    facts = await db.get_user_facts(user_id, limit=30)
    if not profile_text and not facts:
        return ""
    parts = ["What you remember about the user from previous conversations (use it naturally, do not list it back unless asked):"]
    if profile_text:
        parts.append(f"Profile: {profile_text}")
    if facts:
        # Group facts by category for readability.
        by_cat: dict = {}
        for f in facts:
            by_cat.setdefault(f["category"], []).append(f"{f['key']}: {f['value']}")
        for cat, entries in by_cat.items():
            parts.append(f"{cat.capitalize()}: " + "; ".join(entries))
    return "\n".join(parts)


def _format_transcript(chat_history) -> str:
    lines = []
    for msg in chat_history:
        role = "User" if isinstance(msg, HumanMessage) else "Assistant"
        lines.append(f"{role}: {msg.content}")
    return "\n".join(lines)


async def consolidate_memory(uuid: str) -> bool:
    """Distill the current chat history into the user's long-term memory.

    Reads the existing profile + facts, asks the LLM to extract stable info,
    then upserts the result. Safe to call multiple times. Returns True if it
    actually ran an update, False if there was nothing to do.
    """
    _logger.info(f"Attempting memory consolidation for UUID: {uuid}")
    memoryData = memory.getMemory(uuid)
    if memoryData is None:
        return False
    user_id = memoryData.getUser()
    if not user_id:
        return False
    chat_history = memoryData.getChatHistory()
    if len(chat_history) < 2:
        return False
    try:
        profile_data = await db.get_user_profile(user_id)
    except Exception as e:
        _logger.error(f"consolidate_memory: cannot read profile: {e}")
        return False
    if not profile_data.get("memory_enabled", True):
        _logger.info(f"Memory disabled for user {user_id}; skipping consolidation")
        memoryData.resetTurnsSinceConsolidation()
        return False
    existing_profile = profile_data.get("profile") or ""
    existing_facts = await db.get_user_facts(user_id, limit=50)
    existing_facts_payload = json.dumps(
        [{"category": f["category"], "key": f["key"], "value": f["value"]} for f in existing_facts],
        ensure_ascii=False,
    )
    transcript = _format_transcript(chat_history)
    # Cap transcript length to keep the consolidation prompt cheap.
    if len(transcript) > 8000:
        transcript = transcript[-8000:]
    try:
        result = await asyncio.to_thread(
            _chains['memory'].invoke,
            {
                "existing_profile": existing_profile,
                "existing_facts": existing_facts_payload,
                "transcript": transcript,
            },
        )
    except Exception as e:
        _logger.error(f"consolidate_memory: LLM extraction failed: {e}")
        return False
    new_profile = (result.profile or "").strip()
    if new_profile and new_profile != existing_profile:
        try:
            await db.set_user_profile(user_id, new_profile)
        except Exception as e:
            _logger.error(f"consolidate_memory: could not save profile: {e}")
    saved = 0
    for fact in (result.facts or []):
        try:
            cat = (fact.category or "").strip().lower() or "profile"
            if cat not in {"profile", "preference", "mistake", "goal", "instruction"}:
                cat = "profile"
            key = (fact.key or "").strip().lower()
            value = (fact.value or "").strip()
            if not key or not value:
                continue
            await db.upsert_user_fact(
                user_id, cat, key, value,
                confidence=max(0.0, min(1.0, float(fact.confidence or 0.7))),
            )
            saved += 1
        except Exception as e:
            _logger.error(f"consolidate_memory: could not save fact {fact}: {e}")
    _logger.info(f"Consolidated memory for {user_id}: profile_updated={bool(new_profile)} facts_saved={saved}")
    # Refresh in-memory cached LTM so the next turn sees the new info.
    try:
        memoryData.setLongTermMemory(await load_long_term_memory(user_id))
    except Exception:
        memoryData.clearLongTermMemory()
    memoryData.resetTurnsSinceConsolidation()
    return True


def schedule_consolidation_if_due(uuid: str):
    """Call from per-turn hooks. Triggers a background consolidation when the
    turn counter crosses the configured threshold. No-op if disabled.
    """
    if _consolidate_every <= 0:
        return
    memoryData = memory.getMemory(uuid)
    if memoryData is None or not memoryData.getUser():
        return
    memoryData.incrementTurnsSinceConsolidation()
    if memoryData.getTurnsSinceConsolidation() < _consolidate_every:
        return
    # Reset immediately so concurrent turns don't all schedule.
    memoryData.resetTurnsSinceConsolidation()
    try:
        asyncio.get_event_loop().create_task(consolidate_memory(uuid))
    except RuntimeError:
        # No running loop (e.g. called from sync context); fall back to a one-shot run.
        try:
            asyncio.run(consolidate_memory(uuid))
        except Exception as e:
            _logger.error(f"schedule_consolidation_if_due: {e}")
