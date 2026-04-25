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
