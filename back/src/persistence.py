from datetime  import datetime
import sqlite3

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
        connection.execute("""CREATE TABLE conversation (id text primary key,user TEXT,
                             label TEXT,
                            name text,
                            initial_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                            final_date DATETIME)
                           """)
        connection.execute("""CREATE TABLE conversation_lines (id text, 
                           type TEXT,
                           msg TEXT
                           time_msg DATETIME DEFAULT CURRENT_TIMESTAMP)""")
        connection.commit()

def get_last_user():
    cursor=connection.execute("""SELECT user FROM users order by last_date desc""")
    data=cursor.fetchall()
    if len(data)==0:
        return 'default'
    return data[0][0] # User

def get_all_context(user):
    query=connection.execute(f"""select label,context,last_time 
                             from context where user = ? order by last_time desc""",(user,))
    data=query.fetchall()
    result = [{"label": row[0], "context": row[1], "last_time": row[2]} for row in data]
    return result

def save_context(user,label,context):
    cursor=connection.execute(f"select * from context where label='{label}' and user='{user}'")
    if cursor.fetchone() is  None:
        sql=f"INSERT INTO context (label,user,context) VALUES (?, ?, ?)"        
        connection.execute(sql, (label,user,context))
    else:
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
connection=sqlite3.connect("robotito_db/sqllite.db", check_same_thread=False)
init_db()