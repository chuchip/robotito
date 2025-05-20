import logging

from quart_cors import cors

logging.basicConfig(level=logging.WARNING, format='%(asctime)s - %(levelname)s - %(message)s')
from langchain_openai import ChatOpenAI,OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate,PromptTemplate
from langchain_core.messages import  HumanMessage, AIMessage
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from google.cloud import speech
from google.cloud import texttospeech
from openai import OpenAI
from langchain.output_parsers import PydanticOutputParser
from quart import Quart
from api.principal import principal_bp 
from api.security import security_bp
from api.audio import audio_bp
from api.context import context_bp
from api.conversation import conversation_bp
import os
from langchain_core.messages import  AIMessage,HumanMessage
import memory
from typing import List
from pydantic import BaseModel, Field
from quart_db import QuartDB

os.environ["GRPC_VERBOSITY"] = "ERROR"
os.environ["GLOG_minloglevel"] = "2"
log_level = os.getenv("LOG_LEVEL")
if log_level is None:
   log_level=logging.INFO
else:
   log_level=int(log_level)
logger_ = logging.getLogger(__name__)
logger_.setLevel(log_level)
app = Quart(__name__)
db_host = os.getenv("DB_HOST")
db_user=os.getenv("DB_USER")
db_password=os.getenv("DB_PASSWORD")
db = QuartDB(app, url=f"postgresql://{db_user}:{db_password}@{db_host}/robotito")


logging.getLogger("asyncio").setLevel(logging.ERROR)
logging.getLogger("hypercorn.access").setLevel(logging.WARNING)
app=cors(app,allow_origin="*")  # Enable Cross-Origin Resource Sharing

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create folder if not exists
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
client_text=None
class SumaryResume(BaseModel):
  rating:str = Field(description="Overall rating of errors in sentences")
  explication:str=Field(description="Explication of why you give this rating")
 
class AnalizePhrase(BaseModel):
  """Information about each analized setence"""
  sentence:str = Field(description="Original sentence to analize")
  rating:str=Field(description="Set the rating for the original sentence. Set the value 'Good' only the analized sentence doesn't have any grammatical error")
  explication:str=Field(description="Explication of why you give the previous status")
  correction:str=Field(description="Give an description of what was wrong on the sentence")
class AnalizePhrases(BaseModel):
  """Container to keep a list of elemnts of type AnalizePhrase """
  result :List[AnalizePhrase] = Field(description="An array containing elements of type  'AnalizePhrase'")

