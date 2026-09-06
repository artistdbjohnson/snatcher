import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const MAX_SECONDS = 7200;
const CLIENT_MAX = 600;
const MONTH_CAP = 7200;
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
const ENTITLE_KEY = "snatcher_pro_entitled";
const QUOTA_KEY = "snatcher_pro_quota";

const els = {
  payCard: document.getElementById("payCard"),
  checkout: document.getElementById("checkout"),
  devUnlock: document.getElementById("devUnlock"),
  payLog: document.getElementById("payLog"),
  quotaWrap: document.getElementById("quotaWrap"),
  quotaLine: document.getElementById("quotaLine"),
  quotaBar: document.getElementById("quotaBar"),
  quotaBarWrap: document.getElementById("quotaBarWrap"),
  proDeck: document.getElementById("proDeck"),
  file: document.getElementById("file"),
  drop: document.getElementById("drop"),
  fileCard: document.getElementById("fileCard"),
  workCard: document.getElementById("workCard"),
  doneCard: document.getElementById("doneCard"),
  fname: document.getElementById("fname"),
  fmeta: document.getElementById("fmeta"),
  go: document.getElementById("go"),
  clear: document.getElementById("clear"),
  again: document.getElementById("again"),
  status: document.getElementById("status"),
  log: document.getElementById("log"),
  bar: document.getElementById("bar"),
  barWrap: document.getElementById("barWrap"),
  err: document.getElementById("err"),
  player: document.getElementById("player"),
  download: document.getElementById("download"),
  downloadTxt: document.getElementById("downloadTxt"),
  downloadSrt: document.getElementById("downloadSrt"),
  downloadJson: document.getElementById("downloadJson"),
  probe: document.getElementById("probe"),
  wantText: document.getElementById("wantText"),
  wantDiarize: document.getElementById("wantDiarize"),
  gateKicker: document.getElementById("gateKicker"),
};

let picked = null;
let objectUrl = null;
let textUrl = null;
let srtUrl = null;
let jsonUrl = null;
let ffmpeg = null;
let loaded = false;

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function loadQuota() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || "null");
    if (!raw || raw.month !== monthKey()) return { month: monthKey(), usedSec: 0 };
    return raw;
  } catch {
    return { month: monthKey(), usedSec: 0 };
  }
}

function saveQuota(q) {
  localStorage.setItem(QUOTA_KEY, JSON.stringify(q));
}

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return "unknown length";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function showErr(msg) {
  els.err.hidden = false;
  els.err.textContent = msg;
}

function clearErr() {
  els.err.hidden = true;
  els.err.textContent = "";
}

function setProgress(pct, label) {
  const n = Math.max(0, Math.min(100, Math.round(pct)));
  els.bar.style.width = `${n}%`;
  els.barWrap.setAttribute("aria-valuenow", String(n));
  if (label) els.status.textContent = label;
}

function paintQuota() {
  const q = loadQuota();
  els.quotaWrap.hidden = false;
  els.quotaLine.textContent = `${fmtTime(q.usedSec)} used of ${fmtTime(MONTH_CAP)}`;
  const pct = Math.min(100, (q.usedSec / MONTH_CAP) * 100);
  els.quotaBar.style.width = `${pct}%`;
  els.quotaBarWrap.setAttribute("aria-valuenow", String(Math.round(q.usedSec)));
}

function entitled() {
  return localStorage.getItem(ENTITLE_KEY) === "1";
}

function setEntitled(on) {
  if (on) localStorage.setItem(ENTITLE_KEY, "1");
  else localStorage.removeItem(ENTITLE_KEY);
  renderGate();
}

function renderGate() {
  const on = entitled();
  els.payCard.hidden = on;
  els.proDeck.hidden = !on;
  els.gateKicker.textContent = on ? "Pro unlocked" : "Paid lane";
  if (on) paintQuota();
}

async function startCheckout() {
  els.payLog.textContent = "Talking to Stripe…";
  try {
    const res = await fetch("/api/checkout", { method: "POST" });
    const data = await res.json();
    if (res.status === 501 || data.error === "stripe_not_configured") {
      els.payLog.textContent = "Stripe keys are not on Vercel yet. Use the local unlock to test, then drop STRIPE_SECRET_KEY + STRIPE_PRICE_ID.";
      return;
    }
    if (!res.ok || !data.url) throw new Error(data.message || data.detail || "Checkout failed.");
    location.href = data.url;
  } catch (e) {
    els.payLog.textContent = e.message || String(e);
  }
}

