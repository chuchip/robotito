"""Audio helpers: speech-to-text and text-to-speech dispatch.

The active STT / TTS backend is selected by calling `init()` from the app
entry point with the provider names and local pipelines.
"""
import logging

import memory


_stt: str = "gemini"
_tts: str = "gemini"
_local_whisper = None
_logger: logging.Logger = logging.getLogger(__name__)


def init(stt: str, tts: str, local_whisper=None, logger: logging.Logger = None):
    global _stt, _tts, _local_whisper, _logger
    _stt = stt
    _tts = tts
    _local_whisper = local_whisper
    if logger is not None:
        _logger = logger


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
        audioData.kpipeline = KPipeline(lang_code=audioData.language)
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


def getAudioFromText(text, audioData, uuid, voice_name):
    if _tts == "kokoro":
        return getAudioFromKokoro(text, audioData, uuid, voice_name)
    if _tts == "gemini":
        import sound_google
        return sound_google.getAudioFromText(audioData, text, uuid, voice_name)
    import sound_openai
    return sound_openai.getAudioFromText(audioData, text, uuid, voice_name)


def set_language(audioData, languageInput):
    if languageInput != audioData.language:
        audioData.language = languageInput
    if _tts == 'kokoro':
        from kokoro import KPipeline
        try:
            language_kokoro = {
                'en-EU': 'a',
                'en-GB': 'b',
                'es-ES': 'e',
            }.get(languageInput, None)
            if language_kokoro is None:
                language_kokoro = languageInput
            audioData.kpipeline = KPipeline(lang_code=language_kokoro)
        except AssertionError:
            _logger.info("Oppss.. pipeline bad configuration")
