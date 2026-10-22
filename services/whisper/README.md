# Whisper server for voice notes

Optional. Turns the iPhone Shortcut's recordings into text on a computer you own; nothing goes to
a cloud service. `faster-whisper` `medium.en` on CPU (int8) transcribes a 50 s note in ~25 s on an
Intel i5-8500 and gets scripture names right far more often than `small.en`.

1. Install Docker and Tailscale on an always-on Linux machine.
2. `cp .env.example .env` and fill in `TAILSCALE_IP` and `WHISPER_TOKEN`.
3. `docker compose up -d --build` (the first start downloads the model, ~1.5 GB).
4. In Obsidian: Settings → Gospel Record → Whisper server `http://<TAILSCALE_IP>:8790`, paste the
   token, press **Test connection**.

- `POST /transcribe`: multipart `file`, optional `vocabulary` (one word per line), header
  `Authorization: Bearer <token>`. `GET /health` needs no token.
- **Sharing with someone else:** share the machine to them in the Tailscale admin console, add
  `name:token` to `WHISPER_TOKENS`, and `docker compose up -d`. Delete their entry to cut them off.
- One transcription at a time; logs record sizes and timings only, never the text.
- Never used for Sacred entries: those are typed straight into an encrypted note.