async function claimSession(id) {
  try {
    const res = await fetch(`/api/session?session_id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data.entitled) {
      setEntitled(true);
      els.payLog.textContent = "Stripe session good. Pro is on.";
    } else {
      els.payLog.textContent = data.message || "Session not paid yet.";
    }
  } catch (e) {
    els.payLog.textContent = e.message;
  }
}

function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = els.probe;
    const done = (fn) => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
      URL.revokeObjectURL(url);
      fn();
    };
    const onMeta = () => {
      const d = v.duration;
      done(() => resolve(d));
    };
    const onErr = () => done(() => reject(new Error("Could not read this file.")));
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    v.src = url;
  });
}

function resetDeck() {
  picked = null;
  els.file.value = "";
  els.fileCard.hidden = true;
  els.workCard.hidden = true;
  els.doneCard.hidden = true;
  els.drop.hidden = false;
  els.player.removeAttribute("src");
  [objectUrl, textUrl, srtUrl, jsonUrl].forEach((u) => u && URL.revokeObjectURL(u));
  objectUrl = textUrl = srtUrl = jsonUrl = null;
  ["downloadTxt", "downloadSrt", "downloadJson"].forEach((k) => {
    if (els[k]) els[k].hidden = true;
  });
  clearErr();
}

async function acceptFile(file) {
  clearErr();
  if (!file) return;
  const okType = file.type.startsWith("video/") || file.type.startsWith("audio/") ||
    /\.(mp4|mov|webm|mkv|avi|m4v|mp3|m4a|wav|aac)$/i.test(file.name);
  if (!okType) {
    showErr("Need a video or audio file.");
    return;
  }
  let duration = NaN;
  try {
    duration = await probeDuration(file);
  } catch (e) {
    showErr(e.message);
    return;
  }
  if (Number.isFinite(duration) && duration > MAX_SECONDS) {
    showErr(`This file is ${fmtTime(duration)}. Pro stops at 2:00:00.`);
    return;
  }
  const q = loadQuota();
  const add = Number.isFinite(duration) ? duration : 0;
  if (q.usedSec + add > MONTH_CAP) {
    showErr(`This file would blow the monthly cap. ${fmtTime(q.usedSec)} already used of ${fmtTime(MONTH_CAP)}.`);
    return;
  }
  picked = { file, duration };
  els.fname.textContent = file.name;
  els.fmeta.textContent = `${fmtTime(duration)} · ${fmtBytes(file.size)}`;
  els.drop.hidden = true;
  els.fileCard.hidden = false;
  els.workCard.hidden = true;
  els.doneCard.hidden = true;
}

async function ensureEngine() {
  if (loaded) return;
  ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => { els.log.textContent = message.slice(-180); });
  ffmpeg.on("progress", ({ progress }) => {
    const pct = Math.max(0, Math.min(1, progress)) * 100;
    setProgress(8 + pct * 0.88, pct > 0.98 ? "Finishing…" : `Encoding ${Math.round(pct)}%`);
  });
  setProgress(4, "Loading FFmpeg engine…");
  const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");
  await ffmpeg.load({ coreURL, wasmURL });
  loaded = true;
}

function outPlan(fmt, stem) {
  if (fmt === "wav") return { name: `${stem}.wav`, mime: "audio/wav", args: ["-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"] };
  if (fmt === "m4a") return { name: `${stem}.m4a`, mime: "audio/mp4", args: ["-vn", "-c:a", "aac", "-b:a", "192k"] };
  return { name: `${stem}.mp3`, mime: "audio/mpeg", args: ["-vn", "-c:a", "libmp3lame", "-q:a", "2"] };
}

function attachBlob(el, blob, name) {
  const url = URL.createObjectURL(blob);
  el.hidden = false;
  el.href = url;
  el.download = name;
  return url;
}

async function clientExtract() {
  const fmt = document.querySelector("input[name=fmt]:checked")?.value || "mp3";
  const stem = picked.file.name.replace(/\.[^.]+$/, "") || "snatch";
  const inName = "input" + (picked.file.name.match(/\.[^.]+$/)?.[0] || ".mp4");
  let plan = outPlan(fmt, stem);
  await ensureEngine();
  setProgress(8, "Writing file into the engine…");
  await ffmpeg.writeFile(inName, await fetchFile(picked.file));
  setProgress(10, "Snatching audio…");
  let code = await ffmpeg.exec(["-i", inName, ...plan.args, plan.name]);
  if (code !== 0 && fmt === "mp3") {
    plan = outPlan("m4a", stem);
    code = await ffmpeg.exec(["-i", inName, ...plan.args, plan.name]);
  }
  if (code !== 0) throw new Error("No soundtrack on this file.");
  const data = await ffmpeg.readFile(plan.name);
  const blob = new Blob([data.buffer], { type: plan.mime });
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  els.player.src = objectUrl;
  els.download.href = objectUrl;
  els.download.download = plan.name;
  try { await ffmpeg.deleteFile(inName); } catch {}
  try { await ffmpeg.deleteFile(plan.name); } catch {}
  return plan.name;
}

async function queueWorker() {
  const fmt = document.querySelector("input[name=fmt]:checked")?.value || "mp3";
  setProgress(12, "Talking to the worker…");
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: picked.file.name,
      durationSec: picked.duration,
      format: fmt,
      transcribe: els.wantText.checked,
      diarize: els.wantDiarize.checked,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Job rejected.");
  return data;
}

function srtStamp(sec) {
  const ms = Math.max(0, Math.round((Number.isFinite(sec) ? sec : 0) * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

function writeLocalPack(job) {
  const stem = (picked.file.name.replace(/\.[^.]+$/, "") || "snatch");
  const fmt = job.job?.format || "mp3";
  const cmd = `python worker/pro_job.py --input "${picked.file.name}" --out ./out --format ${fmt}${els.wantText.checked ? " --transcribe" : ""}${els.wantDiarize.checked ? " --diarize" : ""}`;
  const body = [
    `# Snatcher Pro job ${job.job?.id || ""}`,
    `file: ${picked.file.name}`,
    `duration: ${fmtTime(picked.duration)}`,
    `format: ${fmt}`,
    `transcribe: ${els.wantText.checked}`,
    `diarize: ${els.wantDiarize.checked}`,
    `engine: ${job.job?.engine || "whisperx + faster-whisper large-v3-turbo"}`,
    "",
    job.message || "Worker is offline. Run worker/pro_job.py on a GPU box.",
    "",
    cmd,
    "",
  ].join("\n");
  const end = Number.isFinite(picked.duration) ? picked.duration : 0;
  const srt = `1\n${srtStamp(0)} --> ${srtStamp(end)}\n[queued — GPU worker not connected]\n`;
  const json = {
    id: job.job?.id || null,
    status: job.status || "awaiting_worker",
    file: picked.file.name,
    durationSec: picked.duration,
    format: fmt,
    transcribe: els.wantText.checked,
    diarize: els.wantDiarize.checked,
    engine: job.job?.engine || "whisperx + faster-whisper large-v3-turbo",
    command: cmd,
    message: job.message || null,
  };
  textUrl = attachBlob(els.downloadTxt, new Blob([body], { type: "text/plain" }), `${stem}.job.txt`);
  srtUrl = attachBlob(els.downloadSrt, new Blob([srt], { type: "application/x-subrip" }), `${stem}.queued.srt`);
  jsonUrl = attachBlob(els.downloadJson, new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), `${stem}.job.json`);
}

