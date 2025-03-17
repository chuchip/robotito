from quart import current_app,Blueprint,  request, jsonify,Response
import os
import persistence as db
import robotito_ai as ai
import soundfile as sf
from kokoro import KPipeline
import persistence
from api.conversation import user
import subprocess
import numpy as np

language='a'
audio_bp = Blueprint('audio', __name__)
kpipeline = KPipeline(lang_code=language) 
voice_name="af_heart"

@audio_bp.route('/stt', methods=['POST'])
async def upload_audio():
    print("In upload audio")
    f=await request.files
    if 'audio' not in f:
        return jsonify({'error': 'No file part'}), 400

    file = f['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    # print(file)
    # print("Upload folder ",current_app.config['UPLOAD_FOLDER'])
    filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], file.filename)
    await  file.save(filepath) 
    text = ai.getTextFromAudio(filepath)
    
    # print(result)
    return jsonify({'message': 'Audio uploaded successfully!', 'text': text})

@audio_bp.route('/tts', methods=['POST'])
async def tts():     
    data = await request.get_json()  # Get JSON data from the request body
    text = data.get('text') 
    user = data.get('user') 
    if text=='':
        return Response(None, mimetype='audio/webm')  
    #print(f"In tts {text}")
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
    wav_file= f"audio/{user}-tts.wav"
    webm_file=f"audio/{user}-tts.webm"
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

@audio_bp.route('/language', methods=['POST'])
async def set_language(): 
  global voice_name,kpipeline,language
  data = await request.get_json()  # Get JSON data from the request body
  
  languageInput = data.get('language') 
  voice_name = data.get('voice') 
  print(language , voice_name)
  if languageInput != language:
    language=languageInput
    kpipeline = KPipeline(lang_code=language)
  persistence.update_language(user,languageInput,voice_name)
  return jsonify({'message': f'Voice changed to {voice_name}'})