// palette.js
// Distinct-first palette with hue separation and adjacency-aware assignment

function buildCandidatesFromLab(labBuf, w, h, stride = 2) {
  const stats = new Map();
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = (y * w + x) * 3;
      const L = labBuf[i];
      const a = labBuf[i + 1];
      const b = labBuf[i + 2];
      const key =
        `${Math.round(L * 2) / 2},` +
        `${Math.round(a)},` +
        `${Math.round(b)}`;
      const s = stats.get(key) || { sum: [0, 0, 0], count: 0 };
      s.sum[0] += L;
      s.sum[1] += a;
      s.sum[2] += b;
      s.count++;
      stats.set(key, s);
    }
  }

  const cands = [];
  stats.forEach((v) => {
    cands.push({
      lab: [
        v.sum[0] / v.count,
        v.sum[1] / v.count,
        v.sum[2] / v.count
      ],
      count: v.count
    });
  });
  cands.sort((a, b) => b.count - a.count);
  return cands;
}

function selectMaxDiversity(
  cands,
  k,
  { lockWB = true, minDelta = 18, hueSep = 25, chromaFloor = 12, distinctMode = true } = {}
) {
  const palette = [];
  const paletteLCH = [];

  const take = (lab) => {
    palette.push(lab);
    paletteLCH.push(lab2lch(lab[0], lab[1], lab[2]));
  };

  // seed white/black
  if (lockWB) {
    const white = cands.find((c) => {
      const [L, a, b] = c.lab;
      return L > 95 && Math.abs(a) < 2 && Math.abs(b) < 2;
    });
    const black = cands.find((c) => c.lab[0] < 10);
    if (white) take(white.lab);
    if (black && palette.length < k) take(black.lab);
  }

  if (palette.length === 0 && cands.length) take(cands[0].lab);

  const maxCnt = cands[0]?.count || 1;
  let relaxHue = false;

  while (palette.length < k && cands.length) {
    let best = null;
    let bestScore = -1;

    for (const c of cands) {
      const [L, a, b] = c.lab;
      const [LL, C, H] = lab2lch(L, a, b);
      const isWB =
        (LL > 95 && Math.abs(a) < 2 && Math.abs(b) < 2) ||
        LL < 10;

      if (distinctMode && !isWB && C < chromaFloor) continue;

      // distance to chosen palette
      let dmin = 1e9;
      for (const p of palette) {
        const d = deltaE00(c.lab, p);
        if (d < dmin) dmin = d;
      }

      // Hue spacing
      let hueOK = true;
      if (distinctMode && !relaxHue && paletteLCH.length) {
        for (const pl of paletteLCH) {
          if (pl[1] >= chromaFloor && C >= chromaFloor) {
            if (hueDiff(pl[2], H) < hueSep) {
              hueOK = false;
              break;
            }
          }
        }
      }
      if (!hueOK) continue;

      const freqBoost = 0.12 * (c.count / maxCnt);
      const vividBoost = distinctMode ? 0.25 * (C / 100) : 0;
      const score = dmin + freqBoost + vividBoost;

      if (dmin >= minDelta && score > bestScore) {
        best = c;
        bestScore = score;
      }
    }

    if (!best) {
      if (!relaxHue) {
        relaxHue = true;
        continue; // relax hue once
      }
      for (const c of cands) {
        let dmin = 1e9;
        for (const p of palette) {
          const d = deltaE00(c.lab, p);
          if (d < dmin) dmin = d;
        }
        if (dmin > bestScore) {
          best = c;
          bestScore = dmin;
        }
      }
    }

    take(best.lab);

    // prune near duplicates
    for (let i = cands.length - 1; i >= 0; i--) {
      const cc = cands[i].lab;
      const d = deltaE00(cc, best.lab);
      const lch = lab2lch(cc[0], cc[1], cc[2]);
      const blch = lab2lch(best.lab[0], best.lab[1], best.lab[2]);
      const hueNear =
        lch[1] >= chromaFloor &&
        blch[1] >= chromaFloor &&
        hueDiff(lch[2], blch[2]) < hueSep * 0.8;
      if (d < minDelta * 0.8 || hueNear) cands.splice(i, 1);
    }

    if (!cands.length) break;
  }

  return palette.slice(0, k);
}

