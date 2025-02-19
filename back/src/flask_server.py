from quart import Quart, Response,request,jsonify
import asyncio
from quart_cors import cors
import os
import robotito_ai as ai
import persistence as db
from api.audio  import audio_bp
from api.context  import context_bp
import api.context  as context
from api.conversation import conversation_bp
from langchain_core.messages import  AIMessage

app = Quart(__name__)
app=cors(app,allow_origin="*")  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

graph= ai.graph  
config= ai.config
vd=False
id = None
user='default'

async def generate(graph,msg_graph):
    for msg, metadata  in graph.stream(msg_graph, config, stream_mode="messages"):      
      if isinstance(msg,AIMessage):
        print (msg.content)
        yield msg.content
async def generate1():
    for i in range(100):
        await asyncio.sleep(0.1)
        yield f"{i}\n" 

def generate2():
    for i in range(100):
        asyncio.sleep(0.1)
        yield f"{i}\n" 

@app.route('/send-question', methods=['POST'])
async def send_question():    
    global id
    data = await request.get_json()  # Get JSON data from the request body
    question =  data.get('text')
    if question is None:
       return ""
    id = db.init_conversation(id,user,question)
    print(f"In send-question {question} \ncontext: {context.context_text}")
    msg_graph={"messages": question,"chat_history": ai.chat_history,
               "retrieved_context": []
                ,"vd": vd,
                "system_msg": context.context_text,
                "id": id,
                "label": context.context_label,
                "user":user }     
  
    #return Response(generate1(), mimetype='text/plain')
    return Response(generate(graph,msg_graph))


@app.route('/clear', methods=['GET'])
def clear(): 
  global id
  print("Clear conversation")
  id = None
  ai.chat_history =[]
  return jsonify({'message': 'Conversation cleared'})

@app.route('/last_user', methods=['GET'])
def get_last_user(): 
  global user
  user=db.get_last_user()
  return jsonify({'user':user})

app.register_blueprint(audio_bp, url_prefix='/audio')
app.register_blueprint(context_bp, url_prefix='/context')
app.register_blueprint(conversation_bp, url_prefix='/conversation')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

