# Escalade Vector Tools (Alpha)

Escalade Vector Tools is a client-side raster → SVG vectorizer with a perceptual color pipeline and a responsive, progress-aware UI.

It runs entirely in the browser (no server component) and wraps [ImageTracer.js](https://github.com/jankovicsandras/imagetracerjs) with:

- A **distinct-first perceptual palette** (CIEDE2000 ΔE00)
- **Hue separation** + chroma floor to avoid muddy, near-duplicate colors
- **Adjacency-aware color assignment** to reduce speckling
- **Anti-seam SVG export** (fill-colored stroke overlap)
- **Caching** between stages so preview tweaks stay fast
- A clean **Escalade-style UI** with live preview, presets, and inline hover help

> **Status:** Alpha preview. Expect rough edges and breaking changes.

---

## Features

- 🎨 **Perceptual palette**
  - Lab / LCh color math with ΔE00 distance
  - Distinct-first palette selection with min ΔE, hue separation, and chroma floor
  - Optional white/black locking for clean backgrounds and crisp text

- 🧩 **Smart quantization**
  - Adjacency-aware smoothing on the palette index map
  - Configurable number of colors (K), min ΔE, hue separation, chroma floor

- ✏️ **Vectorization controls**
  - Corner fidelity (`ltres`)
  - Curve smoothness (`qtres`)
  - Despeckle / minimum area (`pathomit`)
  - Coordinate rounding (`roundcoords`)
  - Anti-seam overlap (stroke width in px)

- ⚙️ **Performance & UX**
  - Client-side only (no uploads to a server)
  - Drag & drop + file input
  - Presets (built-in + custom, saved to `localStorage`)
  - Live preview with debounced runs and stage-aware progress bar
  - Hover tooltips for every key control

---

## Getting Started

### 1. Use the website or download the repo

> **Important:** See [Terms of Use](./TERMS_OF_USE.md) before using this code.  
> Modification and redistribution are **not permitted**.
