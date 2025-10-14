/* Minimal helpers */
const $ = (s)=>document.querySelector(s);
const statusEl=$("#status"), providerEl=$("#provider"), diag=$("#diag"), bar=$("#bar");
const drop=$("#drop"), fileInput=$("#file"), inputs=$("#inputs"), gallery=$("#gallery");
const runBtn=$("#run"), clearBtn=$("#clear"), forceWasm=$("#forceWasm");
const epsIn=$("#eps"), epsVal=$("#epsVal"); const areaIn=$("#minArea"), areaVal=$("#minAreaVal");
const opIn=$("#opacity"), opVal=$("#opacityVal"); const snapW=$("#snapW"), snapWVal=$("#snapWVal");
const snapB=$("#snapB"), snapBVal=$("#snapBVal"); const modelSizeEl=$("#modelSize"), modelOutsEl=$("#modelOuts");
const toast=$("#toast");
let session=null, xName=null, tName=null, outNames=[], MODEL_SIZE=256;

function setStatus(t){ statusEl.textContent=t; }
function setProvider(t){ providerEl.textContent=t; }
function log(...a){ diag.textContent += a.join(" ")+"\n"; diag.scrollTop = diag.scrollHeight; }
function onRangeSync(inp,lab){ const sync=()=>lab.textContent=inp.value; sync(); inp.addEventListener("input",sync); }
onRangeSync(epsIn,epsVal); onRangeSync(areaIn,areaVal); onRangeSync(opIn,opVal); onRangeSync(snapW,snapWVal); onRangeSync(snapB,snapBVal);

drop.addEventListener("dragover", e=>{e.preventDefault(); drop.classList.add("hover");});
drop.addEventListener("dragleave", ()=>drop.classList.remove("hover"));
drop.addEventListener("drop", e=>{ e.preventDefault(); drop.classList.remove("hover"); fileInput.files=e.dataTransfer.files; renderInputs(); });
fileInput.addEventListener("change", renderInputs);
clearBtn.addEventListener("click", ()=>{ fileInput.value=""; inputs.innerHTML=""; gallery.innerHTML=""; });

function showToast(m,ms=5000){ toast.textContent=m; toast.classList.remove("hidden"); setTimeout(()=>toast.classList.add("hidden"), ms); }

async function thumb(file){
  const url=URL.createObjectURL(file); const img=new Image(); img.src=url; await img.decode();
  URL.revokeObjectURL(url); const c=document.createElement("canvas"); c.width=256; c.height=256;
  const ctx=c.getContext("2d"); const s=Math.min(256/img.naturalWidth,256/img.naturalHeight);
  const nw=Math.round(img.naturalWidth*s), nh=Math.round(img.naturalHeight*s);
  ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight,(256-nw)/2,(256-nh)/2,nw,nh);
  return c.toDataURL("image/png");
}
async function renderInputs(){
  inputs.innerHTML=""; for(const f of Array.from(fileInput.files||[])){
    const u=await thumb(f); const card=document.createElement("div"); card.className="card";
    card.innerHTML=`<img class="thumb" src="${u}" alt="input"/><div class="meta"><span class="badge">${f.name}</span><span class="badge">${(f.size/1024|0)} KB</span></div>`;
    inputs.appendChild(card);
  }
}

/* Preprocess near whites / blacks */
function preprocessRGBA(data){
  const w=snapW.value|0, b=snapB.value|0;
  for(let i=0;i<data.length;i+=4){
    const r=data[i], g=data[i+1], bl=data[i+2];
    const lum = (0.2126*r + 0.7152*g + 0.0722*bl);
    if (lum>=w){ data[i]=data[i+1]=data[i+2]=255; }
    else if (lum<=b){ data[i]=data[i+1]=data[i+2]=0; }
  }
  return data;
}

function toNCHWFloat(canvas){
  const {width:w,height:h}=canvas; const ctx=canvas.getContext("2d");
  const img=ctx.getImageData(0,0,w,h); preprocessRGBA(img.data); // reduce halos
  ctx.putImageData(img,0,0);
  const out=new Float32Array(1*3*w*h); let oR=0,oG=w*h,oB=2*w*h;
  const d=img.data;
  for(let i=0,p=0;p<w*h;p++,i+=4){ out[oR+p]=d[i]/255; out[oG+p]=d[i+1]/255; out[oB+p]=d[i+2]/255; }
  return out;
}

