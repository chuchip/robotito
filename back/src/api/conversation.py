from quart import Blueprint,  request, jsonify,Response
import persistence as db
import robotito_ai as ai
from robotito_ai import context
conversation_bp = Blueprint('conversation', __name__)
id_conversation = None
user='default'

@conversation_bp.route('/id/<string:id>', methods=['GET'])
def conversation_getId(id): 
  global id_conversation
  print("GET  conversation with id: ",id)
  data = db.conversation_get_by_id(id)
  if len (data) == 0:
    return jsonify({'message': f'Conversation with id {id} NOT FOUND!', 'conversation': id})
  ai.restore_history(data)
  id_conversation=id
  return jsonify({'message': f'This is the conversation with id {id_conversation}!', 'conversation': data})

@conversation_bp.route('/id/<string:id>', methods=['DELETE'])
def conversation_deleteId(id): 
  print("GET  conversation with id: ",id)
  db.conversation_delete_by_id(id)
  
  return jsonify({'message': f'Conversation with id {id} DELETED!', 'conversation': id})

@conversation_bp.route('/id/<string:id>', methods=['POST'])
async def conversation_saveId(id): 
  global id_conversation
  
  data = await request.get_json()
  # print(f"Save  conversation with id: {id}{data} ")
  id_conversation=db.conversation_save(id,data['user'],
                                       context.getLabel(),data['type'] ,data['msg'])

  return jsonify({'message': f'Conversation saved on id {id_conversation} !', 'id': id_conversation})
@conversation_bp.route('/init', methods=['POST'])
async def conversation_init(): 
  global id_conversation
  
  data = await request.get_json()
  # print(f"Save  conversation with id: {id}{data} ")
  id_conversation=db.init_conversation(None,data['user'],data['msg'])
  
  return jsonify({'message': f'Conversation saved on id {id_conversation} !', 'id': id_conversation})


@conversation_bp.route('/user/<string:user>', methods=['GET'])
def conversation_getUser(user): 
  print("GET All conversations of the user: ",user)

  data = db.conversation_get_list(user)
  
  return jsonify({'message': f'Conversations of user {user}!', 'conversations': data})