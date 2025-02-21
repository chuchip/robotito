Start using 'start.sh' 

In the back,I'm using Angular 19.
In the front I'm using python 3.9.21. You can use the command: 

- conda env create -f environment.yml

to recreate the conda environment.

In the back, i use hexgrad/Kokoro-82M  (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md#spanish) as TTS and openai/whisper-large-v3-turbo (https://huggingface.co/openai/whisper-large-v3-turbo) as STT.
As database I'm using Sqllite and Chroma.

