from flask import current_app,Blueprint, Flask, request, jsonify,Response
import os
import persistence as db
import robotito_ai as ai
import soundfile as sf
from kokoro import KPipeline
import subprocess
import numpy as np


audio_bp = Blueprint('user', __name__)
kpipeline = KPipeline(lang_code='a') # make sure lang_code matches voice
voice_name="af_heart"

@audio_bp.route('/audio/stt', methods=['POST'])
def upload_audio():
    print("In upload audio")
    if 'audio' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
 
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], file.filename)
    file.save(filepath)
    result = ai.pipe_whisper(filepath,return_timestamps=True)
    print(result)
    return jsonify({'message': 'Audio uploaded successfully!', 'text': result["text"]})

@audio_bp.route('/audio/tts', methods=['POST'])
def tts():     
    data = request.get_json()  # Get JSON data from the request body
    text = data.get('text') 
    if text=='':
        return Response(None, mimetype='audio/webm')  
    print(f"In tts {text}")
    generator = kpipeline(
            text, 
            voice= voice_name,
            speed=1, split_pattern=r'\n+'
        )    
    
    for i, (gs, ps, audio) in enumerate(generator):       
        if (i==0):
            total = audio
        else:
            total=np.concatenate((total, audio), axis=0)
    wav_file= "audio/audio.wav"
    webm_file="audio/text.webm"
    sf.write(wav_file, total, 24000)
    command = [
    'ffmpeg',"-y",
    '-i', wav_file,       # Input WAV file
    '-c:a', 'libopus',     # Audio codec (Opus)
        webm_file            # Output WebM file
    ]
    subprocess.run(command)


    def generate():
        with open(webm_file, 'rb') as file:  # Open file in binary mode
            while chunk := file.read(1024 * 1024):  # Read in 1MB chunks
                yield chunk  # Stream the chunks to the client

    return Response(generate(), mimetype='audio/webm')  # Set proper MIME type  

@audio_bp.route('/audio/language', methods=['POST'])
def set_language(): 
  global voice_name,kpipeline

  data = request.get_json()  # Get JSON data from the request body
  language = data.get('language') 
  if language == 'a':
    voice_name='af_heart'
  if language == 'b':
    voice_name='bf_emma'
  if language == 'e':   
    voice_name='em_alex'
  print("language:",language)
  kpipeline = KPipeline(lang_code=language) 
  return jsonify({'message': f'Voice changed to {voice_name}'})