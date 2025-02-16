from flask import Flask, request, jsonify,Response
from flask_cors import CORS
import os
import robotito_ai as ai
import soundfile as sf
import persistence as db
from api.audio  import audio_bp

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

graph= ai.graph  
config= ai.config
vd=False
context="You are a robot designed to interact with non-technical people and we are having a friendly conversation."
label="NEW"

id = None
user='default'


@app.route('/send-question', methods=['POST'])
def send_question():    
    global id
    data = request.get_json()  # Get JSON data from the request body
    question = data.get('text')
        
    id = db.init_conversation(id,user,question)
    print(f"In send-question {question} \ncontext: {context}")
    msg_graph={"messages": question,"chat_history": ai.chat_history,
               "retrieved_context": []
                ,"vd": vd,
                "system_msg": context,
                "id": id,
                "label": label,
                "user":user }
        #print("Question_Graph: ",msg_graph) 
    response= graph.invoke(msg_graph, config) 
    answer=response["messages"][-1].content
    return jsonify({'message': 'M   g uploaded successfully!', 'text': answer})



## Work with context
@app.route('/context', methods=['POST'])
def context_update():     
  global context,label
  data = request.get_json()  # Get JSON data from the request body    
  print("Context update ",data['label'])
  label=data['label']
  if label != 'NEW' and label !='':
    db.save_context(user=data['user'],label=label,context=data['context'])  
  context=data['context']
  
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{label}'", 'text': data['label']})

@app.route('/context', methods=['DELETE'])
def context_delete(): 
  data = request.get_json()  # Get JSON data from the request body    
  print("Deleted  Context: ",data['label'])
  db.delete_context(user=data['user'],label=data['label'])  
  return jsonify({'message': 'Context deleted successfully!', 'text': data['label']})

@app.route('/context', methods=['GET'])
def context_get(): 
  print("GET All Context: ")
  user = request.args.get('user')  # Get 'user' parameter from the query string
  if not user:
        return jsonify({'error': 'User parameter is required'}), 400
  data = db.get_all_context(user)
  
  return jsonify({'message': 'Context updated successfully!', 'contexts': data})



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

@app.route('/conversation/id/<string:id>', methods=['GET'])
def conversation_getId(id): 
  print("GET  conversation with id: ",id)
  data = db.conversation_get_by_id(id)
  
  return jsonify({'message': f'This is the conversation with id {id}!', 'conversation': data})

@app.route('/conversation/id/<string:id>', methods=['DELETE'])
def conversation_deleteId(id): 
  print("GET  conversation with id: ",id)
  db.conversation_delete_by_id(id)
  
  return jsonify({'message': f'Conversation with id {id} DELETED!', 'conversation': id})

@app.route('/conversation/user/<string:user>', methods=['GET'])
def conversation_getUser(user): 
  print("GET All conversations of the user: ",user)

  data = db.conversation_get_list(user)
  
  return jsonify({'message': f'Conversations of user {user}!', 'conversations': data})

app.register_blueprint(audio_bp, url_prefix='/')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

