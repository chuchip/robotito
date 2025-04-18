from quart import Blueprint,  request, jsonify
import persistence as db
import memory
context_bp = Blueprint('context', __name__)
import logging

@context_bp.route('/label/<string:label>', methods=['put'])
async def context_setByLabel(label):   
  logging.info("Set Context by Label: ",label)
  mem=memory.getMemory(request.headers.get("uuid"))
  context = mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)

  context_db = db.get_context_by_label(mem.getUser(), label)
  
  context.setId(context_db['id'])
  context.setLabel(context_db['label'])
  context.setText(context_db['text'])
  context.setRememberText(context_db['remember'])
  return jsonify({'message': f"Context set  Set Context to: '{id}'", 'data': context_db})

@context_bp.route('/id/<string:id>', methods=['put'])
async def context_setById(id):
  if id is None or id == '' or id=='null':
    return jsonify({'message': 'Context ID is required!','data': None}) 
  logging.info("Set Context: ",id)
  mem=memory.getMemory(request.headers.get("uuid"))
  context = mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)

  context_db = db.get_context_by_id(id)
  if context_db is None or 'text' not in context_db or not isinstance(context_db['text'], str):
    return jsonify({'message': f"Context Text NOT FOUND, is None, or is not a valid string!", 'data': None})
  try:
    context.setId(context_db['id'])
    context.setLabel(context_db['label'])
    context.setText(context_db['text'])
    context.setRememberText(context_db['remember'])
  except Exception as e:
    logging.error(f"An exception occurred: {e}")
    logging.error(f"Error setting context. Context DB values: {context_db}")
    if context_db is not None:
      for key, value in context_db.items():
        logging.info(f"{key}: {value}")
  return jsonify({'message': f"Context set  Set Context to: '{id}'", 'data': context_db})

## Work with context
@context_bp.route('', methods=['POST'])
async def context_update():       
  data = await request.get_json()  # Get JSON data from the request body   
  mem=memory.getMemory(request.headers.get("uuid")) 
  context =mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)
  if "label" not in data or data['label'] is None:
    return jsonify({'message': f"Context hasn't label", "status:": 'KO','text': data['context']})
  if data['label'].strip() == '':
    return jsonify({'message': f"Context hasn't a valid label", "status:": 'KO','text': data['context']})

  context.setLabel(data['label'])

  contextId=db.save_context(user=data['user'],label=data['label'],context=data['context'],remember=data['contextRemember'])
  if 'context' not in data  or 'contextRemember'  not in data:
     return jsonify({'message': f"Context hasn't a valid latext or label", "status:": 'KO','text': data['context']})
  try:
    context.setId(contextId)
    context.setLabel(data['label'])
    context.setText(data['context'])
    context.setRememberText(data['contextRemember'])
  except Exception as e:
    logging.error(f"An exception occurred: {e}")
    logging.error(f"Error setting context. {context} (type: {type(context)}) Data values: {data}")
    if data is not None:
      for key, value in data.items():
        logging.error(f"{key}: {value}")
    return jsonify({'message': f"Context updated successfully!. Update Context of: '{data['label']}'", "status:": 'KO','text': 'error'})  
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{data['label']}'", "status:": 'OK','text': data['context']})

@context_bp.route('/id/<string:id>', methods=['DELETE'])
async def context_delete_by_id(id):   
  logging.info("Deleted  context by id: ",id)
  db.delete_context_by_id(id)  
  return jsonify({'message': f'Context with id {id} successfully!', 'text': id})

# Url  /context/user/${user}
@context_bp.route('/user/<string:user>', methods=['GET'])
def context_get(user): 
  logging.info("GET All Context of user: ",user)
  data = db.get_all_context(user)  
  return jsonify({'message': 'Context updated successfully!', 'contexts': data})

@context_bp.route('/current', methods=['GET'])
def context_current_get(): 
  logging.info("GET Current Context ")  
  context = memory.getMemory(request.headers.get("uuid")).getContext()
  return jsonify(context.__dict__)