from quart import Blueprint,  request, jsonify,Response
import persistence as db
import logging
import memory
import asyncio
import trafilatura

conversation_bp = Blueprint('conversation', __name__)
logger_=memory.getLogger()

def get_or_create_memory(uuid):
    """Get memory object for UUID, creating it if it doesn't exist"""
    mem = memory.getMemory(uuid)
    if mem is None:
        mem = memory.memoryDTO(uuid)
        memory.addMemory(mem)
    return mem


@conversation_bp.route('/id/<string:id>', methods=['GET'])
async def conversation_getId(id):
  import robotito_ai as ai
  logging.info(f"GET  conversation with id: {id}")
  uuid=request.headers.get("uuid")
  mem=get_or_create_memory(uuid)
  data = await db.conversation_get_by_id(id)
  if len (data) == 0:
    return jsonify({'message': f'Conversation with id {id} NOT FOUND!', 'conversation': id}),404

  first_row = data[0]
  mem.clearUrlContext()
  url_source = first_row.get('url_source')
  if url_source:
    try:
      downloaded = await asyncio.to_thread(trafilatura.fetch_url, url_source)
      if downloaded is not None:
        text = trafilatura.extract(downloaded, include_comments=False, include_tables=True)
        if text:
          mem.setUrlContext(text, url_source)
    except Exception as e:
      logger_.error(f"Error fetching URL for conversation {id}: {e}")

  ai.restore_history(uuid,data)
  mem.setConversationId(id)
  return jsonify({'message': f'This is the conversation with id {id}!', 'conversation': data, 'url': url_source})


@conversation_bp.route('/id/<string:id>', methods=['DELETE'])
async def conversation_deleteId(id): 
  logging.info(f"DELETE conversation with id: {id}")
  await db.conversation_delete_by_id(id)  
  return jsonify({'message': f'Conversation with id {id} DELETED!', 'conversation': id})


@conversation_bp.route('/id/<string:id>', methods=['POST'])
async def conversation_saveId(id):     
  data = await request.get_json()
  uuid=request.headers.get("uuid")  
  mem = get_or_create_memory(uuid)
  context = mem.getContext()  
  idContext=None
  if not context is None:
    idContext=context.getId()
  id_conversation=await db.conversation_save(uuid,id,data['user'],
                                       idContext,data['type'] ,data['msg'])
  #logging.info(f"Save  conversation with id: {id}{data} ")
  return jsonify({'message': f'Conversation saved on id {id_conversation} !', 'id': id_conversation})


@conversation_bp.route('/init', methods=['POST'])
async def conversation_init():     
  data = await request.get_json()
  uuid=request.headers.get("uuid")
  mem=get_or_create_memory(uuid)
  # logging.info(f"Save  conversation with id: {id}{data} ")
  id_conversation=await db.init_conversation(None,data['user'],data['msg'])
  if mem.getContext() is None:
    await db.updateConversationContext(id_conversation, data.get('contextId'))
  if mem.getUrlSource():
    await db.updateConversationUrl(id_conversation, mem.getUrlSource())
  mem.setConversationId(id_conversation)
  return jsonify({'message': f'Conversation saved on id {id_conversation} !', 'id': id_conversation})


@conversation_bp.route('/user/<string:user>', methods=['GET'])
async def conversation_getUser(user): 
  logging.info(f"GET All conversations of the user: {user}")

  data = await db.conversation_get_list(user)
  
  return jsonify({'message': f'Conversations of user {user}!', 'conversations': data})

@conversation_bp.route('/history', methods=['GET'])
def current_history(): 
  uuid=request.headers.get("uuid")
  mem = get_or_create_memory(uuid)
  chat_history=mem.getChatHistory()
 
  return jsonify({
      'message': f'History of conversation id: {id}',
      'history': [{'content': msg.content, 'type': msg.type} for msg in chat_history]
  })


@conversation_bp.route('/id/<string:id>/notes', methods=['GET'])
async def conversation_get_notes(id):
  notes = await db.get_notes(id)
  return jsonify({'notes': notes if notes is not None else ''})


@conversation_bp.route('/id/<string:id>/notes', methods=['PUT'])
async def conversation_save_notes(id):
  data = await request.get_json()
  notes = data.get('notes', '')
  try:
    await db.save_notes(id, notes)
    return jsonify({'message': 'Notes saved', 'notes': notes})
  except ValueError as e:
    return jsonify({'message': str(e)}), 404

# Dictionary Words endpoints
@conversation_bp.route('/id/<string:id>/words', methods=['GET'])
async def conversation_get_words(id):
  try:
    words = await db.get_words(id)
    return jsonify({'words': words})
  except ValueError as e:
    return jsonify({'message': str(e)}), 404

@conversation_bp.route('/id/<string:id>/words', methods=['POST'])
async def conversation_add_word(id):
  import robotito_ai as ai
  
  data = await request.get_json()
  word = data.get('word', '').strip()
  
  if not word:
    return jsonify({'message': 'Word cannot be empty'}), 400
  
  try:
    uuid = request.headers.get("uuid")
    mem = get_or_create_memory(uuid)
    user_id = mem.getUser()
    
    if not user_id:
      return jsonify({'message': 'User not authenticated'}), 401
    
    # Call LLM to get translation
    try:
      translation_result = await ai.call_llm_translate(word)
      translation = translation_result.translation
      examples = translation_result.examples
      logging.info(f"LLM translation successful for '{word}'")
    except Exception as llm_error:
      logging.error(f"LLM translation failed: {str(llm_error)}")
      translation = f"Translation for '{word}'"
      examples = {"english_phrase": "Example sentence in English", "spanish_phrase": "Oración de ejemplo en español"}
    
    # Add word to database
    try:
      result = await db.add_word(id, user_id, word, translation, examples)
      logging.info(f"Word added successfully: {result}")
      return jsonify(result), 201
    except Exception as db_error:
      logging.error(f"Database error adding word: {str(db_error)}")
      return jsonify({'message': 'Database error'}), 500
  except ValueError as e:
    return jsonify({'message': str(e)}), 404
  except Exception as e:
    logger_.error(f"Error adding word '{word}': {str(e)}")
    return jsonify({'message': 'Internal server error'}), 500 

@conversation_bp.route('/id/<string:id>/words/<string:word_id>', methods=['PUT'])
async def conversation_update_word(id, word_id):
  data = await request.get_json()
  translation = data.get('translation', '')
  examples = data.get('examples', '')
  
  try:
    await db.update_word(id, word_id, translation, examples)
    return jsonify({'message': 'Word updated', 'id': word_id})
  except ValueError as e:
    return jsonify({'message': str(e)}), 404

@conversation_bp.route('/id/<string:id>/words/<string:word_id>', methods=['DELETE'])
async def conversation_delete_word(id, word_id):
  try:
    await db.delete_word(id, word_id)
    return jsonify({'message': 'Word deleted', 'id': word_id})
  except ValueError as e:
    return jsonify({'message': str(e)}), 404


