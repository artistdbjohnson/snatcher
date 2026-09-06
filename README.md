# Snatcher

Free PWA. Drop a video up to five minutes. Get the audio. The file never leaves the device.

**Pro — $9.99 / month.** Two hours per file. Two hours transcribed per month. Native FFmpeg + WhisperX (`large-v3-turbo`). Stripe keys are env vars; until they land, `/pro` has a local unlock for testing.

- Free engine: [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
- Paid engine: `worker/pro_job.py` (ffmpeg + WhisperX / faster-whisper)
- Same encode path as the workspace `audio-snatcher` skill: `libmp3lame -q:a 2`
- By dglxss

## Env (Vercel)

See `.env.example`. Needed to go live:

`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_SITE_URL`, `WORKER_URL`, `WORKER_TOKEN`
