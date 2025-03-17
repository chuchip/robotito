from quart import Blueprint,  request, jsonify
import persistence as db
import  robotito_ai as ai
context_bp = Blueprint('context', __name__)


## Work with context/
@context_bp.route('', methods=['POST'])
async def context_update():       
  data = await request.get_json()  # Get JSON data from the request body    

  ai.setContextLabel(data['label'])
  if data['label'] != 'NEW' and data['label'] !='':
    db.save_context(user=data['user'],label=data['label'],context=data['context'],remember=data['contextRemember'])  
  ai.setContextText=data['context']
  ai.setContextRemember(data['contextRemember'])
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{data['label']}'", 'text': data['context']})


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

