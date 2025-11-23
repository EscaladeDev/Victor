// ui-help.js
// Hover help for controls

const HELP = {
  k: "Sets the number of output colors. Lower values create flat, posterized art and smaller SVGs; higher preserves gradients and detail.",
  smooth: "Applies a small blur before quantization to reduce speckles. Higher values soften edges.",
  whiteT: "Pushes very light pixels to pure white. Great for paper scans and UIs; too high may erase highlights.",
  blackT: "Pulls very dark pixels to pure black. Good for text/line art; too high may crush shadow detail.",
  desat: "Converts to grayscale before palette selection. Useful for diagrams; results in fewer colors and simpler shapes.",
  distinctPalette: "Picks palette colors that are far apart using ΔE00 (perceptual distance).",
  lockWB: "Forces pure white and pure black into the palette when present. Keeps backgrounds clean and text crisp.",
  minDelta: "Minimum perceptual distance (ΔE00) enforced between palette entries. Higher = more distinct colors.",
  hueSep: "Minimum angular separation between palette hues (in LCh°) for chromatic colors. Avoids picking colors of the same hue.",
  chromaFloor: "Rejects colors below this chroma unless white/black. Avoids muddy grays and encourages vivid colors.",
  ltres: "Tolerance for straight segments. Lower = tighter fit (more nodes); higher = simpler geometry.",
  qtres: "Tolerance for quadratic curves. Lower keeps wavy detail; higher simplifies curves into smoother shapes.",
  pathomit: "Drops very small paths below this area threshold. Higher removes speckles; too high can lose fine dots/accents.",
  roundcoords: "Rounds SVG coordinates to fewer decimals. Smaller numbers shrink file size but can introduce stair-stepping.",
  autoprev: "Re-runs vectorization while you adjust sliders (debounced). Turn off for big edits, then click Vectorize manually."
};

function makeHelp(text) {
  const wrap = document.createElement("span");
  wrap.className = "help";
  const q = document.createElement("span");
  q.className = "q";
  q.setAttribute("tabindex", "0");
  q.textContent = "?";
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.innerHTML = text;
  wrap.appendChild(q);
  wrap.appendChild(tip);
  return wrap;
}

function addTooltipFor(id) {
  const el = $(id);
  if (!el) return;

  let anchor = null;
  if (["k", "smooth", "whiteT", "blackT", "ltres", "qtres", "pathomit", "roundcoords"].includes(id)) {
    anchor = el.previousElementSibling; // label-row
  } else if (["desat", "distinctPalette", "lockWB"].includes(id)) {
    anchor = el.parentElement;
  } else if (["minDelta", "hueSep", "chromaFloor"].includes(id)) {
    anchor = el.parentElement;
  } else if (id === "autoprev") {
    anchor = el.parentElement;
  }

  if (anchor) {
    const tipEl = makeHelp(HELP[id] || "");
    anchor.appendChild(tipEl);
  }
}

function injectHoverHelp() {
  const ids = [
    "k",
    "smooth",
    "whiteT",
    "blackT",
    "desat",
    "distinctPalette",
    "lockWB",
    "minDelta",
    "hueSep",
    "chromaFloor",
    "ltres",
    "qtres",
    "pathomit",
    "roundcoords",
    "autoprev"
  ];
  ids.forEach(addTooltipFor);
}
