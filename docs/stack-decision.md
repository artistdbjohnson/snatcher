# Snatcher — Stack Decision

Domain: UI/UX — free installable PWA that extracts audio from an uploaded video (max 5 min). Skills: build-router → ui-ux-gauntlet + hallmark + audio-snatcher. Motionsites seed: transform-data-hero.

Primary type: Mobile-first app (utility). Modifier: none.
Delivery: static HTML/CSS/JS PWA + Vercel serverless stubs (`api/checkout`, `api/session`, `api/jobs`, `api/webhook`). GPU worker is a separate Python box (`worker/pro_job.py`), not the browser.

Paid slice DoD
- `/pro` pricing + local unlock + Stripe checkout stub
- 2:00:00 file cap and 2:00:00 monthly quota (client tracked until billing is live)
- Short Pro extracts can still use ffmpeg.wasm; long files + transcripts queue a worker job slip
- Worker script extracts + WhisperX turbo (faster-whisper fallback)
- Stripe creds later — no fake paid checkmarks
Extractor: ffmpegwasm/ffmpeg.wasm. Native FFmpeg stays the agent-side snatcher. Same flags: `-vn -c:a libmp3lame -q:a 2`, AAC fallback.
Motion: low. OriginKit: none needed. Canvas UI: none needed. Three.js: none. vgpu: none. Thinking: none.
Type: Fustat (display) + IBM Plex Mono (chrome). Palette: oxide `#14110e`, paper `#f3eadc`, ember `#e25b2a`, brass `#c4a574`.
