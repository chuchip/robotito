import html 

from robotito_ai import speechToText
from robotito_ai import textToSpeech
from google.cloud import texttospeech
from google.cloud import speech
from google.cloud import texttospeech
import memory
  

def text_to_ssml(text):
    # Escape special characters to avoid conflicts with SSML commands
    escaped_text = html.escape(text)

    # Wrap the text in the <speak> tag
    ssml = f"<speak>{escaped_text}</speak>"

    return ssml
def getTextFromAudio(audioData:memory.AudioData,file_path):
  with open(file_path, "rb") as audio_file:
    content = audio_file.read()
  audio = speech.RecognitionAudio(content=content)
 
  config = speech.RecognitionConfig(
      encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
      sample_rate_hertz=24000,
      language_code=audioData.language,
      enable_automatic_punctuation=True,
  )
  # Perform speech recognition
  response = speechToText.recognize(config= config, audio=audio)

  # Print the transcription results
  text=""
  for result in response.results:
      text=text+ result.alternatives[0].transcript
  return text

def getAudioFromText(audioData:memory.AudioData,text,uuid):
  ssml_output = text_to_ssml(text)
    # Set the text input
  synthesis_input = texttospeech.SynthesisInput(ssml=ssml_output)
  voice = texttospeech.VoiceSelectionParams(
        language_code=audioData.language,
        name=audioData.voice_name,
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