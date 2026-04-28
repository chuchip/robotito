ChatBot made with Angular and Python 
It supports two local TTS engines, kokoro (https://huggingface.co/hexgrad/Kokoro-82M) and
VibeVoice-Realtime (https://github.com/microsoft/VibeVoice), plus
whisper-large-v3-turbo (https://huggingface.co/openai/whisper-large-v3-turbo)

It has been tested in Ubuntu 24.04 with Python 3.12. 

### Executing with docker
 docker run -it -p5000:5000  --gpus all -e GOOGLE_API_KEY=$GOOGLE_API_KEY cuda-python39-image
IMPORTANT: You will need a good Graphic Card ,16GB  memory  and 10 GB or more of hard disk to install this app.

## Back

### Dependencies
The back is in the directory 'back':

With conda installed, create the needed: environment 

> conda env create -f environment.yml

This will take a while because it has a lot of dependencies.

Update your environment if you have one installed

> conda env update --file environment.yml 

Important: You will need to install the next packages in your linux.

> sudo apt install ffmpeg
> sudo apt-get -qq -y install espeak-ng > /dev/null 2>&1

Create robotito_db directory to save data. In the directory back (outside src) execute:

> mkdir robotito_db

You must have your key to interact with the api of gemini.
You can create one in  https://ai.google.dev/gemini-api/docs/api-key

Create this environment variable: 

> GOOGLE_API_KEY="<YOUR_KEY">

### TTS engine selection

`TTS` selects the *default* engine. Valid values: `kokoro`, `vibevoice`, `gemini`, `openai`.

Set `TTS_ENGINES` (comma-separated) to enable additional engines that the user can pick from the
front-end settings panel. Example for Kokoro + VibeVoice with Kokoro as the default:

> export TTS=kokoro
> export TTS_ENGINES=kokoro,vibevoice

VibeVoice extras (only needed when `vibevoice` is enabled):

> pip install "vibevoice @ git+https://github.com/microsoft/VibeVoice.git#egg=vibevoice[streamingtts]"
> # then download voice presets in the VibeVoice repo:
> bash demo/download_experimental_voices.sh
> # optional: point the backend at a custom voices dir
> export VIBEVOICE_VOICES_DIR=/path/to/streaming_model/voices

### Start back
Execute: 
> python src/flask_server.py

### Execute docker of postgres manually
Example:
> docker run --name robotito_db  -p5432:5432  -e POSTGRES_USER=robotito -e POSTGRES_PASSWORD=secret  -d postgres
## Front:
You have the front in the directory 'front':

It's made with Angular so you will need node 19:

### Dependencies
Install dependencies with:
> npm install

### Start Front:

> npm start
Start using 'start.sh' 

Example of context:

You are going to pretend that you are my English teacher. You can only speak English. It is very important that you correct me if I make any mistakes or if my answer does not make sense or it doesn't sound natural.  Don't be overly helpful, the idea is having a conversation so  you have to make the conversation flow.
Remember, the most importance in our conversation is tell me if my sentence was correct.

## Make DockerFiles

### FRONT

cd front
ng build 
docker build -t robotito_front .
docker tag robotito_front chuchip/robotito_front:latest
docker push chuchip/robotito_front:latest
###  BACK LIGHT
cd back
docker build -t robotito_back -f Dockerfile-light .
docker tag robotito_back chuchip/robotito_back:latest
docker push chuchip/robotito_back:latest
#### BACK FULL
```
cd  # go to home directory
docker build -t robotito_back .

```
