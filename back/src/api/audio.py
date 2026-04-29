from quart import current_app,Blueprint,  request, jsonify,Response
import asyncio
import logging
import os
import uuid as uuid_lib
import persistence
import memory

audio_bp = Blueprint('audio', __name__)

logger_=memory.getLogger()

tts_env = os.getenv("TTS")
if tts_env is not None and tts_env=='gemini':
    language_options = [
        { "label": "American English", "value": "en-US" },
        { "label": "British English", "value": "en-GB" },
        { "label": "Spanish - Spain", "value": "es-ES" },
    ]
    voice_options = [
        { "language": "en-US", "label": "en-US-Standard-A","gender":"Male" },
        { "language": "en-US", "label": "en-US-Standard-B","gender":"Male" },
        { "language": "en-US", "label": "en-US-Standard-C" ,"gender":"Female"},
        { "language": "en-US", "label": "en-US-Neural2-A" ,"gender":"male"},
        { "language": "en-US", "label": "en-US-Neural2-C" ,"gender":"female"},

        { "language": "en-GB", "label": "en-GB-Standard-A","gender":"Female" },
        { "language": "en-GB", "label": "en-GB-Standard-B","gender":"Male" },
        { "language": "en-GB", "label": "en-GB-Standard-C","gender":"Female" },
        { "language": "en-GB", "label": "en-GB-Neural2-A" ,"gender":"female"},
        { "language": "en-GB", "label": "en-GB-Neural2-B" ,"gender":"male"},
        

        { "language": "es-ES", "label": "es-ES-Standard-A","gender":"Male" },
        { "language": "es-ES", "label": "es-ES-Standard-B","gender":"Male" },
        { "language": "es-ES", "label": "es-ES-Standard-C","gender":"Female" },
        { "language": "es-ES", "label": "es-ES-Neural2-A" ,"gender":"Female"},
        { "language": "es-ES", "label": "es-ES-Neural2-F" ,"gender":"Male"},

    ]
else:
    language_options = [
        { "label": "American English", "value": "en-EU"},
        { "label": "British English", "value": "en-GB", },
        { "label": "Spanish", "value": "es-ES"},
    ]

    voice_options = [
        { "language": "en-EU", "label": "af_heart","gender":"Female" },
        { "language": "en-EU", "label": "af_aoede" ,"gender":""},
        { "language": "en-EU", "label": "af_bella" ,"gender":"Female"},
        { "language": "en-EU", "label": "af_sky" ,"gender":""},
        { "language": "en-EU", "label": "am_michael","gender":"Male" },
        { "language": "en-EU", "label": "am_fenrir","gender":"Male" },
        { "language": "en-EU", "label": "af_kore" ,"gender":""},
        { "language": "en-EU", "label": "am_puck","gender":"Male" },
        { "language": "en-GB", "label": "bf_emma","gender":"Female" },
        { "language": "en-GB", "label": "bm_george","gender":"Male" },
        { "language": "en-GB", "label": "bm_fable","gender":"Male" },
        { "language": "es-ES", "label": "ef_dora","gender":"Female" },
        { "language": "es-ES", "label": "em_alex","gender":"Male" },
        { "language": "es-ES", "label": "em_santa","gender":"Male" },
    ]

@audio_bp.route('/languages', methods=['GET'])
async def get_languages():
    return jsonify(language_options)
@audio_bp.route('/voices', methods=['GET'])
async def get_all_voices():
   return jsonify(voice_options)
@audio_bp.route('/voices/<string:language>', methods=['GET'])
async def get_voices(language):
    voices = [voice for voice in voice_options if voice['language'] == language]
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
  await asyncio.to_thread(ai.set_language, audioData, languageInput)
 
  await persistence.update_language(user,languageInput,audioData.voice_name)
  return jsonify({'message': f'Voice changed to {audioData.voice_name} and language to {audioData.language}!'})

@audio_bp.route('/human_voice', methods=['POST'])
async def set_human_voice():
  """Persist the user's secondary / "alternative" voice. Used for Shift+F4
  playback and the floating "alternative voice" button. Stored separately
  from the primary voice so the user can mix two different voices/languages
  for AI vs. their own lines."""
  data = await request.get_json()
  uuid = request.headers.get("uuid")
  user = memory.getMemory(uuid).getUser()
  voice = data.get('voice')
  if not voice:
    return jsonify({'message': 'Missing voice'}), 400
  await persistence.update_human_voice(user, voice)
  return jsonify({'message': f'Alternative voice changed to {voice}!'})