const $ = (s)=>document.querySelector(s);
const statusEl = $("#status");
const providerEl = $("#provider");
const diag = $("#diag");
const drop = $("#drop");
const fileInput = $("#file");
const inputs = $("#inputs");
const gallery = $("#gallery");
const runBtn = $("#run");
const epsIn = $("#eps"), epsVal = $("#epsVal");
const areaIn = $("#minArea"), areaVal = $("#areaVal");
const opIn = $("#opacity"), opVal = $("#opVal");
const toast = $(".toast");
const bar = $("#bar");

let session = null;
let outNames = [];
let xName = null, tName = null;
let modelSize = 256;

function setStatus(txt){ statusEl.textContent = txt; }
function setProvider(txt){ providerEl.textContent = txt; }
function log(...args){ diag.textContent += args.join(" ") + "\n"; diag.scrollTop = diag.scrollHeight; console.log(...args); }
function showToast(msg, ms=5000){ toast.textContent = msg; toast.classList.remove("hidden"); setTimeout(()=>toast.classList.add("hidden"), ms); }
function onRangeSync(inp, lab){ lab.textContent = inp.value; inp.addEventListener("input", ()=>lab.textContent = inp.value); }
onRangeSync(epsIn, epsVal);
onRangeSync(areaIn, areaVal);
onRangeSync(opIn, opVal);

drop.addEventListener("dragover", (e)=>{ e.preventDefault(); drop.classList.add("hover"); });
drop.addEventListener("dragleave", ()=> drop.classList.remove("hover"));
drop.addEventListener("drop", (e)=>{ e.preventDefault(); drop.classList.remove("hover"); fileInput.files = e.dataTransfer.files; renderInputs(); });
fileInput.addEventListener("change", renderInputs);

async function loadImageAsThumb(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url; await img.decode();
  URL.revokeObjectURL(url);
  const canvas = document.createElement("canvas");
  const w = 256, h = 256;
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext("2d");
  const s = Math.min(w/img.naturalWidth, h/img.naturalHeight);
  const nw = Math.round(img.naturalWidth*s), nh = Math.round(img.naturalHeight*s);
  ctx.drawImage(img, 0,0,img.naturalWidth,img.naturalHeight, (w-nw)/2,(h-nh)/2,nw,nh);
  return canvas.toDataURL("image/png");
}
async function renderInputs(){
  inputs.innerHTML = "";
  const files = Array.from(fileInput.files || []);
  for(const f of files){
    const url = await loadImageAsThumb(f);
    const card = document.createElement("div");
    card.className="card";
    card.innerHTML = `<img class="thumb" src="${url}" alt="input"/>
      <div class="meta"><span class="badge">${f.name}</span><span class="badge">${(f.size/1024|0)} KB</span></div>`;
    inputs.appendChild(card);
  }
}

function labToRgbPixel(L,a,b){
  const refX=95.047, refY=100.0, refZ=108.883;
  const fy = (L + 16) / 116;
  const fx = fy + (a / 500);
  const fz = fy - (b / 200);
  const e = 216/24389, k=24389/27;
  function finv(t){ const t3=t*t*t; return t3>e ? t3 : (116*t-16)/k; }
  let X = refX * finv(fx) / 100.0;
  let Y = refY * finv(fy) / 100.0;
  let Z = refZ * finv(fz) / 100.0;
  let r =  3.2406*X + -1.5372*Y + -0.4986*Z;
  let g = -0.9689*X +  1.8758*Y +  0.0415*Z;
  let b2=  0.0557*X + -0.2040*Y +  1.0570*Z;
  function gamma(u){ return u<=0.0031308 ? 12.92*u : 1.055*Math.pow(u,1/2.4) - 0.055; }
  r = Math.min(1, Math.max(0, gamma(r)));
  g = Math.min(1, Math.max(0, gamma(g)));
  b2= Math.min(1, Math.max(0, gamma(b2)));
  return [r,g,b2];
}
function labPaletteToHex(pal){
  const out=[];
  for(let k=0;k<pal.length/3;k++){
    const L=pal[k*3+0], a=pal[k*3+1], b=pal[k*3+2];
    const [r,g,b]=labToRgbPixel(L,a,b);
    const R=(r*255)|0, G=(g*255)|0, B=(b*255)|0;
    out.push("#"+[R,G,B].map(v=>v.toString(16).padStart(2,"0")).join(""));
  }
  return out;
}

