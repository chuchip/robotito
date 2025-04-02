from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages import  HumanMessage, AIMessage
from langchain_core.documents import Document
import memory
import html 
import os

from google.cloud import speech
from google.cloud import texttospeech
def text_to_ssml(text):
    """
    Converts plain text with punctuation into SSML format.

    Args:
        text (str): The input plain text.

    Returns:
        str: SSML-formatted string.
    """
    # Escape special characters to avoid conflicts with SSML commands
    escaped_text = html.escape(text)

    # Wrap the text in the <speak> tag
    ssml = f"<speak>{escaped_text}</speak>"

    return ssml

async def call_llm(state) :       
    #print(f"call_llm: {state['messages']}")
    memoryData=memory.getMemory(state['uuid'])
    context = memoryData.getContext()
    chat_history=memoryData.getChatHistory()
    prompt = ChatPromptTemplate.from_messages( [
          ("system", "{system_msg}"),
          ("system", "Here is some background information to help answer user queries:\n{context}"),
          ("placeholder","{msgs}"),
          ("user","{question}")
    ])
    msg=state["message"]
    swRemember=False
    if context.getRememberText()!="":      
      if context.hasToRemember():
        msg+=f". {context.getRememberText()}"
        swRemember=True        
      context.incrementRememberNumber()
    chat_prompt =  prompt.format_messages(
      system_msg=context.getText(),
      context=[], 
      msgs=chat_history,
      question=msg
    )  
     
    #response = model.invoke(chat_prompt)    
    
    async for chunk in clientText.astream(chat_prompt):        
        yield  chunk.content
    if swRemember:
      yield "*"
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

def getTextFromAudio(file_path):
  with open(file_path, "rb") as audio_file:
        content = audio_file.read()

  # Configure recognition settings
  audio = speech.RecognitionAudio(content=content)
  config = speech.RecognitionConfig(
      encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
      sample_rate_hertz=24000,
      language_code="en-EU",
      enable_automatic_punctuation=True,
  )

  # Perform speech recognition
  response = speechToText.recognize(config=config, audio=audio)

  # Print the transcription results
  text=""
  for result in response.results:
      text=text+ result.alternatives[0].transcript
  return text
def getAudioFromText(text,uuid):
  ssml_output = text_to_ssml(text)
    # Set the text input
  synthesis_input = texttospeech.SynthesisInput(ssml=ssml_output)
  voice = texttospeech.VoiceSelectionParams(
        language_code="en-GB",
         name="en-GB-Wavenet-B" 
    )
    
    # Set audio configuration
  audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.LINEAR16
    )
    
    # Generate speech
  response = textToSpeech.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )
  output_filename = f"audio/output_{uuid}.webm"
  with open(output_filename, "wb") as out:
        out.write(response.audio_content)
        print(f"Audio content written to file: {output_filename}")
  return output_filename
# Define the configuration
print("--------------------------------")
print("Initializing Robotito ...")
print("--------------------------------")
config = {"configurable": {"thread_id": "1"}}
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "./robotito_google_cloud_key.json"
clientText=configGeminiAI()
speechToText= speech.SpeechClient()
textToSpeech = texttospeech.TextToSpeechClient()