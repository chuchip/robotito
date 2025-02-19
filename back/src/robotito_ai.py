from langchain_community.embeddings  import OpenAIEmbeddings
from langchain_openai import ChatOpenAI,OpenAIEmbeddings
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages import  HumanMessage, AIMessage
from typing_extensions import Annotated, TypedDict
from typing import Sequence, List
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import START,END, MessagesState, StateGraph
from langchain_chroma import Chroma

import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import persistence as db

class State(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    chat_history: List[BaseMessage]
    retrieved_context: List[str]
    system_msg: str
    vd: bool
    id: int
    label: str
    user:str


def call_llm(state: State):    
    #print(f"call_llm: {state['messages']}")
    prompt = ChatPromptTemplate.from_messages( [
          ("system", "{system_msg}"),
          ("system", "Here is some background information to help answer user queries:\n{context}"),
          ("placeholder","{msgs}"),
          ("user","{question}")
    ])
    #print("Chat History: ",state['chat_history']) 
    #print("retrieved_context: ",state['retrieved_context']) 
    chat_prompt =  prompt.format_messages(
      system_msg=state['system_msg'],
      context=state['retrieved_context'], 
      msgs=state['chat_history'],
      question=state["messages"][-1].content
    )  
    #print(f"chat_prompt {chat_prompt}")
    response = model.invoke(chat_prompt)    
    #print("- Call LLM",response)
    chat_history.append(state["messages"][-1])
    chat_history.append(response)
    db.conversation_save(state['id'], state['label'],"R",state["messages"][-1].content)
    db.conversation_save(state['id'], state['label'],"H",response.content)
    return {"messages": response}

def restore_history(jsonHistory):
  chat_history.clear()
  for line in jsonHistory:
    if line['type']=='R':
      chat_history.append(AIMessage(content=line['msg']))
    else:
       chat_history.append(HumanMessage(content=line['msg']))
def initial(state: State):    
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
      state['retrieved_context']=retrieved_context
    return state

def save(state: State):
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


def llm_question(question: str):
  input_message = [HumanMessage(content=question)]
  output = graph.invoke({"messages": input_message}, config) 
  #print(f"Answer from llm to question: {question}")
  
  output["messages"][-1].pretty_print()

def search_all():
  documents = vector_store.get()
  for doc in documents['documents']:
      print(type(doc))
      print(doc)

def llm1():
  print("Ejecutando llm1")
  input_message = [HumanMessage(content="Hi, My name is Jesus")]
  output = graph.invoke({"messages": input_message}, config) 
  output["messages"][-1].pretty_print()

def llm2():
  input_message = [HumanMessage(content="Do you remember my name?")]
  output = graph.invoke({"messages": input_message}, config) 
  output["messages"][-1].pretty_print()

def llm3():
  input_message = [HumanMessage(content="What is the weight of the planet Earth?")]
  output = graph.invoke({"messages": input_message}, config) 
  output["messages"][-1].pretty_print()


print (f"__name__ in robotito{__name__}")

# Define the configuration
print("--------------------------------")
print("Initializing Robotito ...")
print("--------------------------------")
config = {"configurable": {"thread_id": "1"}}

model = ChatOpenAI(model_name="gpt-4o-mini",
                   presence_penalty=1.2,
                   temperature=0.7)

embeddings = OpenAIEmbeddings( model="text-embedding-3-large")
vector_store = Chroma(
    collection_name="user1",
    embedding_function=embeddings,
    persist_directory="../robotito_db",  # Where to save data locally, remove if not necessary
)
text_splitter = RecursiveCharacterTextSplitter(chunk_size=200, chunk_overlap=200)
ai={"model":model,"pipeline":pipeline,"embeddings":embeddings,"vector_store":vector_store,"text_splitter":text_splitter}  

# Define a new graph
workflow = StateGraph(State)
workflow.add_node("initial", initial)
workflow.add_node("call_llm", call_llm)
workflow.add_node("save", save)

# Set the entrypoint as conversation
workflow.add_edge(START, "initial")
workflow.add_edge("initial", "call_llm")
workflow.add_edge("call_llm", "save")
workflow.add_edge("save", END)
# Compile
#memory = MemorySaver()
#graph = workflow.compile(checkpointer=memory)
graph = workflow.compile()

# Configure Whisper

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
chat_history=[]