async function loadImageAsCanvas(file){
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url; await img.decode();
  const W=img.naturalWidth, H=img.naturalHeight;
  const S=modelSize;
  const scale = Math.min(S/W, S/H);
  const nw = Math.max(1, Math.round(W*scale));
  const nh = Math.max(1, Math.round(H*scale));
  const padX = Math.floor((S-nw)/2);
  const padY = Math.floor((S-nh)/2);
  const canvas = document.createElement("canvas");
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,S,S);
  ctx.drawImage(img, 0,0,W,H, padX, padY, nw, nh);
  URL.revokeObjectURL(url);
  return {canvas, meta:{orig_w:W, orig_h:H, size:S, scale:scale, pad_x:padX, pad_y:padY}};
}
function tensorFromCanvasRGB01(canvas){
  const {width:w,height:h} = canvas;
  const ctx=canvas.getContext("2d");
  const img=ctx.getImageData(0,0,w,h).data;
  const out = new Float32Array(1*3*w*h);
  let oR=0, oG=w*h, oB=2*w*h;
  for(let i=0,px=0; px<w*h; px++,i+=4){
    out[oR+px]=img[i]/255;
    out[oG+px]=img[i+1]/255;
    out[oB+px]=img[i+2]/255;
  }
  return out;
}
function argmaxK(A, K, H, W){
  const idx = new Int32Array(H*W);
  for(let i=0;i<H*W;i++) idx[i]=0;
  for(let k=1;k<K;k++){
    for(let i=0;i<H*W;i++){
      const prevK = idx[i];
      if(A[k*H*W + i] > A[prevK*H*W + i]) idx[i]=k;
    }
  }
  return idx;
}
function marchingSquaresPaths(mask, W, H){
  const paths=[];
  function bit(x,y){ return (x>=0 && x<W && y>=0 && y<H) ? mask[y*W+x] : 0; }
  for(let y=0;y<H-1;y++){
    for(let x=0;x<W-1;x++){
      const tl = bit(x,y)>0 ? 1:0;
      const tr = bit(x+1,y)>0 ? 1:0;
      const br = bit(x+1,y+1)>0 ? 1:0;
      const bl = bit(x,y+1)>0 ? 1:0;
      const code = (tl<<3)|(tr<<2)|(br<<1)|bl;
      if(code===0 || code===15) continue;
      const pts=[[x+0.5,y],[x+1,y+0.5],[x+0.5,y+1],[x,y+0.5]];
      paths.push(pts);
    }
  }
  return paths;
}
function simplifyDP(points, eps){
  if(points.length<=2) return points;
  const sqeps = eps*eps;
  function d2(p,a,b){
    const [x,y]=p, [x1,y1]=a, [x2,y2]=b;
    const A=x-x1, B=y-y1, C=x2-x1, D=y2-y1;
    const dot=A*C+B*D, len=C*C+D*D;
    let t = len ? dot/len : 0;
    t = Math.max(0, Math.min(1, t));
    const xx=x1+t*C, yy=y1+t*D;
    const dx=x-xx, dy=y-yy;
    return dx*dx+dy*dy;
  }
  function rec(pts, s, e, out){
    let maxd=0, idx=-1;
    for(let i=s+1;i<e;i++){
      const d=d2(pts[i], pts[s], pts[e]);
      if(d>maxd){ maxd=d; idx=i; }
    }
    if(maxd>sqeps){
      rec(pts, s, idx, out);
      out.push(pts[idx]);
      rec(pts, idx, e, out);
    }
  }
  const res=[points[0]];
  rec(points, 0, points.length-1, res);
  res.push(points[points.length-1]);
  return res;
}
function contentMask(meta){
  const m = new Uint8Array(meta.size*meta.size);
  const px=meta.pad_x, py=meta.pad_y;
  const nw=Math.round(meta.orig_w*meta.scale), nh=Math.round(meta.orig_h*meta.scale);
  for(let y=py;y<py+nh;y++){
    for(let x=px;x<nw+px;x++){ m[y*meta.size + x]=1; }
  }
  return m;
}
function toOrig(pts, meta){
  const s=meta.scale, px=meta.pad_x, py=meta.pad_y, W0=meta.orig_w, H0=meta.orig_h;
  return pts.map(([x,y])=>{
    const x0=(x - px)/s, y0=(y - py)/s;
    return [Math.min(W0, Math.max(0, x0)), Math.min(H0, Math.max(0, y0))];
  });
}

