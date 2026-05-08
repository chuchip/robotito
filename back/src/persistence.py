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
    row = await g.connection.fetch_sole(
        "SELECT user,language,voice,human_voice,role, max_length_answer FROM users  where user_id = :user",
        {"user": user},
    )
    if row is None:
        return None
    result = {"user": row["user"], "language": row['language'], "voice": row['voice'],
              "human_voice": row['human_voice'],
              "role":row['role'],"max_length_answer":row['max_length_answer']}
    return result

async def get_all_context(user):
    cursor= await g.connection.fetch_all(f"""select label,context,remember,last_time,id
                             from context where user_id = :user order by last_time desc""",{"user": user})
    
    result = [ get_DTO_context(row) for row in cursor]
    return result

async def get_context_by_label(user,label):
    sql=f"select label,context,remember,last_time,id from context where label=:label and user_id=:user"    
    row=await g.connection.fetch_sole(sql,{"label":label,"user":user})
    
    if row is None:
        return None
    
    return get_DTO_context(row)
async def save_context(user_id,label,context,remember):
    data=await get_context_by_label(user_id,label)
    if data is  None:
        logging.info(f"Insert context: {label}")
        sql=f"INSERT INTO context (label,user_id,context,remember) VALUES (:label, :user_id, :context,:remember) returning id"        
        cursor = await g.connection.fetch_sole(sql, {"label": label,"user_id":user_id,"context": context,"remember":remember})
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
    row=await g.connection.fetch_sole(sql,{"id":int(id)})    
    if row is None:
        return None
    
    return get_DTO_context(row)

async def init_conversation(id ,user,msg,force=False):
    import robotito_ai as ai 
    if id is None or force:
        if len(msg.split())>15:
            # Do a sumary of the message
            resp = await ai.call_llm_internal(f"Create a summary of less than 12 words from this sentence: '{msg}'")
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
    row = await g.connection.fetch_sole(sql, {"conversation_id": conversation_id})
    if row is None:
        return None
    return row["notes"]

async def save_notes(conversation_id: str, notes: str):
    # Check if conversation exists
    sql_check = "SELECT id FROM conversation WHERE id = :id"
    row = await g.connection.fetch_sole(sql_check, {"id": conversation_id})
    if row is None:
        raise ValueError(f"Conversation {conversation_id} does not exist")
    
    existing = await get_notes(conversation_id)
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

async def find_user_word(user_id: str, word: str):
    """Return the first dictionary entry matching `word` for `user_id` across any
    of their conversations, or None if it doesn't exist. Comparison is
    case-insensitive and ignores surrounding whitespace.
    """
    sql = """SELECT id, conversation_id, word, translation, examples_english, examples_spanish, created_date
             FROM dictionary_words
             WHERE user_id = :user_id AND LOWER(TRIM(word)) = LOWER(TRIM(:word))
             ORDER BY created_date ASC
             LIMIT 1"""
    row = await g.connection.fetch_sole(sql, {"user_id": user_id, "word": word})
    if row is None:
        return None

    english_examples = row["examples_english"].split("\n") if row["examples_english"] else []
    spanish_examples = row["examples_spanish"].split("\n") if row["examples_spanish"] else []
    examples = [
        {"english_phrase": en.strip(), "spanish_phrase": es.strip()}
        for en, es in zip(english_examples, spanish_examples)
        if en.strip() or es.strip()
    ]

    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "word": row["word"],
        "translation": row["translation"],
        "examples": examples,
        "createdDate": row["created_date"],
    }

async def add_word(conversation_id: str, user_id: str, word: str, translation: str, examples):
    # examples can be a list of dicts/ExamplePhrase objects or a single dict
    word_id = str(uuid.uuid4())
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