function labToRgbPixel(L,a,b){
  const refX=95.047, refY=100.0, refZ=108.883;
  const fy=(L+16)/116, fx=fy+(a/500), fz=fy-(b/200); const e=216/24389, k=24389/27;
  const finv=(t)=>{const t3=t*t*t; return t3>e?t3:(116*t-16)/k;};
  let X=refX*finv(fx)/100, Y=refY*finv(fy)/100, Z=refZ*finv(fz)/100;
  let r=3.2406*X-1.5372*Y-0.4986*Z, g=-0.9689*X+1.8758*Y+0.0415*Z, b2=0.0557*X-0.2040*Y+1.0570*Z;
  const gamma=(u)=>u<=0.0031308?12.92*u:1.055*Math.pow(u,1/2.4)-0.055;
  r=Math.min(1,Math.max(0,gamma(r))); g=Math.min(1,Math.max(0,gamma(g))); b2=Math.min(1,Math.max(0,gamma(b2)));
  return [(r*255)|0,(g*255)|0,(b2*255)|0];
}
function paletteHexFromLAB(palData, K){
  const out=[]; for(let k=0;k<K;k++){ const L=palData[k*3+0], a=palData[k*3+1], b=palData[k*3+2];
    const [R,G,B]=labToRgbPixel(L,a,b); out.push("#"+[R,G,B].map(v=>v.toString(16).padStart(2,"0")).join("")); }
  return out;
}

function argmaxK(A,K,H,W){
  const idx=new Int32Array(H*W); for(let i=0;i<H*W;i++) idx[i]=0;
  for(let k=1;k<K;k++){ const off=k*H*W; for(let i=0;i<H*W;i++){ if(A[off+i] > A[idx[i]*H*W+i]) idx[i]=k; } }
  return idx;
}

function marchingSquaresPaths(mask,W,H){
  const paths=[]; const bit=(x,y)=> (x>=0&&x<W&&y>=0&&y<H)?mask[y*W+x]:0;
  for(let y=0;y<H-1;y++){
    for(let x=0;x<W-1;x++){
      const tl=bit(x,y)>0?1:0, tr=bit(x+1,y)>0?1:0, br=bit(x+1,y+1)>0?1:0, bl=bit(x,y+1)>0?1:0;
      const code=(tl<<3)|(tr<<2)|(br<<1)|bl; if(code===0||code===15) continue;
      const pts=[[x+0.5,y],[x+1,y+0.5],[x+0.5,y+1],[x,y+0.5]]; paths.push(pts);
    }
  }
  return paths;
}
function simplifyDP(points, eps){
  if(points.length<=2) return points; const sqeps=eps*eps;
  function d2(p,a,b){ const [x,y]=p,[x1,y1]=a,[x2,y2]=b; const A=x-x1,B=y-y1,C=x2-x1,D=y2-y1;
    const dot=A*C+B*D,len=C*C+D*D; let t=len?dot/len:0; t=Math.max(0,Math.min(1,t));
    const xx=x1+t*C, yy=y1+t*D; const dx=x-xx, dy=y-yy; return dx*dx+dy*dy; }
  const res=[points[0]]; (function rec(s,e){ let m=0,at=-1; for(let i=s+1;i<e;i++){const dd=d2(points[i],points[s],points[e]); if(dd>m){m=dd;at=i;}}
    if(m>sqeps){ rec(s,at); res.push(points[at]); rec(at,e);} })(0,points.length-1);
  res.push(points.at(-1)); return res;
}

async function fetchWithProgress(url){
  const res=await fetch(url,{cache:"no-store"});
  if(!res.ok) throw new Error("HTTP "+res.status+" for "+url);
  const total=+(res.headers.get("Content-Length")||0);
  bar.style.width="0%";
  if(!res.body || !res.body.getReader){ const buf=await res.arrayBuffer(); bar.style.width="100%"; return buf; }
  const reader=res.body.getReader(); let rec=0; const chunks=[];
  while(true){ const {done,value}=await reader.read(); if(done) break; chunks.push(value); rec+=value.length;
    if(total) bar.style.width=Math.min(100,(rec/total*100)).toFixed(1)+"%"; }
  const blob=new Blob(chunks); bar.style.width="100%"; return await blob.arrayBuffer();
}

