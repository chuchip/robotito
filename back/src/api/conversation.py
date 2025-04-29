from quart import Blueprint,  request, jsonify,Response
import persistence as db
import logging
import memory

conversation_bp = Blueprint('conversation', __name__)
logger_=memory.getLogger()


@conversation_bp.route('/id/<string:id>', methods=['GET'])
def conversation_getId(id):
  import robotito_ai as ai
  logging.info("GET  conversation with id: ",id)
  uuid=request.headers.get("uuid")
  mem=memory.getMemory(uuid)
  data = db.conversation_get_by_id(id)
  if len (data) == 0:
    return jsonify({'message': f'Conversation with id {id} NOT FOUND!', 'conversation': id})
  ai.restore_history(uuid,data)
  mem.setConversationId(id)
  return jsonify({'message': f'This is the conversation with id {id}!', 'conversation': data})


@conversation_bp.route('/id/<string:id>', methods=['DELETE'])
def conversation_deleteId(id): 
  logging.info("GET  conversation with id: ",id)
  db.conversation_delete_by_id(id)  
  return jsonify({'message': f'Conversation with id {id} DELETED!', 'conversation': id})


@conversation_bp.route('/id/<string:id>', methods=['POST'])
async def conversation_saveId(id):     
  data = await request.get_json()
  uuid=request.headers.get("uuid")  
  context = memory.getMemory(uuid).getContext()  
  idContext=None
  if not context is None:
    idContext=context.getId()
  id_conversation=db.conversation_save(uuid,id,data['user'],
                                       idContext,data['type'] ,data['msg'])
  #logging.info(f"Save  conversation with id: {id}{data} ")
  return jsonify({'message': f'Conversation saved on id {id_conversation} !', 'id': id_conversation})


@conversation_bp.route('/init', methods=['POST'])
async def conversation_init():     
  data = await request.get_json()
  uuid=request.headers.get("uuid")
  mem=memory.getMemory(uuid)
  # logging.info(f"Save  conversation with id: {id}{data} ")
  id_conversation=db.init_conversation(None,data['user'],data['msg'])
  if mem.getContext() is None:
    db.updateConversationContext(id_conversation, data['contextId'])
  mem.setConversationId(id_conversation)
  return jsonify({'message': f'Conversation saved on id {id_conversation} !', 'id': id_conversation})


@conversation_bp.route('/user/<string:user>', methods=['GET'])
def conversation_getUser(user): 
  logging.info("GET All conversations of the user: ",user)

  data = db.conversation_get_list(user)
  
  return jsonify({'message': f'Conversations of user {user}!', 'conversations': data})

@conversation_bp.route('/history', methods=['GET'])
def current_history(): 
  uuid=request.headers.get("uuid")
  chat_history=memory.getMemory(uuid).getChatHistory()
 
  return jsonify({
      'message': f'History of conversation id: {id}',
      'history': [{'content': msg.content, 'type': msg.type} for msg in chat_history]
  })


