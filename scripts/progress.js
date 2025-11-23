// progress.js
// Progress UI + run scheduling

let runToken = 0;
let runTimer = null;
const DEBOUNCE_MS = 220;

function showProgress(show) {
  const w = $("working");
  const p = $("progress");
  if (w) w.classList.toggle("show", !!show);
  if (p) p.classList.toggle("show", !!show);
  if (!show) {
    setBar(0);
    setStep(0, "idle");
    setStep(1, "idle");
    setStep(2, "idle");
  }
}

function setBar(pct) {
  const bar = $("bar");
  if (!bar) return;
  const p = Math.max(0, Math.min(100, pct));
  bar.style.width = p + "%";
}

function setWorkText(t) {
  const el = $("workText");
  if (!el) return;
  el.textContent = t;
}

function setBarPulse(on) {
  const wrap = $("barWrap");
  if (!wrap) return;
  wrap.classList.toggle("pulse", !!on);
}

function setStep(i, state) {
  const el = $("step" + i);
  if (!el) return;
  el.classList.remove("active", "done", "cached", "queued", "skip");
  if (state === "active") el.classList.add("active");
  else if (state === "done") el.classList.add("done");
  else if (state === "cached") el.classList.add("cached");
  else if (state === "queued") el.classList.add("queued");
  else if (state === "skip") el.classList.add("skip");
}

function computeKeys() {
  if (!st.file) return null;
  const img = $("raster");
  if (!img || !img.naturalWidth) return null;

  const MAX = 3000;
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const cw = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const ch = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

  const imgKey = `${img.naturalWidth}x${img.naturalHeight}|${st.file?.name || ""}|${img.src?.length || 0}`;
  const prepKey = `${imgKey}|prep:${st.whiteT}-${st.blackT}-${st.desat}-${st.smooth}`;
  const quantKey = `${prepKey}|quant:k${st.k}|lock${+st.lockWB}|d${st.minDelta}|distinct${+st.distinctPalette}|h${st.hueSep}|c${st.chromaFloor}`;

  return { imgKey, prepKey, quantKey, cw, ch };
}

function planWork() {
  const keys = computeKeys();
  if (!keys) return null;

  const willPrep = cache.prepKey !== keys.prepKey;
  const willQuant = cache.quantKey !== keys.quantKey;
  const willTrace = true;

  const hits = [];
  const misses = [];
  if (!willPrep) hits.push("preprocess");
  else misses.push("preprocess");
  if (!willQuant) hits.push("quantize");
  else misses.push("quantize");
  if (willTrace) misses.push("trace");

  return { willPrep, willQuant, willTrace, hits, misses };
}

function previewNextRun() {
  const plan = planWork();
  if (!plan) return;

  showProgress(true);
  setBarPulse(true);
  setBar(5);

  if (plan.willPrep || plan.willQuant) {
    setWorkText("Queued: " + plan.misses.join(" + "));
  } else {
    setWorkText("Queued: trace-only update");
  }

  setStep(0, plan.willPrep ? "queued" : (cache.prepKey ? "cached" : "skip"));
  setStep(1, plan.willQuant ? "queued" : (cache.quantKey ? "cached" : "skip"));
  setStep(2, "queued");
}

function yieldNow(ms = 0) {
  return new Promise((res) => {
    if (ms > 0) return setTimeout(res, ms);
    (window.requestAnimationFrame || setTimeout)(() => res(), 0);
  });
}

function scheduleRun() {
  if (!st.autoprev) return;
  if (runTimer) clearTimeout(runTimer);
  previewNextRun();
  runTimer = setTimeout(() => {
    runTimer = null;
    if (typeof runCancelable === "function") runCancelable();
  }, DEBOUNCE_MS);
}
