from quart import current_app,Blueprint,  request, jsonify,Response
import asyncio
import logging
import os
import uuid as uuid_lib
import persistence
import memory
import audio_service

audio_bp = Blueprint('audio', __name__)

logger_=memory.getLogger()

# ---------------------------------------------------------------------------
# Per-engine option catalog. Each entry carries the engine it belongs to so
# the frontend can filter once the user picks an engine. New engines just
# need to be added here (and wired in audio_service.getAudioFromText).
# ---------------------------------------------------------------------------

_LANGUAGES_BY_ENGINE = {
    "kokoro": [
        {"label": "American English", "value": "en-EU"},
        {"label": "British English",  "value": "en-GB"},
        {"label": "Spanish",          "value": "es-ES"},
    ],
    "vibevoice": [
        # The realtime model is officially English-only; the multilingual
        # voices below are experimental (see VibeVoice docs).
        {"label": "American English", "value": "en-US"},
        {"label": "Spanish (experimental)",     "value": "es-ES"},
        {"label": "French (experimental)",      "value": "fr-FR"},
        {"label": "German (experimental)",      "value": "de-DE"},
        {"label": "Italian (experimental)",     "value": "it-IT"},
        {"label": "Portuguese (experimental)",  "value": "pt-PT"},
        {"label": "Japanese (experimental)",    "value": "ja-JP"},
        {"label": "Korean (experimental)",      "value": "ko-KR"},
    ],
    "gemini": [
        {"label": "American English", "value": "en-US"},
        {"label": "British English",  "value": "en-GB"},
        {"label": "Spanish - Spain",  "value": "es-ES"},
    ],
    "openai": [
        {"label": "American English", "value": "en-US"},
        {"label": "British English",  "value": "en-GB"},
        {"label": "Spanish - Spain",  "value": "es-ES"},
    ],
}

_VOICES_BY_ENGINE = {
    "kokoro": [
        {"language": "en-EU", "label": "af_heart",   "gender": "Female"},
        {"language": "en-EU", "label": "af_aoede",   "gender": ""},
        {"language": "en-EU", "label": "af_bella",   "gender": "Female"},
        {"language": "en-EU", "label": "af_sky",     "gender": ""},
        {"language": "en-EU", "label": "am_michael", "gender": "Male"},
        {"language": "en-EU", "label": "am_fenrir",  "gender": "Male"},
        {"language": "en-EU", "label": "af_kore",    "gender": ""},
        {"language": "en-EU", "label": "am_puck",    "gender": "Male"},
        {"language": "en-GB", "label": "bf_emma",    "gender": "Female"},
        {"language": "en-GB", "label": "bm_george",  "gender": "Male"},
        {"language": "en-GB", "label": "bm_fable",   "gender": "Male"},
        {"language": "es-ES", "label": "ef_dora",    "gender": "Female"},
        {"language": "es-ES", "label": "em_alex",    "gender": "Male"},
        {"language": "es-ES", "label": "em_santa",   "gender": "Male"},
    ],
    "vibevoice": [
        # Default English voices that ship with VibeVoice-Realtime-0.5B.
        {"language": "en-US", "label": "alice",   "gender": "Female"},
        {"language": "en-US", "label": "carter",  "gender": "Male"},
        {"language": "en-US", "label": "frank",   "gender": "Male"},
        {"language": "en-US", "label": "maya",    "gender": "Female"},
        {"language": "en-US", "label": "wayne",   "gender": "Male"},
        # Experimental multilingual voices (download via
        # demo/download_experimental_voices.sh in the VibeVoice repo).
        {"language": "es-ES", "label": "es-spk1", "gender": ""},
        {"language": "fr-FR", "label": "fr-spk1", "gender": ""},
        {"language": "de-DE", "label": "de-spk1", "gender": ""},
        {"language": "it-IT", "label": "it-spk1", "gender": ""},
        {"language": "pt-PT", "label": "pt-spk1", "gender": ""},
        {"language": "ja-JP", "label": "ja-spk1", "gender": ""},
        {"language": "ko-KR", "label": "ko-spk1", "gender": ""},
    ],
    "gemini": [
        {"language": "en-US", "label": "en-US-Standard-A", "gender": "Male"},
        {"language": "en-US", "label": "en-US-Standard-B", "gender": "Male"},
        {"language": "en-US", "label": "en-US-Standard-C", "gender": "Female"},
        {"language": "en-US", "label": "en-US-Neural2-A",  "gender": "male"},
        {"language": "en-US", "label": "en-US-Neural2-C",  "gender": "female"},
        {"language": "en-GB", "label": "en-GB-Standard-A", "gender": "Female"},
        {"language": "en-GB", "label": "en-GB-Standard-B", "gender": "Male"},
        {"language": "en-GB", "label": "en-GB-Standard-C", "gender": "Female"},
        {"language": "en-GB", "label": "en-GB-Neural2-A",  "gender": "female"},
        {"language": "en-GB", "label": "en-GB-Neural2-B",  "gender": "male"},
        {"language": "es-ES", "label": "es-ES-Standard-A", "gender": "Male"},
        {"language": "es-ES", "label": "es-ES-Standard-B", "gender": "Male"},
        {"language": "es-ES", "label": "es-ES-Standard-C", "gender": "Female"},
        {"language": "es-ES", "label": "es-ES-Neural2-A",  "gender": "Female"},
        {"language": "es-ES", "label": "es-ES-Neural2-F",  "gender": "Male"},
    ],
    "openai": [
        {"language": "en-US", "label": "alloy",   "gender": ""},
        {"language": "en-US", "label": "echo",    "gender": ""},
        {"language": "en-US", "label": "fable",   "gender": ""},
        {"language": "en-US", "label": "onyx",    "gender": ""},
        {"language": "en-US", "label": "nova",    "gender": ""},
        {"language": "en-US", "label": "shimmer", "gender": ""},
    ],
}

