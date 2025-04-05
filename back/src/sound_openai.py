from robotito_ai import speechToText,textToSpeech
import memory

def stt_api_whisper(audio_file):
  audio_file= open(audio_file, "rb")
  transcription = speechToText.audio.transcriptions.create(
      model="whisper-1", 
      file=audio_file
  )
  return transcription.text
def getAudioFromText(audioData:memory.AudioData,text,uuid):
    response = textToSpeech.audio.speech.create(
      model="tts-1",
      voice=audioData.voice_name,
      response_format="opus",
      input=text,
    )
    fileOutput=f"/audio/{uuid}_output.webm"
    return response.stream_to_file(fileOutput)
