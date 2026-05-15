"""Vocabulary review feature.

Drives a one-on-one "review N random words" conversation:
- Picks the words from the user's dictionary on `start_review`.
- Streams a teacher reply on each user turn with a per-word system prompt
  (the LLM never sees future words).
- After the reply is done, runs a small judge chain to produce a structured
  verdict (`correct` / `partial` / `incorrect` / `hint_given` / `gave_up` /
  `off_topic`).
- The verdict is appended to the streamed response as a trailing marker
  (`\\n[[VERDICT:<value>]]`) so the frontend can update its UI in one round
  trip, and is also stored on the session for `GET /api/review/state`.

Kept deliberately separate from `ai_service.call_llm` to avoid bolting a
state machine onto the normal chat flow.
"""
import asyncio
import logging
import random
from typing import AsyncIterator

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage

import memory
import persistence as db


# Module-level singletons wired up by `init()` from robotito_ai.
_client_text = None
_chains: dict = {}
_model_api: str = "gemini"
_logger: logging.Logger = logging.getLogger(__name__)

# Number of words picked per review session. The dictionary may have fewer,
# in which case we pick everything available.
WORDS_PER_REVIEW = 10

# How many words to consider as candidates (most-needed-first) before random
# shuffle. Keeping a small pool means recently-failed/untested words are
# weighted heavily without being deterministic between sessions.
CANDIDATE_POOL_SIZE = max(WORDS_PER_REVIEW * 4, WORDS_PER_REVIEW)

# Suffix appended to the streamed teacher reply to communicate the judged
# verdict back to the frontend. Kept short and on its own line so the frontend
# can easily strip it before display / TTS.
VERDICT_PREFIX = "\n[[VERDICT:"
VERDICT_SUFFIX = "]]"

_VALID_VERDICTS = {"correct", "partial", "incorrect", "hint_given", "gave_up", "off_topic"}


_TEACHER_SYSTEM_TEMPLATE = (
    "You are the user's friendly English teacher in a vocabulary review session.\n"
    "We are reviewing one word at a time. Help the user remember the meaning of "
    "the CURRENT word only.\n\n"
    "Current word: \"{word}\"\n"
    "Meaning(s) (FOR YOUR EYES ONLY - do NOT reveal unless the user explicitly "
    "gives up or correctly states it): \"{translation}\"\n"
    "Reference example sentences you may draw on:\n{examples}\n\n"
    "Rules:\n"
    "1. Help the user remember what the current word means.\n"
    "2. If they ask for a clue: give a short hint - a sentence using the word, "
    "   a synonym, a category, a situation. Never state the translation directly.\n"
    "3. If they guess: warmly confirm a correct answer, gently correct a wrong "
    "   one, encourage another try.\n"
    "4. If they explicitly give up ('I don't know, tell me'): reveal the "
    "   meaning and invite them to move on.\n"
    "5. Keep replies short and conversational (no more than 3 sentences).\n"
    "6. Focus on the current word only - never hint about other words.\n"
    "7. Do not tell the user to click any button; the app handles that itself.\n"
)


def init(client_text, chains: dict, model_api: str, logger: logging.Logger):
    """Wire the service with the same LLM clients the main `ai_service` uses."""
    global _client_text, _chains, _model_api, _logger
    _client_text = client_text
    _chains = chains
    _model_api = model_api
    _logger = logger


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------
async def start_review(uuid: str):
    """Create a fresh review session for the current user.

    Returns a `(state, intro_line)` tuple, or `(None, None)` if the user has
    no words in their dictionary yet. The intro line is the first robot
    message ("Let's start with 'X'..."); the caller is responsible for
    showing/persisting it.
    """
    mem = memory.getMemory(uuid)
    if mem is None or not mem.getUser():
        return None, None
    user_id = mem.getUser()
    try:
        all_words = await db.get_words_by_user(user_id)
    except Exception as e:
        _logger.error(f"start_review: cannot read words for {user_id}: {e}")
        return None, None
    if not all_words:
        return None, None

    # Take the top-priority slice (`get_words_by_user` already orders by
    # "needs review most"), then shuffle so subsequent sessions don't always
    # surface the exact same first N words in the same order.
    pool = all_words[:CANDIDATE_POOL_SIZE]
    random.shuffle(pool)
    picked = pool[: min(WORDS_PER_REVIEW, len(pool))]
    review_words = [
        memory.ReviewWord(
            word_id=w.get("id"),
            word=w.get("word") or "",
            translation=w.get("translation") or "",
            examples=w.get("examples") or [],
        )
        for w in picked
    ]
    session = memory.ReviewSession(review_words)
    mem.setReviewSession(session)
    state = session.public_state()
    intro = _intro_line(state.get("current_word"))
    return state, intro


def end_review(uuid: str):
    """Stop the active review and return a summary, or `None` if there
    wasn't one."""
    mem = memory.getMemory(uuid)
    if mem is None:
        return None
    session = mem.getReviewSession()
    if session is None:
        return None
    summary = session.summary()
    mem.clearReviewSession()
    return summary


def get_state(uuid: str):
    """Return the public state of the active session, or `None`."""
    mem = memory.getMemory(uuid)
    if mem is None:
        return None
    session = mem.getReviewSession()
    if session is None:
        return None
    return session.public_state()


