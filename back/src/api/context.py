from quart import Blueprint,  request, jsonify
import logging
import persistence as db
import memory
import trafilatura
import asyncio

context_bp = Blueprint('context', __name__)

logger_=memory.getLogger()

@context_bp.route('/label/<string:label>', methods=['put'])
async def context_setByLabel(label):
  logger_.info(f"Set Context by Label: {label}")
  mem=memory.getMemory(request.headers.get("uuid"))
  context = mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)

  context_db = await db.get_context_by_label(mem.getUser(), label)
  
  context.setId(context_db['id'])
  context.setLabel(context_db['label'])
  context.setText(context_db['text'])
  context.setRememberText(context_db['remember'])
  return jsonify({'message': f"Context set  Set Context to: '{id}'", 'data': context_db})

@context_bp.route('/id/<string:id>', methods=['put'])
async def context_setById(id):

  if id is None or id == '' or id=='null':
    return jsonify({'message': 'Context ID is required!','status':'KO','data': None}) 
  logger_.info(f"Set Context: {id}")
  mem=memory.getMemory(request.headers.get("uuid"))
  if mem is None:
    return jsonify({'message': 'Memory not found!','status':'KO','data': None})
  context = mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)

  context_db = await db.get_context_by_id(id)
  if context_db is None or 'text' not in context_db or not isinstance(context_db['text'], str):
    return jsonify({'message': f"Context Text NOT FOUND, is None, or is not a valid string!", 'status':'KO','data': None})
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
  return jsonify({'message': f"Context set  Set Context to: '{id}'", 'data': context_db,'status':'OK'})

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
    return jsonify({'message': f"Context hasn't label", "status:": 'KO','text': data['context']}),501
  if data['label'].strip() == '':
    return jsonify({'message': f"Context hasn't a valid label", "status:": 'KO','text': data['context']}),501

  context.setLabel(data['label'])
  if 'context' not in data  or 'contextRemember'  not in data:
     return jsonify({'message': f"Context hasn't a valid latext or label", "status:": 'KO','text': data['context']}),501

  logger_.info(f"Context Update: {data['label']}: {data['context']}")
  contextId=await db.save_context(user_id=data['user'],label=data['label'],context=data['context'],remember=data['contextRemember'])
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
    return jsonify({'message': f"Context updated successfully!. Update Context of: '{data['label']}'", "status:": 'KO','text': 'error'}) ,501
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{data['label']}'", "status:": 'OK','text': data['context']})

@context_bp.route('/id/<string:id>', methods=['DELETE'])
async def context_delete_by_id(id):   
  logger_.info(f"Deleted  context by id: {id}")
  db.delete_context_by_id(id)  
  return jsonify({'message': f'Context with id {id} successfully!', 'text': id})

# Url  /context/user/${user}
@context_bp.route('/user/<string:user>', methods=['GET'])
async def context_get(user): 
  logger_.info(f"GET All Context of user: {user}")
  data = await db.get_all_context(user)  
  return jsonify({'message': 'Context updated successfully!', 'contexts': data})

@context_bp.route('/current', methods=['GET'])
def context_current_get(): 
  logger_.info("GET Current Context ")  
  context = memory.getMemory(request.headers.get("uuid")).getContext()
  return jsonify(context.__dict__)

@context_bp.route('/url', methods=['PUT'])
async def context_set_url():
  data = await request.get_json()
  url = data.get("url")
  if not url:
    return jsonify({'status': 'KO', 'message': 'URL is required'}), 400

  mem = memory.getMemory(request.headers.get("uuid"))
  try:
    downloaded = await asyncio.to_thread(trafilatura.fetch_url, url)
    if downloaded is None:
      return jsonify({'status': 'KO', 'message': 'Could not fetch the URL'}), 400
    text = trafilatura.extract(downloaded, include_comments=False, include_tables=True)
    if not text:
      return jsonify({'status': 'KO', 'message': 'Could not extract content from the page'}), 400
    mem.setUrlContext(text, url)
    logger_.info(f"URL context set from: {url} ({len(text)} chars)")
    return jsonify({'status': 'OK', 'message': f'URL content loaded ({len(text)} chars)', 'url': url, 'length': len(text)})
  except Exception as e:
    logger_.error(f"Error fetching URL {url}: {e}")
    return jsonify({'status': 'KO', 'message': f'Error fetching URL: {str(e)}'}), 500

@context_bp.route('/url', methods=['DELETE'])
def context_clear_url():
  logger_.info("Clearing URL context")
  mem = memory.getMemory(request.headers.get("uuid"))
  mem.clearUrlContext()
  return jsonify({'status': 'OK', 'message': 'URL context cleared'})

@context_bp.route('/url', methods=['GET'])
def context_get_url():
  mem = memory.getMemory(request.headers.get("uuid"))
  url_source = mem.getUrlSource()
  url_context = mem.getUrlContext()
  if url_context is None:
    return jsonify({'status': 'OK', 'url': None, 'length': 0})
  return jsonify({'status': 'OK', 'url': url_source, 'length': len(url_context)})
  