async def call_llm(state) :       
    #logging.info(f"call_llm: {state['messages']}")    
    memoryData=memory.getMemory(state['uuid'])
    max_length_answers=memoryData.getMaxLengthAnswer()
    limit_words=f"Your answer should be less than {max_length_answers} words"
    context = memoryData.getContext()
    rememberText=""
    if not context is None:
      rememberText=context.getRememberText()
    chat_history=memoryData.getChatHistory()
    prompt = ChatPromptTemplate.from_messages( [
          ("system", "{system_msg}"),         
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
      if max_history>0:
        msgs=chat_history[max_history*-1:]
      else:
        msgs=chat_history
      context_text=context.getText()
      if max_length_answers != 0:
        context_text=f"{limit_words}. {context.getText()}"
        insert_pos = len(msgs) - 4
        if insert_pos>0:
          msgs.insert(insert_pos, HumanMessage(f"Remember: {limit_words}"))  
        else:
          msgs.append(HumanMessage(f"Remember: {limit_words}"))  
      
      chat_prompt =  prompt.format_messages(
        system_msg=context_text,
        context=[], 
        msgs=msgs,  # Get the last MAX_HISTORY messages
        question=HumanMessage(question)
      ) 
      logger_.debug(f"LLM Context: {context_text}\n Question: {question}")
      if model_api=='ollama':
        async for chunk in client_text.astream(chat_prompt):
            yield  chunk
      else:
        async for chunk in client_text.astream(chat_prompt):        
            yield  chunk.content
      if swRemember:
          yield "*"    
    else:
      yield " "

def getLogger():
   return logger_
def call_llm_internal(chat_prompt):
  response=llm_text.invoke(chat_prompt)
  if model_api=='ollama':
      return response
  else:
      return response.content
  
def sumary_history(uuid,type):  
  if type=='resume':    
     chain=chain_resume   
  else:     
     chain=chain_detail
  memoryData=memory.getMemory(uuid)
  chat_history=memoryData.getChatHistory()
  msg=""
  i=1
  for line in chat_history:
    if isinstance(line, HumanMessage):
       msg += f'- Sentence number {i}: "{line.content}" \n'
       i+=1
  result= result = chain.invoke({"sentences_input": msg})
  return result
def rating_phrase(phrase): 
  result= result = chain_rating.invoke({"sentence_input": phrase})
  return result
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
    #logging.info(f"--- Searching in Vector Database --- {state['messages'][-1].content}")
    if state["vd"]: 
      results_with_scores = vector_store.similarity_search_with_score(
        state["messages"][-1].content,
        k=10
      )
      similarity_threshold = 1.0
#      for res, score in results_with_scores:       
#            logging.info(f"* {res.page_content} [{res.metadata}] {score}")
      filtered_results = [res for res, score in results_with_scores if score <= similarity_threshold]        
      retrieved_context = "\n".join([res.page_content for res in filtered_results])
      # logging.info(f"Retrieved Context in initial: {retrieved_context}")
#      state['retrieved_context']=retrieved_context
# return state

def save(state):
    chat_documents=[]
    message=state["messages"][0]
    if (isinstance(message, HumanMessage)):
      source = "Human"
    else:
      source = "AI"
    #logging.info(f"Content: {message.content} source: {source}")
    chat_documents.append(Document(page_content=message.content, metadata={"source": source},))
  
    all_splits = text_splitter.split_documents(chat_documents)
    _ = vector_store.add_documents(documents=all_splits)
    return state
def configOllamaAI(model:str,base_url:str,temperature=0.6):
   from langchain_ollama.llms import OllamaLLM
   model = OllamaLLM(model=model,base_url=base_url,temperature=temperature)
   return model
def configOpenAI(temperature=0.8):
  if version=="3.5":
    model = ChatOpenAI(model_name="o3-mini",                
                   streaming=True)
  else:
    model = ChatOpenAI(model_name="gpt-4o",
                    presence_penalty=1.2,
                   streaming=True,
                   temperature=temperature)

  return model

def configGeminiAI(model="gemini-2.0-flash-lite",temperature=0.6): 
  model = ChatGoogleGenerativeAI(
    model=model,
    temperature=temperature,
    streaming=True,
    timeout=None,
    max_retries=2
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
      chunk_length_s=30,
      batch_size=16,
      tokenizer=processor.tokenizer,
      feature_extractor=processor.feature_extractor,
      torch_dtype=torch_dtype,
      device=device,
  )
  return pipe_whisper

def getTextFromAudio(audioData:memory.AudioData,filepath):
  if stt=="local":
    language_whisper = {
            'english':'en-EU', 
            'english':'en-GB', 
            'spanish':'es-ES',
        }.get(audioData.language, None)    
    text = local_whisper(filepath,return_timestamps=True,
                         generate_kwargs={"language": language_whisper})['text']
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
  subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
      try:     
        language_kokoro = {
            'en-EU': 'a',
            'en-GB': 'b',
            'es-ES': 'e'
        }.get(languageInput, None)
        if  language_kokoro is None:
           language_kokoro=languageInput
        audioData.kpipeline = KPipeline(lang_code=language_kokoro)
      except AssertionError: 
         logging.info("Oppss.. pipeline bad configuration")
# Define the configuration
logger_.info("--------------------------------")
logger_.info("Initializing Robotito ...")

config = {"configurable": {"thread_id": "1"}}
version="3.5"

max_history = os.getenv("MAX_HISTORY")
if max_history is None:
   max_history=12
else:
   max_history=int(max_history)
max_length_answers = memory.get_max_length_answer()
# Configure LLM
model_api = os.getenv("MODEL_API")
if model_api is None:
  model_api="gemini"
if model_api=="openai":
  model_api="openai"
  client_text=configOpenAI()
  llm_text=configOpenAI(0.0)
elif model_api=='ollama':
  model_api="ollama"
  client_text=configOllamaAI("gemma3","http://172.24.144.1:11434")   
  llm_text=configOllamaAI("gemma3","http://172.24.144.1:11434",0.0)   
else:
  model_api="gemini"
  client_text=configGeminiAI()   
  llm_text=configGeminiAI("gemini-2.0-flash",0.0)

speechToText=None
textToSpeech=None
# Configure Text to Sound
tts = os.getenv("TTS")
if not tts :
   tts="gemini"
if tts.lower()=="kokoro":
  tts="kokoro"  
elif tts.lower()=="gemini":
  stt="gemini"
  textToSpeech = texttospeech.TextToSpeechClient()
else:
  tts="openai"
  textToSpeech=OpenAI()

# Configure Speech to Text
stt = os.getenv("STT")
if not stt:
   stt="gemini"
if stt.lower()=="openai":
  stt="openai"
  speechToText=OpenAI()
elif stt.lower()=="gemini":
  stt="gemini"
  speechToText= speech.SpeechClient()
else:
  local_whisper=configure_whisper_local()
  stt="local" # Use Whisper Local

prompt_resume_str = """
Analyze the grammatical correctness of the following sentences. 
If they are understandable and don't have any serious grammatical errors, don't worry about punctuation, missing spaces, or whether it could be improved for clarity. The phrases were written for someone at level B2, so don't be too harsh. 
Give a final brief summary feedback without talk about specific sentences.
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Sentences to analyze:
{sentences_input}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}.
"""
parser_resume = PydanticOutputParser(pydantic_object=SumaryResume)

prompt_resume = PromptTemplate(
    template=prompt_resume_str,
    input_variables=["sentences_input"],
    partial_variables={"format_instructions": parser_resume.get_format_instructions()}
)

chain_resume = prompt_resume | llm_text | parser_resume


prompt_detail_str = """
In the following sentences, analyze each one and determine if it's understandable and free of grammatical errors. Ignore punctuation, missing spaces, and potential clarity improvements. The target audience is B2 level.
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Sentences  to analyze:
{sentences_input}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

parser_detail = PydanticOutputParser(pydantic_object=AnalizePhrases)
format_instructions = parser_detail.get_format_instructions()
prompt_detail = PromptTemplate(
    template=prompt_detail_str,
    input_variables=["sentences_input"],
    partial_variables={"format_instructions": format_instructions}
)

chain_detail = prompt_detail | llm_text | parser_detail


prompt_rating_str = """
Analyze the grammatical correctness of the following sentence.
{sentence_input}

If the previous sentence is understandable and has no serious grammatical errors, don't worry about punctuation, missing spaces, or whether it could be improved for clarity.. The phrase was written for someone at level B2, so don't be too harsh. 
Provide the results as a JSON object conforming to the following schema.

{format_instructions}

Ensure your entire response is ONLY the JSON object, starting with {{ and ending with }}."""

parser_rating = PydanticOutputParser(pydantic_object=AnalizePhrase)
format_instructions = parser_rating.get_format_instructions()
prompt_rating = PromptTemplate(
    template=prompt_rating_str,
    input_variables=["sentence_input"],
    partial_variables={"format_instructions": format_instructions}
)

chain_rating = prompt_rating | llm_text | parser_rating

logger_.info(f"Model API: {model_api}  STT: {stt} TTS: {tts} . Max Lenght Answers: {max_length_answers} Max History: {max_history}" )
logger_.info("--------------------------------")

app.register_blueprint(audio_bp, url_prefix='/api/audio')
app.register_blueprint(context_bp, url_prefix='/api/context')
app.register_blueprint(conversation_bp, url_prefix='/api/conversation')
app.register_blueprint(principal_bp, url_prefix='/api')
app.register_blueprint(security_bp, url_prefix='/api/security')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
