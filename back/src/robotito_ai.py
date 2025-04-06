from langchain_openai import ChatOpenAI,OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages import  HumanMessage, AIMessage
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from google.cloud import speech
from google.cloud import texttospeech
from openai import OpenAI

from quart import Quart
from quart_cors import cors
import os
from api.audio  import audio_bp
from api.principal import principal_bp
from api.context  import context_bp
from api.conversation import conversation_bp
from api.security import security_bp
from langchain_core.messages import  AIMessage,HumanMessage
import memory

app = Quart(__name__)
app=cors(app,allow_origin="*")  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


async def call_llm(state) :       
    #print(f"call_llm: {state['messages']}")
    memoryData=memory.getMemory(state['uuid'])
    context = memoryData.getContext()
    rememberText=""
    if not context is None:
      rememberText=context.getRememberText()
    chat_history=memoryData.getChatHistory()
    prompt = ChatPromptTemplate.from_messages( [
          ("system", "{system_msg}"),
          ("system", "Here is some background information to help answer user queries:\n{context}"),
          ("placeholder","{msgs}"),
          ("user","{question}")
    ])
    
    question=state["message"]
    if question.strip() != "":
      swRemember=False
      if rememberText!="":      
        if context.hasToRemember():
          question+=f". {context.getRememberText()}"
          swRemember=True        
        context.incrementRememberNumber()
      if max_length_answers != 0:
        context.setText=f"{context.getText()}. Your answer should be less than {max_length_answers} words."
      chat_prompt =  prompt.format_messages(
        system_msg=context.getText(),
        context=[], 
        msgs=chat_history[max_history*-1:],  # Get the last MAX_HISTORY messages
        question=question
      )              
      async for chunk in client_text.astream(chat_prompt):        
          yield  chunk.content
      if swRemember:
        yield "*"
    else:
      yield " "
def save_msg(uuid,type,msg):
    chat_history = memory.getMemory(uuid).getChatHistory()
    if type=='R':
      chat_history.append(AIMessage(content=msg))
    else:
      chat_history.append(HumanMessage(content=msg))
def restore_history(uuid,jsonHistory):
  chat_history = memory.getMemory(uuid).getChatHistory()
  chat_history.clear()
  for line in jsonHistory:
    if line['type']=='R':
      chat_history.append(AIMessage(content=line['msg']))
    else:
       chat_history.append(HumanMessage(content=line['msg']))
def initial(state):    
    #print(f"--- Searching in Vector Database --- {state['messages'][-1].content}")
    if state["vd"]: 
      results_with_scores = vector_store.similarity_search_with_score(
        state["messages"][-1].content,
        k=10
      )
      similarity_threshold = 1.0
#      for res, score in results_with_scores:       
#            print(f"* {res.page_content} [{res.metadata}] {score}")
      filtered_results = [res for res, score in results_with_scores if score <= similarity_threshold]        
      retrieved_context = "\n".join([res.page_content for res in filtered_results])
      # print(f"Retrieved Context in initial: {retrieved_context}")
#      state['retrieved_context']=retrieved_context
# return state

def save(state):
    chat_documents=[]
    message=state["messages"][0]
    if (isinstance(message, HumanMessage)):
      source = "Human"
    else:
      source = "AI"
    #print(f"Content: {message.content} source: {source}")
    chat_documents.append(Document(page_content=message.content, metadata={"source": source},))
  
    all_splits = text_splitter.split_documents(chat_documents)
    _ = vector_store.add_documents(documents=all_splits)
    return state

def configOpenAI():
  if version=="3.5":
    model = ChatOpenAI(model_name="o3-mini",                
                   streaming=True)
  else:
    model = ChatOpenAI(model_name="gpt-4o",
                    presence_penalty=1.2,
                   streaming=True,
                   temperature=0.8)

  return model
def configGeminiAISync(): 
  model = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    temperature=0.1,
    streaming=False,
    max_tokens=None,
    timeout=None,
    max_retries=2,  
  )
  return model

def configGeminiAI(): 
  model = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash-lite",
    temperature=0.6,
    streaming=True,
    max_tokens=None,
    timeout=None,
    max_retries=2,  
  )
  return model


def configure_vector_store():
  vector_store=None
  from transformers import pipeline
  from langchain_chroma import Chroma
  embeddings = OpenAIEmbeddings( model="text-embedding-3-large")
  
  vector_store = Chroma(
      collection_name="user1",
      embedding_function=embeddings,
      persist_directory="../robotito_db",  # Where to save data locally, remove if not necessary
  )
  text_splitter = RecursiveCharacterTextSplitter(chunk_size=200, chunk_overlap=200)
  ai={"model":client_text,"pipeline":pipeline,"embeddings":embeddings,"vector_store":vector_store,"text_splitter":text_splitter}  

