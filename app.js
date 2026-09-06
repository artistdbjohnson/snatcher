import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const MAX_SECONDS = 300;
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";

const els = {
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
  probe: document.getElementById("probe"),
};

let picked = null;
let objectUrl = null;
let ffmpeg = null;
let loaded = false;

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

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return "unknown length";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
    const onErr = () => done(() => reject(new Error("Could not read this video.")));
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
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  clearErr();
}

async function acceptFile(file) {
  clearErr();
  if (!file) return;
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name)) {
    showErr("That file does not look like a video.");
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
    showErr(`This clip is ${fmtTime(duration)}. Snatcher only takes videos up to 5:00.`);
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
  ffmpeg.on("log", ({ message }) => {
    els.log.textContent = message.slice(-180);
  });
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
  if (fmt === "wav") {
    return { name: `${stem}.wav`, mime: "audio/wav", args: ["-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2"] };
  }
  if (fmt === "m4a") {
    return { name: `${stem}.m4a`, mime: "audio/mp4", args: ["-vn", "-c:a", "aac", "-b:a", "192k"] };
  }
  return { name: `${stem}.mp3`, mime: "audio/mpeg", args: ["-vn", "-c:a", "libmp3lame", "-q:a", "2"] };
}

async function snatch() {
  if (!picked) return;
  clearErr();
  els.fileCard.hidden = true;
  els.workCard.hidden = false;
  els.doneCard.hidden = true;
  els.go.disabled = true;
  setProgress(1, "Starting…");

  const fmt = document.querySelector("input[name=fmt]:checked")?.value || "mp3";
  const stem = picked.file.name.replace(/\.[^.]+$/, "") || "snatch";
  const inName = "input" + (picked.file.name.match(/\.[^.]+$/)?.[0] || ".mp4");
  let plan = outPlan(fmt, stem);

  try {
    await ensureEngine();
    setProgress(8, "Writing file into the engine…");
    await ffmpeg.writeFile(inName, await fetchFile(picked.file));
    setProgress(10, "Snatching audio…");
    let code = await ffmpeg.exec(["-i", inName, ...plan.args, plan.name]);
    if (code !== 0 && fmt === "mp3") {
      els.log.textContent = "MP3 encoder missing in this build — falling back to M4A.";
      plan = outPlan("m4a", stem);
      code = await ffmpeg.exec(["-i", inName, ...plan.args, plan.name]);
    }
    if (code !== 0) throw new Error("FFmpeg could not pull audio from this file. It may have no soundtrack.");
    const data = await ffmpeg.readFile(plan.name);
    const blob = new Blob([data.buffer], { type: plan.mime });
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    els.player.src = objectUrl;
    els.download.href = objectUrl;
    els.download.download = plan.name;
    try { await ffmpeg.deleteFile(inName); } catch {}
    try { await ffmpeg.deleteFile(plan.name); } catch {}
    setProgress(100, "Audio ready.");
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

els.file.addEventListener("change", (e) => acceptFile(e.target.files?.[0]));
els.clear.addEventListener("click", resetDeck);
els.again.addEventListener("click", resetDeck);
els.go.addEventListener("click", snatch);

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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
