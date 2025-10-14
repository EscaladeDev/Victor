Neural Vectorizer — Hosted (model integrated)

How to use:
1) Put your model file at models/vectorizer.onnx
2) Optionally edit config.json to point to a CDN URL first.
3) Serve locally: python -m http.server 8080  (open http://127.0.0.1:8080)
4) Deploy the folder to GitHub Pages.

Notes:
- Set "force_wasm": true in config.json to avoid WebGPU (useful when GPU VRAM is busy).
- A service worker caches core assets and the model after first load.
