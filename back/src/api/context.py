from flask import Blueprint,  request, jsonify,Response
import persistence as db

context_bp = Blueprint('context', __name__)
context_text="You are a robot designed to interact with non-technical people and we are having a friendly conversation."
context_label="NEW"

## Work with context
@context_bp.route('', methods=['POST'])
def context_update():     
  global context_text,context_label
  data = request.get_json()  # Get JSON data from the request body    
  print("Context update ",data['label'])
  context_label=data['label']
  if context_label != 'NEW' and context_label !='':
    db.save_context(user=data['user'],label=context_label,context=data['context'])  
  context_text=data['context']
  
  return jsonify({'message': f"Context updated successfully!. Update Context of: '{context_label}'", 'text': data['label']})

@context_bp.route('', methods=['DELETE'])
def context_delete(): 
  data = request.get_json()  # Get JSON data from the request body    
  print("Deleted  Context: ",data['label'])
  db.delete_context(user=data['user'],label=data['label'])  
  return jsonify({'message': 'Context deleted successfully!', 'text': data['label']})

@context_bp.route('/user/<string:user>', methods=['GET'])
def context_get(user): 
  print("GET All Context of user: ",user)
  data = db.get_all_context(user)  
  return jsonify({'message': 'Context updated successfully!', 'contexts': data})

