from flask import Flask, request, jsonify,Response
from flask_cors import CORS
import os
import robotito_ai as ai
import numpy as np
import base64
from pydub import AudioSegment
from io import BytesIO
import soundfile as sf
import subprocess
from kokoro import KPipeline

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

graph= ai.graph  
config= ai.config
vd=False
context="You are a robot designed to interact with non-technical people and we are having a friendly conversation."
kpipeline = KPipeline(lang_code='a') # make sure lang_code matches voice
voice_name="af_heart"

@app.route('/upload-audio', methods=['POST'])
def upload_audio():
    print("In upload audio")
    if 'audio' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
 
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(filepath)
    result = ai.pipe_whisper(filepath)
    
    return jsonify({'message': 'Audio uploaded successfully!', 'text': result["text"]})

@app.route('/send-question', methods=['POST'])
def send_question():    
    data = request.get_json()  # Get JSON data from the request body
    question = data.get('text') 
    print(f"In send-question {question} \ncontext: {context}")
    msg_graph={"messages": question,"chat_history": ai.chat_history,"retrieved_context": []
                ,"vd": vd,
                "system_msg": context }
        #print("Question_Graph: ",msg_graph) 
    response= graph.invoke(msg_graph, config) 
    answer=response["messages"][-1].content
    return jsonify({'message': 'M   g uploaded successfully!', 'text': answer})


@app.route('/tts', methods=['POST'])
def tts():     
    data = request.get_json()  # Get JSON data from the request body
    text = data.get('text') 
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

@app.route('/set-context', methods=['POST'])
def set_context(): 
  global context
  
  data = request.get_json()  # Get JSON data from the request body
  context = data.get('text') 
  print("Set Context: ",context)
  return jsonify({'message': 'Context updated successfully!', 'text': context})

@app.route('/language', methods=['POST'])
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

@app.route('/clear', methods=['GET'])
def clear(): 
  print("Clear conversation")
  
  ai.chat_history =[]
  return jsonify({'message': 'Conversation cleared'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