def advance_word(uuid: str, mark_known: bool = True):
    """Advance to the next word. `mark_known` records the current word as
    learned vs. unknown. Returns `(state, intro_line)` for the new word, or
    `(state, None)` when the session is finished."""
    mem = memory.getMemory(uuid)
    if mem is None:
        return None, None
    session = mem.getReviewSession()
    if session is None:
        return None, None
    session.advance("known" if mark_known else "unknown")
    state = session.public_state()
    intro = None if state["is_finished"] else _intro_line(state.get("current_word"))
    return state, intro


def skip_word(uuid: str):
    """Mark the current word as skipped (NOT counted as known) and advance."""
    mem = memory.getMemory(uuid)
    if mem is None:
        return None, None
    session = mem.getReviewSession()
    if session is None:
        return None, None
    session.advance("skipped")
    state = session.public_state()
    intro = None if state["is_finished"] else _intro_line(state.get("current_word"))
    return state, intro


def _intro_line(word: str) -> str:
    if not word:
        return ""
    return (
        f"Let's review the word '{word}'. Do you remember what it means? "
        "Ask for a clue if you need one."
    )


# ---------------------------------------------------------------------------
# Per-turn streaming
# ---------------------------------------------------------------------------
async def review_turn(uuid: str, user_message: str) -> AsyncIterator[str]:
    """Async generator: stream the teacher reply, then yield a trailing
    `\\n[[VERDICT:<value>]]` marker once judged.

    Updates the session's `last_verdict` and per-word counters as a side
    effect. Does NOT mutate `chat_history`; the conversation save endpoint
    is still responsible for appending the user/robot lines (same pattern as
    the normal chat flow).
    """
    mem = memory.getMemory(uuid)
    if mem is None:
        yield "Review session not found."
        yield VERDICT_PREFIX + "off_topic" + VERDICT_SUFFIX
        return
    session = mem.getReviewSession()
    if session is None or session.is_finished():
        yield "No active review session."
        yield VERDICT_PREFIX + "off_topic" + VERDICT_SUFFIX
        return

    word = session.current()
    system_text = _TEACHER_SYSTEM_TEMPLATE.format(
        word=word.word,
        translation=word.translation,
        examples=_format_examples(word.examples),
    )

    chat_history = mem.getChatHistory()
    # Use a short tail so the teacher remembers recent banter on this word
    # but doesn't drag the whole conversation into every prompt.
    msgs = chat_history[-8:] if chat_history else []

    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system_msg}"),
        ("placeholder", "{msgs}"),
        ("user", "{question}"),
    ])
    chat_prompt = prompt.format_messages(
        system_msg=system_text,
        msgs=msgs,
        question=HumanMessage(user_message),
    )

    reply_parts: list = []
    try:
        if _model_api == "ollama":
            async for chunk in _client_text.astream(chat_prompt):
                text = _chunk_to_text(chunk)
                if text:
                    reply_parts.append(text)
                    yield text
        else:
            async for chunk in _client_text.astream(chat_prompt):
                content = getattr(chunk, "content", chunk)
                text = _chunk_to_text(content)
                if text:
                    reply_parts.append(text)
                    yield text
    except Exception as e:
        _logger.error(f"review_turn: LLM streaming error: {e}")

    full_reply = "".join(reply_parts).strip()

    verdict = await _judge(word, user_message, full_reply)
    session.record_attempt(verdict)
    _logger.info(f"review_turn: word='{word.word}' verdict={verdict}")
    yield VERDICT_PREFIX + verdict + VERDICT_SUFFIX


async def _judge(word, user_message: str, teacher_reply: str) -> str:
    """Run the judge chain. Always returns one of `_VALID_VERDICTS`; falls
    back to `off_topic` on any error so the state machine doesn't get
    stuck."""
    chain = _chains.get("review_judge")
    if chain is None:
        return "off_topic"
    try:
        result = await asyncio.to_thread(
            chain.invoke,
            {
                "word": word.word,
                "translation": word.translation,
                "teacher_reply": teacher_reply or "",
                "user_message": user_message or "",
            },
        )
        verdict = (getattr(result, "verdict", "") or "").strip().lower().replace("-", "_").replace(" ", "_")
        if verdict not in _VALID_VERDICTS:
            _logger.warning(f"_judge: unexpected verdict '{verdict}', falling back to off_topic")
            return "off_topic"
        return verdict
    except Exception as e:
        _logger.error(f"_judge failed: {e}")
        return "off_topic"


def _format_examples(examples) -> str:
    if not examples:
        return "(none)"
    lines = []
    for ex in examples[:3]:
        en = (ex.get("english_phrase") or "").strip()
        es = (ex.get("spanish_phrase") or "").strip()
        if en or es:
            lines.append(f"- EN: {en} | ES: {es}")
    return "\n".join(lines) if lines else "(none)"


def _chunk_to_text(content) -> str:
    """Mirror of `ai_service._chunk_to_text` so the review streamer handles
    list/dict content blocks from newer LangChain Gemini chunks the same way
    the normal chat flow does."""
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
                txt = block.get("text") or block.get("content") or ""
                if isinstance(txt, str):
                    parts.append(txt)
        return "".join(parts)
    if isinstance(content, dict):
        return content.get("text") or content.get("content") or ""
    return str(content)
