from quart import  Blueprint,Response,request,jsonify
import persistence as db
import memory
import logging

principal_bp = Blueprint('principal', __name__)

logger_=memory.getLogger()

async def generate(msg_graph):
  import robotito_ai as ai
  async for msg  in ai.call_llm(msg_graph):
      yield msg

@principal_bp.route('/max_length_answer/<int:max_length>', methods=['PUT'])
async def set_length_max_answer(max_length:int):
    logger_.info(f"Setting length max answer to : {max_length}")
    uuid=request.headers.get("uuid")
    mem=memory.getMemory(uuid)
    data_user=await db.get_user_data(mem.getUser())
    if max_length > memory.get_max_length_answer() and data_user['role']!='admin':
       return jsonify({"status":"KO","message":f"Max length answer {max_length}  exceed global maximum length: { memory.get_max_length_answer()} "})
    
    if data_user['role']!='admin' and max_length == 0:
       return jsonify({"status":"KO","message":f"Only admins can put lenght unlimited"})
    
    mem.setMaxLengthAnswer(max_length)
    await db.update_max_lenght(mem.getUser(),max_length)
    return jsonify({"status":"OK","message":f"Length max answer set to : {max_length}"})
@principal_bp.route('/max_length_answer', methods=['GET'])
async def get_length_max_answer():    
    uuid=request.headers.get("uuid")
    mem=memory.getMemory(uuid)
    max_length=mem.getMaxLengthAnswer()
    return jsonify({"status":"OK","maxLength":max_length, "message":f"Length max answer set to : {max_length}"})
@principal_bp.route('/summary', methods=['POST'])
async def summary_conversation():    
    uuid=request.headers.get("uuid")
    data = await request.get_json()      
    type= data.get("type")
    import robotito_ai as ai
    response=await ai.sumary_history(uuid,type)
    if type=='resume':  
        return jsonify({"status":"OK", "rating":response.rating,"explication": response.explication})
    else:
        json_array=[]
        for line in response.result:
           json_array.append({ "sentence":line.sentence,"status": line.rating,
                        "explication": line.explication,
                        "correction": line.correction })
        return jsonify({"status":"OK", "sentences":json_array})

@principal_bp.route('/rating_phrase', methods=['POST'])
async def rating_phrase():    
    data = await request.get_json()      
    phrase= data.get("phrase")
    import robotito_ai as ai
    response=await ai.rating_phrase(phrase)
   
    return jsonify({ "status":"OK", 
                    "sentence":response.sentence,"value": response.rating,
                    "explication": response.explication,
                    "correction": response.correction })
@principal_bp.route('/send-question', methods=['POST'])
async def send_question():    
    uuid=request.headers.get("uuid")
    data = await request.get_json()  # Get JSON data from the request body
    question =  data.get('text')
    if question is None:
       return ""
    
    msg_graph={"message": question,               
                "uuid": uuid}     
    
    return Response(generate(msg_graph), mimetype='text/plain')

@principal_bp.route('/clear', methods=['GET'])
def clear():   
  logger_.info("Clear conversation")
  uuid=request.headers.get("uuid")
  if len(memory.memoryData) != 0:
    mem=memory.getMemory(uuid)
    if mem is not None:
        mem.getChatHistory().clear()        
        return jsonify({"status":"OK",'message': f'Existed conversation with UUID: {uuid} cleared'})
    
  mem=memory.memoryDTO(uuid)  
  memory.addMemory(mem)
  
  return jsonify({'message': f'Conversation with UUID: {uuid} cleared'})
  

@principal_bp.route('/last_user', methods=['GET'])
async def get_last_user():
  mem = memory.getMemory(request.headers.get("uuid"))
  data=await db.get_user_data(mem.getUser())
  logging.info(f"Last user: {data}")
  return jsonify(data)


@principal_bp.route('/words', methods=['GET'])
async def get_user_words():
  """Return every word saved by the current user across all their conversations."""
  mem = memory.getMemory(request.headers.get("uuid"))
  if mem is None or not mem.getUser():
    return jsonify({'message': 'User not authenticated'}), 401
  words = await db.get_words_by_user(mem.getUser())
  return jsonify({'words': words})


@principal_bp.route('/words/review', methods=['POST'])
async def review_user_words():
  """Evaluate the user's answers to a vocabulary quiz using the LLM."""
  import robotito_ai as ai

  mem = memory.getMemory(request.headers.get("uuid"))
  if mem is None or not mem.getUser():
    return jsonify({'message': 'User not authenticated'}), 401
  user_id = mem.getUser()

  data = await request.get_json() or {}
  direction = data.get('direction', 'en->es')
  items = data.get('items', [])

  if direction not in ('en->es', 'es->en'):
    return jsonify({'message': 'Invalid direction'}), 400
  if not isinstance(items, list) or not items:
    return jsonify({'message': 'No items to review'}), 400

  payload_items = []
  word_ids = []
  for it in items:
    if not isinstance(it, dict):
      continue
    payload_items.append({
      'word': str(it.get('word', '')).strip(),
      'expected': str(it.get('expected', '')).strip(),
      'user_answer': str(it.get('user_answer', '')).strip(),
    })
    # Track the original word id alongside the LLM payload so we can update
    # the per-word review status once we have the grader's verdict.
    word_ids.append(str(it.get('id', '')).strip() or None)

  try:
    result = await ai.call_llm_review(payload_items, direction)
    out_items = [item.dict() for item in result.items]
    if len(out_items) != len(payload_items):
      logger_.warning(
        f"Review LLM returned {len(out_items)} items for {len(payload_items)} questions; padding."
      )
      aligned = []
      for i, src in enumerate(payload_items):
        if i < len(out_items):
          aligned.append(out_items[i])
        else:
          aligned.append({
            'word': src['word'],
            'user_answer': src['user_answer'],
            'is_correct': False,
            'feedback': 'Not evaluated by the grader.',
          })
      out_items = aligned

    # Persist the result for each word so the next review surfaces the words
    # that were missed (and untouched ones) first.
    for idx, graded in enumerate(out_items):
      word_id = word_ids[idx] if idx < len(word_ids) else None
      if not word_id:
        continue
      try:
        await db.update_word_review_status(user_id, word_id, bool(graded.get('is_correct')))
      except Exception as upd_err:
        logger_.warning(f"Could not update review status for word {word_id}: {upd_err}")

    return jsonify({'items': out_items, 'direction': direction})
  except Exception as e:
    logger_.error(f"Error reviewing words for user {user_id}: {str(e)}")
    return jsonify({'message': 'Internal server error'}), 500