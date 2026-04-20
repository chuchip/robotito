"""Robotito application entry point.

Responsibilities:
- Create the Quart app, CORS, and DB.
- Initialize AI and audio services based on env vars.
- Register blueprints.
- Re-export key names (app, db, speechToText, textToSpeech, and the AI service
  functions) for backward compatibility with modules that do
  ``from robotito_ai import ...`` or ``import robotito_ai as ai``.
"""
import logging
import os

from quart import Quart
from quart_cors import cors
from quart_db import QuartDB
from openai import OpenAI
from google.cloud import speech, texttospeech

import memory
import ai_providers
import ai_chains
import ai_service
import audio_service
from api.principal import principal_bp
from api.security import security_bp
from api.audio import audio_bp
from api.context import context_bp
from api.conversation import conversation_bp

os.environ["GRPC_VERBOSITY"] = "ERROR"
os.environ["GLOG_minloglevel"] = "2"

logging.basicConfig(level=logging.WARNING, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger("asyncio").setLevel(logging.ERROR)
logging.getLogger("hypercorn.access").setLevel(logging.WARNING)

log_level = os.getenv("LOG_LEVEL")
log_level = int(log_level) if log_level is not None else logging.INFO
logger_ = logging.getLogger(__name__)
logger_.setLevel(log_level)


def getLogger():
    return logger_


# ---------------------------------------------------------------------------
# Quart app / DB / CORS
# ---------------------------------------------------------------------------
app = Quart(__name__)
db_host = os.getenv("DB_HOST")
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db = QuartDB(app, url=f"postgresql://{db_user}:{db_password}@{db_host}/robotito")

app = cors(app, allow_origin="*")

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


# ---------------------------------------------------------------------------
# LLM configuration
# ---------------------------------------------------------------------------
max_history = int(os.getenv("MAX_HISTORY") or 12)
max_length_answers = memory.get_max_length_answer()

model_api = (os.getenv("MODEL_API") or "gemini").lower()
if model_api == "openai":
    client_text = ai_providers.configOpenAI()
    llm_text = ai_providers.configOpenAI(temperature=0.0)
elif model_api == "ollama":
    client_text = ai_providers.configOllamaAI("gemma3", "http://172.24.144.1:11434")
    llm_text = ai_providers.configOllamaAI("gemma3", "http://172.24.144.1:11434", 0.0)
else:
    model_api = "gemini"
    client_text = ai_providers.configGeminiAI()
    llm_text = ai_providers.configGeminiAI("gemini-2.5-flash", 0.0)


# ---------------------------------------------------------------------------
# STT / TTS configuration
# ---------------------------------------------------------------------------
speechToText = None
textToSpeech = None
local_whisper = None

tts = (os.getenv("TTS") or "gemini").lower()
if tts == "kokoro":
    tts = "kokoro"
elif tts == "gemini":
    tts = "gemini"
    textToSpeech = texttospeech.TextToSpeechClient()
else:
    tts = "openai"
    textToSpeech = OpenAI()

stt = (os.getenv("STT") or "gemini").lower()
if stt == "openai":
    stt = "openai"
    speechToText = OpenAI()
elif stt == "gemini":
    stt = "gemini"
    speechToText = speech.SpeechClient()
else:
    stt = "local"
    local_whisper = ai_providers.configure_whisper_local()


# ---------------------------------------------------------------------------
# Wire up services
# ---------------------------------------------------------------------------
chains = ai_chains.build_chains(llm_text)
ai_service.init(client_text, llm_text, model_api, chains, max_history, logger_)
audio_service.init(stt, tts, local_whisper, logger_)

# Re-export for backward compatibility with ``import robotito_ai as ai``.
call_llm = ai_service.call_llm
call_llm_internal = ai_service.call_llm_internal
sumary_history = ai_service.sumary_history
rating_phrase = ai_service.rating_phrase
save_msg = ai_service.save_msg
restore_history = ai_service.restore_history
call_llm_translate = ai_service.call_llm_translate

getTextFromAudio = audio_service.getTextFromAudio
getAudioFromText = audio_service.getAudioFromText
set_language = audio_service.set_language


logger_.info("--------------------------------")
logger_.info("Initializing Robotito ...")
logger_.info(
    f"Model API: {model_api}  STT: {stt} TTS: {tts} . "
    f"Max Lenght Answers: {max_length_answers} Max History: {max_history}"
)
logger_.info("--------------------------------")


# ---------------------------------------------------------------------------
# Register blueprints
# ---------------------------------------------------------------------------
app.register_blueprint(audio_bp, url_prefix='/api/audio')
app.register_blueprint(context_bp, url_prefix='/api/context')
app.register_blueprint(conversation_bp, url_prefix='/api/conversation')
app.register_blueprint(principal_bp, url_prefix='/api')
app.register_blueprint(security_bp, url_prefix='/api/security')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
