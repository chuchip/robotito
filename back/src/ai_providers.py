"""LLM provider configuration factories.

Each function returns a configured LangChain model client. The caller decides
which provider to use based on the MODEL_API environment variable.
"""
import logging

from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI


def configOllamaAI(model: str, base_url: str, temperature: float = 0.6):
    from langchain_ollama.llms import OllamaLLM
    return OllamaLLM(model=model, base_url=base_url, temperature=temperature)


def configOpenAI(version: str = "3.5", temperature: float = 0.8):
    if version == "3.5":
        return ChatOpenAI(model_name="o3-mini", streaming=True)
    return ChatOpenAI(
        model_name="gpt-4o",
        presence_penalty=1.2,
        streaming=True,
        temperature=temperature,
    )


def configGeminiAI(model: str = "gemini-2.5-flash-lite", temperature: float = 0.6):
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=temperature,
        timeout=None,
        max_retries=2,
    )


def configure_whisper_local():
    """Configure the local Whisper pipeline for speech-to-text."""
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    model_id = "openai/whisper-large-v3-turbo"

    model_audio = AutoModelForSpeechSeq2Seq.from_pretrained(
        model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
    )
    model_audio.to(device)

    processor = AutoProcessor.from_pretrained(model_id)

    return pipeline(
        "automatic-speech-recognition",
        model=model_audio,
        chunk_length_s=30,
        batch_size=16,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        device=device,
    )
