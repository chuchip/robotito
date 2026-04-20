from datetime  import datetime, timedelta
import sqlite3
import logging
import os
import uuid
import bcrypt
import memory
from quart import  g


SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _is_bcrypt_hash(value: str) -> bool:
    return isinstance(value, str) and value.startswith(("$2a$", "$2b$", "$2y$"))


def verify_password(password: str, stored: str) -> bool:
    """Check plaintext password against bcrypt hash. Returns False if either is falsy."""
    if not password or not stored:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
    except (ValueError, TypeError):
        return False


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
        now = datetime.now()
        sql="""UPDATE context SET context = :context,remember= :remember, last_time=:last_time
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
    data=await get_context_by_id(id)
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
            logging.info(f"Summary: {msg}")
        now = datetime.now()
        random_uuid = uuid.uuid4()  # Generate a random UUID
        id = str(random_uuid)
        logging.info(f"Init conversation id: {id}") 
        sql="insert into conversation (id,user_id,name,final_date) values (:id,:user_id,:name,:final_date)"
            
        await g.connection.execute(sql,{"id":id,"user_id":user,"name":msg,"final_date":now})
        
    return id

# Conversation
async def conversation_save(uuid,id ,user, context_id,type,msg):
    import robotito_ai as ai
    if id=='X':
        id=await init_conversation(None,user,msg,True)
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
    await g.connection.execute(sql,{"context_id":context_id,"id": conversation_id})

async def updateConversationUrl(conversation_id, url_source):
    if conversation_id is None:
        return
    sql = "update conversation set url_source = :url_source where id = :id "
    await g.connection.execute(sql, {"url_source": url_source, "id": conversation_id})

async def clearConversationUrl(conversation_id):
    if conversation_id is None:
        return
    sql = "update conversation set url_source = null where id = :id "
    await g.connection.execute(sql, {"id": conversation_id})

# Notes
async def get_notes(conversation_id: str):
    sql = "SELECT notes FROM conversation_notes WHERE conversation_id = :conversation_id"
    row = await g.connection.fetch_one(sql, {"conversation_id": conversation_id})
    if row is None:
        return None
    return row["notes"]

async def save_notes(conversation_id: str, notes: str):
    # Check if conversation exists
    sql_check = "SELECT id FROM conversation WHERE id = :id"
    row = await g.connection.fetch_one(sql_check, {"id": conversation_id})
    if row is None:
        raise ValueError(f"Conversation {conversation_id} does not exist")
    
    existing = await get_notes(conversation_id)
    from datetime import datetime
    now = datetime.now()
    if existing is None:
        sql = "INSERT INTO conversation_notes (conversation_id, notes, last_update) VALUES (:conversation_id, :notes, :last_update)"
    else:
        sql = "UPDATE conversation_notes SET notes = :notes, last_update = :last_update WHERE conversation_id = :conversation_id"
    await g.connection.execute(sql, {"conversation_id": conversation_id, "notes": notes, "last_update": now})
    
    return conversation_id

# Dictionary Words
async def get_words(conversation_id: str):
    sql = "SELECT id, word, translation, examples_english, examples_spanish, created_date FROM dictionary_words WHERE conversation_id = :conversation_id ORDER BY created_date DESC"
    rows = await g.connection.fetch_all(sql, {"conversation_id": conversation_id})
    if rows is None:
        return []
    
    result = []
    for row in rows:
        # Split examples back into a list
        english_examples = row["examples_english"].split("\n") if row["examples_english"] else []
        spanish_examples = row["examples_spanish"].split("\n") if row["examples_spanish"] else []
        
        # Create list of example dicts, pairing English and Spanish
        examples = [
            {"english_phrase": en.strip(), "spanish_phrase": es.strip()} 
            for en, es in zip(english_examples, spanish_examples)
            if en.strip() or es.strip()
        ]
        
        result.append({
            "id": row["id"], 
            "word": row["word"], 
            "translation": row["translation"], 
            "examples": examples, 
            "createdDate": row["created_date"]
        })
    
    return result

async def add_word(conversation_id: str, user_id: str, word: str, translation: str, examples):
    # examples can be a list of dicts/ExamplePhrase objects or a single dict
    word_id = str(uuid.uuid4())
    from datetime import datetime
    now = datetime.now()
    
    # Handle list of examples or single example
    if isinstance(examples, list):
        examples_list = examples
    else:
        examples_list = [examples] if examples else []
    
    # Convert each example to dict if it's a Pydantic model
    english_phrases = []
    spanish_phrases = []
    
    for example in examples_list:
        if hasattr(example, 'dict'):
            # Pydantic v1
            example_dict = example.dict()
        elif hasattr(example, 'model_dump'):
            # Pydantic v2
            example_dict = example.model_dump()
        else:
            # Already a dict
            example_dict = example if example else {}
        
        english_phrases.append(example_dict.get("english_phrase", ""))
        spanish_phrases.append(example_dict.get("spanish_phrase", ""))
    
    # Combine examples with newlines
    english_text = "\n".join(english_phrases)
    spanish_text = "\n".join(spanish_phrases)
    
    sql = """INSERT INTO dictionary_words (id, conversation_id, user_id, word, translation, examples_english, examples_spanish, created_date, last_update) 
             VALUES (:id, :conversation_id, :user_id, :word, :translation, :examples_english, :examples_spanish, :created_date, :last_update)"""
    await g.connection.execute(sql, {
        "id": word_id,
        "conversation_id": conversation_id,
        "user_id": user_id,
        "word": word,
        "translation": translation,
        "examples_english": english_text,
        "examples_spanish": spanish_text,
        "created_date": now,
        "last_update": now
    })
    
    # Return examples as a list structure
    example_list = [{"english_phrase": en, "spanish_phrase": es} for en, es in zip(english_phrases, spanish_phrases)]
    return {"id": word_id, "word": word, "translation": translation, "examples": example_list, "createdDate": now}

async def update_word(conversation_id: str, word_id: str, translation: str, examples):
    from datetime import datetime
    now = datetime.now()
    
    # Handle list of examples or single example
    if isinstance(examples, list):
        examples_list = examples
    else:
        examples_list = [examples] if examples else []
    
    # Convert each example to dict if it's a Pydantic model
    english_phrases = []
    spanish_phrases = []
    
    for example in examples_list:
        if hasattr(example, 'dict'):
            # Pydantic v1
            example_dict = example.dict()
        elif hasattr(example, 'model_dump'):
            # Pydantic v2
            example_dict = example.model_dump()
        else:
            # Already a dict
            example_dict = example if example else {}
        
        english_phrases.append(example_dict.get("english_phrase", ""))
        spanish_phrases.append(example_dict.get("spanish_phrase", ""))
    
    # Combine examples with newlines
    english_text = "\n".join(english_phrases)
    spanish_text = "\n".join(spanish_phrases)
    
    sql = """UPDATE dictionary_words SET translation = :translation, examples_english = :examples_english, examples_spanish = :examples_spanish, last_update = :last_update 
             WHERE id = :id AND conversation_id = :conversation_id"""
    await g.connection.execute(sql, {
        "id": word_id,
        "conversation_id": conversation_id,
        "translation": translation,
        "examples_english": english_text,
        "examples_spanish": spanish_text,
        "last_update": now
    })
    
    return word_id

async def delete_word(conversation_id: str, word_id: str):
    sql = "DELETE FROM dictionary_words WHERE id = :id AND conversation_id = :conversation_id"
    await g.connection.execute(sql, {"id": word_id, "conversation_id": conversation_id})
    
    return word_id

async def conversation_get_by_id(id):
    sql = """
        select c.user_id,c.context_id,c.name,c.initial_time,c.final_date,c.url_source, l.type,l.msg
         from conversation as c, conversation_lines as l where c.id = :id and c.id=l.conversation_id order by l.time_msg
    """

    data=await g.connection.fetch_all(sql,{"id":id})
    result = [{"user": row['user_id'], "idContext": row['context_id'], "name": row['name'],
            "initial_time": row['initial_time'],"final_date":row['final_date'],"url_source": row['url_source'],"type": row['type'],"msg": row['msg']} for row in data]
    
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
async def save_session(user_id, uuid):
    session = memory.getSessionFromAutorization(uuid)
    if session is not None:
        return
    expires_at = datetime.now() + timedelta(days=SESSION_TTL_DAYS)
    sql = "select user_id from user_session where uuid = :uuid"
    row = await g.connection.fetch_one(sql, {"uuid": uuid})
    if row is None:
        sql = "insert into user_session (user_id, uuid, expires_at) values (:user_id, :uuid, :expires_at)"
        await g.connection.execute(sql, {"user_id": user_id, "uuid": uuid, "expires_at": expires_at})
    else:
        sql = "update user_session set expires_at = :expires_at where uuid = :uuid"
        await g.connection.execute(sql, {"expires_at": expires_at, "uuid": uuid})

    memory.saveSession(user_id, uuid)


async def get_session(uuid):
    session = memory.getSessionFromAutorization(uuid)
    if session is not None:
        return session
    sql = "select user_id, uuid, expires_at from user_session where uuid = :uuid"
    row = await g.connection.fetch_one(sql, {"uuid": uuid})
    if row is None:
        return None
    expires_at = row['expires_at']
    if expires_at is not None and expires_at < datetime.now():
        # Clean up the expired session
        await g.connection.execute(
            "delete from user_session where uuid = :uuid", {"uuid": uuid}
        )
        return None
    session = memory.Session(row['user_id'], row['uuid'])
    memory.saveSession(session.user, uuid)
    return session


async def delete_session(authorization):
    """Remove a session from both the DB and the in-memory cache."""
    await g.connection.execute(
        "delete from user_session where uuid = :uuid", {"uuid": authorization}
    )
    memory.sessions.pop(authorization, None)


async def checkUser(user_id, password):
    row = await g.connection.fetch_one(
        "SELECT user_id, password FROM users where user_id = :user_id",
        {"user_id": user_id},
    )
    if row is None:
        return False
    stored = row['password']
    if _is_bcrypt_hash(stored):
        return verify_password(password, stored)
    # Legacy plaintext password: verify, then upgrade to bcrypt transparently.
    if stored != password:
        return False
    new_hash = hash_password(password)
    await g.connection.execute(
        "update users set password = :password where user_id = :user_id",
        {"password": new_hash, "user_id": user_id},
    )
    logging.info(f"Upgraded plaintext password to bcrypt for user: {user_id}")
    return True

