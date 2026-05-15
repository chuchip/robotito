import os
import logging


class Context:  
  def __init__(self):
    self.id=None
    self.text=None
    self.label=None
    self.remember_text=None
    self.remember_number=0
    self.remember_each=2
  def setId(self,id):
    self.id=id
  def getId(self):
    return self.id
  def setRememberText(self,text):
    self.remember_text=text
    self.remember_number=0
  def setText(self,text):
    self.text=text
  def setLabel(self,label):
    self.label=label 
  def getText(self):
    return self.text
  def getLabel(self):
    return self.label 
  def getRememberText(self):
    return self.remember_text
  def getRememberNumber(self):
    return self.remember_number
  def incrementRememberNumber(self):
    self.remember_number+=1
  def hasToRemember(self):
    return self.remember_number%self.remember_each==0 or self.remember_number==0
class AudioData:
    def __init__(self):
        self.language='en-EU'
        self.kpipeline = None
        self.voice_name="af_heart"
        self.configGoogle=None


# ---------------------------------------------------------------------------
# Vocabulary review session (in-memory only; never persisted)
# ---------------------------------------------------------------------------
class ReviewWord:
    """A single dictionary word selected for the review session.

    Holds the data needed for both the teacher prompt (word + meaning +
    examples) and the per-word judgement, plus a few attempt counters used
    to produce the end-of-session summary.
    """
    def __init__(self, word_id, word, translation, examples=None):
        self.id = word_id
        self.word = word or ""
        self.translation = translation or ""
        self.examples = examples or []  # list of {english_phrase, spanish_phrase}
        self.attempts = 0   # how many user turns spent on this word
        self.hints = 0      # how many hint-style turns
        self.status = "pending"  # 'pending' | 'known' | 'unknown' | 'skipped'


class ReviewSession:
    """State machine driving a one-on-one vocabulary review conversation.

    Lives on `memoryDTO.review_session` and is wiped on logout / clear.
    Never persisted: a refresh that loses the in-memory session simply ends
    the review (the conversation lines stay saved as normal).
    """
    def __init__(self, words):
        self.words = words or []
        self.index = 0
        self.last_verdict = None
        # Frozen snapshot of the per-word outcomes once advanced/skipped, in
        # the order they were resolved. Used for the closing summary.
        self.history = []

    def current(self) -> "ReviewWord":
        if 0 <= self.index < len(self.words):
            return self.words[self.index]
        return None

    def is_finished(self) -> bool:
        return self.index >= len(self.words)

    def record_attempt(self, verdict: str):
        """Update counters for the current word after a turn.

        Does NOT advance; advancing is always user-initiated (3c flow).
        """
        self.last_verdict = verdict
        w = self.current()
        if w is None:
            return
        w.attempts += 1
        if verdict == "hint_given":
            w.hints += 1

    def advance(self, mark: str):
        """Mark the current word with `mark` ('known' | 'unknown' | 'skipped')
        and move to the next one. Returns the new current word (or None).
        """
        w = self.current()
        if w is None:
            return None
        w.status = mark if mark in ("known", "unknown", "skipped") else "unknown"
        self.history.append({
            "word": w.word,
            "translation": w.translation,
            "status": w.status,
            "attempts": w.attempts,
            "hints": w.hints,
        })
        self.index += 1
        self.last_verdict = None
        return self.current()

    def public_state(self) -> dict:
        """Frontend-facing snapshot. Includes the CURRENT word only (future
        words are intentionally not exposed)."""
        cur = self.current()
        return {
            "active": True,
            "index": self.index,
            "total": len(self.words),
            "current_word": cur.word if cur else None,
            "last_verdict": self.last_verdict,
            "is_finished": self.is_finished(),
            "resolved": [
                {"word": h["word"], "translation": h["translation"], "status": h["status"]}
                for h in self.history
            ],
        }

    def summary(self) -> dict:
        """End-of-session summary used by /review/end."""
        known = sum(1 for h in self.history if h["status"] == "known")
        skipped = sum(1 for h in self.history if h["status"] == "skipped")
        unknown = sum(1 for h in self.history if h["status"] == "unknown")
        return {
            "total": len(self.words),
            "known": known,
            "skipped": skipped,
            "unknown": unknown,
            "history": self.history,
        }
