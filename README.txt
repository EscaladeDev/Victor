Neural Vectorizer — Static Site (ONNX not included)

How to use
----------
1) Export your ONNX (example):
   python src\export_onnx.py --ckpt runs\palette_assign_v1\ckpts\best.pt --kmax 16 --size 256 --out vectorizer.onnx

2) Place the model at:
   models/vectorizer.onnx

3) Local test:
   python -m http.server 8080
   Open http://127.0.0.1:8080 (progress bar will show while fetching the model)

4) Deploy to GitHub Pages:
   - Commit this whole folder to a repo (or /docs)
   - Enable Pages (main branch / root or /docs)
   - Optional: use a CDN model URL (GitHub Release + jsDelivr) by editing config.json

config.json
-----------
{
  "model_urls": ["models/vectorizer.onnx"],
  "force_wasm": false
}
- force_wasm=true forces CPU backend (useful if your GPU is busy training).
- The app auto-detects input/output names and shows them in Diagnostics.

Troubleshooting
---------------
- Stuck on "Loading config…": ensure config.json is present and valid JSON
- "Model load failed": path wrong or model missing; check browser console and Diagnostics
- WebGPU vs WASM: the top-right chip tells you which backend is used
- Large model: consider CDN hosting (add CDN URL first in model_urls)

License
-------
This bundle is provided as-is, no warranty. You own your model and input images.
