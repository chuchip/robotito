from google.cloud import texttospeech
import os
import html 
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
def text_to_speech(text, output_filename):
    # Set the path to your service account key file
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "./robotito_google_cloud_key.json"
    
    # Initialize the client
    client = texttospeech.TextToSpeechClient()
    ssml_output = text_to_ssml(text)
    # Set the text input
    synthesis_input = texttospeech.SynthesisInput(ssml=ssml_output)
    
    # Configure voice parameters
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-GB",
         name="en-GB-Wavenet-D" 
    )
    
    # Set audio configuration
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.LINEAR16
    )
    
    # Generate speech
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config
    )
    
    # Save the audio file
    with open(output_filename, "wb") as out:
        out.write(response.audio_content)
        print(f"Audio content written to file: {output_filename}")

# Example usage
if __name__ == "__main__":
    text = "What is your name?. I hope you are doing well. I am a robot."
    output_file = "output.wav"
    text_to_speech(text, output_file)
