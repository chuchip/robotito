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