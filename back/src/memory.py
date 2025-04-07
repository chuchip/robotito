
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
    language='en-EU'
    kpipeline = None
    voice_name="af_heart"
    configGoogle=None

class memoryDTO:
    def __init__(self, uuid):
        self.user=None
        self.session=None
        self.uuid=uuid
        self.conversationId=None
        self.chat_history =[]
        self.context=None
        self.audioData=AudioData()
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
    def getUser(self):
        return self.user
    def setUser(self,user):
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
        self.context=None()   
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
    for mem in memoryData:
        if mem.getUuid()==uuid:
            return mem
    return None
# This is a memory cache for sessions
def getSessionFromAutorization(authorization):
  for session in sessions:
     if session.authorization==authorization:
        return session
  return None

# Save in  memory cache a session
def saveSession(user,uuid):
  sessions.append( Session(user,uuid))

memoryData=[]
sessions=[]