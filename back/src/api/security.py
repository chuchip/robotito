from quart import Blueprint,  request,abort, jsonify
import uuid
import persistence
import memory

security_bp = Blueprint('security', __name__)

logger_=memory.getLogger()
   
@security_bp.route('/login', methods=['POST'])
async def login():
   data = await request.get_json()  
   mem= memory.getMemory(request.headers.get("uuid"))
   user=data.get('user')
   password=data.get('password')
   if user is None or password is None:
       return jsonify({'status':"KO", 'error': f"User and password required"})
   if not await persistence.checkUser(user,password):
    return jsonify({'status':"KO", 'error': "User or password invalid"})
   uuid_ = uuid.uuid4()
   authorization = str(uuid_)
   await persistence.save_session(user,authorization)
   mem.setUser(user)
   data_user=await persistence.get_user_data(user)
   mem.setMaxLengthAnswer(data_user['max_length_answer'])
   mem.setSession(memory.Session(user,authorization))
   return jsonify({'status': 'OK', 'session': mem.getSession().__dict__})

@security_bp.route('/uuid/<string:authorization>', methods=['GET'])
async def get_uuid(authorization):
   mem= memory.getMemory(request.headers.get("uuid"))  
   session= mem.getSession()
   if session is None:
    session = await persistence.get_session(authorization)
    if session is None:
        return jsonify({'status': 'KO', "error": "Session not found"})
    else:
       mem.setUser(session.getUser())
       data_user=await persistence.get_user_data(session.getUser())
       if data_user is None:
           return jsonify({'status': 'KO', "error": "User not found"})
       max_length=data_user['max_length_answer']
       mem.setMaxLengthAnswer(max_length)
       mem.setSession(session)
   return jsonify({'status': 'OK', 'session': session.__dict__})

