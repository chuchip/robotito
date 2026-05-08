from quart import Blueprint,  request,abort, jsonify
import uuid
import persistence
import memory

security_bp = Blueprint('security', __name__)

logger_=memory.getLogger()
   
@security_bp.route('/login', methods=['POST'])
async def login():
   data = await request.get_json()  
   uuid_header = request.headers.get("uuid")
   mem = memory.getMemory(uuid_header)
   if mem is None:
       mem = memory.memoryDTO(uuid_header)
       memory.addMemory(mem)
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
   uuid_header = request.headers.get("uuid")
   mem = memory.getMemory(uuid_header)
   if mem is None:
       mem = memory.memoryDTO(uuid_header)
       memory.addMemory(mem)
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


@security_bp.route('/logout', methods=['POST'])
async def logout():
    """Invalidate the current session in the DB and in-memory cache."""
    authorization = request.headers.get("Authorization")
    uuid_header = request.headers.get("uuid")
    # Consolidate long-term memory before tearing down the in-memory session,
    # so anything the user just shared is remembered next time they log in.
    if uuid_header:
        try:
            import robotito_ai as ai
            await ai.consolidate_memory(uuid_header)
        except Exception as e:
            logger_.error(f"Logout: memory consolidation failed: {e}")
    if authorization:
        await persistence.delete_session(authorization)
    mem = memory.getMemory(uuid_header)
    if mem is not None:
        mem.clear()
    logger_.info(f"Logout: session {authorization} invalidated")
    return jsonify({'status': 'OK'})