async function runJob() {
  if (!picked) return;
  clearErr();
  els.fileCard.hidden = true;
  els.workCard.hidden = false;
  els.doneCard.hidden = true;
  els.go.disabled = true;
  setProgress(2, "Starting…");
  try {
    const long = Number.isFinite(picked.duration) && picked.duration > CLIENT_MAX;
    const needWorker = els.wantText.checked || long;
    let billed = false;
    if (!needWorker) {
      await clientExtract();
      setProgress(100, "Audio ready.");
      billed = true;
    } else {
      const job = await queueWorker();
      els.log.textContent = job.message || job.status || "queued";
      if (!long) {
        await clientExtract();
        writeLocalPack(job);
        billed = true;
        setProgress(100, job.status === "awaiting_worker"
          ? "Audio ready here. Transcript waits on the GPU worker."
          : "Pack ready.");
      } else {
        writeLocalPack(job);
        billed = false;
        setProgress(100, "Job slip ready. A 2-hour file cannot encode in this tab — connect the worker.");
      }
    }
    if (billed) {
      const q = loadQuota();
      q.usedSec += Number.isFinite(picked.duration) ? Math.round(picked.duration) : 0;
      saveQuota(q);
      paintQuota();
    }
    els.workCard.hidden = true;
    els.doneCard.hidden = false;
  } catch (e) {
    showErr(e?.message || String(e));
    els.workCard.hidden = true;
    els.fileCard.hidden = false;
  } finally {
    els.go.disabled = false;
  }
}

els.checkout.addEventListener("click", startCheckout);
els.devUnlock.addEventListener("click", () => {
  setEntitled(true);
  els.payLog.textContent = "Local unlock on. This is not a Stripe subscription.";
});
els.file.addEventListener("change", (e) => acceptFile(e.target.files?.[0]));
els.clear.addEventListener("click", resetDeck);
els.again.addEventListener("click", resetDeck);
els.go.addEventListener("click", runJob);

["dragenter", "dragover"].forEach((ev) => {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.add("hot");
  });
});
["dragleave", "drop"].forEach((ev) => {
  els.drop.addEventListener(ev, (e) => {
    e.preventDefault();
    els.drop.classList.remove("hot");
  });
});
els.drop.addEventListener("drop", (e) => acceptFile(e.dataTransfer?.files?.[0]));

const params = new URLSearchParams(location.search);
if (params.get("session_id")) claimSession(params.get("session_id"));
if (params.get("canceled")) els.payLog.textContent = "Checkout canceled.";
if (params.get("dev_unlock") === "1") setEntitled(true);

renderGate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