async function createSessionFromArrayBuffer(buf, forceWasm=false){
  const eps = [];
  if(!forceWasm){
    const webgpuOk = await ort.env.webgpu.isWebGPUSupported();
    if(webgpuOk) eps.push("webgpu");
  }
  eps.push("wasm");
  ort.env.wasm.numThreads = 1;
  const sess = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: eps });
  setProvider((eps[0]==="webgpu") ? "WebGPU" : "WASM");
  return sess;
}

function chooseInputNames(names){
  xName = names.find(n=>/x|input|image|rgb/i.test(n)) || names[0];
  const mayTemp = names.find(n=>/temp|tau|temperature/i.test(n));
  tName = mayTemp || (names.length>1 ? names[1] : null);
  if(names.length===1) tName=null;
  log("Feed mapping:", JSON.stringify({xName, tName}));
}

async function fetchWithProgress(url){
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = +(res.headers.get("Content-Length")||0);
  if (!res.body || !res.body.getReader) {
    // no streaming (older browsers / some CDNs), just return arrayBuffer
    bar.style.width = total ? "50%" : "0%";
    const buf = await res.arrayBuffer();
    bar.style.width = "100%";
    return buf;
  }
  const reader = res.body.getReader();
  let received = 0;
  const chunks = [];
  while(true){
    const {done, value} = await reader.read();
    if(done) break;
    chunks.push(value);
    received += value.length;
    if(total){ bar.style.width = Math.min(100, (received/total*100)).toFixed(1) + "%"; }
  }
  const blob = new Blob(chunks);
  bar.style.width = "100%";
  return await blob.arrayBuffer();
}

async function loadFromConfig(){
  try{
    const cfgRes = await fetch("config.json", {cache:"no-store"});
    let cfg = {model_urls:["models/vectorizer.onnx"], force_wasm:false};
    if(cfgRes.ok){ cfg = await cfgRes.json(); }
    setStatus("Fetching model…");
    let lastErr = null;
    for(const url of cfg.model_urls){
      try{
        log("Fetching:", url);
        bar.style.width = "0%";
        const buf = await fetchWithProgress(url);
        setStatus("Creating session…");
        session = await createSessionFromArrayBuffer(buf, !!cfg.force_wasm);
        outNames = session.outputNames;
        chooseInputNames(session.inputNames);
        setStatus("Model ready");
        log("Inputs:", session.inputNames.join(", "));
        log("Outputs:", outNames.join(", "));
        return;
      }catch(e){
        lastErr = e;
        log("Failed:", url, e.message);
      }
    }
    throw lastErr || new Error("No model_urls worked");
  }catch(e){
    setStatus("Load failed");
    showToast("Model load failed: " + e.message);
    log("Model load failed:", e);
  }
}

window.addEventListener("DOMContentLoaded", loadFromConfig);

function getOutputs(out){
  let pal = out["palette_lab"] || out[outNames.find(n=>/palette/i.test(n))];
  let A   = out["assignments"] || out[outNames.find(n=>/assign/i.test(n))];
  let lab = out["recon_lab"]   || out[outNames.find(n=>/recon|rgb|lab/i.test(n))];
  if(!pal || !A){ throw new Error("Model outputs not recognized. Expect palette_lab and assignments."); }
  return {pal, A, lab};
}

