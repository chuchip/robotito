from quart import Blueprint,  request, jsonify
import persistence as db
import  robotito_ai as ai
import memory
context_bp = Blueprint('context', __name__)

@context_bp.route('/label/<string:label>', methods=['put'])
async def context_setByLabel(label):   
  print("Set Context by Label: ",label)
  mem=memory.getMemory(request.headers.get("uuid"))
  context = mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)

  context_db = db.get_context_by_label(mem.getUser(), label)
  db.updateConversationContext(mem.getConversationId(),context_db['id'])
  context.setLabel(context_db['label'])
  context.setText(context_db['context'])
  context.setRememberText(context_db['contextRemember'])
  return jsonify({'message': f"Context set  Set Context to: '{id}'", 'data': context_db})

@context_bp.route('/id/<string:id>', methods=['put'])
async def context_setById(id):   
  print("Set Context: ",id)
  mem=memory.getMemory(request.headers.get("uuid"))
  context = mem.getContext()
  if context is None:
    context=memory.Context()
    mem.setContext(context)

  context_db = db.get_context_by_id(id)
  db.updateConversationContext(mem.getConversationId(),context_db['id'])
  context.setLabel(context_db['label'])
  context.setText(context_db['context'])
  context.setRememberText(context_db['contextRemember'])
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
  context.setLabel(data['label'])
  if data['label'] !='':
    contextId=db.save_context(user=data['user'],label=data['label'],context=data['context'],remember=data['contextRemember'])
    db.updateConversationContext(mem.getConversationId(),contextId)
  context.setText(data['context'])
  context.setRememberText(data['contextRemember'])
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{data['label']}'", 'text': data['context']})

@context_bp.route('', methods=['DELETE'])
async def context_delete():  
  data = await request.get_json()  # Get JSON data from the request body    
  print("Deleted  Context: ",data['label'])
  db.delete_context(user=data['user'],label=data['label'])  
  return jsonify({'message': 'Context deleted successfully!', 'text': data['label']})

@context_bp.route('/id/<string:id>', methods=['DELETE'])
async def context_delete_by_id(id):   
  print("Deleted  context by id: ",id)
  db.delete_context_by_id(id)  
  return jsonify({'message': f'Context with id {id} successfully!', 'text': id})

# Url  /context/user/${user}
@context_bp.route('/user/<string:user>', methods=['GET'])
def context_get(user): 
  print("GET All Context of user: ",user)
  data = db.get_all_context(user)  
  return jsonify({'message': 'Context updated successfully!', 'contexts': data})

@context_bp.route('/current', methods=['GET'])
def context_current_get(): 
  print("GET Current Context ")  
  context = memory.getMemory(request.headers.get("uuid")).getContext()
  return jsonify(context.__dict__)