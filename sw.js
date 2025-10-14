const CORE=["./","./index.html","./style.css","./app.js","./config.json"];
self.addEventListener("install",e=>{e.waitUntil(caches.open("nv-core-v1").then(c=>c.addAll(CORE)).catch(()=>{}))});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.pathname.endsWith(".onnx")){
    event.respondWith((async()=>{
      try{
        const net=await fetch(event.request);
        const cache=await caches.open("nv-model-v1"); cache.put(event.request, net.clone());
        return net;
      }catch(e){
        const cache=await caches.open("nv-model-v1");
        const hit=await cache.match(event.request);
        return hit||Response.error();
      }
    })()); return;
  }
  if(CORE.includes(url.pathname.replace(/\/+$/,"/"))){
    event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));
  }
});