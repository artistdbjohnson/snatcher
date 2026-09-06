const WORKER = process.env.WORKER_URL || "";
const TOKEN = process.env.WORKER_TOKEN || "";
const MAX_SECONDS = 7200;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });

  let body;
  try { body = await readBody(req); } catch {
    return json(res, 400, { error: "invalid_json" });
  }

  const duration = Number(body.durationSec || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return json(res, 400, { error: "need_duration" });
  }
  if (duration > MAX_SECONDS) {
    return json(res, 413, { error: "over_cap", message: "Pro cap is 2 hours per file." });
  }

  const job = {
    id: `job_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    durationSec: Math.round(duration),
    format: body.format || "mp3",
    transcribe: Boolean(body.transcribe),
    diarize: Boolean(body.diarize),
    filename: String(body.filename || "clip").slice(0, 180),
    engine: "whisperx + faster-whisper large-v3-turbo",
    extract: "ffmpeg libmp3lame q2",
  };

  if (!WORKER) {
    return json(res, 200, {
      status: "awaiting_worker",
      job,
      message: "GPU worker is not connected. Run worker/pro_job.py on a box with ffmpeg + WhisperX, or set WORKER_URL.",
    });
  }

  try {
    const upstream = await fetch(`${WORKER.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(job),
    });
    const data = await upstream.json().catch(() => ({}));
    return json(res, upstream.status, data);
  } catch (e) {
    return json(res, 502, { error: "worker_unreachable", message: e.message });
  }
};