_ENGINE_LABELS = {
    "kokoro":    "Kokoro",
    "vibevoice": "VibeVoice (realtime)",
    "gemini":    "Google Gemini",
    "openai":    "OpenAI",
}


def _enabled_engines() -> list[str]:
    return audio_service.get_enabled_engines()


def _options_with_engine_tag(table: dict, key: str) -> list[dict]:
    """Flatten {engine: [...]} -> [...] and tag each entry with its engine."""
    out = []
    for engine in _enabled_engines():
        for entry in table.get(engine, []):
            out.append({**entry, "engine": engine})
    return out


@audio_bp.route('/engines', methods=['GET'])
async def get_engines():
    engines = _enabled_engines()
    return jsonify({
        "default": audio_service.get_default_engine(),
        "engines": [
            {"value": e, "label": _ENGINE_LABELS.get(e, e.title())}
            for e in engines
        ],
    })


@audio_bp.route('/languages', methods=['GET'])
async def get_languages():
    engine = request.args.get('engine')
    if engine:
        return jsonify(_LANGUAGES_BY_ENGINE.get(engine, []))
    return jsonify(_options_with_engine_tag(_LANGUAGES_BY_ENGINE, 'language'))


@audio_bp.route('/voices', methods=['GET'])
async def get_all_voices():
    engine = request.args.get('engine')
    if engine:
        return jsonify(_VOICES_BY_ENGINE.get(engine, []))
    return jsonify(_options_with_engine_tag(_VOICES_BY_ENGINE, 'voice'))


@audio_bp.route('/voices/<string:language>', methods=['GET'])
async def get_voices(language):
    engine = request.args.get('engine')
    if engine:
        voices = [v for v in _VOICES_BY_ENGINE.get(engine, []) if v['language'] == language]
        return jsonify(voices)
    voices = []
    for eng in _enabled_engines():
        for v in _VOICES_BY_ENGINE.get(eng, []):
            if v['language'] == language:
                voices.append({**v, "engine": eng})
    return jsonify(voices)

