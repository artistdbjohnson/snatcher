#!/usr/bin/env python3
"""Snatcher Pro worker.

Extract audio with ffmpeg, then transcribe with WhisperX (faster-whisper
large-v3-turbo). Falls back to faster-whisper alone if WhisperX is missing.

Usage:
  python worker/pro_job.py --input clip.mp4 --out ./out --format mp3 --transcribe --diarize

Caps: 7200 seconds. Writes <stem>.mp3 + <stem>.txt + <stem>.srt + <stem>.json
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MAX_SECONDS = 7200


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd)


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def extract(src: Path, dest: Path, fmt: str) -> None:
    if fmt == "wav":
        args = ["-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"]
    elif fmt == "m4a":
        args = ["-vn", "-c:a", "aac", "-b:a", "192k"]
    else:
        args = ["-vn", "-c:a", "libmp3lame", "-q:a", "2"]
    run(["ffmpeg", "-y", "-i", str(src), *args, str(dest)])


def transcribe(audio: Path, dest_dir: Path, stem: str, diarize: bool) -> dict:
    txt = dest_dir / f"{stem}.txt"
    srt = dest_dir / f"{stem}.srt"
    js = dest_dir / f"{stem}.json"

    if shutil.which("whisperx"):
        cmd = [
            "whisperx", str(audio),
            "--model", "large-v3-turbo",
            "--compute_type", "float16",
            "--output_dir", str(dest_dir),
            "--output_format", "all",
        ]
        if diarize:
            cmd.append("--diarize")
        run(cmd)
        return {"engine": "whisperx", "model": "large-v3-turbo", "diarize": diarize}

    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise SystemExit(
            "Need whisperx or faster-whisper. pip install -r worker/requirements.txt"
        ) from e

    model = WhisperModel("large-v3-turbo", device="auto", compute_type="int8")
    segments, info = model.transcribe(str(audio), vad_filter=True, beam_size=5)
    rows = []
    lines = []
    srt_chunks = []
    for i, seg in enumerate(segments, start=1):
        rows.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
        lines.append(seg.text.strip())
        srt_chunks.append(
            f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n"
        )
    txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
    srt.write_text("\n".join(srt_chunks) + "\n", encoding="utf-8")
    js.write_text(json.dumps({"language": info.language, "segments": rows}, indent=2), encoding="utf-8")
    return {
        "engine": "faster-whisper",
        "model": "large-v3-turbo",
        "diarize": False,
        "language": info.language,
    }


def ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, milli = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--out", default="./out")
    p.add_argument("--format", default="mp3", choices=["mp3", "m4a", "wav"])
    p.add_argument("--transcribe", action="store_true")
    p.add_argument("--diarize", action="store_true")
    args = p.parse_args()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        print(f"missing input: {src}", file=sys.stderr)
        return 2

    duration = probe_duration(src)
    if duration > MAX_SECONDS:
        print(f"over cap: {duration:.1f}s > {MAX_SECONDS}", file=sys.stderr)
        return 3

    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    stem = src.stem
    audio = out / f"{stem}.{args.format}"
    extract(src, audio, args.format)

    meta = {
        "source": str(src),
        "audio": str(audio),
        "durationSec": duration,
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "transcript": None,
    }
    if args.transcribe:
        meta["transcript"] = transcribe(audio, out, stem, args.diarize)

    (out / f"{stem}.job.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