async function createSession(buf, forceCPU){
  const eps=[]; if(!forceCPU && ort.env.webgpu && await ort.env.webgpu.isWebGPUSupported()) eps.push("webgpu"); eps.push("wasm");
  ort.env.wasm.numThreads=1;
  const sess=await ort.InferenceSession.create(new Uint8Array(buf), {executionProviders:eps});
  setProvider(eps[0]==="webgpu"?"WebGPU":"WASM"); return sess;
}

function chooseInputs(sess){
  const names=sess.inputNames; xName=names.find(n=>/x|input|image|rgb/i.test(n))||names[0];
  tName = names.find(n=>/temp|tau|temperature/i.test(n)) || null;
  log("Inputs:", names.join(", ")); log("Using:", JSON.stringify({xName,tName}));
  const in0 = sess.inputNames[0]; const inMeta = sess.sessionOptions? null : null;
  // try to read model size from declared shape if static
  try{
    const meta = sess._modelMeta; // internal; may not exist across versions
    const ii = sess.getInputs ? sess.getInputs() : null;
    if(ii && ii[0] && Array.isArray(ii[0].shape) && ii[0].shape.length===4 && typeof ii[0].shape[2]==="number"){
      MODEL_SIZE = ii[0].shape[2] || MODEL_SIZE;
    }
  }catch(e){}
  $("#modelSize").textContent = MODEL_SIZE+"×"+MODEL_SIZE;
  $("#modelOuts").textContent = sess.outputNames.join(", ");
}

async function loadModel(){
  try{
    // Read config
    let cfg={model_urls:["models/vectorizer.onnx"],force_wasm:false};
    try{ const r=await fetch("config.json",{cache:"no-store"}); if(r.ok) cfg=await r.json(); }catch(e){}
    if(forceWasm.checked) cfg.force_wasm = true;
    setStatus("Fetching model…");
    let err=null, buf=null;
    for(const url of cfg.model_urls){
      try{ buf=await fetchWithProgress(url); log("Fetched:",url); break; }catch(e){ err=e; log("Fetch failed:", url, e.message); }
    }
    if(!buf) throw err||new Error("No model_urls worked");
    setStatus("Creating session…");
    session = await createSession(buf, !!cfg.force_wasm);
    outNames = session.outputNames.slice();
    chooseInputs(session);
    setStatus("Model ready");
  }catch(e){
    setStatus("Load failed"); log("Load error:", e.message); showToast("Model load failed: "+e.message);
  }
}

window.addEventListener("DOMContentLoaded", loadModel);
forceWasm.addEventListener("change", ()=>{ session=null; setStatus("Reloading…"); loadModel(); });

function makeCanvasFor(img, S){
  const W=img.naturalWidth||img.width, H=img.naturalHeight||img.height; const sc=Math.min(S/W,S/H);
  const nw=Math.max(1,Math.round(W*sc)), nh=Math.max(1,Math.round(H*sc)); const padX=Math.floor((S-nw)/2), padY=Math.floor((S-nh)/2);
  const c=document.createElement("canvas"); c.width=S; c.height=S; const ctx=c.getContext("2d");
  ctx.clearRect(0,0,S,S); ctx.drawImage(img,0,0,W,H,padX,padY,nw,nh);
  return {canvas:c, meta:{W,H,S,sc,padX,padY,nw,nh}};
}
function toOrig(pts, meta){
  const {W,H,sc,padX,padY}=meta; return pts.map(([x,y])=>{
    const xo=(x-padX)/sc, yo=(y-padY)/sc; return [Math.min(W,Math.max(0,xo)), Math.min(H,Math.max(0,yo))];
  });
}