def get_max_length_answer():
  max_length_answers = os.getenv("MAX_LENGHT_ANSWERS")
  if max_length_answers is None:
    max_length_answers=70
  else:
    max_length_answers=int(max_length_answers)
  return max_length_answers
class memoryDTO:
    def __init__(self, uuid):
        self.user:str=None
        self.session=None
        self.uuid=uuid
        self.conversationId=None
        self.chat_history =[]
        self.max_length_answer=get_max_length_answer()
        self.context=None
        self.audioData=AudioData()
        self.url_context:str=None
        self.url_source:str=None
        # Long-term memory loaded from DB once per session and prepended to the system prompt.
        # None = not yet loaded; "" = loaded but empty (user has nothing remembered or memory disabled).
        self.long_term_memory:str=None
        # Counts user turns since the last memory consolidation, so we can periodically refresh.
        self.turns_since_consolidation:int=0
        # Active vocabulary-review session, if any (see ReviewSession).
        # Lives in memory only; cleared on logout or a fresh conversation.
        self.review_session:ReviewSession=None
    def getMaxLengthAnswer(self):
        return self.max_length_answer
    def setMaxLengthAnswer(self,max_lemgth:int):
        self.max_length_answer=max_lemgth
    def getConversationId(self):
        return self.conversationId
    def setConversationId(self,conversationId):
        self.conversationId=conversationId    
    def getSession(self):
       return self.session
    def setSession(self,session):
       if session is None:
          self.user=None
          self.session=None
          return
       self.user=session.getUser()
       self.session=session
    def clear(self):
        self.user=None
        self.session=None
        self.chat_history.clear()
        self.context=None
        self.audioData=AudioData()
        self.url_context=None
        self.url_source=None
        self.long_term_memory=None
        self.turns_since_consolidation=0
        self.review_session=None
    def getUser(self):
        return self.user
    def setUser(self,user:str):
        self.user=user  
    def getAudioData(self):
       return self.audioData
    def getChatHistory(self):
        return self.chat_history
    def getContext(self) -> Context:
        return self.context
    def setchatHistory(self,chat_history):
        self.chat_history=chat_history
    def setContext(self,context:Context):    
        self.context=context 
    def addChatHistory(self,msg):    
        self.chat_history.append(msg)
    def clearChatHistory(self):
        self.chat_history.clear()
    def clearContext(self):
        self.context=None
    def getUrlContext(self):
        return self.url_context
    def setUrlContext(self, url_context:str, url_source:str):
        self.url_context=url_context
        self.url_source=url_source
    def getUrlSource(self):
        return self.url_source
    def clearUrlContext(self):
        self.url_context=None
        self.url_source=None
    def getLongTermMemory(self):
        return self.long_term_memory
    def setLongTermMemory(self, text):
        self.long_term_memory = text or ""
    def clearLongTermMemory(self):
        self.long_term_memory = None
    def getTurnsSinceConsolidation(self):
        return self.turns_since_consolidation
    def incrementTurnsSinceConsolidation(self):
        self.turns_since_consolidation += 1
    def resetTurnsSinceConsolidation(self):
        self.turns_since_consolidation = 0
    def getReviewSession(self) -> "ReviewSession":
        return self.review_session
    def setReviewSession(self, session: "ReviewSession"):
        self.review_session = session
    def clearReviewSession(self):
        self.review_session = None
    def getUuid(self):    
        return self.uuid

class Session:
   def __init__(self,user,authorization):
      self.user=user
      self.authorization=authorization
   def getUser(self):
      return self.user
   def getAuthorization(self):            
      return self.authorization
  
# Return a object type memoryDto or None
def getMemory(uuid) -> memoryDTO:
    return memoryData.get(uuid)

def addMemory(mem:memoryDTO):
    memoryData[mem.getUuid()] = mem

# This is a memory cache for sessions
def getSessionFromAutorization(authorization):
  return sessions.get(authorization)

# Save in  memory cache a session
def saveSession(user,authorization):
  sessions[authorization] = Session(user,authorization)

memoryData={}
sessions={}

def getLogger() -> logging.Logger:
  logger_ = logging.getLogger(__name__)
  log_level = os.getenv("LOG_LEVEL")
  if log_level is None:
     log_level=logging.INFO
  else:
     log_level=int(log_level)  
  logger_.setLevel(log_level)
  return logger_