async def get_words_by_user(user_id: str):
    """Return every word saved by the given user across all their conversations.

    Words are ordered so the ones the user most needs to review come first:
    1. Never reviewed (last_reviewed_at IS NULL) or last attempt failed.
    2. Then the rest, oldest review first.
    A small RANDOM() tiebreaker is applied so the same 10 words are not always
    picked in the exact same order.
    """
    sql = """SELECT id, word, translation, examples_english, examples_spanish,
                    created_date, last_reviewed_at, last_review_correct
               FROM dictionary_words
              WHERE user_id = :user_id
              ORDER BY
                  CASE
                      WHEN last_reviewed_at IS NULL THEN 0
                      WHEN last_review_correct = FALSE THEN 1
                      ELSE 2
                  END,
                  last_reviewed_at ASC NULLS FIRST,
                  RANDOM()"""
    rows = await g.connection.fetch_all(sql, {"user_id": user_id})
    if rows is None:
        return []

    result = []
    for row in rows:
        english_examples = row["examples_english"].split("\n") if row["examples_english"] else []
        spanish_examples = row["examples_spanish"].split("\n") if row["examples_spanish"] else []
        examples = [
            {"english_phrase": en, "spanish_phrase": es}
            for en, es in zip(english_examples, spanish_examples)
        ]
        result.append({
            "id": row["id"],
            "word": row["word"],
            "translation": row["translation"],
            "examples": examples,
            "createdDate": row["created_date"],
            "lastReviewedAt": row["last_reviewed_at"],
            "lastReviewCorrect": row["last_review_correct"],
        })

    return result


async def update_word_review_status(user_id: str, word_id: str, is_correct: bool):
    """Record the outcome of a review attempt for a single word.

    Only updates if the word actually belongs to the given user; this keeps the
    endpoint safe even if the client sends a foreign id.
    """
    now = datetime.now()
    sql = """UPDATE dictionary_words
                SET last_reviewed_at = :now,
                    last_review_correct = :is_correct
              WHERE id = :id AND user_id = :user_id"""
    await g.connection.execute(sql, {
        "now": now,
        "is_correct": bool(is_correct),
        "id": word_id,
        "user_id": user_id,
    })

async def conversation_get_by_id(id):
    # Order by time_msg with the row's physical insertion identifier (ctid)
    # as a tiebreaker. Without ctid, two lines saved within the same
    # CURRENT_TIMESTAMP tick (e.g. an "H" / "R" pair from the same turn)
    # came back in arbitrary order.
    sql = """
        select c.user_id,c.context_id,c.name,c.initial_time,c.final_date,c.url_source, l.type,l.msg
         from conversation as c, conversation_lines as l where c.id = :id and c.id=l.conversation_id order by l.time_msg, l.ctid
    """

    data=await g.connection.fetch_all(sql,{"id":id})
    result = [{"user": row['user_id'], "idContext": row['context_id'], "name": row['name'],
            "initial_time": row['initial_time'],"final_date":row['final_date'],"url_source": row['url_source'],"type": row['type'],"msg": row['msg']} for row in data]
    
    return result
async def conversation_get_list(user):
    sql = """
        select c.id, c.user_id, c.context_id, c.name, c.initial_time, c.final_date,
               (n.conversation_id IS NOT NULL) as has_notes,
               EXISTS (SELECT 1 FROM dictionary_words w WHERE w.conversation_id = c.id) as has_words
         from conversation as c
         left join conversation_notes as n
           on n.conversation_id = c.id and COALESCE(NULLIF(TRIM(n.notes), ''), NULL) IS NOT NULL
         where c.user_id = :id
         order by c.final_date desc
    """

    data=await g.connection.fetch_all(sql,{"id":user})
    result = [{"id":row['id'] , "user": row['user_id'], "idContext": row['context_id'], "name": row['name'],
            "initial_time": row['initial_time'],"final_date":row['final_date'],
            "hasNotes": bool(row['has_notes']), "hasWords": bool(row['has_words'])} for row in data]
    
    return result

async def conversation_delete_by_id(id):
    sql="delete from conversation where id = :id"
    await g.connection.execute(sql,{"id":id})    
    
    
