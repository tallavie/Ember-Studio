// Picture helpers shared by the tileset editor and "character from a picture": load a file into a canvas, make a
// palette (median cut), map pixels to a palette, and a small crop dialog.
'use strict';

const ImgTools = (() => {
  async function load(file) {
    const bmp = await createImageBitmap(file);
    const cv = h('canvas', { width: bmp.width, height: bmp.height }); cv.getContext('2d').drawImage(bmp, 0, 0);
    return cv;
  }
  const data = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  // n colours (GBA 15-bit) from the opaque pixels of an ImageData
  function medianCut(id, n) {
    const d = id.data, cols = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) cols.push([d[i] & 0xF8, d[i + 1] & 0xF8, d[i + 2] & 0xF8]);
    if (!cols.length) return [];
    let boxes = [cols];
    while (boxes.length < n) {
      let bi = -1, br = 0, bc = 0;
      boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } if (hi - lo > br) { br = hi - lo; bi = i; bc = c; } } });
      if (bi < 0 || br === 0) break;
      const b = boxes[bi].sort((p, q) => p[bc] - q[bc]), m = b.length >> 1; boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    return boxes.map(b => { const a = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) a[c] += p[c]; return Gfx.fromRGB(...a.map(v => Math.round(v / b.length))); });
  }
  // pixels -> palette indices (index 0 = transparent); first = the first index the picture may use
  function quantize(id, pal, first = 1) {
    const d = id.data, out = new Uint8Array(id.width * id.height), rgb = pal.map(Gfx.toRGB);
    for (let i = 0; i < out.length; i++) {
      if (d[i * 4 + 3] < 128) { out[i] = 0; continue; }
      let best = first, bd = 1e9;
      for (let k = first; k < pal.length; k++) { const dd = (rgb[k][0] - d[i * 4]) ** 2 + (rgb[k][1] - d[i * 4 + 1]) ** 2 + (rgb[k][2] - d[i * 4 + 2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
      out[i] = best;
    }
    return out;
  }
  // a plain background colour (taken from the corners) becomes transparent
  function removeBackground(cv) {
    const id = data(cv), d = id.data, W = cv.width, H = cv.height;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 128) return cv;               // already has transparency
    const bg = [d[0], d[1], d[2]], seen = new Uint8Array(W * H), st = [0, W - 1, (H - 1) * W, H * W - 1];
    const near = i => Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]) < 48;
    while (st.length) {
      const i = st.pop(); if (seen[i] || !near(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W);
    }
    cv.getContext('2d').putImageData(id, 0, 0); return cv;
  }
  // the opaque part of a picture, fitted into w x h (feet at the bottom, centred)
  function fit(cv, w, h2, smooth = true) {
    const id = data(cv), d = id.data, W = cv.width, H = cv.height;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 < 0) throw new Error(T('The image is empty'));
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, f = Math.min(w / bw, h2 / bh), tw = Math.max(1, Math.round(bw * f)), th = Math.max(1, Math.round(bh * f));
    const out = h('canvas', { width: w, height: h2 }), oc = out.getContext('2d');
    oc.imageSmoothingEnabled = smooth && f < 1; oc.imageSmoothingQuality = 'high';
    oc.drawImage(cv, x0, y0, bw, bh, Math.floor((w - tw) / 2), h2 - th, tw, th);
    // hard edges: half-transparent pixels become fully opaque or fully transparent
    const od = oc.getImageData(0, 0, w, h2); for (let i = 3; i < od.data.length; i += 4) od.data[i] = od.data[i] >= 100 ? 255 : 0; oc.putImageData(od, 0, 0);
    return out;
  }
  function pick(accept = 'image/*') {
    return new Promise(res => { const inp = h('input', { type: 'file', accept, onchange: () => res(inp.files[0] || null) }); inp.click(); });
  }
  // indexed pixels -> canvas (scaled)
  function indexedCanvas(px, w, h2, pal, scale = 1) {
    const cv = h('canvas', { width: w, height: h2, class: 'pixel' }); cv.getContext('2d').putImageData(Gfx.toImageData(px, w, h2, pal, true), 0, 0);
    cv.style.width = w * scale + 'px'; return cv;
  }
  return { load, data, medianCut, quantize, removeBackground, fit, pick, indexedCanvas };
})();
