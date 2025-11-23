// core-state.js
// Global helpers, state, presets, and sync

const $ = (id) => document.getElementById(id);

const st = {
  // preprocess & quantize
  k: 12,
  smooth: 1,
  whiteT: 245,
  blackT: 25,
  desat: false,
  distinctPalette: true,
  lockWB: true,
  minDelta: 18,
  hueSep: 25,
  chromaFloor: 12,

  // vectorization
  lt: 1.0,
  qt: 1.0,
  omit: 8,
  rc: 1,
  seam: 0.45,

  // UX
  autoprev: true,
  file: null,
  svg: null,
  imgReady: false,
  working: false
};

const BUILTINS = [
  { name: "Logo / Flat", s: { k: 8, smooth: 0, whiteT: 250, blackT: 15, desat: false, lt: 1.2, qt: 1.6, omit: 8, rc: 1.0, minDelta: 22, hueSep: 30, chromaFloor: 16, distinctPalette: true, lockWB: true } },
  { name: "Poster / Text", s: { k: 14, smooth: 1, whiteT: 245, blackT: 25, desat: false, lt: 1.3, qt: 1.6, omit: 10, rc: 1.0, minDelta: 20, hueSep: 28, chromaFloor: 14, distinctPalette: true, lockWB: true } },
  { name: "Illustration", s: { k: 24, smooth: 1, whiteT: 242, blackT: 22, desat: false, lt: 1.0, qt: 1.0, omit: 8, rc: 1.0, minDelta: 18, hueSep: 22, chromaFloor: 12, distinctPalette: true, lockWB: true } },
  { name: "Pixel Art", s: { k: 12, smooth: 0, whiteT: 255, blackT: 0, desat: false, lt: 0.8, qt: 0.8, omit: 0, rc: 0.5, minDelta: 24, hueSep: 34, chromaFloor: 18, distinctPalette: true, lockWB: true } }
];

const LS_KEY = "es_pv_presets_v1";

// Lightweight caches for pipeline stages
const cache = {
  imgKey: null,
  prepKey: null,
  quantKey: null,
  w: 0,
  h: 0,
  baseImData: null,
  lab: null,
  palette: null,
  idxMap: null,
  qImData: null
};

function loadCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCustomPresets(arr) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch (e) {
    // ignore
  }
}

function sync() {
  // sliders
  const map = [
    ["k", st.k, "kVal"],
    ["smooth", st.smooth, "smoothVal"],
    ["whiteT", st.whiteT, "wVal"],
    ["blackT", st.blackT, "bVal"],
    ["ltres", st.lt, "ltVal"],
    ["qtres", st.qt, "qtVal"],
    ["pathomit", st.omit, "omitVal"],
    ["roundcoords", st.rc, "rcVal"],
    ["seam", st.seam, "seamVal"],
    ["minDelta", st.minDelta, "minDeltaVal"],
    ["hueSep", st.hueSep, "hueSepVal"],
    ["chromaFloor", st.chromaFloor, "chromaFloorVal"]
  ];
  for (const [id, val, vid] of map) {
    const el = $(id);
    if (el) el.value = String(val);
    const ro = $(vid);
    if (ro) {
      if (id === "ltres" || id === "qtres") {
        ro.textContent = Number(val).toFixed(2);
      } else {
        ro.textContent = String(val);
      }
    }
  }

  const desat = $("desat");
  if (desat) desat.checked = st.desat;
  const distinct = $("distinctPalette");
  if (distinct) distinct.checked = st.distinctPalette;
  const lockWB = $("lockWB");
  if (lockWB) lockWB.checked = st.lockWB;
  const autoprev = $("autoprev");
  if (autoprev) autoprev.checked = st.autoprev;

  const dl = $("downloadBtn");
  const topDl = $("downloadBtnTop");
  if (dl) {
    dl.disabled = !st.svg;
    dl.classList.toggle("disabled", !st.svg);
  }
  if (topDl) {
    topDl.style.display = st.svg ? "inline-flex" : "none";
  }
}

function populatePresetSelect(selectName = null) {
  const sel = $("presetSelect");
  if (!sel) return;
  sel.innerHTML = "";

  const bgrp = document.createElement("optgroup");
  bgrp.label = "Built-in";
  BUILTINS.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = "b:" + i;
    opt.textContent = p.name;
    bgrp.appendChild(opt);
  });
  sel.appendChild(bgrp);

  const custom = loadCustomPresets();
  if (custom.length) {
    const cgrp = document.createElement("optgroup");
    cgrp.label = "Custom";
    custom.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = "c:" + i;
      opt.textContent = p.name;
      cgrp.appendChild(opt);
    });
    sel.appendChild(cgrp);
  }

  if (selectName) {
    [...sel.options].forEach((o) => {
      if (o.textContent === selectName) sel.value = o.value;
    });
  } else {
    sel.selectedIndex = 1; // Poster/Text default
  }
}

function applySettings(S) {
  Object.assign(st, S);
  sync();
  if (typeof scheduleRun === "function") scheduleRun();
}
