// color-math.js
// sRGB <-> Lab, ΔE00, and helpers

function srgbToXyz(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgb2lab(r, g, b) {
  let R = srgbToXyz(r),
    G = srgbToXyz(g),
    B = srgbToXyz(b);

  let X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;

  const xr = X / 0.95047;
  const yr = Y / 1.0;
  const zr = Z / 1.08883;

  function f(t) {
    return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116;
  }

  const fx = f(xr);
  const fy = f(yr);
  const fz = f(zr);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function lab2rgb(L, a, b) {
  let fy = (L + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;

  function finv(t) {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  }

  const xr = finv(fx);
  const yr = finv(fy);
  const zr = finv(fz);

  const X = xr * 0.95047;
  const Y = yr * 1.0;
  const Z = zr * 1.08883;

  let R = 3.2404542 * X + -1.5371385 * Y + -0.4985314 * Z;
  let G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  let B = 0.0556434 * X + -0.2040259 * Y + 1.0572252 * Z;

  function clamp(v) {
    const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(x * 255)));
  }

  return [clamp(R), clamp(G), clamp(B)];
}

function lab2lch(L, a, b) {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, H];
}

function hueDiff(h1, h2) {
  let d = Math.abs(h1 - h2);
  return d > 180 ? 360 - d : d;
}

// CIEDE2000 ΔE00
function deltaE00(l1, l2) {
  const L1 = l1[0],
    a1 = l1[1],
    b1 = l1[2];
  const L2 = l2[0],
    a2 = l2[1],
    b2 = l2[2];

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;

  const G =
    0.5 *
    (1 -
      Math.sqrt(
        Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))
      ));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
  const h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    let d = h2p - h1p;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    dhp = d;
  }

  const dHp =
    2 * Math.sqrt(C1p * C2p) * Math.sin(((dhp * Math.PI) / 180) / 2);

  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;

  let hpm = 0;
  if (C1p * C2p === 0) {
    hpm = h1p + h2p;
  } else {
    const d = Math.abs(h1p - h2p);
    if (d <= 180) hpm = (h1p + h2p) / 2;
    else hpm = (h1p + h2p + 360 * (h1p + h2p < 360 ? 1 : -1)) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((hpm - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * hpm) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hpm + 6) * Math.PI) / 180) -
    0.20 * Math.cos(((4 * hpm - 63) * Math.PI) / 180);

  const dTheta =
    30 * Math.exp(-Math.pow((hpm - 275) / 25, 2));

  const Rc =
    2 *
    Math.sqrt(
      Math.pow(Cpm, 7) /
        (Math.pow(Cpm, 7) + Math.pow(25, 7))
    );

  const Sl =
    1 +
    (0.015 * Math.pow(Lpm - 50, 2)) /
      Math.sqrt(20 + Math.pow(Lpm - 50, 2));
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin((2 * dTheta * Math.PI) / 180) * Rc;

  const kl = 1,
    kc = 1,
    kh = 1;
  const dE = Math.sqrt(
    Math.pow(dLp / (kl * Sl), 2) +
      Math.pow(dCp / (kc * Sc), 2) +
      Math.pow(dHp / (kh * Sh), 2) +
      Rt * (dCp / (kc * Sc)) * (dHp / (kh * Sh))
  );

  return dE;
}
