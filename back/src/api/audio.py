from quart import current_app,Blueprint,  request, jsonify,Response
import os
import persistence
import memory

audio_bp = Blueprint('audio', __name__)
tts = os.getenv("STT")
if tts is not None and tts=='gemini':
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
        { "language": "en-EU", "label": "am_fenrir","gender":"" },
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
    print("In upload audio")
    f=await request.files
    if 'audio' not in f:
        return jsonify({'error': 'No file part'}), 400

    file = f['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    uuid=request.headers.get("uuid")
    audioData=memory.getMemory(uuid).getAudioData()
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], uuid+"_"+file.filename)
    await  file.save(filepath) 
    text = ai.getTextFromAudio(audioData,filepath)
    
    return jsonify({'message': 'Audio uploaded successfully!', 'text': text})

@audio_bp.route('/tts', methods=['POST'])
async def tts():
    import robotito_ai as ai
    data = await request.get_json()  # Get JSON data from the request body
    text = data.get('text')
    uuid=request.headers.get("uuid")
    audioData=memory.getMemory(uuid).getAudioData()
    if text=='':
        return Response(None, mimetype='audio/webm')  
    #print(f"In tts {text}")
    webm_file = ai.getAudioFromText(text,audioData,uuid)

    def generate():
        with open(webm_file, 'rb') as file:  # Open file in binary mode
            while chunk := file.read(1024 * 1024):  # Read in 1MB chunks
                yield chunk  # Stream the chunks to the client

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
  ai.set_language( audioData, languageInput)
 
  persistence.update_language(user,languageInput,audioData.voice_name)
  return jsonify({'message': f'Voice changed to {audioData.voice_name} and language to {audioData.language}!'})