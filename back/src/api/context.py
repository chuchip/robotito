from quart import Blueprint,  request, jsonify
import persistence as db
import  robotito_ai as ai
import memory
context_bp = Blueprint('context', __name__)

## Work with context/
@context_bp.route('', methods=['POST'])
async def context_update():       
  data = await request.get_json()  # Get JSON data from the request body    
  context = memory.getMemory(request.headers.get("uuid")).getContext()  
  context.setLabel(data['label'])
  if data['label'] != 'NEW' and data['label'] !='':
    db.save_context(user=data['user'],label=data['label'],context=data['context'],remember=data['contextRemember'])  
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
  print("Deleted  by Context: ",id)
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