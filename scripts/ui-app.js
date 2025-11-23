// ui-app.js
// Main wiring + pipeline + file handling

async function run(myToken) {
  if (!st.file || !st.imgReady) return;
  if (typeof window.ImageTracer === "undefined") {
    alertErr("Vectorization engine not loaded");
    return;
  }
  if (st.working) return;

  st.working = true;
  const btn = $("runBtn");
  if (btn) {
    btn.textContent = "Vectorizing…";
    btn.disabled = true;
  }

  try {
    const img = $("raster");
    const canvas = $("work");
    if (!img || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const MAX = 3000;
    const scale = Math.min(
      1,
      MAX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
    );
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    canvas.height = Math.max(
      1,
      Math.round((img.naturalHeight || 1) * scale)
    );

    const imgKey = `${img.naturalWidth}x${img.naturalHeight}|${st.file?.name || ""}|${img.src?.length || 0}`;
    const prepKey = `${imgKey}|prep:${st.whiteT}-${st.blackT}-${st.desat}-${st.smooth}`;
    const quantKey = `${prepKey}|quant:k${st.k}|lock${+st.lockWB}|d${st.minDelta}|distinct${+st.distinctPalette}|h${st.hueSep}|c${st.chromaFloor}`;

    // Draw once
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await yieldNow();

    // Preprocess
    if (cache.prepKey !== prepKey) {
      setStep(0, "active");
      setBarPulse(false);
      setWorkText("Preprocess…");
      setBar(20);

      let imdata = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imdata.data;

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        const a = d[i + 3];
        if (a < 10) continue;

        if (st.desat) {
          const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
          r = g = b = y;
        }

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const s = max === 0 ? 0 : (max - min) / max;

        if (
          (r >= st.whiteT && g >= st.whiteT && b >= st.whiteT) ||
          (s < 0.12 &&
            r >= st.whiteT - 5 &&
            g >= st.whiteT - 5 &&
            b >= st.whiteT - 5)
        ) {
          r = g = b = 255;
        } else if (
          (r <= st.blackT && g <= st.blackT && b <= st.blackT) ||
          (s < 0.12 &&
            r <= st.blackT + 5 &&
            g <= st.blackT + 5 &&
            b <= st.blackT + 5)
        ) {
          r = g = b = 0;
        }

        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }

      smoothImage(imdata.data, canvas.width, canvas.height, st.smooth);
      cache.baseImData = cloneImageData(imdata);
      cache.w = canvas.width;
      cache.h = canvas.height;

      // build Lab buffer
      const N = cache.w * cache.h;
      const lab = new Float32Array(N * 3);
      const dd = cache.baseImData.data;
      for (let i = 0; i < N; i++) {
        const j = i * 4;
        const L = rgb2lab(dd[j], dd[j + 1], dd[j + 2]);
        lab[i * 3] = L[0];
        lab[i * 3 + 1] = L[1];
        lab[i * 3 + 2] = L[2];
      }
      cache.lab = lab;
      cache.palette = null;
      cache.idxMap = null;
      cache.qImData = null;
      cache.prepKey = prepKey;
      cache.imgKey = imgKey;

      setBar(40);
      setStep(0, "done");
      await yieldNow();
    } else {
      setStep(0, "cached");
    }

    // Quantize
    if (cache.quantKey !== quantKey) {
      setStep(1, "active");
      setWorkText("Quantize…");
      setBar(60);

      const distinct = !!st.distinctPalette;
      const { palette, idxMap, qImData } = quantizeFromLab(
        cache.lab,
        cache.w,
        cache.h,
        st.k,
        {
          lockWB: st.lockWB,
          minDelta: st.minDelta,
          hueSep: st.hueSep,
          chromaFloor: st.chromaFloor,
          stride: 2,
          distinctMode: distinct
        }
      );

      cache.palette = palette;
      cache.idxMap = idxMap;
      cache.qImData = qImData;
      cache.quantKey = quantKey;

      setBar(80);
      setStep(1, "done");
      await yieldNow();
    } else {
      setStep(1, "cached");
    }

    // Trace
    setStep(2, "active");
    setWorkText("Trace…");

    const svgraw = ImageTracer.imagedataToSVG(cache.qImData, {
      numberofcolors: st.k,
      ltres: st.lt,
      qtres: st.qt,
      pathomit: st.omit,
      blurradius: 0,
      blurdelta: 64,
      roundcoords: Math.min(st.rc, 3),
      viewbox: true,
      desc: true
    });

    const svgstr = postProcessSVG(svgraw, {
      bg: "#0a1224",
      strokeWidth: st.seam
    });

    st.svg = svgstr;
    const svgWrap = $("svgwrap");
    const svgEmpty = $("svgEmpty");
    if (svgWrap) svgWrap.innerHTML = svgstr;
    if (svgEmpty) svgEmpty.style.display = "none";

    setBar(100);
    setStep(2, "done");
    setWorkText("Done");
  } catch (err) {
    console.error(err);
    alertErr("Vectorization failed — " + (err?.message || String(err)));
  } finally {
    st.working = false;
    const btn = $("runBtn");
    if (btn) {
      btn.textContent = "Vectorize";
      btn.disabled = false;
    }
    sync();
  }
}

