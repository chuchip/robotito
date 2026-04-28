"""VibeVoice-Realtime TTS provider.

Wraps the `vibevoice` package (https://github.com/microsoft/VibeVoice) so it
can be used from `audio_service.getAudioFromText` with the same signature as
the Kokoro backend: take text + speaker name, return a webm/opus file path.

Model and processor are loaded once on the first call and reused; both load
times and GPU memory make per-request initialization unworkable.

Voices are `.pt` files shipped with the VibeVoice repo under
`demo/voices/streaming_model/`. Set `VIBEVOICE_VOICES_DIR` if you store them
elsewhere. Run `demo/download_experimental_voices.sh` from the VibeVoice repo
to fetch the multilingual voices.
"""
import copy
import glob
import logging
import os
import subprocess
import threading
from typing import Iterator

_logger = logging.getLogger(__name__)

_model = None
_processor = None
_voice_mapper: dict | None = None
_device: str | None = None
SAMPLE_RATE = 24_000  # VibeVoice realtime fixed output rate


def _load_model() -> None:
    """Lazy-load the VibeVoice realtime model + processor (idempotent)."""
    global _model, _processor, _device
    if _model is not None:
        return

    import torch
    from vibevoice.modular.modeling_vibevoice_streaming_inference import (
        VibeVoiceStreamingForConditionalGenerationInference,
    )
    from vibevoice.processor.vibevoice_streaming_processor import (
        VibeVoiceStreamingProcessor,
    )

    model_path = os.getenv("VIBEVOICE_MODEL", "microsoft/VibeVoice-Realtime-0.5B")

    if torch.cuda.is_available():
        _device = "cuda"
        load_dtype = torch.bfloat16
        attn_impl = "flash_attention_2"
        kwargs = {"device_map": "cuda"}
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        _device = "mps"
        load_dtype = torch.float32
        attn_impl = "sdpa"
        kwargs = {"device_map": None}
    else:
        _device = "cpu"
        load_dtype = torch.float32
        attn_impl = "sdpa"
        kwargs = {"device_map": "cpu"}

    _logger.info(f"Loading VibeVoice from {model_path} on {_device} ...")
    _processor = VibeVoiceStreamingProcessor.from_pretrained(model_path)

    try:
        _model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
            model_path,
            torch_dtype=load_dtype,
            attn_implementation=attn_impl,
            **kwargs,
        )
    except Exception as exc:
        if attn_impl == "flash_attention_2":
            _logger.warning(
                f"flash_attention_2 unavailable ({exc}); falling back to sdpa."
            )
            _model = VibeVoiceStreamingForConditionalGenerationInference.from_pretrained(
                model_path,
                torch_dtype=load_dtype,
                attn_implementation="sdpa",
                device_map="cuda" if _device == "cuda" else "cpu",
            )
        else:
            raise

    if _device == "mps":
        _model.to("mps")
    _model.eval()
    # Match the streaming demo's noise scheduler tweak: SDE-DPM-Solver++ with
    # cosine-cap beta schedule produces noticeably better realtime quality.
    try:
        _model.model.noise_scheduler = _model.model.noise_scheduler.from_config(
            _model.model.noise_scheduler.config,
            algorithm_type="sde-dpmsolver++",
            beta_schedule="squaredcos_cap_v2",
        )
    except Exception as exc:
        _logger.warning(f"Could not tune VibeVoice noise scheduler: {exc}")
    _model.set_ddpm_inference_steps(num_steps=5)
    _logger.info("VibeVoice model ready.")


def _build_voice_mapper() -> dict:
    """Scan the VibeVoice install for .pt voice presets (lower-cased name -> path)."""
    custom = os.getenv("VIBEVOICE_VOICES_DIR")
    if custom:
        voices_dir = custom
    else:
        try:
            import vibevoice as _vv
            pkg_root = os.path.dirname(_vv.__file__)
        except ImportError:
            pkg_root = ""
        candidates = [
            os.path.join(pkg_root, "..", "demo", "voices", "streaming_model"),
            os.path.join(pkg_root, "demo", "voices", "streaming_model"),
        ]
        voices_dir = next((c for c in candidates if os.path.isdir(c)), candidates[0])

    pt_files = glob.glob(os.path.join(voices_dir, "**", "*.pt"), recursive=True)
    mapper = {
        os.path.splitext(os.path.basename(p))[0].lower(): os.path.abspath(p)
        for p in pt_files
    }
    if not mapper:
        _logger.warning(
            "No VibeVoice voice presets found under %s. "
            "Run demo/download_experimental_voices.sh or set VIBEVOICE_VOICES_DIR.",
            voices_dir,
        )
    return mapper


def _resolve_voice(speaker_name: str) -> str:
    global _voice_mapper
    if _voice_mapper is None:
        _voice_mapper = _build_voice_mapper()
    if not _voice_mapper:
        raise RuntimeError(
            "No VibeVoice voices available. Set VIBEVOICE_VOICES_DIR or run "
            "demo/download_experimental_voices.sh from the VibeVoice repo."
        )
    name = (speaker_name or "").lower().strip()
    if name in _voice_mapper:
        return _voice_mapper[name]
    matches = [p for k, p in _voice_mapper.items() if k in name or name in k]
    if matches:
        return matches[0]
    default = next(iter(_voice_mapper.values()))
    _logger.warning(
        f"VibeVoice voice '{speaker_name}' not found; falling back to {default}."
    )
    return default


