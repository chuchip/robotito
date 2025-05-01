from datetime  import datetime
import sqlite3
import logging
import uuid
import memory
from quart import  g


def get_DTO_context(row):
    return {"label": row['label'], "text": row['context'], "remember": row['remember'],"last_time": row['last_time'],"id":row['id']}

async def get_user_data(user:str):
    row = await g.connection.fetch_one(
        "SELECT user,language,voice,role, max_length_answer FROM users  where user_id = :user",
        {"user": user},
    )
    if row is None:
        return None
    result = {"user": row["user"], "language": row['language'], "voice": row['voice'],"role":row['role'],"max_length_answer":row['max_length_answer']}
    return result

async def get_all_context(user):
    cursor= await g.connection.fetch_all(f"""select label,context,remember,last_time,id
                             from context where user_id = :user order by last_time desc""",{"user": user})
    
    result = [ get_DTO_context(row) for row in cursor]
    return result

async def get_context_by_label(user,label):
    sql=f"select label,context,remember,last_time,id from context where label=:label and user_id=:user"    
    row=await g.connection.fetch_one(sql,{"label":label,"user":user})
    
    if row is None:
        return None
    
    return get_DTO_context(row)
async def save_context(user_id,label,context,remember):
    data=await get_context_by_label(user_id,label)
    if data is  None:
        logging.info(f"Insert context: {label}")
        sql=f"INSERT INTO context (label,user_id,context,remember) VALUES (:label, :user_id, :context,:remember) returning id"        
        cursor = await g.connection.fetch_one(sql, {"label": label,"user_id":user_id,"context": context,"remember":remember})
        id = cursor['id']
    else:
        logging.info(f"Update context: {label}")
        id=data['id']
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sql="""UPDATE context SET context = :context,remember= :remember, last_time=:last_time'
                where label= :label  and user_id= :user_id"""
        cursor = await g.connection.execute(sql, {
                "context": context,
                "remember": remember,
                "last_time": now,
                "label": label,
                "user_id": user_id
            })        
    
    return id
async def delete_context(user_id,label):
    if label==None or label == '' or label=='default':
        return
    sql="""delete from context where label=:label and user_id=:user"""
    await g.connection.execute(sql,{"label":label,"user":user_id})
    

async def delete_context_by_id(id):
    data=get_context_by_id(id)
    if data is  None:
        logging.info(f"Context with id {id} not found")
        return
    if (data['label'] =='default'):
        logging.info(f"Label 'default' cannot be deleted")
        return
    sql="delete from context where id=:id" 
    await g.connection.execute(sql,{"id":id})
    
async def get_context_by_id(id):
    sql=f"select label, context, remember, last_time,id from context where id=:id " 
    row=await g.connection.fetch_one(sql,{"id":int(id)})    
    if row is None:
        return None
    
    return get_DTO_context(row)

async def init_conversation(id ,user,msg,force=False):
    import robotito_ai as ai 
    if id is None or force:
        if len(msg.split())>15:
            # Do a sumary of the message
            resp = ai.call_llm_internal(f"Create a summary of less than 12 words from this sentence: '{msg}'")
            msg=resp
            logging.info("Summary: ",msg)
        now = datetime.now()
        random_uuid = uuid.uuid4()  # Generate a random UUID
        id = str(random_uuid)
        logging.info("Init conversation id",id) 
        sql="insert into conversation (id,user_id,name,final_date) values (:id,:user_id,:name,:final_date)"
            
        await g.connection.execute(sql,{"id":id,"user_id":user,"name":msg,"final_date":now})
        
    return id

# Conversation
async def conversation_save(uuid,id ,user, context_id,type,msg):
    import robotito_ai as ai
    if id=='X':
        id=init_conversation(None,user,msg,True)
    ai.save_msg(uuid,type,msg)
    now = datetime.now()
    sql="update conversation set final_date = :final_date, context_id=:context_id where id = :id "
    await g.connection.execute(sql,{"final_date":now,"context_id":str(context_id),"id":id})
    sql="insert into conversation_lines  (conversation_id,type,msg) values (:id,:type,:msg)"
    await g.connection.execute(sql,{"id":id,"type":type,"msg":msg})    
    return id
async def updateConversationContext(conversation_id,context_id):
    if conversation_id is None or context_id is None:
        return
    sql="update conversation set context_id=:context_id where id = :id "
    await g.connection.execute(sql,{"idContext":context_id,"id": conversation_id})
    
    return conversation_id
async def conversation_get_by_id(id):
    sql = """
        select c.user_id,c.context_id,c.name,c.initial_time,c.final_date, l.type,l.msg
         from conversation as c, conversation_lines as l where c.id = :id and c.id=l.conversation_id order by l.time_msg
    """

    data=await g.connection.fetch_all(sql,{"id":id})
    result = [{"user": row['user_id'], "idContext   ": row['context_id'], "name": row['name'],
            "initial_time": row['initial_time'],"final_date":row['final_date'],"type": row['type'],"msg": row['msg']} for row in data]
    
    return result
async def conversation_get_list(user):
    sql = """
        select c.id,c.user_id,c.context_id,c.name,c.initial_time,c.final_date
         from conversation as c where c.user_id = :id  order by c.final_date desc
    """

    data=await g.connection.fetch_all(sql,{"id":user})
    result = [{"id":row['id'] , "user": row['user_id'], "idContext": row['context_id'], "name": row['name'],
            "initial_time": row['initial_time'],"final_date":row['final_date']} for row in data]
    
    return result

async def conversation_delete_by_id(id):
    sql="delete from conversation where id = :id"
    await g.connection.execute(sql,{"id":id})    
    
    
async def update_language(user,language,voice):    
    sql="update users set language = :language, voice=:voice where user_id = :user "
    await g.connection.execute(sql,{"language":language,"voice": voice,"user":user})    
    logging.info("Save language preferences")    
    
async def update_max_lenght(user,max_length):
    sql="update users set max_length_answer = :max_length_answer where user_id = :user_id "
    await g.connection.execute(sql,{"max_length_answer":max_length,"user_id":user})    
    logging.info("Save language preferences")    
    
# Save in db and cache an uuid if it not exists
async def save_session(user_id,uuid):
    session= memory.getSessionFromAutorization(uuid)
    if session is not None:
        return
    sql="select user from user_session where uuid = :uuid"
    row=await g.connection.fetch_one(sql,{"uuid":uuid})
    if row is  None:
        sql="insert into user_session  (user_id,uuid) values (:user_id,:uuid)"
        await g.connection.execute(sql,{"user_id":user_id,"uuid":uuid})
        
    memory.saveSession(user_id, uuid)
async def get_session(uuid):
    session= memory.getSessionFromAutorization(uuid)
    if session is not None:        
        return session
    sql="select user,uuid from user_session where uuid = :uuid"
    row=await g.connection.fetch_one(sql,{"uuid":uuid})
    if row is None:
        return None
    session=memory.Session(row['user'],row['uuid'],)        
    memory.saveSession(session.user, uuid)
    return session
async def checkUser(user_id,password):
    row =await g.connection.fetch_one("SELECT user_id,password FROM users  where user_id = :user_id",{"user_id":user_id})

    if row is None:
        return False
    if row['password'] != password:
        return False
    return True

