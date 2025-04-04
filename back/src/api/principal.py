from quart import  Blueprint,Response,request,abort,jsonify
import robotito_ai as ai
import persistence as db
import memory

principal_bp = Blueprint('principal', __name__)


@principal_bp.before_request
def security_check():
    if request.method == 'OPTIONS':
        return
    current_endpoint = request.endpoint
    print("Current endpoint: ",current_endpoint)
    if 'uuid' not in request.headers:
        abort(401)   
    if current_endpoint == 'principal.clear' or current_endpoint == 'security.get_uuid' or current_endpoint == 'security.login': 
        return
    if 'Authorization' not in request.headers:
        abort(401)  # Unauthorized
    authorization=request.headers.get("Authorization")
    mem= memory.getMemory(request.headers.get("uuid")) 
    session= mem.getSession()
    if session is None:
          abort(401)
    else:
        if session.getAuthorization()!=authorization:
          abort(401)
    print("Security check OK")

async def generate(msg_graph):
  async for msg  in  ai.call_llm(msg_graph):
      yield msg

@principal_bp.route('/send-question', methods=['POST'])
async def send_question():    
    uuid=request.headers.get("uuid")
    data = await request.get_json()  # Get JSON data from the request body
    question =  data.get('text')
    if question is None:
       return ""
    #id = db.init_conversation(id,user,question)
    msg_graph={"message": question,               
                "uuid": uuid}     
    
    return Response(generate(msg_graph), mimetype='text/plain')


@principal_bp.route('/clear', methods=['GET'])
def clear():   
  print("Clear conversation")
  uuid=request.headers.get("uuid")
  if len(memory.memoryData) != 0:
    mem=memory.getMemory(uuid)
    if mem is not None:
      mem.getChatHistory().clear()        
      return jsonify({'message': f'Existed conversation with UUID: {uuid} cleared'})
  memory.memoryData.append(memory.memoryDTO(uuid))
  return jsonify({'message': f'Conversation with UUID: {uuid} cleared'})
  

@principal_bp.route('/last_user', methods=['GET'])
def get_last_user():
  mem = memory.getMemory(request.headers.get("uuid"))
  data=db.get_last_user(mem)
  print("Last user: ",data)
  return jsonify(data)