from quart import  Blueprint,Response,request,abort,jsonify
import persistence as db
import memory
import logging
principal_bp = Blueprint('principal', __name__)


@principal_bp.before_request
def security_check():
    if request.method == 'OPTIONS':
        return
    current_endpoint = request.endpoint
    logging.info("Current endpoint: ",current_endpoint)
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
    logging.info("Security check OK")

async def generate(msg_graph):
  import robotito_ai as ai
  async for msg  in ai.call_llm(msg_graph):
      yield msg

@principal_bp.route('/summary', methods=['POST'])
async def summary_conversation():    
    uuid=request.headers.get("uuid")
    data = await request.get_json()      
    type= data.get("type")
    import robotito_ai as ai
    response=ai.sumary_history(uuid,type)
    if type=='resume':  
        return jsonify({"status":"OK", "rating":response.rating,"explication": response.explication})
    else:
        json_array=[]
        for line in response.result:
           json_array.append({ "sentence":line.sentence,"status": line.rating,
                        "explication": line.explication,
                        "correction": line.correction })
        return jsonify({"status":"OK", "sentences":json_array})

@principal_bp.route('/rating_phrase', methods=['POST'])
async def rating_phrase():    
    data = await request.get_json()      
    phrase= data.get("phrase")
    import robotito_ai as ai
    response=ai.rating_phrase(phrase)
   
    return jsonify({ "status":"OK", 
                    "sentence":response.sentence,"value": response.rating,
                    "explication": response.explication,
                    "correction": response.correction })
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
  logging.info("Clear conversation")
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
  logging.info("Last user: ",data)
  return jsonify(data)