# Configure Whisper in local
def configure_whisper_local():
  import torch
  from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

  device = "cuda:0" if torch.cuda.is_available() else "cpu"
  torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

  model_id = "openai/whisper-large-v3-turbo"

  model_audio = AutoModelForSpeechSeq2Seq.from_pretrained(
      model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
  )
  model_audio.to(device)

  processor = AutoProcessor.from_pretrained(model_id)

  pipe_whisper = pipeline(
      "automatic-speech-recognition",
      model=model_audio,
      tokenizer=processor.tokenizer,
      feature_extractor=processor.feature_extractor,
      torch_dtype=torch_dtype,
      device=device,
  )
  return pipe_whisper

def getTextFromAudio(audioData,filepath):
  if stt=="local":
    text = local_whisper(filepath,return_timestamps=True)['text']
  elif stt=="gemini":
     import sound_google
     text=sound_google.getTextFromAudio(audioData,filepath)
  else:
    import sound_openai
    text=sound_openai.stt_api_whisper(filepath)
  return text
   #text = ai.testWhisper(filepath)
def getAudioFromKokoro(text,audioData,uuid): 
  import soundfile as sf
  import numpy as np
  import subprocess
  if audioData.kpipeline is None:
      from kokoro import KPipeline
      audioData.kpipeline = KPipeline(lang_code=audioData.language)
  generator = audioData.kpipeline(
          text, 
          voice= audioData.voice_name,
          speed=1, split_pattern=r'\n+'
      )    

  for i, (gs, ps, audio) in enumerate(generator):       
      if (i==0):
          total = audio
      else:
          total=np.concatenate((total, audio), axis=0)
  wav_file= f"audio/{uuid}-tts.wav"
  webm_file=f"audio/{uuid}-tts.webm"
  sf.write(wav_file, total, 24000)
  command = [
  'ffmpeg',"-y",
  '-i', wav_file,       # Input WAV file
  '-c:a', 'libopus',     # Audio codec (Opus)
      webm_file            # Output WebM file
  ]
  subprocess.run(command)
  return webm_file

# Convert  text to audio en webm format
def getAudioFromText(text,audioData,uuid):
  if tts=="kokoro":
     fileOutput= getAudioFromKokoro(text,audioData,uuid)
  elif tts=="gemini":
     import sound_google
     fileOutput= sound_google.getAudioFromText(audioData,text,uuid)
  else:
    import sound_openai
    fileOutput= sound_openai.getAudioFromText(audioData,text,uuid)
   
  return fileOutput
def set_language(audioData,languageInput):
   if languageInput != audioData.language:
      audioData.language=languageInput
   if tts=='kokoro':
      from kokoro import KPipeline
      audioData.kpipeline = KPipeline(lang_code=languageInput)
# Define the configuration
print("--------------------------------")
print("Initializing Robotito ...")

config = {"configurable": {"thread_id": "1"}}
version="3.5"

max_history = os.getenv("MAX_HISTORY")
if max_history is None:
   max_history=12
max_length_answers = os.getenv("MAX_LENGHT_ANSWERS")
if max_length_answers is None:
   max_length_answers=70
# Configure LLM
model_api = os.getenv("MODEL_API")
if model_api and model_api!="gemini":
  model_api="openai"
  client_text=configOpenAI()  
else:
  model_api="gemini"
  client_text=configGeminiAI()   

speechToText=None
textToSpeech=None
# Configure Text to Sound
tts = os.getenv("TTS")
if tts and tts.lower()=="kokoro":
  tts="kokoro"  
elif tts and tts.lower()=="gemini":
  stt="gemini"
  textToSpeech = texttospeech.TextToSpeechClient()
else:
  tts="openai"
  textToSpeech=OpenAI()

# Configure Speech to Text
stt = os.getenv("STT")
if stt and stt.lower()=="openai":
  stt="openai"
  speechToText=OpenAI()
elif stt and stt.lower()=="gemini":
  stt="gemini"
  speechToText= speech.SpeechClient()
else:
  local_whisper=configure_whisper_local()
  stt="local" # Use Whisper Local

  
print(f"Model API: {model_api}  STT: {stt} TTS: {tts}" )
print("--------------------------------")

app.register_blueprint(principal_bp, url_prefix='/api')
app.register_blueprint(audio_bp, url_prefix='/api/audio')
app.register_blueprint(context_bp, url_prefix='/api/context')
app.register_blueprint(conversation_bp, url_prefix='/api/conversation')
app.register_blueprint(security_bp, url_prefix='/api/security')



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