function runCancelable() {
  const myToken = ++runToken;
  const svgWrap = $("svgwrap");
  if (svgWrap) svgWrap.innerHTML = "";
  const svgEmpty = $("svgEmpty");
  if (svgEmpty) svgEmpty.style.display = "grid";

  showProgress(true);
  setBarPulse(false);
  setWorkText("Starting…");
  setBar(10);

  (async () => {
    try {
      await run(myToken);
    } finally {
      if (myToken === runToken) {
        showProgress(false);
        setBarPulse(false);
      }
    }
  })();
}

// ---- UI wiring ----

function alertErr(msg) {
  const e = $("err");
  if (!e) return;
  e.classList.remove("hidden");
  e.textContent = msg;
  setTimeout(() => e.classList.add("hidden"), 5000);
}

function updateMeta() {
  const el = $("rasterMeta");
  const img = $("raster");
  if (st.file && img && img.naturalWidth) {
    el.textContent = `${st.file.name} — ${img.naturalWidth}×${img.naturalHeight}px`;
  } else if (el) {
    el.textContent = "No image loaded";
  }
}

function handleFile(f) {
  st.file = f || null;
  st.svg = null;
  st.imgReady = false;
  sync();

  const svgWrap = $("svgwrap");
  const svgEmpty = $("svgEmpty");
  if (svgWrap) svgWrap.innerHTML = "";
  if (svgEmpty) svgEmpty.style.display = "grid";

  // bust caches
  cache.imgKey = cache.prepKey = cache.quantKey = null;
  cache.baseImData = cache.lab = cache.palette = cache.idxMap = cache.qImData = null;

  const rasterWrap = $("rasterWrap");
  const rasterEmpty = $("rasterEmpty");
  const raster = $("raster");

  if (!f) {
    if (rasterWrap) rasterWrap.style.display = "none";
    if (rasterEmpty) rasterEmpty.style.display = "grid";
    if (raster) raster.src = "";
    updateMeta();
    return;
  }

  const r = new FileReader();
  r.onload = () => {
    if (!raster) return;
    raster.onload = async () => {
      st.imgReady = true;
      if (rasterWrap) rasterWrap.style.display = "flex";
      if (rasterEmpty) rasterEmpty.style.display = "none";
      updateMeta();
      await yieldNow();
      if (st.autoprev) runCancelable();
    };
    raster.src = String(r.result);
  };
  r.readAsDataURL(f);
}

function resetAllControls() {
  Object.assign(st, {
    k: 12,
    smooth: 1,
    whiteT: 245,
    blackT: 25,
    desat: false,
    lt: 1.0,
    qt: 1.0,
    omit: 8,
    rc: 1,
    seam: 0.45,
    distinctPalette: true,
    lockWB: true,
    minDelta: 18,
    hueSep: 25,
    chromaFloor: 12
  });
  sync();
  scheduleRun();
}