async function runOne(file){
  if(!session) throw new Error("Model not ready");
  // load img
  const url=URL.createObjectURL(file); const img=new Image(); img.src=url; await img.decode(); URL.revokeObjectURL(url);
  const {canvas, meta}=makeCanvasFor(img, MODEL_SIZE);
  // tensor
  const x = toNCHWFloat(canvas);
  const feeds={}; feeds[xName]=new ort.Tensor("float32", x, [1,3,MODEL_SIZE,MODEL_SIZE]);
  if(tName) feeds[tName] = new ort.Tensor("float32", new Float32Array([1.0]), [1]);
  const out = await session.run(feeds);
  // outputs
  const get=(re)=> out[session.outputNames.find(n=>re.test(n))];
  const pal = get(/palette/i), A = get(/assign/i) || get(/mask|scores/i);
  if(!pal || !A) throw new Error("Outputs not recognized (need palette & assignments).");
  const K = pal.dims.at(-2) || pal.dims.at(-1);
  const colors = paletteHexFromLAB(pal.data, K);

  // argmax over K
  const dims=A.dims; const KA=dims.at(-3), H=dims.at(-2), W=dims.at(-1);
  const raw=A.data; const idx=argmaxK(raw, KA, H, W);

  // content mask to ignore padded border
  const content=new Uint8Array(MODEL_SIZE*MODEL_SIZE);
  for(let y=meta.padY;y<meta.padY+meta.nh;y++){ for(let x=meta.padX;x<meta.padX+meta.nw;x++){ content[y*MODEL_SIZE+x]=1; } }

  // build SVG
  const eps=parseFloat(epsIn.value); const minArea=parseInt(areaIn.value,10); const opacity=parseFloat(opIn.value);
  const svgParts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.W}" height="${meta.H}" viewBox="0 0 ${meta.W} ${meta.H}">`];
  for(let k=0;k<KA;k++){
    const mask=new Uint8Array(H*W);
    for(let y=0;y<H;y++){ for(let x=0;x<W;x++){ const i=y*W+x; const src=y*MODEL_SIZE+x; mask[i]=(idx[i]===k && content[src])?1:0; } }
    const paths=marchingSquaresPaths(mask, W, H);
    if(!paths.length) continue;
    svgParts.push(`  <g fill="${colors[k%colors.length]}" fill-opacity="${opacity.toFixed(3)}" stroke="none">`);
    for(const pts of paths){
      if(pts.length<3) continue;
      let area=0; for(let i=0;i<pts.length;i++){ const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length]; area+=x1*y2-x2*y1; }
      if(Math.abs(area)<minArea) continue;
      const simp=simplifyDP(pts, eps);
      const orig=toOrig(simp, meta);
      const d="M "+orig.map(([x,y])=>`${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")+" Z";
      svgParts.push(`    <path d="${d}"/>`);
    }
    svgParts.push("  </g>");
  }
  svgParts.push("</svg>");
  const svg = svgParts.join("\n");

  // preview (palette-colored assignments upscaled into the original box)
  const prev=document.createElement("canvas"); prev.width=meta.W; prev.height=meta.H; const ctx=prev.getContext("2d");
  const palRGB=colors.map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
  const small=document.createElement("canvas"); small.width=MODEL_SIZE; small.height=MODEL_SIZE; const sctx=small.getContext("2d");
  const imgData=sctx.createImageData(W,H);
  for(let y=0;y<H;y++){ for(let x=0;x<W;x++){ const k2=idx[y*W+x]; const i=(y*W+x)*4; const [r,g,b]=palRGB[k2%palRGB.length]; imgData.data[i]=r; imgData.data[i+1]=g; imgData.data[i+2]=b; imgData.data[i+3]=255; } }
  sctx.putImageData(imgData,0,0);
  ctx.clearRect(0,0,prev.width,prev.height);
  ctx.drawImage(small, meta.padX, meta.padY, meta.nw, meta.nh);

  // card
  const card=document.createElement("div"); card.className="card";
  const blob = new Blob([svg], {type:"image/svg+xml"}); const url2 = URL.createObjectURL(blob);
  card.innerHTML=`<img class="thumb" src="${prev.toDataURL("image/png")}" alt="preview"/>
    <div class="meta">
      <span class="badge">${file.name}</span>
      <a href="${url2}" download="${file.name.replace(/\.[^.]+$/, '')}.svg">Download SVG</a>
    </div>`;
  gallery.appendChild(card);
}

runBtn.addEventListener("click", async ()=>{
  if(!session){ showToast("Model not ready yet."); return; }
  const files = Array.from(fileInput.files||[]); if(!files.length){ showToast("Pick images first."); return; }
  runBtn.disabled=true; const old=runBtn.textContent; runBtn.textContent="Running…";
  try{
    gallery.innerHTML="";
    for(const f of files){ await runOne(f); }
  }catch(e){ console.error(e); log("Run error:", e.message); showToast("Error: "+e.message); }
  finally{ runBtn.disabled=false; runBtn.textContent=old; }
});
