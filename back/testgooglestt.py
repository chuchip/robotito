import os

from google.cloud import speech

def transcribe_audio(file_path):
    # Load credentials from the JSON key file
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "./robotito_google_cloud_key.json"

    # Initialize the Speech-to-Text client with explicit credentials
    client = speech.SpeechClient()

    # Load the audio file into memory
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
    response = client.recognize(config=config, audio=audio)

    # Print the transcription results
    for result in response.results:
        print("Transcript:", result.alternatives[0].transcript)

# Replace 'your_audio_file.wav' with the path to your local audio file
transcribe_audio("uploads/73e44bf9-ccc2-49af-a969-6053d471cc99_recording.webm")


