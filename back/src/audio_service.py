"""Audio helpers: speech-to-text and text-to-speech dispatch.

The active STT / TTS backends are selected by calling `init()` from the app
entry point. Multiple TTS engines may be enabled simultaneously; each user
session can override the default by setting `AudioData.tts_engine`.
"""
import logging

import memory


_stt: str = "gemini"
_default_tts: str = "gemini"
_enabled_tts: set[str] = {"gemini"}
_local_whisper = None
_logger: logging.Logger = logging.getLogger(__name__)


def init(
    stt: str,
    tts: str,
    local_whisper=None,
    logger: logging.Logger = None,
    enabled_tts: list[str] | None = None,
):
    global _stt, _default_tts, _enabled_tts, _local_whisper, _logger
    _stt = stt
    _default_tts = tts
    if enabled_tts:
        _enabled_tts = set(enabled_tts)
    else:
        _enabled_tts = {tts}
    _enabled_tts.add(tts)  # the default must always be enabled
    _local_whisper = local_whisper
    if logger is not None:
        _logger = logger


def get_default_engine() -> str:
    return _default_tts


def get_enabled_engines() -> list[str]:
    # Stable order: default first, then the rest sorted.
    others = sorted(e for e in _enabled_tts if e != _default_tts)
    return [_default_tts, *others]


def _resolve_engine(audioData: memory.AudioData) -> str:
    """Pick the engine for this request: per-session override or default."""
    requested = getattr(audioData, "tts_engine", None)
    if requested and requested in _enabled_tts:
        return requested
    if requested and requested not in _enabled_tts:
        _logger.warning(
            f"Requested TTS engine '{requested}' is not enabled; using '{_default_tts}'."
        )
    return _default_tts


def getTextFromAudio(audioData: memory.AudioData, filepath):
    if _stt == "local":
        language_whisper = {
            'en-EU': 'english',
            'en-GB': 'english',
            'es-ES': 'spanish',
        }.get(audioData.language, None)
        return _local_whisper(
            filepath,
            return_timestamps=True,
            generate_kwargs={"language": language_whisper},
        )['text']
    if _stt == "gemini":
        import sound_google
        return sound_google.getTextFromAudio(audioData, filepath)
    import sound_openai
    return sound_openai.stt_api_whisper(filepath)


def getAudioFromKokoro(text, audioData, uuid, voice_name: str = ""):
    import soundfile as sf
    import numpy as np
    import os
    import subprocess
    if voice_name == "":
        voice_name = audioData.voice_name
    if audioData.kpipeline is None:
        from kokoro import KPipeline
        audioData.kpipeline = KPipeline(lang_code=_kokoro_lang_code(audioData.language))
    generator = audioData.kpipeline(
        text,
        voice=voice_name,
        speed=1,
        split_pattern=r'\n+',
    )

    total = None
    for i, (gs, ps, audio) in enumerate(generator):
        if i == 0:
            total = audio
        else:
            total = np.concatenate((total, audio), axis=0)
    wav_file = f"audio/{uuid}-tts.wav"
    webm_file = f"audio/{uuid}-tts.webm"
    sf.write(wav_file, total, 24000)
    command = [
        'ffmpeg', "-y",
        '-i', wav_file,
        '-c:a', 'libopus',
        webm_file,
    ]
    subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        os.remove(wav_file)
    except OSError as exc:
        _logger.warning(f"Could not remove kokoro wav {wav_file}: {exc}")
    return webm_file


def getAudioFromVibevoice(text, audioData, uuid, voice_name: str = ""):
    import sound_vibevoice
    if voice_name == "":
        voice_name = audioData.voice_name
    return sound_vibevoice.synthesize_to_webm(text, voice_name, uuid)


def getAudioFromText(text, audioData, uuid, voice_name):
    engine = _resolve_engine(audioData)
    if engine == "kokoro":
        return getAudioFromKokoro(text, audioData, uuid, voice_name)
    if engine == "vibevoice":
        return getAudioFromVibevoice(text, audioData, uuid, voice_name)
    if engine == "gemini":
        import sound_google
        return sound_google.getAudioFromText(audioData, text, uuid, voice_name)
    import sound_openai
    return sound_openai.getAudioFromText(audioData, text, uuid, voice_name)


def _kokoro_lang_code(language: str) -> str:
    return {
        'en-EU': 'a',
        'en-GB': 'b',
        'es-ES': 'e',
    }.get(language, language)


def set_language(audioData, languageInput):
    if languageInput != audioData.language:
        audioData.language = languageInput
    # Only Kokoro needs a per-language pipeline rebuild; other engines either
    # take the language code per request (gemini/openai) or are language-agnostic
    # (vibevoice voice presets carry their own language).
    if "kokoro" in _enabled_tts:
        from kokoro import KPipeline
        try:
            audioData.kpipeline = KPipeline(lang_code=_kokoro_lang_code(languageInput))
        except AssertionError:
            _logger.info("Oppss.. pipeline bad configuration")


def set_engine(audioData, engine: str | None):
    """Override the TTS engine for this session. Pass None to fall back to default."""
    if engine and engine not in _enabled_tts:
        _logger.warning(
            f"TTS engine '{engine}' is not enabled (enabled: {sorted(_enabled_tts)}); ignoring."
        )
        return False
    audioData.tts_engine = engine or None
    return True
