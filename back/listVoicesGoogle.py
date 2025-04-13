import os
def list_voices(language=None):
    """Lists the available voices."""
    
    from google.cloud import texttospeech
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "./robotito_google_cloud_key.json"
    client = texttospeech.TextToSpeechClient()

    # Performs the list voices request
    voices = client.list_voices()

    for voice in voices.voices:
        # Display the voice's name. Example: tpc-vocoded
        if language is not None and language not in voice.language_codes:
            continue
        logging.info(f"Name: {voice.name}")

        # Display the supported language codes for this voice. Example: "en-US"
        for language_code in voice.language_codes:
            logging.info(f"Supported language: {language_code}")

        ssml_gender = texttospeech.SsmlVoiceGender(voice.ssml_gender)

        # Display the SSML Voice Gender
        logging.info(f"SSML Voice Gender: {ssml_gender.name}")

        # Display the natural sample rate hertz for this voice. Example: 24000
        logging.info(f"Natural Sample Rate Hertz: {voice.natural_sample_rate_hertz}\n")

# Example usage
if __name__ == "__main__":
    text = "What is your name?. I hope you are doing well. I am a robot."
    output_file = "output.wav"
    list_voices("es-ES")