function wireUI() {
  const presetSelect = $("presetSelect");
  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v.startsWith("b:")) {
        const i = +v.split(":")[1];
        applySettings(BUILTINS[i].s);
      } else if (v.startsWith("c:")) {
        const i = +v.split(":")[1];
        const arr = loadCustomPresets();
        if (arr[i]) applySettings(arr[i].s);
      }
    });
  }

  const savePreset = $("savePreset");
  if (savePreset) {
    savePreset.addEventListener("click", () => {
      const name = prompt("Preset name:");
      if (!name) return;
      const arr = loadCustomPresets();
      const idx = arr.findIndex(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      );
      const obj = {
        name,
        s: {
          k: st.k,
          smooth: st.smooth,
          whiteT: st.whiteT,
          blackT: st.blackT,
          desat: st.desat,
          lt: st.lt,
          qt: st.qt,
          omit: st.omit,
          rc: Math.min(st.rc, 3),
          minDelta: st.minDelta,
          hueSep: st.hueSep,
          chromaFloor: st.chromaFloor,
          distinctPalette: st.distinctPalette,
          lockWB: st.lockWB
        }
      };
      if (idx >= 0) arr[idx] = obj;
      else arr.push(obj);
      saveCustomPresets(arr);
      populatePresetSelect(name);
    });
  }

  const fileInput = $("file");
  if (fileInput) {
    fileInput.addEventListener("change", (ev) => {
      handleFile(ev.target.files?.[0] || null);
    });
  }

  const dropZone = document.querySelector("#rasterEmpty");
  if (dropZone) {
    ["dragenter", "dragover"].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.style.border =
          "2px dashed rgba(255,255,255,.45)";
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.style.border = "";
      })
    );
    dropZone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    });
  }

  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      st.file = null;
      st.svg = null;
      st.imgReady = false;
      const fi = $("file");
      const raster = $("raster");
      if (fi) fi.value = "";
      if (raster) raster.src = "";
      const rasterWrap = $("rasterWrap");
      const rasterEmpty = $("rasterEmpty");
      if (rasterWrap) rasterWrap.style.display = "none";
      if (rasterEmpty) rasterEmpty.style.display = "grid";
      const svgWrap = $("svgwrap");
      const svgEmpty = $("svgEmpty");
      if (svgWrap) svgWrap.innerHTML = "";
      if (svgEmpty) svgEmpty.style.display = "grid";
      updateMeta();
      sync();
      cache.imgKey = cache.prepKey = cache.quantKey = null;
      cache.baseImData = cache.lab = cache.palette = cache.idxMap = cache.qImData = null;
    });
  }

  const resetAll = $("resetAll");
  if (resetAll) {
    resetAll.addEventListener("click", resetAllControls);
  }

  const runBtn = $("runBtn");
  if (runBtn) {
    runBtn.addEventListener("click", () => {
      runCancelable();
    });
  }

  const downloadBtn = $("downloadBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (!st.svg) return;
      const blob = new Blob([st.svg], {
        type: "image/svg+xml;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (st.file?.name?.replace(/\.[^.]+$/, "") || "vectorized") +
        ".svg";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const downloadBtnTop = $("downloadBtnTop");
  if (downloadBtnTop) {
    downloadBtnTop.addEventListener("click", () => {
      const dl = $("downloadBtn");
      if (dl) dl.click();
    });
  }

  // sliders -> state
  const sliderMap = [
    ["k", "k"],
    ["smooth", "smooth"],
    ["whiteT", "whiteT"],
    ["blackT", "blackT"],
    ["ltres", "lt"],
    ["qtres", "qt"],
    ["pathomit", "omit"],
    ["roundcoords", "rc"],
    ["seam", "seam"]
  ];
  sliderMap.forEach(([id, prop]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", (e) => {
      const v = e.target.value;
      if (prop === "lt" || prop === "qt" || prop === "seam") {
        st[prop] = +v;
      } else {
        st[prop] = +v;
      }
      sync();
      scheduleRun();
    });
  });

  const desat = $("desat");
  if (desat) {
    desat.addEventListener("change", (e) => {
      st.desat = e.target.checked;
      scheduleRun();
    });
  }
  const distinct = $("distinctPalette");
  if (distinct) {
    distinct.addEventListener("change", (e) => {
      st.distinctPalette = e.target.checked;
      scheduleRun();
    });
  }
  const lockWB = $("lockWB");
  if (lockWB) {
    lockWB.addEventListener("change", (e) => {
      st.lockWB = e.target.checked;
      scheduleRun();
    });
  }

  const minDelta = $("minDelta");
  if (minDelta) {
    minDelta.addEventListener("input", (e) => {
      st.minDelta = +e.target.value;
      const out = $("minDeltaVal");
      if (out) out.textContent = st.minDelta;
      scheduleRun();
    });
  }
  const hueSep = $("hueSep");
  if (hueSep) {
    hueSep.addEventListener("input", (e) => {
      st.hueSep = +e.target.value;
      const out = $("hueSepVal");
      if (out) out.textContent = st.hueSep;
      scheduleRun();
    });
  }
  const chromaFloor = $("chromaFloor");
  if (chromaFloor) {
    chromaFloor.addEventListener("input", (e) => {
      st.chromaFloor = +e.target.value;
      const out = $("chromaFloorVal");
      if (out) out.textContent = st.chromaFloor;
      scheduleRun();
    });
  }

  const autoprev = $("autoprev");
  if (autoprev) {
    autoprev.addEventListener("change", (e) => {
      st.autoprev = e.target.checked;
    });
  }
}

function initApp() {
  populatePresetSelect();
  applySettings(BUILTINS[1].s); // Poster/Text default
  sync();
  const rasterWrap = $("rasterWrap");
  const rasterEmpty = $("rasterEmpty");
  const svgEmpty = $("svgEmpty");
  if (rasterWrap) rasterWrap.style.display = "none";
  if (rasterEmpty) rasterEmpty.style.display = "grid";
  if (svgEmpty) svgEmpty.style.display = "grid";
  injectHoverHelp();
  wireUI();
}

window.addEventListener("DOMContentLoaded", initApp);