def list_voices() -> list[str]:
    """Return the lowercase names of every voice preset found on disk."""
    global _voice_mapper
    if _voice_mapper is None:
        _voice_mapper = _build_voice_mapper()
    return list(_voice_mapper.keys())


def synthesize_to_webm(text: str, speaker_name: str, uuid: str) -> str:
    """Generate speech, transcode to webm/opus, return the output path."""
    import torch

    _load_model()
    voice_path = _resolve_voice(speaker_name)

    target_device = _device or "cpu"
    prefilled = torch.load(voice_path, map_location=target_device, weights_only=False)

    inputs = _processor.process_input_with_cached_prompt(
        text=text,
        cached_prompt=prefilled,
        padding=True,
        return_tensors="pt",
        return_attention_mask=True,
    )
    for k, v in inputs.items():
        if torch.is_tensor(v):
            inputs[k] = v.to(target_device)

    cfg_scale = float(os.getenv("VIBEVOICE_CFG_SCALE", "1.5"))
    outputs = _model.generate(
        **inputs,
        max_new_tokens=None,
        cfg_scale=cfg_scale,
        tokenizer=_processor.tokenizer,
        generation_config={"do_sample": False},
        verbose=False,
        all_prefilled_outputs=copy.deepcopy(prefilled),
    )

    if not outputs.speech_outputs or outputs.speech_outputs[0] is None:
        raise RuntimeError("VibeVoice produced no audio for the given input.")

    wav_file = f"audio/{uuid}-tts.wav"
    webm_file = f"audio/{uuid}-tts.webm"
    os.makedirs(os.path.dirname(wav_file) or ".", exist_ok=True)
    _processor.save_audio(outputs.speech_outputs[0], output_path=wav_file)

    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_file, "-c:a", "libopus", webm_file],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        os.remove(wav_file)
    except OSError as exc:
        _logger.warning(f"Could not remove vibevoice wav {wav_file}: {exc}")
    return webm_file


def synthesize_streaming(
    text: str,
    speaker_name: str,
    cfg_scale: float | None = None,
    inference_steps: int | None = None,
) -> Iterator[bytes]:
    """Yield raw PCM16 LE bytes (mono, 24 kHz) as audio is generated.

    Generation runs on a background thread; this function pulls chunks from
    VibeVoice's `AudioStreamer` and converts them to little-endian int16.
    Closing/exhausting the generator stops the background thread.
    """
    import numpy as np
    import torch
    from vibevoice.modular.streamer import AudioStreamer

    _load_model()
    voice_path = _resolve_voice(speaker_name)
    target_device = _device or "cpu"

    cfg = float(cfg_scale if cfg_scale is not None else os.getenv("VIBEVOICE_CFG_SCALE", "1.5"))
    if inference_steps and inference_steps > 0:
        _model.set_ddpm_inference_steps(num_steps=int(inference_steps))

    prefilled = torch.load(voice_path, map_location=target_device, weights_only=False)
    inputs = _processor.process_input_with_cached_prompt(
        text=text.strip(),
        cached_prompt=prefilled,
        padding=True,
        return_tensors="pt",
        return_attention_mask=True,
    )
    for k, v in inputs.items():
        if torch.is_tensor(v):
            inputs[k] = v.to(target_device)

    audio_streamer = AudioStreamer(batch_size=1, stop_signal=None, timeout=None)
    stop_event = threading.Event()
    errors: list = []

    def _run():
        try:
            _model.generate(
                **inputs,
                max_new_tokens=None,
                cfg_scale=cfg,
                tokenizer=_processor.tokenizer,
                generation_config={"do_sample": False},
                audio_streamer=audio_streamer,
                stop_check_fn=stop_event.is_set,
                verbose=False,
                refresh_negative=True,
                all_prefilled_outputs=copy.deepcopy(prefilled),
            )
        except Exception as exc:  # pragma: no cover - diagnostic
            errors.append(exc)
            _logger.exception("VibeVoice streaming generation failed")
        finally:
            audio_streamer.end()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    try:
        for audio_chunk in audio_streamer.get_stream(0):
            if torch.is_tensor(audio_chunk):
                arr = audio_chunk.detach().cpu().to(torch.float32).numpy()
            else:
                arr = np.asarray(audio_chunk, dtype=np.float32)
            if arr.ndim > 1:
                arr = arr.reshape(-1)
            if arr.size == 0:
                continue
            peak = float(np.max(np.abs(arr)))
            if peak > 1.0:
                arr = arr / peak
            arr = np.clip(arr, -1.0, 1.0)
            yield (arr * 32767.0).astype(np.int16).tobytes()
    finally:
        stop_event.set()
        audio_streamer.end()
        thread.join(timeout=5.0)
        if errors:
            raise errors[0]

