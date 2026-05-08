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
from quart import request, abort
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
from api.memory import memory_bp

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

_allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if _allowed_origins_env:
    _allowed_origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
else:
    # Safe local-dev default. Set ALLOWED_ORIGINS to a comma-separated list for production.
    _allowed_origins = ["http://localhost:4200"]
    logger_.warning(
        "ALLOWED_ORIGINS not set; defaulting CORS to %s. Configure this in production.",
        _allowed_origins,
    )
app = cors(app, allow_origin=_allowed_origins)

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


# ---------------------------------------------------------------------------
# LLM configuration
# ---------------------------------------------------------------------------
max_history = int(os.getenv("MAX_HISTORY") or 12)
max_length_answers = memory.get_max_length_answer()

model_api = (os.getenv("MODEL_API") or "gemini").lower()
llm_smart = None
gemini_model = None
gemini_smart_model = None
if model_api == "openai":
    client_text = ai_providers.configOpenAI()
    llm_text = ai_providers.configOpenAI(temperature=0.0)
elif model_api == "ollama":
    client_text = ai_providers.configOllamaAI("gemma3", "http://172.24.144.1:11434")
    llm_text = ai_providers.configOllamaAI("gemma3", "http://172.24.144.1:11434", 0.0)
else:
    model_api = "gemini"
    # Override the Gemini model with the GEMINI_MODEL env var. Defaults to the
    # current best price/performance "Flash-Lite" tier; set to e.g.
    # "gemini-3-flash-preview" or "gemini-2.5-flash" to A/B test.
    gemini_model = os.getenv("GEMINI_MODEL") or "gemini-3.1-flash-lite"
    # Optional "smart" model used only for heavy structured chains (memory
    # extraction, vocabulary review grading). Costs more per call but runs
    # rarely. Defaults to the same as GEMINI_MODEL — set GEMINI_MODEL_SMART
    # to e.g. "gemini-3-flash-preview" or "gemini-3.1-pro-preview" to upgrade
    # only those chains while keeping chat on the cheap fast model.
    gemini_smart_model = os.getenv("GEMINI_MODEL_SMART") or gemini_model
    client_text = ai_providers.configGeminiAI(gemini_model)
    llm_text = ai_providers.configGeminiAI(gemini_model, 0.0)
    if gemini_smart_model != gemini_model:
        llm_smart = ai_providers.configGeminiAI(gemini_smart_model, 0.0)


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
chains = ai_chains.build_chains(llm_text, llm_smart)
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
call_llm_review = ai_service.call_llm_review
consolidate_memory = ai_service.consolidate_memory
load_long_term_memory = ai_service.load_long_term_memory
schedule_consolidation_if_due = ai_service.schedule_consolidation_if_due

getTextFromAudio = audio_service.getTextFromAudio
getAudioFromText = audio_service.getAudioFromText
set_language = audio_service.set_language


logger_.info("--------------------------------")
logger_.info("Initializing Robotito ...")
_model_label = model_api
if model_api == "gemini":
    if gemini_smart_model and gemini_smart_model != gemini_model:
        _model_label = f"gemini ({gemini_model} + smart={gemini_smart_model})"
    else:
        _model_label = f"gemini ({gemini_model})"
logger_.info(
    f"Model API: {_model_label}  STT: {stt} TTS: {tts} . "
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
app.register_blueprint(memory_bp, url_prefix='/api/memory')


# ---------------------------------------------------------------------------
# Global auth gate. Runs on every request; only enforces for /api/* paths.
# Unauthenticated endpoints (login, session restore, logout) are allow-listed.
# ---------------------------------------------------------------------------
_OPEN_ENDPOINTS = frozenset({
    'security.login',
    'security.get_uuid',
    'security.logout',
})


@app.before_request
def global_security_check():
    if not request.path.startswith('/api'):
        return
    if request.method == 'OPTIONS':
        return
    if request.endpoint in _OPEN_ENDPOINTS:
        return
    if 'uuid' not in request.headers or 'Authorization' not in request.headers:
        abort(401)
    authorization = request.headers.get("Authorization")
    mem = memory.getMemory(request.headers.get("uuid"))
    if mem is None:
        abort(401)
    session = mem.getSession()
    if session is None or session.getAuthorization() != authorization:
        abort(401)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
