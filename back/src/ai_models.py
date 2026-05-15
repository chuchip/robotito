"""Pydantic models used by the AI chains for structured output."""
from typing import List
from pydantic import BaseModel, Field


class SumaryResume(BaseModel):
    rating: str = Field(description="Overall rating of errors in sentences")
    explication: str = Field(description="Explication of why you give this rating")


class AnalizePhrase(BaseModel):
    """Information about each analized setence"""
    sentence: str = Field(description="Original sentence to analize")
    rating: str = Field(description="Set the rating for the original sentence. Set the value 'Good' only the analized sentence doesn't have any grammatical error")
    explication: str = Field(description="Explication of why you give the previous status")
    correction: str = Field(description="Give an description of what was wrong on the sentence")


class AnalizePhrases(BaseModel):
    """Container to keep a list of elemnts of type AnalizePhrase"""
    result: List[AnalizePhrase] = Field(description="An array containing elements of type 'AnalizePhrase'")


class ExamplePhrase(BaseModel):
    english_phrase: str = Field(description="Example sentence in English")
    spanish_phrase: str = Field(description="Example sentence in Spanish")


class TranslationResult(BaseModel):
    """Translation result with examples"""
    translation: str = Field(description="Spanish translation of the word")
    examples: List[ExamplePhrase] = Field(description="List of usage examples with both English and Spanish phrases")


class ReviewItem(BaseModel):
    """Evaluation result for a single quiz item."""
    word: str = Field(description="The original word that was prompted to the user")
    user_answer: str = Field(description="The translation answer typed by the user")
    is_correct: bool = Field(description="True if the user's answer is an acceptable translation of the word")
    feedback: str = Field(description="Short feedback for the user (one sentence)")


class ReviewResult(BaseModel):
    """Container for the evaluation of a list of quiz items."""
    items: List[ReviewItem] = Field(description="Evaluation results, one per quiz item, in the same order as the input")


class MemoryFact(BaseModel):
    """A single piece of long-term memory about the user."""
    category: str = Field(description="One of: 'profile', 'preference', 'mistake', 'goal', 'instruction'")
    key: str = Field(description="Short stable identifier for the fact (e.g. 'age', 'hobby:football', 'mistake:past_tense'). Lowercase, snake/colon style.")
    value: str = Field(description="The fact value as a short human-readable sentence")
    confidence: float = Field(description="Confidence in [0,1] that this fact is correct and worth remembering")


class MemoryExtraction(BaseModel):
    """Output of the memory consolidation chain."""
    profile: str = Field(description="A short paragraph (<=300 words) merging the previous profile with new stable info about the user. May be empty if nothing changed.")
    facts: List[MemoryFact] = Field(description="Discrete facts to remember. Empty list is allowed. Skip one-off chitchat.")


class ReviewVerdict(BaseModel):
    """Verdict produced after each user turn during a vocabulary review session.

    The frontend uses the `verdict` to decide whether to highlight the
    "Next word" button (correct/partial) and to record per-word outcomes for
    the end-of-session summary.
    """
    verdict: str = Field(description=(
        "One of: 'correct' (user clearly stated the meaning), 'partial' "
        "(close but imprecise), 'incorrect' (wrong guess), 'hint_given' "
        "(user asked for a clue / example / sentence without guessing), "
        "'gave_up' (user explicitly gave up or asked for the answer), "
        "'off_topic' (unrelated to the word)."
    ))
    rationale: str = Field(default="", description="One short sentence justifying the verdict. May be empty.")

