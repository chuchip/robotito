import streamlit as st 
import robotito_ai as ai
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from streamlit import session_state as ss
from kokoro import KPipeline
import soundfile as sf

def add_name(ss,name_input,chat_history):
    ss.name=name_input
    greetings="Hello!. My name now is "+name_input    
    ss.chat_history.append(HumanMessage(content=greetings))    
    with st.chat_message("Human"):
        st.write(ss.chat_history[-1].content)  

if "graph" not in st.session_state:
  print("Rebuilding the graph")
  ss.graph= ai.graph  
  ss.config= ai.config
  ss.chat_history=[ AIMessage(content="I'm a bot. How can I help you ?") ]
      
name=ss.get("name",None)
graph=ss.graph 
config=ss.config
chat_history=ss.get("chat_history",[])

st.set_page_config(page_title="Robotito",page_icon="😎")
st.title("Robotito")
with st.sidebar:
    st.header("Settings") 

name_input=st.sidebar.text_input(f"Tell me your Name")
context=st.sidebar.text_input(f"Context")
vd= st.sidebar.checkbox("Vector Database",value="True")
sound= st.sidebar.checkbox("Speak aloud",value="False")
question=st.chat_input(f"Type your message here ... ") 

if st.sidebar.button("New Conversation",type="primary"):
    ss.chat_history=[ AIMessage(content="I'm a bot. How can I help you ?") ]   
    
    if name_input is not None and name_input != "":
       add_name(ss,name_input,chat_history)
    else:
        ss.name=None
else:
    for history in chat_history:
        #print("History: ",history)
        if type(history) is AIMessage:
            with st.chat_message("AI"):
                st.write(history.content)
        else:    
            with st.chat_message("Human"):
                st.write(history.content)  

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
        with st.chat_message("Human"):
            st.write(question)
        with st.chat_message("AI"):
            st.write(answer)
        if sound:
            generator = ai.pipeline(
                answer, voice='af_bella',
                speed=1, split_pattern=r'\n+'
                )
            for i, (gs, ps, audio) in enumerate(generator):
                print(i)  # i => index
                print(gs) # gs => graphemes/text
                print(ps) # ps => phonemes    
                #sf.write(f'audio/{i}.wav', audio, 24000) # save each audio fil
                st.audio(audio, format="audio/wav",sample_rate=24000, autoplay=True)
    if name is None and name_input is not None and name_input != "":
        add_name(ss,name_input,chat_history)    



