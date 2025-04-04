from quart import current_app,Blueprint,  request, jsonify,Response
import os
import persistence as db
import robotito_ai as ai
import soundfile as sf
from kokoro import KPipeline
import persistence
import subprocess
import numpy as np
import memory

audio_bp = Blueprint('audio', __name__)


@audio_bp.route('/stt', methods=['POST'])
async def upload_audio():
    print("In upload audio")
    f=await request.files
    if 'audio' not in f:
        return jsonify({'error': 'No file part'}), 400

    file = f['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    uuid=request.headers.get("uuid")
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], uuid+"_"+file.filename)
    await  file.save(filepath) 
    text = ai.getTextFromAudio(filepath)
    
    return jsonify({'message': 'Audio uploaded successfully!', 'text': text})

@audio_bp.route('/tts', methods=['POST'])
async def tts():     
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
  data = await request.get_json()  # Get JSON data from the request body
  uuid=request.headers.get("uuid")
  audioData=memory.getMemory(uuid).getAudioData()
  user=memory.getMemory(uuid).getUser()
  languageInput = data.get('language') 
  audioData.voice_name = data.get('voice') 
  
  if languageInput != audioData.language:
    audioData.language=languageInput
    audioData.kpipeline = KPipeline(lang_code=languageInput)
  persistence.update_language(user,languageInput,audioData.voice_name)
  return jsonify({'message': f'Voice changed to {audioData.voice_name} and language to {audioData.language}!'})