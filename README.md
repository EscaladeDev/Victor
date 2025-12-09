# Escalade Vector Tools (V1.0)

Escalade Vector Tools is a high-performance, client-side raster → SVG vectorizer. It runs entirely in the browser using Web Workers to process images up to 8K resolution without sending any data to a server.

> **Status:** Alpha Build. Features may change or break. 

---

## Key Features

### 🎨 Perceptual Color Engine
- **CIEDE2000 Distance:** Uses human-perceptual color math (Lab/LCh) rather than simple RGB distance.
- **Smart Clustering:** Distinct-first palette selection avoids muddy, near-duplicate colors.
- **Adjacency Awareness:** Reduces "speckling" by considering neighbor colors during quantization.

### ✏️ Advanced Vectorization
- **Gaussian Smooth (New):** A slider to relax vector geometry organically, removing jagged "stair-steps" without the artificial "beveled" look of standard corner cutting.
- **Border Pinning:** Automatically detects points on the canvas edge and locks them to preserve clean rectangular borders for posters/cards.
- **Seam Protection:** Configurable stroke overlap to prevent white gaps between vector shapes.

### ⚡ Performance & Privacy
- **Client-Side Only:** No images are ever uploaded. Your data stays on your machine.
- **Web Workers:** Heavy processing runs in the background, keeping the UI responsive.
- **8K Support:** Capable of processing large inputs (up to 8192px).
- **Super-Sampling:** Optional 2x upscale before tracing for higher fidelity on low-res sources.

---

## User Interface & Controls

### Source
- **Input:** Drag & drop anywhere, Paste (Ctrl+V), or use the file picker.
- **Resolution:** Set internal working resolution (1024px - 8192px).
- **Super-Sample:** Upscales input 2x to capture finer details before vectorizing.

### 1. Color Fidelity
- **Colors (Max):** Target number of colors (K-means clustering).
- **Splash Tolerance:** How strictly to group similar pixel colors before vectorizing.
- **Min Area Size:** Removes small "dust" specks and noise islands.

### 2. Geometry
- **Accuracy (Fit):** Controls how closely the vector path hugs the original pixel grid.
- **Corner Smooth:** Applies Gaussian smoothing passes to relax sharp angles.
- **Roundness:** Controls curve interpretation (Quadratic Bezier vs. Straight Lines).
- **Seam Thickness:** Adds a stroke to shapes to cover rendering gaps.

---

## Getting Started

1. **Open `index.html`** in any modern browser (Chrome/Edge/Firefox).
2. **Drag and drop** an image onto the page.
3. Adjust sliders to taste.
   - *Tip:* Use "Hold to Compare" to see the original raster image.
4. Click **Download SVG** to save your vector file.

---

## License & Terms

See [Terms of Use](./TERMS_OF_USE.md).  
*Modification and redistribution of this code are not permitted without authorization.*