async function runOne(file){
  if(!session) throw new Error("Load a model first.");
  const {canvas, meta} = await loadImageAsCanvas(file);
  const S = meta.size;
  const x = tensorFromCanvasRGB01(canvas);
  const feeds = {};
  feeds[xName] = new ort.Tensor("float32", x, [1,3,S,S]);
  if(tName) feeds[tName] = new ort.Tensor("float32", new Float32Array([1.0]), [1]);
  const out = await session.run(feeds);
  const {pal, A} = getOutputs(out);

  const palData = pal.data;
  const K = pal.dims.at(-2) || pal.dims.at(-1);
  const lab = new Float32Array(K*3);
  if(pal.dims.length===3){ for(let k=0;k<K;k++){ lab[k*3+0]=palData[k*3+0]; lab[k*3+1]=palData[k*3+1]; lab[k*3+2]=palData[k*3+2]; } }
  else { lab.set(palData); }
  const colors = labPaletteToHex(lab);

  const dims = A.dims;
  const KA = dims.at(-3), H = dims.at(-2), W = dims.at(-1);
  const Ad = A.data;
  const flatA = new Float32Array(KA*H*W);
  if(dims.length===4) flatA.set(Ad.slice(0, KA*H*W)); else flatA.set(Ad);
  const idx = argmaxK(flatA, KA, H, W);

  const content = contentMask(meta);
  const eps = parseFloat(epsIn.value);
  const minArea = parseInt(areaIn.value,10);
  const opacity = parseFloat(opIn.value);

  const svgParts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.orig_w}" height="${meta.orig_h}" viewBox="0 0 ${meta.orig_w} ${meta.orig_h}">`];
  for(let k=0;k<KA;k++){
    const mask = new Uint8Array(H*W);
    for(let i=0;i<H*W;i++){ mask[i] = (idx[i]===k && content[i]) ? 1 : 0; }
    const paths = marchingSquaresPaths(mask, W, H);
    if(!paths.length) continue;
    svgParts.push(`  <g fill="${colors[k % colors.length]}" fill-opacity="${opacity.toFixed(3)}" stroke="none">`);
    for(const pts of paths){
      if(pts.length<4) continue;
      let area=0; for(let i=0;i<pts.length;i++){ const [x1,y1]=pts[i], [x2,y2]=pts[(i+1)%pts.length]; area+=x1*y2-x2*y1; }
      if(Math.abs(area) < minArea) continue;
      const simp = simplifyDP(pts, eps);
      const orig = toOrig(simp, meta);
      const d = "M " + orig.map(([x,y])=>`${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ") + " Z";
      svgParts.push(`    <path d="${d}"/>`);
    }
    svgParts.push("  </g>");
  }
  svgParts.push("</svg>");
  const svg = svgParts.join("\n");

  const prev = document.createElement("canvas");
  prev.width = meta.orig_w; prev.height = meta.orig_h;
  const ctx = prev.getContext("2d");
  const imgData = ctx.createImageData(S, S);
  const palRGB = colors.map(hex=>[parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]);
  for(let y=0;y<S;y++){
    for(let x2=0;x2<S;x2++){
      const k2 = idx[y*S + x2];
      const i = (y*S + x2)*4;
      const [r,g,b]=palRGB[k2 % palRGB.length];
      imgData.data[i]=r; imgData.data[i+1]=g; imgData.data[i+2]=b; imgData.data[i+3]=255;
    }
  }
  const tmp = document.createElement("canvas"); tmp.width=S; tmp.height=S;
  tmp.getContext("2d").putImageData(imgData,0,0);
  const nw=Math.round(meta.orig_w*meta.scale), nh=Math.round(meta.orig_h*meta.scale);
  ctx.clearRect(0,0,prev.width,prev.height);
  ctx.drawImage(tmp, meta.pad_x, meta.pad_y, nw, nh);

  const card = document.createElement("div");
  card.className="card";
  const blob = new Blob([svg], {type: "image/svg+xml"});
  const url = URL.createObjectURL(blob);
  card.innerHTML = `
    <img class="thumb" src="${prev.toDataURL("image/png")}" alt="preview"/>
    <div class="meta">
      <span class="badge">${file.name}</span>
      <a href="${url}" download="${file.name.replace(/\.[^.]+$/,'')}.svg">Download SVG</a>
    </div>`;
  gallery.appendChild(card);
}

runBtn.addEventListener("click", async ()=>{
  if(!session){ showToast("Model not ready yet."); return; }
  const files = Array.from(fileInput.files || []);
  if(!files.length){ showToast("Pick images first."); return; }
  runBtn.disabled = true; runBtn.textContent = "Running…";
  try{
    gallery.innerHTML = "";
    for(const f of files){ await runOne(f); }
  }catch(err){
    console.error(err);
    showToast("Error: " + err.message);
    log("Run error:", err.message);
  }finally{
    runBtn.disabled = false; runBtn.textContent = "Run";
  }
});
