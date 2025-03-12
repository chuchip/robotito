from langchain_openai import ChatOpenAI,OpenAIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI


from langchain.prompts import ChatPromptTemplate
from langchain_core.messages import  HumanMessage, AIMessage
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma

import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import persistence as db

contextRemember_text=""
contextRemember_number=3

def setContextRemember(text):
  global contextRemember_text,contextRemember_number
  contextRemember_text=text
  contextRemember_number=3

async def call_llm(state) :    
    global contextRemember_text,contextRemember_number
    #print(f"call_llm: {state['messages']}")
    prompt = ChatPromptTemplate.from_messages( [
          ("system", "{system_msg}"),
          ("system", "Here is some background information to help answer user queries:\n{context}"),
          ("placeholder","{msgs}"),
          ("user","{question}")
    ])
    msg=state["messages"]
    if contextRemember_text!="":      
      if contextRemember_number%3==0:
        msg+=f"Just a reminder: {contextRemember_text}" 
        print("Remember: ",msg)
      contextRemember_number+=1
    chat_prompt =  prompt.format_messages(
      system_msg=state['system_msg'],
      context=state['retrieved_context'], 
      msgs=state['chat_history'],
      question=msg
    )  
     
    #response = model.invoke(chat_prompt)    
    
    async for chunk in model.astream(chat_prompt):
        #print(chunk.content, end="", flush=True)  # Stream response in real-time
        yield  chunk.content  # 
def save_msg(type,msg):
    if type=='R':
      chat_history.append(AIMessage(content=msg))
    else:
      chat_history.append(HumanMessage(content=msg))
def restore_history(jsonHistory):
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


# Define the configuration
print("--------------------------------")
print("Initializing Robotito ...")
print("--------------------------------")
config = {"configurable": {"thread_id": "1"}}

def configOpenAI():
  model = ChatOpenAI(model_name="gpt-4.5-preview",
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
    model="gemini-2.0-flash",
    temperature=0.5,
    streaming=True,
    max_tokens=None,
    timeout=None,
    max_retries=2,  
  )
  return model

vector_store=None
def configure_vector_store():
  embeddings = OpenAIEmbeddings( model="text-embedding-3-large")
  global vector_store
  vector_store = Chroma(
      collection_name="user1",
      embedding_function=embeddings,
      persist_directory="../robotito_db",  # Where to save data locally, remove if not necessary
  )
  text_splitter = RecursiveCharacterTextSplitter(chunk_size=200, chunk_overlap=200)
  ai={"model":model,"pipeline":pipeline,"embeddings":embeddings,"vector_store":vector_store,"text_splitter":text_splitter}  

# Configure Whisper
def configureWhisper():     
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
chat_history=[]

pipe_whisper=configureWhisper()
model=configGeminiAI()
#model=configOpenAI()
