"""LangChain prompt templates and chain factory.

`build_chains(llm_text)` returns a dict of named chains wired to the provided LLM.
"""
from langchain.prompts import PromptTemplate
from langchain.output_parsers import PydanticOutputParser

from ai_models import SumaryResume, AnalizePhrase, AnalizePhrases, TranslationResult, ReviewResult, MemoryExtraction


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
Analyze the grammatical correctness of the following sentence.
{sentence_input}

If the previous sentence is understandable and has no serious grammatical errors, don't worry about punctuation, missing spaces, or whether it could be improved for clarity.. The phrase was written for someone at level B2, so don't be too harsh. 
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

_prompt_translation_str = """
Translate the following from English word to Spanish. If a word has more than one meaning, list up to five of them, separated by commas. Indicate in brackets, for each translation, whether it is an adjective, a noun, a verb, etc.
Provide examples in both English and Spanish for each meaning of the word.

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


def _build_chain(template_str: str, input_variables: list, parser: PydanticOutputParser, llm):
    prompt = PromptTemplate(
        template=template_str,
        input_variables=input_variables,
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    return prompt | llm | parser


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
    }
