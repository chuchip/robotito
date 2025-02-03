import streamlit as st 
import src.robotito_ai as ai
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from streamlit import session_state as ss
import sqlite3
import pathlib
import numpy as np
from st_audiorec import st_audiorec

def add_name(ss,name_input):
    ss.name=name_input
    greetings="Hello!. My name now is "+name_input    
    ss.chat_history.append(HumanMessage(content=greetings))    
    human_msg(ss.chat_history[-1].content)  

def init_db(connection):
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'" )
    if cursor.fetchone() is  None:
        print("Initialzing the database")    
        connection.execute("CREATE TABLE users (user TEXT PRIMARY KEY, name TEXT, email TEXT, password TEXT)")        
        connection.execute("INSERT INTO users (user,name) VALUES ('','No Name')")
        connection.commit()
    cursor=connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='context'" )
    if cursor.fetchone() is  None:
        connection.execute("CREATE TABLE context (user TEXT, label TEXT, context TEXT)")
        connection.commit()
    
def ai_msg(content):
    return st.markdown('<span class="msg_ai">> AI: </span><span  class="msg_ai_typing">'+content+"</span>", unsafe_allow_html=True)
    
def human_msg(content):
    return st.markdown('<span class="msg_human">> HUMAN: </span><span class="msg_human_typing">'+content+"</span>", unsafe_allow_html=True)
    
if "graph" not in st.session_state:
  print("Rebuilding the graph")  
  ss.connection=sqlite3.connect("robotito_db/sqllite.db", check_same_thread=False)
  init_db(ss.connection)
  ss.context_value=""
  ss.contexts=[]
  ss.users= [user[0] for user in ss.connection.execute("SELECT * FROM users").fetchall()]
  ss.graph= ai.graph  
  ss.config= ai.config
  ss.chat_history=[ AIMessage(content="I'm a bot. How can I help you ?") ]
      
name=ss.get("name",None)
graph=ss.graph 
config=ss.config
chat_history=ss.get("chat_history",[])

def load_css(file_path):
    with open(file_path) as f:
        st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)

st.set_page_config(page_title="Robotito",page_icon="😎")
css_path = pathlib.Path("assets/styles.css")
load_css(css_path)

st.title("Robotito")
with st.sidebar:
    with st.container(border=True):        
        name_input=st.selectbox(label="User", options=list(ss.users))
        with st.popover("New"):
            ss.new_user=st.text_input("New User")

    if name_input is not None:
        with st.popover("Context"):        
            if len(ss.contexts)==0:
                query=ss.connection.execute(f"select label,context from context where user = '{name_input}'")
                data=query.fetchall()
                
            context=st.text_area(f"Context",value=ss.context_value,help="Context is the information that robotito uses to understand the conversation.")
            if len(data)>0:
                list_context=st.selectbox(label="Saved", options=list(data[0]))
                if list_context is not None and list_context!='':
                    ss.context_value="Choosed"
    vd= st.checkbox("Vector Database",value=False)
    sound= st.checkbox("Speak aloud",value=False)     
    newConversation=st.button("New Conversation",type="primary")    
with st.expander("Listen"):     
    record_audio = st_audiorec()
question=st.chat_input(f"Type your message here ... ",key="styledinput") 

new_user=ss.get("new_user",None)
if new_user is not None and new_user != "":
        c=ss.connection.execute(f"select user from users where user = '{new_user}'")
        if (c.fetchone() is None):
            ss.users.append(new_user)
            ss.connection.execute(f"INSERT INTO users (user) VALUES ('{new_user}')")
            ss.connection.commit()
            name_input=new_user    
        else:
            st.sidebar.error("User already exists")
if newConversation:
    ss.chat_history=[ AIMessage(content="I'm a bot. How can I help you ?") ]       
    if name_input is not None and name_input != "":
       add_name(ss,name_input)
    else:
        ss.name=None
else:
    for history in chat_history:        
        if type(history) is AIMessage:           
            ai_msg( history.content)
        else:    
            human_msg(history.content)  
    
    if record_audio is not None and len(record_audio)>1000:
        print("Recording audio")
        txt=ai.pipe(record_audio)        
        question=txt['text']

    if ss.get("name",None) is not None and question is not None and question != "":
        if context is None or context == "":
            context="You are a robot designed to interact with non-technical people and we are having a friendly conversation."
        msg_graph={"messages": question,"chat_history": chat_history,"retrieved_context": []
                ,"vd": vd,
                "system_msg": context }
        #print("Question_Graph: ",msg_graph) 
        response= graph.invoke(msg_graph, config) 
        answer=response["messages"][-1].content
        chat_history.append(HumanMessage(content=question))
        chat_history.append(AIMessage(content=answer))       
        human_msg (question)
        ai_msg(answer)
        if sound:
            generator = ai.kpipeline(
                answer, voice='af_bella',
                speed=1, split_pattern=r'\n+'
                )            
            for i, (gs, ps, audio) in enumerate(generator):
                if (i==0):
                    total = audio
                else:
                    total=np.concatenate((total, audio), axis=0)
              
            st.audio(total, format="audio/wav",sample_rate=24000, autoplay=True)
    if name is None and name_input is not None and name_input != "":
        add_name(ss,name_input)    

