from quart import current_app,Blueprint,  request, jsonify,Response
import uuid
import persistence
import memory
security_bp = Blueprint('security', __name__)

@security_bp.route('/login', methods=['POST'])
async def login():
   data = await request.get_json()  
   mem= memory.getMemory(request.headers.get("uuid"))  
   user=data.get('user')
   password=data.get('password')
   if user is None or password is None:
       return jsonify({'status':"KO", 'error': f"User and password required"})
   uuid_ = uuid.uuid4()
   random_uuid = str(uuid_)   
   persistence.save_session(user,random_uuid)
   mem.setSession(memory.Session(user,random_uuid))
   return jsonify({'status': 'OK', 'session': mem.getSession().__dict__})

@security_bp.route('/uuid/<string:id>', methods=['GET'])
async def get_uuid(id):
   mem= memory.getMemory(request.headers.get("uuid"))  
   session= mem.getSession()
   if session is None:
    session = persistence.get_session(uuid,id)
    if session is None:
        return jsonify({'status': 'KO', "error": "Session not found"})
    else:
       mem.setSession(session)
   return jsonify({'status': 'OK', 'session': session.__dict__})
