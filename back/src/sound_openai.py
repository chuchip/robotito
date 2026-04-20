from robotito_ai import speechToText,textToSpeech
import memory

def stt_api_whisper(audio_file):
  with open(audio_file, "rb") as fh:
    transcription = speechToText.audio.transcriptions.create(
        model="whisper-1",
        file=fh,
    )
  return transcription.text
def getAudioFromText(audioData:memory.AudioData,text,uuid,voice_name):
    voice = voice_name if voice_name else audioData.voice_name
    response = textToSpeech.audio.speech.create(
      model="tts-1",
      voice=voice,
      response_format="opus",
      input=text,
    )
    fileOutput=f"audio/{uuid}_output.webm"
    response.stream_to_file(fileOutput)
    return fileOutput
