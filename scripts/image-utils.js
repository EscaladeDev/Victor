// image-utils.js
// Basic image utilities and SVG post-processor

function smoothImage(data, w, h, iters = 1) {
  if (iters <= 0) return data;
  const out = new Uint8ClampedArray(data.length);

  for (let t = 0; t < iters; t++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let accR = 0,
          accG = 0,
          accB = 0,
          accA = 0,
          cnt = 0;

        function add(xx, yy) {
          const j = (yy * w + xx) * 4;
          accR += data[j];
          accG += data[j + 1];
          accB += data[j + 2];
          accA += data[j + 3];
          cnt++;
        }

        add(x, y);
        if (x > 0) add(x - 1, y);
        if (x < w - 1) add(x + 1, y);
        if (y > 0) add(x, y - 1);
        if (y < h - 1) add(x, y + 1);

        out[i] = accR / cnt;
        out[i + 1] = accG / cnt;
        out[i + 2] = accB / cnt;
        out[i + 3] = accA / cnt;
      }
    }
    data.set(out);
  }

  return data;
}

function cloneImageData(src) {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

function postProcessSVG(svg, { bg = "#0a1224", strokeWidth = 0.45 } = {}) {
  // background rect + shape-rendering
  svg = svg.replace(
    /<svg([^>]*)>/,
    `<svg$1><style>*{shape-rendering:geometricPrecision}</style><rect width="100%" height="100%" fill="${bg}"/>`
  );

  // enforce anti-seam overlap by giving each path a stroke of its own fill
  svg = svg.replace(/<path\b[^>]*>/g, (tag) => {
    let t = tag.replace(
      /\s+stroke(?:-width|-linejoin|-linecap)?="[^"]*"/gi,
      ""
    );
    t = t.replace(/style="([^"]*)"/gi, (m, style) => {
      const cleaned = style
        .replace(
          /stroke(?:-width|-linejoin|-linecap)?\s*:\s*[^;"]*;?/gi,
          ""
        )
        .trim()
        .replace(/;{2,}/g, ";")
        .replace(/^;|;$/g, "");
      return cleaned ? `style="${cleaned}"` : "";
    });

    const withStroke = t.replace(
      /<path\b([^>]*?)\sfill="([^"]+)"([^>]*)>/i,
      `<path $1 fill="$2" stroke="$2" stroke-width="${strokeWidth}" stroke-linejoin="round"$3>`
    );
    return withStroke;
  });

  return svg;
}
