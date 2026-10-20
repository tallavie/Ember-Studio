// The in-game town map (FireRed Kanto region map): preview it from the ROM and redraw it from the world view's layout.
// The map is a 22x15 grid of map sections (which name the cursor shows, where the player dot goes) drawn as one
// 30x20 tilemap. The generator puts every connected map on the grid (cities = town dots, routes = paths), draws land,
// sea and coast with tile rules learned from the original map (js/townmap_data.js), and writes the section grid,
// the section corners / sizes and the tilemap back. Kanto is shown for every section (Sevii check patched).
'use strict';

const TownMap = (() => {
  const D = () => TOWNMAP_DATA;
  const NONE = 0xC5, W = 22, H = 15;
  const supported = () => App.game && App.game.patchKey === 'BPRE1';

  // ---------- read / preview ----------
  function tiles(rom) {
    const r = LZ.decompress(rom.u8, rom.ptr(0xC0344)); return r ? r.data : null;
  }
  function tilemap(rom) {
    const r = LZ.decompress(rom.u8, rom.ptr(D().tilemap_ref)); if (!r) return D().base.slice();
    const out = []; for (let i = 0; i < 600; i++) out.push(r.data[i * 2] | (r.data[i * 2 + 1] << 8)); return out;
  }
  function grid(rom) { return rom.u8.slice(D().grid, D().grid + W * H); }
  function render(rom, cv) {
    const gfx = tiles(rom), tm = tilemap(rom); if (!gfx) return;
    const pal = Gfx.readPal(rom.u8, D().pal, 64).map(Gfx.toRGB);
    const img = new ImageData(240, 160);
    for (let ty = 0; ty < 20; ty++) for (let tx = 0; tx < 30; tx++) {
      const e = tm[ty * 30 + tx], t = e & 0x3FF, hf = e & 0x400, vf = e & 0x800, pb = e >> 12;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y, b = gfx[t * 32 + sy * 4 + (sx >> 1)] || 0, c = sx & 1 ? b >> 4 : b & 15;
        const col = pal[pb * 16 + c] || [255, 0, 255], o = ((ty * 8 + y) * 240 + tx * 8 + x) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
    }
    cv.width = 240; cv.height = 160; cv.getContext('2d').putImageData(img, 0, 0);
    // fly points (sections with a heal location) as small blue rings
    const c = cv.getContext('2d'), g = grid(rom), seen = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = g[y * W + x]; if (s === NONE || s < 0x58 || seen.has(s)) continue;
      seen.add(s);
      if (!rom.u8[D().fly + (s - 0x58) * 3 + 2]) continue;
      const i = s - 0x58, cx = rom.r16(D().corners + i * 4), cy = rom.r16(D().corners + i * 4 + 2);
      c.strokeStyle = '#1c7ed6'; c.lineWidth = 1.5; c.beginPath(); c.arc((cx + D().ox) * 8 + 4, (cy + D().oy) * 8 + 4, 5, 0, 7); c.stroke();
    }
  }
  function cellAt(cv, e) {
    const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) * 240 / r.width / 8) - D().ox, y = Math.floor((e.clientY - r.top) * 160 / r.height / 8) - D().oy;
    return x >= 0 && y >= 0 && x < W && y < H ? [x, y] : null;
  }

  // ---------- generate from the world ----------
  // list: [{k, x, y, w, h}] (connected maps only); info(k) -> {sec, city, water}; linked(a, b) -> maps are connected
  function generate(list, info, linked, exits) {
    const d = D();
    const x0 = Math.min(...list.map(p => p.x)), y0 = Math.min(...list.map(p => p.y));
    const bw = Math.max(...list.map(p => p.x + p.w)) - x0, bh = Math.max(...list.map(p => p.y + p.h)) - y0;
    const s = Math.max(bw / 20, bh / 13, 1);
    const offx = 1 + Math.floor((20 - bw / s) / 2), offy = 1 + Math.floor((13 - bh / s) / 2);
    const cellOf = (bx, by) => [Math.max(0, Math.min(W - 1, offx + Math.floor((bx - x0) / s))), Math.max(0, Math.min(H - 1, offy + Math.floor((by - y0) / s)))];
    const sec = Array.from({ length: H }, () => new Array(W).fill(NONE)), own = Array.from({ length: H }, () => new Array(W).fill(null));
    const town = Array.from({ length: H }, () => new Array(W).fill(false)), area = Array.from({ length: H }, () => new Array(W).fill(null));
    const order = [...list].sort((a, b) => (info(a.k).city ? 1 : 0) - (info(b.k).city ? 1 : 0));
    const cells = new Map();
    for (const p of order) {
      const inf = info(p.k), [cx0, cy0] = cellOf(p.x, p.y), [cx1, cy1] = cellOf(p.x + p.w - 1, p.y + p.h - 1);
      const mine = [];
      if (inf.city) {
        const [tx, ty] = cellOf(p.x + p.w / 2, p.y + p.h / 2);
        for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (!own[y][x]) { sec[y][x] = inf.sec; area[y][x] = p.k; }
        own[ty][tx] = p.k; sec[ty][tx] = inf.sec; town[ty][tx] = true; mine.push([tx, ty]);
        for (const dir of exits(p.k)) {                              // a road from the dot to each side the city connects on
          const [dx, dy] = { 1: [0, 1], 2: [0, -1], 3: [-1, 0], 4: [1, 0] }[dir];
          for (let x = tx + dx, y = ty + dy; x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1; x += dx, y += dy) if (!own[y][x]) { own[y][x] = p.k; mine.push([x, y]); }
        }
        cells.set(p.k, { town: [tx, ty], cells: mine });
      } else {
        for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (!town[y][x]) { own[y][x] = p.k; sec[y][x] = inf.sec; mine.push([x, y]); }
        cells.set(p.k, { cells: mine });
      }
    }
    // land: cells of land maps, one cell of coast around them, and every hole that the sea cannot reach
    const isLand = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => { const k = own[y][x] || area[y][x]; return !!k && !info(k).water; }));
    const land = isLand.map((row, y) => row.map((v, x) => v || [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => isLand[y + dy] && isLand[y + dy][x + dx])));
    const sea = Array.from({ length: H }, () => new Array(W).fill(false)), q = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !land[y][x]) { sea[y][x] = true; q.push([x, y]); }
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !sea[ny][nx] && !land[ny][nx]) { sea[ny][nx] = true; q.push([nx, ny]); } } }
    const L = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !sea[y][x];
    const conn = (x, y, nx, ny) => {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !own[y][x] || !own[ny][nx]) return false;
      return own[y][x] === own[ny][nx] || linked(own[y][x], own[ny][nx]);
    };
    const tm = d.base.slice();
    const routeKeys = Object.keys(d.route);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let e;
      if (town[y][x]) e = d.town;
      else if (own[y][x]) {
        const c = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => conn(x, y, x + dx, y + dy) ? '1' : '0').join('');
        const key = (L(x, y) ? '1' : '0') + c;
        if (d.route[key] != null) e = d.route[key];
        else if (d.route2[c] != null) e = d.route2[c];
        else {
          const ham = k => [...k].reduce((n, ch, i) => n + (ch !== key[i] ? (i ? 1 : 4) : 0), 0);
          e = d.route[routeKeys.sort((a, b) => ham(a) - ham(b))[0]];
        }
      } else {
        const k8 = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([dx, dy]) => L(x + dx, y + dy) ? '1' : '0').join('');
        e = d.bg8[k8] ?? d.bg4[k8.slice(0, 5)] ?? (k8[0] === '1' ? d.land : d.sea);
      }
      tm[(y + d.oy) * 30 + x + d.ox] = e;
    }
    // the drawing continues past the grid (margins of the picture): sea, with coast next to land at the grid's edge
    const LT = (tx, ty) => L(tx - d.ox, ty - d.oy);
    for (const [tx, ty] of d.art || []) {
      const k8 = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([dx, dy]) => LT(tx + dx, ty + dy) ? '1' : '0').join('');
      tm[ty * 30 + tx] = d.bg8[k8] ?? d.bg4[k8.slice(0, 5)] ?? d.sea;
    }
    for (const [x, y, e] of d.icon) tm[(y + d.oy) * 30 + x + d.ox] = e;      // the map-switch icon stays
    // section corners / sizes: cities = their dot, routes = the cells they cover
    const box = new Map();
    for (const [k, c] of cells) {
      const sc = info(k).sec, pts = c.town ? [c.town] : c.cells; if (!pts.length) continue;
      const b = box.get(sc) || { x0: 99, y0: 99, x1: -1, y1: -1, town: !!c.town };
      if (c.town && !b.town) { b.x0 = 99; b.y0 = 99; b.x1 = -1; b.y1 = -1; b.town = true; }
      if (!c.town && b.town) continue;
      for (const [x, y] of pts) { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); }
      box.set(sc, b);
    }
    return { sec, tm, box };
  }

  // ---------- write ----------
  function write(rom, gen) {
    const d = D(), g = new Uint8Array(W * H * 2).fill(NONE);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = gen.sec[y][x];
    rom.write(d.grid, g);                                                   // map layer + an empty dungeon layer
    for (const [sc, b] of gen.box) {
      const i = sc - 0x58; if (i < 0 || i >= 198) continue;
      const c = new Uint8Array(4), z = new Uint8Array(4), cv = new DataView(c.buffer), zv = new DataView(z.buffer);
      cv.setUint16(0, b.x0, true); cv.setUint16(2, b.y0, true); zv.setUint16(0, b.x1 - b.x0 + 1, true); zv.setUint16(2, b.y1 - b.y0 + 1, true);
      rom.write(d.corners + i * 4, c); rom.write(d.dims + i * 4, z);
    }
    const raw = new Uint8Array(1200); gen.tm.forEach((e, i) => { raw[i * 2] = e & 255; raw[i * 2 + 1] = e >> 8; });
    const lz = LZ.compress(raw), cur = rom.ptr(d.tilemap_ref);
    const SLOT = 0x700;
    if (cur === 0x3F090C) {                                                 // first time: a roomy slot of our own
      const buf = new Uint8Array(SLOT).fill(0); buf.set(lz);
      const n = rom.writeNew(buf);
      for (const p of rom.findPointers(cur, true)) rom.wptr(p, n);
    } else if (lz.length <= SLOT) rom.write(cur, lz);
    else { const n = rom.writeNew(lz); for (const p of rom.findPointers(cur, true)) rom.wptr(p, n); }
    if (rom.u8[d.sevii_cmp] === 0x8E && rom.u8[d.sevii_cmp + 1] === 0x28) rom.w8(d.sevii_cmp, 0xFF);   // cmp r0, #0xFF: always Kanto
  }

  return { supported, render, cellAt, grid, generate, write, NONE, W, H };
})();