@audio_bp.route('/stt', methods=['POST'])
async def upload_audio():
    import robotito_ai as ai
    logging.info("In upload audio")
    f=await request.files
    if 'audio' not in f:
        return jsonify({'error': 'No file part'}), 400

    file = f['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    uuid=request.headers.get("uuid")
    audioData=memory.getMemory(uuid).getAudioData()
    request_id = uuid_lib.uuid4().hex
    filepath = os.path.join(
        current_app.config['UPLOAD_FOLDER'],
        f"{uuid}_{request_id}_{file.filename}",
    )
    await  file.save(filepath)
    try:
        text = await asyncio.to_thread(ai.getTextFromAudio, audioData, filepath)
    finally:
        try:
            await asyncio.to_thread(os.remove, filepath)
        except OSError as exc:
            logger_.warning(f"Could not remove upload {filepath}: {exc}")

    return jsonify({'message': 'Audio uploaded successfully!', 'text': text})

@audio_bp.route('/tts/stream', methods=['POST'])
async def tts_stream():
    """Low-latency streaming TTS for engines that support it (currently vibevoice).

    Returns raw PCM16 LE @ 24 kHz mono via chunked transfer encoding. The
    frontend decodes chunks with the Web Audio API for gapless playback while
    audio is still being generated. Other engines should keep using /tts.
    """
    data = await request.get_json()
    text = (data.get('text') or '').strip()
    uuid = request.headers.get("uuid")
    audioData = memory.getMemory(uuid).getAudioData()

    requested_engine = data.get('tts_engine') or audioData.tts_engine \
        or audio_service.get_default_engine()
    if requested_engine != 'vibevoice':
        return jsonify({
            'error': 'Streaming is only supported for the vibevoice engine.',
            'engine': requested_engine,
        }), 400
    if requested_engine not in audio_service.get_enabled_engines():
        return jsonify({'error': f"Engine '{requested_engine}' is not enabled."}), 400

    voice_name = data.get('voice_name') or audioData.voice_name
    if not text:
        return Response(b'', mimetype='audio/pcm')

    import sound_vibevoice

    def _producer():
        return sound_vibevoice.synthesize_streaming(text, voice_name)

    async def generate():
        # Run the blocking generator in a worker thread; pull each chunk back
        # to the event loop without blocking other requests. We use a small
        # queue so producer/consumer stay loosely coupled.
        gen = await asyncio.to_thread(_producer)
        sentinel = object()

        def _next():
            try:
                return next(gen)
            except StopIteration:
                return sentinel
            except Exception as exc:
                logger_.exception(f"VibeVoice streaming error: {exc}")
                return sentinel

        try:
            while True:
                chunk = await asyncio.to_thread(_next)
                if chunk is sentinel:
                    break
                yield chunk
        finally:
            try:
                gen.close()
            except Exception:
                pass

    headers = {
        # Hint to the client about the raw format so it can decode without
        # parsing. The frontend hardcodes 24 kHz / mono / s16le too.
        'X-Audio-Sample-Rate': '24000',
        'X-Audio-Channels': '1',
        'X-Audio-Format': 's16le',
        'Cache-Control': 'no-store',
    }
    return Response(generate(), mimetype='audio/pcm', headers=headers)


@audio_bp.route('/tts', methods=['POST'])
async def tts():
    import robotito_ai as ai
    data = await request.get_json()  # Get JSON data from the request body
    text = data.get('text')
    uuid=request.headers.get("uuid")
    voice_name=memory.getMemory(uuid).getAudioData().voice_name
    if data.get('voice_name') is not None:
        voice_name = data.get('voice_name') if data.get('voice_name') != '' else voice_name
    audioData=memory.getMemory(uuid).getAudioData()
    if text=='':
        return Response(None, mimetype='audio/webm')
    #logging.info(f"In tts {text}")
    # Unique key per request so concurrent TTS calls for the same user
    # do not overwrite each other's output file.
    file_key = f"{uuid}_{uuid_lib.uuid4().hex}"
    webm_file = await asyncio.to_thread(
        ai.getAudioFromText, text, audioData, file_key, voice_name
    )

    async def generate():
        try:
            file = await asyncio.to_thread(open, webm_file, 'rb')
            try:
                while True:
                    chunk = await asyncio.to_thread(file.read, 1024 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                await asyncio.to_thread(file.close)
        finally:
            try:
                await asyncio.to_thread(os.remove, webm_file)
            except OSError as exc:
                logger_.warning(f"Could not remove tts output {webm_file}: {exc}")

    return Response(generate(), mimetype='audio/webm')  # Set proper MIME type

@audio_bp.route('/language', methods=['POST'])
async def set_language():
  import robotito_ai as ai
  data = await request.get_json()  # Get JSON data from the request body
  uuid=request.headers.get("uuid")
  audioData=memory.getMemory(uuid).getAudioData()
  user=memory.getMemory(uuid).getUser()
  languageInput = data.get('language')
  audioData.voice_name = data.get('voice')
  # Optional engine override (per-session, not persisted in the DB).
  engine_input = data.get('tts_engine')
  if engine_input is not None:
    ai.set_engine(audioData, engine_input or None)
  await asyncio.to_thread(ai.set_language, audioData, languageInput)

  await persistence.update_language(user,languageInput,audioData.voice_name)
  current_engine = audioData.tts_engine or audio_service.get_default_engine()
  return jsonify({
      'message': f'Voice changed to {audioData.voice_name}, language to {audioData.language}, engine: {current_engine}!',
      'tts_engine': current_engine,
  })
