from quart import Blueprint,  request, jsonify
import persistence as db
import  robotito_ai as ai
context_bp = Blueprint('context', __name__)
context_text="You are a robot designed to interact with non-technical people and we are having a friendly conversation."
context_label="NEW"

## Work with context/
@context_bp.route('', methods=['POST'])
async def context_update():     
  global context_text,context_label
  data = await request.get_json()  # Get JSON data from the request body    

  context_label=data['label']
  if context_label != 'NEW' and context_label !='':
    db.save_context(user=data['user'],label=context_label,context=data['context'],remember=data['contextRemember'])  
  context_text=data['context']
  
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{context_label}'", 'text': data['label']})

@context_bp.route('remember', methods=['POST'])
async def contextRemember_update():     
  global context_text,context_label
  data = await request.get_json()  # Get JSON data from the request body    

  context_label=data['label']
  ai.setContextRemember(data['contextRemember'])
  db.save_context(user=data['user'],label=context_label,context=data['context'],remember=data['contextRemember'])
  return jsonify({'message': f"Context Remember updated successfully!. Update Context of: '{context_label}'", 'text': data['label']})

@context_bp.route('', methods=['DELETE'])
async def context_delete(): 
  data = await request.get_json()  # Get JSON data from the request body    
  print("Deleted  Context: ",data['label'])
  db.delete_context(user=data['user'],label=data['label'])  
  return jsonify({'message': 'Context deleted successfully!', 'text': data['label']})

# Url  /context/user/${user}
@context_bp.route('/user/<string:user>', methods=['GET'])
def context_get(user): 
  print("GET All Context of user: ",user)
  data = db.get_all_context(user)  
  return jsonify({'message': 'Context updated successfully!', 'contexts': data})

