import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import datetime

device = "cuda:0" if torch.cuda.is_available() else "cpu"
torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

model_id = "openai/whisper-large-v3-turbo"

model = AutoModelForSpeechSeq2Seq.from_pretrained(
    model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
)
model.to(device)

processor = AutoProcessor.from_pretrained(model_id)

pipe = pipeline(
    "automatic-speech-recognition",
    model=model,
    tokenizer=processor.tokenizer,
    feature_extractor=processor.feature_extractor,
    torch_dtype=torch_dtype,
    device=device,
)
now = datetime.datetime.now()
logging.info(f"Start pipe {now}")
result = pipe("audio/0.wav")
now = datetime.datetime.now()
logging.info(f"End  pipe {now}")
logging.info(result["text"])

logging.info("--------------------")
logging.info(f"Start pipe {now}")
result = pipe("audio/chuchi.wav")
now = datetime.datetime.now()
logging.info(f"End  pipe {now}")
logging.info(result["text"])

logging.info("--------------------")
logging.info(f"Start pipe {now}")
result = pipe("audio/recording.webm")
now = datetime.datetime.now()
logging.info(f"End  pipe {now}")
logging.info(result["text"])
