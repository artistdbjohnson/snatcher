# Snatcher Pro worker

GPU box job. Not the free PWA.

```bash
python worker/pro_job.py --input clip.mp4 --out ./out --format mp3 --transcribe
```

Needs `ffmpeg` on PATH. WhisperX if you want word times + speakers. faster-whisper is the fallback.

Env on Vercel when the box is live:

- `WORKER_URL`
- `WORKER_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_SITE_URL`
