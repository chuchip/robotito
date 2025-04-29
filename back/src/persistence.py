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
        "SELECT user,language,voice,role, max_length_answer FROM users  where user = :user",
        {"user": user},
    )
   
    result = {"user": row["user"], "language": row['language'], "voice": row['voice'],"role":row['role'],"max_length_answer":row['max_length_answer']}
    return result

async def get_all_context(user):
    cursor= await g.connection.fetch_all(f"""select label,context,remember,last_time,id
                             from context where user = :user order by last_time desc""",{"user": user})
    
    result = [ get_DTO_context(row) for row in cursor]
    return result

async def get_context_by_label(user,label):
    sql=f"select label,context,remember,last_time,id from context where label=:label and user=:user"    
    row=await g.connection.fetch_one(sql,{"label":label,"user":user})
    
    if row is None:
        return None
    
    return get_DTO_context(row)
async def save_context(user,label,context,remember):
    data=get_context_by_label(user,label)
    if data is  None:
        logging.info(f"Insert context: {label}")
        sql=f"INSERT INTO context (label,user,context,remember) VALUES (?, ?, ?,?)"        
        cursor = connection.execute(sql, (label,user,context,remember))
        id = cursor.lastrowid
    else:
        logging.info(f"Update context: {label}")
        id=data['id']
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sql=f"""UPDATE context SET context = ?,remember= ?, last_time='{now}'
                where label= ?  and user= ?"""
        
        connection.execute(sql,(context,remember,label,user))
    connection.commit()
    return id
async def delete_context(user,label):
    if label==None or label == '' or label=='default':
        return
    sql=f"""delete from context where label=? and user=? """ 
    connection.execute(sql,(label,user))
    connection.commit()

async def delete_context_by_id(id):
    data=get_context_by_id(id)
    if data is  None:
        logging.info(f"Context with id {id} not found")
        return
    if (data['label'] =='default'):
        logging.info(f"Label 'default' cannot be deleted")
        return
    sql=f"delete from context where id=? " 
    connection.execute(sql,(id,))
    connection.commit()
async def get_context_by_id(id):
    sql=f"select label, context, remember, last_time,id from context where id=? " 
    cursor=connection.execute(sql,(id,))
    row=cursor.fetchone()
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
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        random_uuid = uuid.uuid4()  # Generate a random UUID
        id = str(random_uuid)
        logging.info("Init conversation id",id) 
        sql="""
                insert into conversation (id,user,name,final_date) values (?,?,?,?)
            """
        connection.execute(sql,(id,user,msg,now))
        connection.commit()
    return id

# Conversation
async def conversation_save(uuid,id ,user, idContext,type,msg):
    import robotito_ai as ai
    if id=='X':
        id=init_conversation(None,user,msg,True)
    ai.save_msg(uuid,type,msg)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sql="update conversation set final_date = ?, idContext=? where id = ? "
    connection.execute(sql,(now,idContext,id))
    sql="insert into conversation_lines  (id,type,msg) values (?,?,?)"
    connection.execute(sql,(id,type,msg))
    connection.commit()
    return id
async def updateConversationContext(idConversation,idContext):
    if idConversation is None or idContext is None:
        return
    sql="update conversation set idContext=? where id = ? "
    connection.execute(sql,(idContext,idConversation))
    connection.commit()
    return idConversation
async def conversation_get_by_id(id):
    sql = """
        select c.user,c.idContext,c.name,c.initial_time,c.final_date, l.type,l.msg
         from conversation as c, conversation_lines as l where c.id = ? and c.id=l.id order by l.time_msg
    """

    data=connection.execute(sql,(id,))
    result = [{"user": row[0], "idContext   ": row[1], "name": row[2],
            "initial_time": row[3],"final_date":row[4],"type": row[5],"msg": row[6]} for row in data]
    
    return result
async def conversation_get_list(user):
    sql = """
        select c.id,c.user,c.idContext,c.name,c.initial_time,c.final_date
         from conversation as c where c.user = ?  order by c.final_date desc
    """

    data=connection.execute(sql,(user,))
    result = [{"id":row[0] , "user": row[1], "idContext": row[2], "name": row[3],
            "initial_time": row[4],"final_date":row[5]} for row in data]
    
    return result

async def conversation_delete_by_id(id):
    sql="delete from conversation where id = ? "
    connection.execute(sql,(id,))    
    connection.commit()
    return 
async def update_language(user,language,voice):    
    sql="update users set language = ?, voice=? where user = ? "
    connection.execute(sql,(language,voice,user))    
    logging.info("Save language preferences")
    connection.commit()
    return 
async def update_max_lenght(user,max_length):
    sql="update users set max_length_answer = ? where user = ? "
    connection.execute(sql,(max_length,user))    
    logging.info("Save language preferences")
    connection.commit()
    return 
# Save in db and cache an uuid if it not exists
async def save_session(user,authorization):
    session= memory.getSessionFromAutorization(authorization)
    if session is not None:
        return
    sql="select user from user_session where uuid = :uuid"
    cursor=connection.execute(sql,(authorization,))
    if cursor.fetchone() is  None:
        sql="insert into user_session  (user,uuid) values (?,?)"
        connection.execute(sql,(user,authorization))
        connection.commit()
    memory.saveSession(user, authorization)
async def get_session(uuid,authorization):
    session= memory.getSessionFromAutorization(authorization)
    if session is not None:        
        return session
    sql="select user,uuid from user_session where uuid = ?"
    cursor=connection.execute(sql,(authorization,))
    data=cursor.fetchone()
    if data is None:
        return None
    session=memory.Session(data[0],data[1],)        
    memory.saveSession(session.user, authorization)
    return session
async def checkUser(user,password):
    row =await g.connection.fetch_one("SELECT user,password FROM users  where user = :user",{"user:":user})

    if row is None:
        return False
    if row['password'] != password:
        return False
    return True

