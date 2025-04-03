from datetime  import datetime
import sqlite3
import uuid
import robotito_ai as ai
import memory

def init_db():
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_session'" )
    # Create table to create User
    if cursor.fetchone() is  None:
        connection.execute("""CREATE TABLE user_session (
                            user TEXT ,
                            uuid TEXT PRIMARY KEY,
                            last_date DATETIME DEFAULT CURRENT_TIMESTAMP)
                            """)  
        connection.commit()
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'" )
    # Create table to create User
    if cursor.fetchone() is  None:
        print("Initialzing the database")    
        connection.execute("""CREATE TABLE users (
                           user TEXT PRIMARY KEY,
                           name TEXT,
                           email TEXT,
                           password TEXT,
                           language text ,
                           voice text,
                           last_date DATETIME DEFAULT CURRENT_TIMESTAMP)
                           """)        
        connection.execute("""INSERT INTO users ( user,name,password,language,voice) VALUES ('default','Guest','changeit','b','bm_fable')""")
        connection.commit()    
    # Create table to create context
    
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='context'" )
    if cursor.fetchone() is  None:
        connection.execute("""CREATE TABLE context ( 
                           id INTEGER PRIMARY KEY AUTOINCREMENT,                          
                           user TEXT, 
                           label TEXT,
                           context TEXT,
                           remember TEXT,
                           last_time DATETIME DEFAULT CURRENT_TIMESTAMP                           
                           ) """)
        connection.execute("""INSERT INTO context ( user,label,context, remember) 
                            VALUES ('default','default','You are my friend Robotito. Your answers should not have more than 60 words','')""")
        connection.commit()
    # Create tables to save conversations
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation'" )
    if cursor.fetchone() is  None:
        connection.execute("""
            CREATE TABLE conversation (
                 id text primary key,
                 user TEXT,
                 idContext TEXT,
                 name text,
                 initial_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                 final_date DATETIME)
            """)
        connection.execute("""CREATE TABLE conversation_lines (id text, 
                           type TEXT,
                           msg TEXT,
                           time_msg DATETIME DEFAULT CURRENT_TIMESTAMP)""")
        connection.commit()

def get_last_user(mem):
    cursor=connection.execute("""SELECT user,language,voice FROM users  where user = ?""",(mem.getUser(),))
    data=cursor.fetchall()
    row=data[0]
    result = {"user": row[0], "language": row[1], "voice": row[2]}
    return result

def get_all_context(user):
    query=connection.execute(f"""select label,context,remember,last_time,id
                             from context where user = ? order by last_time desc""",(user,))
    data=query.fetchall()
    result = [{"label": row[0], "context": row[1], "contextRemember": row[2],"last_time": row[3],"id":row[4]} for row in data]
    return result

def get_context_by_label(user,label):
    sql=f"select label,context,remember,last_time,id from context where label=? and user=?"    
    cursor=connection.execute(sql,(label,user))
    row= cursor.fetchone()
    if row is None:
        return None
    result = {"label": row[0], "context": row[1], "contextRemember": row[2],"last_time": row[3],"id":row[4]}
    return result
def save_context(user,label,context,remember):
    data=get_context_by_label(user,label)
    if data is  None:
        print(f"Insert context: {label}")
        sql=f"INSERT INTO context (label,user,context,remember) VALUES (?, ?, ?,?)"        
        cursor = connection.execute(sql, (label,user,context,remember))
        id = cursor.lastrowid
    else:
        print(f"Update context: {label}")
        id=data['id']
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sql=f"""UPDATE context SET context = ?,remember= ?, last_time='{now}'
                where label= ?  and user= ?"""
        
        connection.execute(sql,(context,remember,label,user))
    connection.commit()
    return id
def delete_context(user,label):
    sql=f"""delete from context where label=? and user=? """ 
    connection.execute(sql,(label,user))
    connection.commit()
def delete_context_by_id(id):
    sql=f"delete from context where id=? " 
    connection.execute(sql,(id,))
    connection.commit()
def get_context_by_id(id):
    sql=f"select label, context, remember, last_time,id from context where id=? " 
    cursor=connection.execute(sql,(id,))
    row=cursor.fetchone()
    if row is None:
        return None

    result = {"label": row[0], "context": row[1], "contextRemember": row[2],"last_time": row[3],"id":row[4]}
    return result

def init_conversation(id ,user,msg,force=False):    
    if id is None or force:
        if len(msg.split())>15:
            # Do a sumary of the message
            resp=ai.client_text.invoke(f"Create a summary of less than 12 words from this sentence: '{msg}'")
            msg=resp.content
            print("Summary: ",msg)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        random_uuid = uuid.uuid4()  # Generate a random UUID
        id = str(random_uuid)
        print("Init conversation id",id) 
        sql="""
                insert into conversation (id,user,name,final_date) values (?,?,?,?)
            """
        connection.execute(sql,(id,user,msg,now))
        connection.commit()
    return id

# Conversation
def conversation_save(uuid,id ,user, idContext,type,msg):
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
def updateConversationContext(idConversation,idContext):
    if idConversation is None or idContext is None:
        return
    sql="update conversation set idContext=? where id = ? "
    connection.execute(sql,(idContext,idConversation))
    connection.commit()
    return idConversation
def conversation_get_by_id(id):
    sql = """
        select c.user,c.idContext,c.name,c.initial_time,c.final_date, l.type,l.msg
         from conversation as c, conversation_lines as l where c.id = ? and c.id=l.id order by l.time_msg
    """

    data=connection.execute(sql,(id,))
    result = [{"user": row[0], "labelContext": row[1], "name": row[2],
            "initial_time": row[3],"final_date":row[4],"type": row[5],"msg": row[6]} for row in data]
    
    return result
def conversation_get_list(user):
    sql = """
        select c.id,c.user,c.idContext,c.name,c.initial_time,c.final_date
         from conversation as c where c.user = ?  order by c.final_date desc
    """

    data=connection.execute(sql,(user,))
    result = [{"id":row[0] , "user": row[1], "labelContext": row[2], "name": row[3],
            "initial_time": row[4],"final_date":row[5]} for row in data]
    
    return result

def conversation_delete_by_id(id):
    sql="delete from conversation where id = ? "
    connection.execute(sql,(id,))    
    connection.commit()
    return 
def update_language(user,language,voice):    
    sql="update users set language = ?, voice=? where user = ? "
    connection.execute(sql,(language,voice,user))    
    print("Save language preferences")
    connection.commit()
    return 
# Save in db and cache an uuid if it not exists
def save_session(user,authorization):
    session= memory.getSessionFromAutorization(authorization)
    if session is not None:
        return
    sql="select user from user_session where uuid = ?"
    cursor=connection.execute(sql,(authorization,))
    if cursor.fetchone() is  None:
        sql="insert into user_session  (user,uuid) values (?,?)"
        connection.execute(sql,(user,authorization))
        connection.commit()
    memory.saveSession(user, authorization)
def get_session(uuid,authorization):
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
def checkUser(user,password):
    cursor=connection.execute("""SELECT user,password FROM users  where user = ?""",(user,))
    data=cursor.fetchone()
    if data is None:
        return False
    if data[1] != password:
        return False
    return True

connection=sqlite3.connect("robotito_db/sqllite.db", check_same_thread=False)
init_db()