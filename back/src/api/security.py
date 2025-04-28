from quart import Blueprint,  request,abort, jsonify
import uuid
import logging
import persistence
import memory
from robotito_ai import app

security_bp = Blueprint('security', __name__)
app.register_blueprint(security_bp, url_prefix='/api/security')
logger_=memory.getLogger()
   
@security_bp.route('/login', methods=['POST'])
async def login():
   data = await request.get_json()  
   mem= memory.getMemory(request.headers.get("uuid"))
   user=data.get('user')
   password=data.get('password')
   if user is None or password is None:
       return jsonify({'status':"KO", 'error': f"User and password required"})
   if not persistence.checkUser(user,password):
      return jsonify({'status':"KO", 'error': f"User or password invalid"})
   uuid_ = uuid.uuid4()
   authorization = str(uuid_)
   persistence.save_session(user,authorization)
   mem.setUser(user)
   data_user=persistence.get_user_data(user)
   mem.setMaxLengthAnswer(data_user['max_length_answer'])
   mem.setSession(memory.Session(user,authorization))
   return jsonify({'status': 'OK', 'session': mem.getSession().__dict__})

@security_bp.route('/uuid/<string:authorization>', methods=['GET'])
async def get_uuid(authorization):
   mem= memory.getMemory(request.headers.get("uuid"))  
   session= mem.getSession()
   if session is None:
    session = persistence.get_session(uuid,authorization)
    if session is None:
        return jsonify({'status': 'KO', "error": "Session not found"})
    else:
       mem.setUser(session.getUser())
       max_length=persistence.get_user_data(session.getUser())['max_length_answer']
       mem.setMaxLengthAnswer(max_length)
       mem.setSession(session)
   return jsonify({'status': 'OK', 'session': session.__dict__})

