// loader-imagetracer.js
// Load ImageTracer with CDN + fallback and enable Vectorize button

(function loadImageTracer() {
  const primary = "https://unpkg.com/imagetracerjs@1.2.6/imagetracer_v1.2.6.min.js";
  const fallback = "https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.min.js";

  function enableBtn() {
    const btn = document.getElementById("runBtn");
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = "Vectorize";
  }

  function inject(src, onload, onerror) {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = onload;
    s.onerror = onerror;
    document.head.appendChild(s);
  }

  inject(
    primary,
    () => {
      console.log("ImageTracer loaded from unpkg");
      enableBtn();
    },
    () => {
      console.warn("unpkg failed, retry via jsDelivr");
      inject(
        fallback,
        () => {
          console.log("ImageTracer loaded from jsDelivr");
          enableBtn();
        },
        () => {
          console.error("Failed to load ImageTracer from both CDNs");
          const err = document.getElementById("err");
          if (err) {
            err.classList.remove("hidden");
            err.textContent =
              "Unable to load vectorization engine. Check your network or try again later.";
          }
        }
      );
    }
  );
})();
