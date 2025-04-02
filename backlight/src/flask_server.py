from quart import Quart, Response,request,abort,jsonify
from quart_cors import cors
import os
import robotito_ai as ai
import persistence as db
from api.audio  import audio_bp
from api.context  import context_bp
from api.conversation import conversation_bp
from api.security import security_bp
import memory
#from api.security import security_check
from functools import wraps
app = Quart(__name__)
app=cors(app,allow_origin="*")  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

config= ai.config
vd=False

@app.before_request
def security_check():
    if request.method == 'OPTIONS':
        return
    current_endpoint = request.endpoint
    print("Current endpoint: ",current_endpoint)
    if 'uuid' not in request.headers:
        abort(401)   
    if current_endpoint == 'clear' or current_endpoint == 'security.get_uuid' or current_endpoint == 'security.login': 
        return
    if 'Authorization' not in request.headers:
        abort(401)  # Unauthorized
    authorization=request.headers.get("Authorization")
    mem= memory.getMemory(request.headers.get("uuid")) 
    session= mem.getSession()
    if session is None:
          abort(401)
    else:
        if session.getAuthorization()!=authorization:
          abort(401)
    print("Security check OK")

async def generate(msg_graph):
  async for msg  in  ai.call_llm(msg_graph):
      yield msg

@app.route('/send-question', methods=['POST'])
async def send_question():    
    uuid=request.headers.get("uuid")
    data = await request.get_json()  # Get JSON data from the request body
    question =  data.get('text')
    if question is None:
       return ""
    #id = db.init_conversation(id,user,question)
    msg_graph={"message": question,               
                "uuid": uuid}     
    
    return Response(generate(msg_graph), mimetype='text/plain')


@app.route('/clear', methods=['GET'])
def clear():   
  print("Clear conversation")
  uuid=request.headers.get("uuid")
  if len(memory.memoryData) != 0:
    mem=memory.getMemory(uuid)
    if mem is not None:
      mem.getChatHistory().clear()        
      return jsonify({'message': f'Existed conversation with UUID: {uuid} cleared'})
  memory.memoryData.append(memory.memoryDTO(uuid))
  return jsonify({'message': f'Conversation with UUID: {uuid} cleared'})
  

@app.route('/last_user', methods=['GET'])
def get_last_user():
  mem = memory.getMemory(request.headers.get("uuid"))
  data=db.get_last_user(mem)
  print("Last user: ",data)
  return jsonify(data)


app.register_blueprint(audio_bp, url_prefix='/audio')
app.register_blueprint(context_bp, url_prefix='/context')
app.register_blueprint(conversation_bp, url_prefix='/conversation')
app.register_blueprint(security_bp, url_prefix='/security')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

