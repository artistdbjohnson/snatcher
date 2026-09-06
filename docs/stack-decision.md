# Snatcher — Stack Decision

Domain: UI/UX — free installable PWA that extracts audio from an uploaded video (max 5 min). Skills: build-router → ui-ux-gauntlet + hallmark + audio-snatcher. Motionsites seed: transform-data-hero.

Primary type: Mobile-first app (utility). Modifier: none.
Delivery: static HTML/CSS/JS PWA. No framework. No backend.
Extractor: ffmpegwasm/ffmpeg.wasm (17.8k) — highest-rated in-browser FFmpeg. Native FFmpeg stays the agent-side snatcher. Same flags: `-vn -c:a libmp3lame -q:a 2`, AAC fallback.
Motion: low. OriginKit: none needed. Canvas UI: none needed. Three.js: none. vgpu: none. Thinking: none.
Type: Fustat (display) + IBM Plex Mono (chrome). Palette: oxide `#14110e`, paper `#f3eadc`, ember `#e25b2a`, brass `#c4a574`.
UI foundation: custom. No Inter, no purple-cyan, no cream default.

Definition of Done
- Drop or pick a video ≤ 5:00
- Duration / no-audio / oversize errors are visible
- Engine loads once, progress is labeled
- MP3 (or M4A fallback) downloads
- Works offline after first visit (SW caches shell, not the 30MB wasm)
- Add-to-home-screen manifest + icons
- Files never leave the device
- Public URL + repo
