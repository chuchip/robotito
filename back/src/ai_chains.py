"""LangChain prompt templates and chain factory.

`build_chains(llm_text)` returns a dict of named chains wired to the provided LLM.
"""
from langchain.prompts import PromptTemplate
from langchain.output_parsers import PydanticOutputParser

from ai_models import SumaryResume, AnalizePhrase, AnalizePhrases, TranslationResult


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
Translate the following English word to Spanish. If a word have more than one meaning, return no more than 5 of them them separate by comma. 
Provide on examples in both English and Spanish for each word meaning.

Word: {word_input}

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""


def _build_chain(template_str: str, input_variables: list, parser: PydanticOutputParser, llm):
    prompt = PromptTemplate(
        template=template_str,
        input_variables=input_variables,
        partial_variables={"format_instructions": parser.get_format_instructions()},
    )
    return prompt | llm | parser


def build_chains(llm_text) -> dict:
    """Create the four chains used by the app. Returns dict with keys:
    'resume', 'detail', 'rating', 'translation'.
    """
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
    }
