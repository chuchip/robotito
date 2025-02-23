from datetime  import datetime
import sqlite3
import uuid
import robotito_ai as ai
def init_db():
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
        connection.execute("""INSERT INTO users ( user,name) VALUES ('default','No Name')""")
        connection.commit()    
    # Create table to create context
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='context'" )
    if cursor.fetchone() is  None:
        connection.execute("""CREATE TABLE context (                           
                           user TEXT, 
                           label TEXT,
                           context TEXT,
                           last_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                           PRIMARY KEY (user, label) 
                           ) """)
        connection.commit()
    # Create tables to save conversations
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation'" )
    if cursor.fetchone() is  None:
        connection.execute("""
            CREATE TABLE conversation (
                 id text primary key,
                 user TEXT,
                 label TEXT,
                 name text,
                 initial_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                 final_date DATETIME)
            """)
        connection.execute("""CREATE TABLE conversation_lines (id text, 
                           type TEXT,
                           msg TEXT,
                           time_msg DATETIME DEFAULT CURRENT_TIMESTAMP)""")
        connection.commit()

def get_last_user():
    cursor=connection.execute("""SELECT user,language,voice FROM users order by last_date desc""")
    data=cursor.fetchall()
    row=data[0]
    result = {"user": row[0], "language": row[1], "voice": row[2]}
    return result
def get_all_context(user):
    query=connection.execute(f"""select label,context,last_time 
                             from context where user = ? order by last_time desc""",(user,))
    data=query.fetchall()
    result = [{"label": row[0], "context": row[1], "last_time": row[2]} for row in data]
    return result

def save_context(user,label,context):
    sql=f"select * from context where label=? and user=?"    
    cursor=connection.execute(sql,(label,user))
    if cursor.fetchone() is  None:
        print(f"Insert context: {label}")
        sql=f"INSERT INTO context (label,user,context) VALUES (?, ?, ?)"        
        connection.execute(sql, (label,user,context))
    else:
        print(f"Update context: {label}")
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sql=f"""UPDATE context SET context = ?,last_time='{now}'
                           where label= ?  and user= ?
                           """    
        connection.execute(sql,(context,label,user))
    connection.commit()
def delete_context(user,label):
    sql=f"""delete from context where label=? and user=? """ 
    connection.execute(sql,(label,user))
    connection.commit()

def init_conversation(id ,user,msg,force=False):    
    if id is None or force:
        
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        random_uuid = uuid.uuid4()  # Generate a random UUID
        id = str(random_uuid)
        print("Init conversation id",id) 
        sql="""
                insert into conversation (id,user,label,name,final_date) values (?,?,?,?,?)
            """
        connection.execute(sql,(id,user,msg,msg,now))
        connection.commit()
    return id

# Conversation
def conversation_save(id ,user, label,type,msg):
    if id=='X':
        id=init_conversation(None,user,msg,True)
    ai.save_msg(type,msg)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sql="update conversation set final_date = ?, label=? where id = ? "
    connection.execute(sql,(now,label,id))
    sql="insert into conversation_lines  (id,type,msg) values (?,?,?)"
    connection.execute(sql,(id,type,msg))
    connection.commit()
    return id

def conversation_get_by_id(id):
    sql = """
        select c.user,c.label,c.name,c.initial_time,c.final_date, l.type,l.msg
         from conversation as c, conversation_lines as l where c.id = ? and c.id=l.id order by l.time_msg
    """

    data=connection.execute(sql,(id,))
    result = [{"user": row[0], "label": row[1], "name": row[2],
            "initial_time": row[3],"final_date":row[4],"type": row[5],"msg": row[6]} for row in data]
    
    return result
def conversation_get_list(user):
    sql = """
        select c.id,c.user,c.label,c.name,c.initial_time,c.final_date
         from conversation as c where c.user = ?  order by c.final_date desc
    """

    data=connection.execute(sql,(user,))
    result = [{"id":row[0] , "user": row[1], "label": row[2], "name": row[3],
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

connection=sqlite3.connect("robotito_db/sqllite.db", check_same_thread=False)
init_db()