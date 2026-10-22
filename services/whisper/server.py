"""Private speech-to-text for Gospel Record voice notes (iPhone Shortcut -> your own machine over Tailscale).

POST /transcribe  multipart field "file" (m4a/wav/...), optional field "vocabulary" (one word per line),
                  header "Authorization: Bearer <token>" -> {"text", "duration", "seconds", "model"}
GET  /health      -> {"ok", "model"}

The vocabulary biases recognition toward names Whisper otherwise misses. The Obsidian plugin sends the
list from its settings; without one, vocab.txt is used (re-read on every request, no restart needed).
"""
import asyncio
import logging
import os
import secrets
import tempfile
import time
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium.en")
CPU_THREADS = int(os.environ.get("WHISPER_THREADS", "4"))
# WHISPER_TOKEN is the owner's; WHISPER_TOKENS adds one per extra person ("name:token,name:token") so each
# can be revoked alone and the log shows whose note it was.
TOKENS = {"owner": os.environ["WHISPER_TOKEN"]}
for pair in filter(None, (p.strip() for p in os.environ.get("WHISPER_TOKENS", "").split(","))):
    name, _, token = pair.partition(":")
    if name.strip() and token.strip():
        TOKENS[name.strip()] = token.strip()
VOCAB_FILE = Path(os.environ.get("WHISPER_VOCAB", "/app/vocab.txt"))
MAX_UPLOAD_MB = int(os.environ.get("WHISPER_MAX_UPLOAD_MB", "50"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper")

log.info("loading %s (%d threads)", MODEL_NAME, CPU_THREADS)
model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=CPU_THREADS,
                     download_root="/models")
log.info("model ready")

app = FastAPI()
# One transcription at a time: a second would just halve the speed of both and starve Home Assistant.
busy = asyncio.Semaphore(1)


def vocab_prompt(vocabulary: str | None = None) -> str | None:
    if vocabulary is None:
        try:
            vocabulary = VOCAB_FILE.read_text()
        except FileNotFoundError:
            return None
    words = [l.strip() for l in vocabulary.splitlines() if l.strip() and not l.strip().startswith("#")]
    return ", ".join(words) + "." if words else None


def require_token(authorization: str = Header(default="")) -> str:
    # Compare against every token without stopping early, so timing does not reveal which one matched.
    who = None
    for name, token in TOKENS.items():
        if secrets.compare_digest(authorization, f"Bearer {token}"):
            who = name
    if who is None:
        raise HTTPException(status_code=401, detail="bad token")
    return who


def transcribe_file(path: str, prompt: str | None) -> dict:
    started = time.time()
    segments, info = model.transcribe(path, language="en", beam_size=5, vad_filter=True, initial_prompt=prompt)
    text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "duration": round(info.duration, 1), "seconds": round(time.time() - started, 1),
            "model": MODEL_NAME}


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), vocabulary: str | None = Form(default=None),
                     who: str = Depends(require_token)) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"file over {MAX_UPLOAD_MB} MB")
    suffix = Path(file.filename or "audio.m4a").suffix or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(data)
        tmp.flush()
        async with busy:
            try:
                result = await asyncio.to_thread(transcribe_file, tmp.name, vocab_prompt(vocabulary))
            except Exception as e:  # undecodable audio etc.
                log.exception("transcription failed")
                raise HTTPException(status_code=422, detail=f"could not transcribe: {e}") from e
    # Log sizes and timing only, never the text.
    log.info("transcribed for %s: %s (%.0f KB, %s vocabulary): %ss audio in %ss", who, file.filename, len(data) / 1024,
             "sent" if vocabulary is not None else "file", result["duration"], result["seconds"])
    return result