async def update_language(user,language,voice):    
    sql="update users set language = :language, voice=:voice where user_id = :user "
    await g.connection.execute(sql,{"language":language,"voice": voice,"user":user})    
    logging.info("Save language preferences")    

async def update_human_voice(user, voice):
    """Persist the secondary ("alternative") voice used for Shift+F4 playback
    and human-line playback. Stored separately from the primary voice."""
    sql = "update users set human_voice = :voice where user_id = :user"
    await g.connection.execute(sql, {"voice": voice, "user": user})
    logging.info(f"Save human voice preference: {voice}")
    
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
    row = await g.connection.fetch_sole(sql, {"uuid": uuid})
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
    row = await g.connection.fetch_sole(sql, {"uuid": uuid})
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


# ---------------------------------------------------------------------------
# Long-term memory (per user, persisted across conversations)
# ---------------------------------------------------------------------------
async def get_user_profile(user_id: str):
    """Return the free-form profile text for a user (or empty string)."""
    row = await g.connection.fetch_sole(
        "SELECT profile, memory_enabled FROM users WHERE user_id = :user_id",
        {"user_id": user_id},
    )
    if row is None:
        return {"profile": "", "memory_enabled": True}
    return {
        "profile": row["profile"] or "",
        "memory_enabled": bool(row["memory_enabled"]) if row["memory_enabled"] is not None else True,
    }


async def set_user_profile(user_id: str, profile: str):
    sql = "UPDATE users SET profile = :profile WHERE user_id = :user_id"
    await g.connection.execute(sql, {"profile": profile or "", "user_id": user_id})


async def set_memory_enabled(user_id: str, enabled: bool):
    sql = "UPDATE users SET memory_enabled = :enabled WHERE user_id = :user_id"
    await g.connection.execute(sql, {"enabled": bool(enabled), "user_id": user_id})


async def upsert_user_fact(user_id: str, category: str, key: str, value: str, confidence: float = 0.7):
    """Insert a new fact or bump hit_count/last_seen if (user, category, key) already exists."""
    now = datetime.now()
    sql = """
        INSERT INTO user_facts (user_id, category, key, value, confidence, hit_count, last_seen)
        VALUES (:user_id, :category, :key, :value, :confidence, 1, :now)
        ON CONFLICT (user_id, category, key) DO UPDATE
            SET value = EXCLUDED.value,
                confidence = GREATEST(user_facts.confidence, EXCLUDED.confidence),
                hit_count = user_facts.hit_count + 1,
                last_seen = EXCLUDED.last_seen
    """
    await g.connection.execute(sql, {
        "user_id": user_id,
        "category": category,
        "key": key,
        "value": value,
        "confidence": float(confidence),
        "now": now,
    })


async def get_user_facts(user_id: str, limit: int = 50):
    sql = """
        SELECT id, category, key, value, confidence, hit_count, last_seen
          FROM user_facts
         WHERE user_id = :user_id
         ORDER BY hit_count DESC, last_seen DESC
         LIMIT :limit
    """
    rows = await g.connection.fetch_all(sql, {"user_id": user_id, "limit": limit})
    return [{
        "id": row["id"],
        "category": row["category"],
        "key": row["key"],
        "value": row["value"],
        "confidence": row["confidence"],
        "hitCount": row["hit_count"],
        "lastSeen": row["last_seen"],
    } for row in rows]


async def delete_user_fact(user_id: str, fact_id: int):
    sql = "DELETE FROM user_facts WHERE id = :id AND user_id = :user_id"
    await g.connection.execute(sql, {"id": int(fact_id), "user_id": user_id})


async def delete_all_user_facts(user_id: str):
    await g.connection.execute(
        "DELETE FROM user_facts WHERE user_id = :user_id", {"user_id": user_id}
    )


async def checkUser(user_id, password):
    row = await g.connection.fetch_sole(
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

