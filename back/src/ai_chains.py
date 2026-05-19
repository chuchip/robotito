"""LangChain prompt templates and chain factory.

`build_chains(llm_text)` returns a dict of named chains wired to the provided LLM.
"""
import re

from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.runnables import RunnableLambda
from langchain_core.messages import BaseMessage

from ai_models import SumaryResume, AnalizePhrase, AnalizePhrases, TranslationResult, ReviewResult, MemoryExtraction, ReviewVerdict


# ---------------------------------------------------------------------------
# Output cleanup
# ---------------------------------------------------------------------------
_CODE_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*([\s\S]*?)\s*```")


def _clean_llm_json(message):
    """Best-effort cleanup of an LLM response so PydanticOutputParser can
    decode it. Handles the two failure modes we see in practice:

    - The model wraps the JSON in a Markdown ```json ... ``` fence.
    - The model prefixes or suffixes the JSON with prose (e.g. "Sure! Here
      is the result: { ... }").

    Returns the original message untouched when no JSON object/array can be
    located — let the downstream parser raise a meaningful error in that
    case.
    """
    # The chain runs LLM -> parser, so we may receive either an AIMessage
    # (chat models) or a plain string (some completion LLMs).
    if isinstance(message, BaseMessage):
        text = message.content
        if isinstance(text, list):  # Google-style content blocks.
            parts = []
            for block in text:
                if isinstance(block, str):
                    parts.append(block)
                elif isinstance(block, dict):
                    parts.append(block.get("text") or block.get("content") or "")
            text = "".join(parts)
        if not isinstance(text, str):
            return message
    elif isinstance(message, str):
        text = message
    else:
        return message

    cleaned = text.strip()

    # 1. Strip Markdown code fences (``` or ```json) anywhere in the output.
    fence_match = _CODE_FENCE_RE.search(cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # 2. Extract the first balanced JSON object / array. We track string
    #    state so braces inside strings don't throw us off.
    start_idx = -1
    open_char = ""
    for i, ch in enumerate(cleaned):
        if ch == "{" or ch == "[":
            start_idx = i
            open_char = ch
            break
    if start_idx < 0:
        # Nothing to extract; return what we have and let the parser
        # produce a useful error.
        if isinstance(message, BaseMessage):
            message.content = cleaned
            return message
        return cleaned

    close_char = "}" if open_char == "{" else "]"
    depth = 0
    in_string = False
    escape = False
    end_idx = -1
    for i in range(start_idx, len(cleaned)):
        ch = cleaned[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
            continue
        if ch == open_char:
            depth += 1
        elif ch == close_char:
            depth -= 1
            if depth == 0:
                end_idx = i
                break

    if end_idx > start_idx:
        cleaned = cleaned[start_idx:end_idx + 1]

    if isinstance(message, BaseMessage):
        message.content = cleaned
        return message
    return cleaned


_clean_json_runnable = RunnableLambda(_clean_llm_json)


_prompt_resume_str = """
Analyze the grammatical correctness of the following sentences. 
If they are understandable and don't have any serious grammatical errors, don't worry about punctuation, missing spaces, or whether it could be improved for clarity. The phrases were written for someone at level B2, so don't be too harsh. 
Give a final brief summary feedback without talk about specific sentences.
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Sentences to analyze:
{sentences_input}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}.
"""

_prompt_detail_str = """
In the following sentences, analyze each one and determine if it's understandable and free of grammatical errors. Ignore punctuation, missing spaces, and potential clarity improvements. The target audience is B2 level.
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Sentences  to analyze:
{sentences_input}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

_prompt_rating_str = """
Analyze the grammatical correctness of the following sentences. If there are more than one sentence in the input, analyze all as a whole, not separately. 
{sentence_input}

If the previous sentences are  understandable and has no serious grammatical errors, don't worry about punctuation, missing spaces, or whether it could be improved for clarity.. The phrase was written for someone at level B2, so don't be too harsh. 
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Return a single JSON object, not an array.

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

_prompt_translation_str = """
Translate the following from English word to Spanish. If a word has more than one meaning, list up to five of them, separated by commas. Indicate in brackets, for each translation, whether it is an adjective, a noun, a verb, etc. For each translation, if that meaning is not commonly used, indicate it in parentheses.
Provide examples phrases with the word in both, English and Spanish, for each meaning of the word. 
For the example phrases, you must use the exact English word '{word_input}' or its direct conjugations (e.g., tempted, tempting). Do not use synonyms like 'provoke' or 'lure'. If the word is not in the example, the response is incorrect.

Word: {word_input}

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

_prompt_review_str = """
You are evaluating a vocabulary quiz. The user is being asked to translate words in the direction: {direction}
("en->es" means the prompted word is in English and the user must give a Spanish translation;
 "es->en" means the prompted word is in Spanish and the user must give an English translation).

For each item, decide if the user's answer is an acceptable translation of the prompted word.

Be lenient with:
- Capitalization, accents (tildes), trailing punctuation, plural/singular forms.
- Articles ("the", "a", "el", "la", "los", "las") at the start of the answer.
- Multiple acceptable meanings: if the user's answer matches ANY common meaning of the word,
  mark it as correct, even if it differs from the reference translation.
- Synonyms and very close translations.

Mark as incorrect when the answer is empty, unrelated, or clearly wrong.

Reference data and user answers (JSON array, evaluate them in the same order):
{items_input}

Provide the results as a JSON object conforming to the following schema. Keep "feedback" short
(one sentence). Write feedback in Spanish if direction is en->es, or in English if direction is es->en.
Always include every item from the input in the output, in the same order.

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""


_prompt_memory_str = """
You curate a long-term memory about a single user of a chatbot, so the assistant
can "know" them across sessions. You receive:
- The user's existing profile (may be empty).
- The list of facts already remembered about them (may be empty).
- A transcript of the most recent conversation.

Your job:
1. Extract STABLE information worth remembering: name, age, location, hobbies,
   job, language level, learning goals, recurring mistakes, explicit standing
   instructions ("call me X", "always answer in Spanish", "I prefer short
   answers"), and strong preferences. Ignore one-off chitchat, weather, jokes,
   transient moods.
2. Update the profile paragraph by MERGING old + new info. Keep it under 300
   words, written as a short third-person bio the assistant will read at the
   start of every conversation. If nothing new came up, return the old profile
   unchanged.
3. Return a list of discrete facts. For each fact pick:
   - category: one of 'profile' (identity), 'preference', 'mistake' (recurring
     language mistake), 'goal', 'instruction'.
   - key: short stable identifier in lowercase snake/colon style, e.g.
     'age', 'name', 'hobby:football', 'mistake:past_tense',
     'instruction:call_me_pedro', 'preference:short_answers'.
     Reuse existing keys if the fact updates one.
   - value: one short sentence in natural language.
   - confidence: 0.0..1.0.
4. Do NOT invent facts. If unsure, leave it out. Empty list is fine.

Existing profile:
---
{existing_profile}
---

Existing facts (JSON):
{existing_facts}

Recent conversation transcript:
---
{transcript}
---

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""


_prompt_review_judge_str = """
You are the silent judge in a vocabulary-review session. After every turn you
return a single verdict describing the user's latest message about the
CURRENT word.

Current word: "{word}"
Its accepted meaning(s): "{translation}"

The user is interacting with a teacher assistant that just replied to them
(included only for context — DO NOT judge the teacher's reply, judge the
USER's message):

Teacher reply:
---
{teacher_reply}
---

User message:
---
{user_message}
---

Pick exactly one verdict:
- "correct"     - the user clearly stated the meaning (translation, synonym, or accurate definition). Be lenient with spelling, accents, plural/singular, and articles.
- "partial"     - close but imprecise, or only one of several meanings of a multi-sense word.
- "incorrect"   - they guessed and were wrong.
- "hint_given"  - they did NOT guess: they asked for a clue, an example sentence, a synonym, a category, said "I don't remember", etc.
- "gave_up"     - they explicitly gave up or asked for the answer ("I don't know, tell me", "just give me the answer", "skip").
- "off_topic"   - their message is not about this word at all.

Provide a one-sentence rationale.

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""


def _build_chain(template_str: str, input_variables: list, parser: PydanticOutputParser, llm):
    prompt = PromptTemplate(
        template=template_str,
        input_variables=input_variables,
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    # Insert a JSON-cleanup step between the LLM and the Pydantic parser so
    # responses wrapped in ```json``` fences or padded with prose still
    # parse correctly.
    return prompt | llm | _clean_json_runnable | parser


def build_chains(llm_text, llm_smart=None) -> dict:
    """Create the chains used by the app.

    `llm_text` powers the cheap, high-volume chains (chat summary, rating,
    translation, init summary).
    `llm_smart` (optional) powers the heavier reasoning chains: vocabulary
    review grading and long-term memory extraction. Falls back to `llm_text`
    when not provided.
    """
    smart = llm_smart or llm_text
    return {
        "resume": _build_chain(
            _prompt_resume_str, ["sentences_input"],
            PydanticOutputParser(pydantic_object=SumaryResume), llm_text,
        ),
        "detail": _build_chain(
            _prompt_detail_str, ["sentences_input"],
            PydanticOutputParser(pydantic_object=AnalizePhrases), llm_text,
        ),
        "rating": _build_chain(
            _prompt_rating_str, ["sentence_input"],
            PydanticOutputParser(pydantic_object=AnalizePhrase), llm_text,
        ),
        "translation": _build_chain(
            _prompt_translation_str, ["word_input"],
            PydanticOutputParser(pydantic_object=TranslationResult), llm_text,
        ),
        "review": _build_chain(
            _prompt_review_str, ["direction", "items_input"],
            PydanticOutputParser(pydantic_object=ReviewResult), smart,
        ),
        "memory": _build_chain(
            _prompt_memory_str, ["existing_profile", "existing_facts", "transcript"],
            PydanticOutputParser(pydantic_object=MemoryExtraction), smart,
        ),
        # Vocabulary-review judge. Called once per user turn during a review
        # session to produce a structured verdict (correct / partial /
        # incorrect / hint_given / gave_up / off_topic). Uses the cheap
        # `llm_text` model: the prompt is short, the schema tiny, and the
        # call happens for every user turn, so cost matters more than peak
        # reasoning quality.
        "review_judge": _build_chain(
            _prompt_review_judge_str, ["word", "translation", "teacher_reply", "user_message"],
            PydanticOutputParser(pydantic_object=ReviewVerdict), llm_text,
        ),
    }