function refineMedoids(cands, palette, { chromaFloor = 12 } = {}) {
  if (!palette.length) return palette;
  const clusters = palette.map(() => []);

  for (const c of cands) {
    let bi = 0;
    let bd = 1e9;
    for (let i = 0; i < palette.length; i++) {
      const d = deltaE00(c.lab, palette[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    clusters[bi].push(c);
  }

  for (let i = 0; i < palette.length; i++) {
    const cluster = clusters[i];
    if (!cluster.length) continue;
    let best = cluster[0];
    let bestScore = 1e18;

    for (const a of cluster) {
      let sum = 0;
      for (const b of cluster) {
        sum += deltaE00(a.lab, b.lab) * b.count;
      }
      const C = lab2lch(a.lab[0], a.lab[1], a.lab[2])[1];
      const penalty = C < chromaFloor ? 1000 : 0;
      const score = sum + penalty;
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }

    palette[i] = best.lab;
  }

  return palette;
}

function quantizeFromLab(
  labBuf,
  w,
  h,
  k,
  { lockWB = true, minDelta = 18, hueSep = 25, chromaFloor = 12, stride = 2, distinctMode = true } = {}
) {
  const cands = buildCandidatesFromLab(labBuf, w, h, stride);
  let palette = selectMaxDiversity(cands.slice(), k, {
    lockWB,
    minDelta,
    hueSep,
    chromaFloor,
    distinctMode
  });
  palette = refineMedoids(cands, palette, { chromaFloor });

  const N = w * h;
  const idxMap = new Uint16Array(N);

  for (let i = 0; i < N; i++) {
    const j = i * 3;
    const p = [labBuf[j], labBuf[j + 1], labBuf[j + 2]];
    let bi = 0;
    let bd = 1e9;
    for (let c = 0; c < palette.length; c++) {
      const d = deltaE00(p, palette[c]);
      if (d < bd) {
        bd = d;
        bi = c;
      }
    }
    idxMap[i] = bi;
  }

  // adjacency-aware smoothing
  const smoothOnce = (map) => {
    const out = new Uint16Array(map.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const cur = map[i];
        const nb = [];
        if (x > 0) nb.push(map[i - 1]);
        if (x < w - 1) nb.push(map[i + 1]);
        if (y > 0) nb.push(map[i - w]);
        if (y < h - 1) nb.push(map[i + w]);

        const cnt = new Map();
        for (const v of nb) {
          cnt.set(v, (cnt.get(v) || 0) + 1);
        }

        let maj = cur;
        let count = cnt.get(cur) || 0;
        for (const [v, c] of cnt) {
          if (c > count) {
            count = c;
            maj = v;
          }
        }

        if (maj !== cur && count >= 3) {
          const j = i * 3;
          const p = [labBuf[j], labBuf[j + 1], labBuf[j + 2]];
          const dCur = deltaE00(p, palette[cur]);
          const dMaj = deltaE00(p, palette[maj]);
          out[i] = dMaj <= dCur + 1.0 ? maj : cur;
        } else {
          out[i] = cur;
        }
      }
    }
    return out;
  };

  const idxMap2 = smoothOnce(idxMap);
  const q = new ImageData(w, h);

  for (let i = 0; i < w * h; i++) {
    const bi = idxMap2[i];
    const [r, g, b] = lab2rgb(
      palette[bi][0],
      palette[bi][1],
      palette[bi][2]
    );
    const k4 = i * 4;
    q.data[k4] = r;
    q.data[k4 + 1] = g;
    q.data[k4 + 2] = b;
    q.data[k4 + 3] = 255;
  }

  return { palette, idxMap: idxMap2, qImData: q };
}
