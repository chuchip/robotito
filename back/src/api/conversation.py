from flask import Blueprint,  request, jsonify,Response
import persistence as db
conversation_bp = Blueprint('conversation', __name__)

@conversation_bp.route('/id/<string:id>', methods=['GET'])
def conversation_getId(id): 
  print("GET  conversation with id: ",id)
  data = db.conversation_get_by_id(id)
  
  return jsonify({'message': f'This is the conversation with id {id}!', 'conversation': data})

@conversation_bp.route('/id/<string:id>', methods=['DELETE'])
def conversation_deleteId(id): 
  print("GET  conversation with id: ",id)
  db.conversation_delete_by_id(id)
  
  return jsonify({'message': f'Conversation with id {id} DELETED!', 'conversation': id})

@conversation_bp.route('/user/<string:user>', methods=['GET'])
def conversation_getUser(user): 
  print("GET All conversations of the user: ",user)

  data = db.conversation_get_list(user)
  
  return jsonify({'message': f'Conversations of user {user}!', 'conversations': data})