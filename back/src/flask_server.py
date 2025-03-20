from quart import Quart, Response,request,jsonify
from quart_cors import cors
import os
import robotito_ai as ai
import persistence as db
from api.audio  import audio_bp
from api.context  import context_bp
from api.conversation import conversation_bp
from langchain_core.messages import  AIMessage,HumanMessage
import memory
app = Quart(__name__)
app=cors(app,allow_origin="*")  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

config= ai.config
vd=False


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
  
  memory.memoryData.append(memory.memoryDTO(uuid))
  
  return jsonify({'message': 'Conversation cleared'})

@app.route('/last_user', methods=['GET'])
def get_last_user():   
  data=db.get_last_user()
  print("Last user: ",data)
  return jsonify(data)


app.register_blueprint(audio_bp, url_prefix='/audio')
app.register_blueprint(context_bp, url_prefix='/context')
app.register_blueprint(conversation_bp, url_prefix='/conversation')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

