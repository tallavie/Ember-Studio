// Kachol-Lavan: rewires the overworld into the shape of Israel (south first, then north). Runs inside Ember Studio
// with the project open (the browser console / CDP):  (0, eval)(new TextDecoder().decode(await Host.readFile(path)))
// Everything goes through the World tab's replay ops (disconnect / connect / paintfull / create), so it is logged
// in data/world_ops.json like edits made by hand.
window.IW = (() => {
  const T = WorldTab._test, R = () => App.rom, G = () => App.game;
  const P = k => k.split('.').map(Number);
  const L = k => MapsTab.api.loadMap(...P(k));
  const at = (m, x, y) => R().r16(m.blocks + (y * m.w + x) * 2);
  const TREE = [[0x41C, 0x41D], [0x414, 0x415]];
  function beh(m, v) {
    const id = v & 0x3FF, sec = id >= G().primaryMetatiles, ts = sec ? m.sec : m.prim, local = sec ? id - G().primaryMetatiles : id;
    const attr = R().ptr(ts.off + 20); return attr < 0 ? 0 : R().r32(attr + local * 4) & 0x1FF;
  }
  // a cell you can walk onto from the next map: no collision, not water, not a ledge
  const land = (m, v) => { if ((v >> 10) & 3 || (v >> 12) === 1) return false; const b = beh(m, v); return !(b >= 0x38 && b <= 0x3B) && !(b >= 0x10 && b <= 0x15); };   // 0x10-0x15: water
  function groundOf(m) {
    const cnt = new Map();
    for (let i = 0; i < m.w * m.h; i++) { const v = R().r16(m.blocks + i * 2); if (!((v >> 10) & 3) && (v >> 12) !== 1 && !beh(m, v)) cnt.set(v, (cnt.get(v) || 0) + 1); }
    return cnt.size ? [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0] : 0x3001;
  }
  // the parity of the map's tree pattern (so painted trees line up with the map's own)
  function treeParity(m) {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if ((at(m, x, y) & 0x3FF) === 0x01C) return [x & 1, y & 1];
    return [0, 0];
  }
  // side: 'N' 'S' 'W' 'E'; i = index along the edge; d = depth (0 = the edge row)
  const cellOf = (m, side, i, d) => side === 'N' ? [i, d] : side === 'S' ? [i, m.h - 1 - d] : side === 'W' ? [d, i] : [m.w - 1 - d, i];
  const along = (m, side) => side === 'N' || side === 'S' ? m.w : m.h;
  const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
  // blocked cells before the first land cell going inward (Infinity if none within 18)
  function depth(m, side, i) {
    for (let d = 0; d < 18; d++) { const [x, y] = cellOf(m, side, i, d); if (x < 0 || y < 0 || x >= m.w || y >= m.h) return Infinity; if (land(m, at(m, x, y))) return d; }
    return Infinity;
  }
  // the best 2-wide crossing for B on side `side` of A, with B's start at `off` along A's edge
  function crossing(A, side, B, off) {
    const ma = L(A), mb = L(B), na = along(ma, side), nb = along(mb, OPP[side]);
    const lo = Math.max(0, off), hi = Math.min(na, off + nb);
    let best = null;
    for (let p = lo; p + 1 < hi; p++) {
      const c = [p, p + 1].map(q => depth(ma, side, q) + depth(mb, OPP[side], q - off));
      const cost = c[0] + c[1] + Math.abs(p + 0.5 - (lo + hi) / 2) * 0.01;        // ties: the middle of the shared edge
      if (!best || cost < best.cost) best = { p, cost };
    }
    return best;
  }
  // carve the crossing at positions p, p+1 (along A's edge) into both maps
  function carveOps(A, side, B, off, p) {
    const ops = [];
    for (const [k, s, base] of [[A, side, 0], [B, OPP[side], off]]) {
      const m = L(k), gnd = groundOf(m), cells = [];
      for (const q of [p, p + 1]) {
        const i = q - base, d = depth(m, s, i);
        for (let j = 0; j < Math.min(d, 18); j++) { const [x, y] = cellOf(m, s, i, j); cells.push([x, y, gnd]); }
      }
      if (cells.length) ops.push({ t: 'paintfull', k, cells });
    }
    return ops;
  }
  // close an edge where a connection was removed: two rows of trees over every open cell in [i0, i1)
  function sealOps(k, side, i0, i1) {
    const m = L(k), [px, py] = treeParity(m), cells = [];
    for (let i = Math.max(0, i0); i < Math.min(along(m, side), i1); i++) {
      if (!land(m, at(m, ...cellOf(m, side, i, 0))) && !land(m, at(m, ...cellOf(m, side, i, 1)))) continue;
      for (let d = 0; d < 2; d++) { const [x, y] = cellOf(m, side, i, d); cells.push([x, y, TREE[(y - py) & 1][(x - px) & 1]]); }
    }
    return cells.length ? [{ t: 'paintfull', k, cells }] : [];
  }
  const dimsOf = k => { const m = L(k); return { w: m.w, h: m.h }; };
  // B's rectangle on `side` of A's rectangle a, `off` blocks along A's edge
  function rectNext(a, side, B, off) {
    const d = dimsOf(B);
    if (side === 'S') return { k: B, x: a.x + off, y: a.y + a.h, w: d.w, h: d.h };
    if (side === 'N') return { k: B, x: a.x + off, y: a.y - d.h, w: d.w, h: d.h };
    if (side === 'E') return { k: B, x: a.x + a.w, y: a.y + off, w: d.w, h: d.h };
    return { k: B, x: a.x - d.w, y: a.y + off, w: d.w, h: d.h };
  }
  // choose B's offset in [o0, o1] with the cheapest crossing (ties: closest to `pref`)
  function bestOff(A, side, B, o0, o1, pref) {
    let best = null;
    for (let o = o0; o <= o1; o++) { const c = crossing(A, side, B, o); if (!c) continue; const cost = c.cost + Math.abs(o - pref) * 0.02; if (!best || cost < best.cost) best = { o, p: c.p, cost, raw: c.cost }; }
    return best;
  }
  // ---------- a new route, drawn from scratch ----------
  // Works on 2x2 units (the size of a tree): a winding path between the openings, clearings along it, tall grass,
  // a few lone trees and ledges; then the units are drawn with FireRed's own tiles - trees get their edge tiles
  // where they meet open ground, and the treetop that hangs over the ground above them.
  // openings: [{ side, i0, i1 }] (cells along that edge, i1 exclusive)
  // opt: { seed, grass (0..1 of the open area), clearings (0..1), ledges (count), flowers (0..1), lane (path radius) }
  const V_ = {
    tree: { tl: 0x41C, tr: 0x41D, bl: 0x414, br: 0x415, tlE: 0x41E, trE: 0x41F, blE: 0x416, brE: 0x417, blS: 0x424, brS: 0x425, blSE: 0x426, brSE: 0x427 },
    ground: [[0x3008, 0x3009], [0x3010, 0x3011]], plain: 0x3001, flower: 0x3004, top: [0x300E, 0x300F], grass: 0x300D,
    ledge: [0x4B0, 0x487, 0x4B1],
  };
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function noise(U, V, scale, rnd) {           // smooth value noise on the unit grid, 0..1
    const gw = Math.ceil(U / scale) + 2, gh = Math.ceil(V / scale) + 2, g = Array.from({ length: gw * gh }, rnd);
    const at = (i, j) => g[j * gw + i], sm = t => t * t * (3 - 2 * t);
    return (u, v) => { const x = u / scale, y = v / scale, i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
      return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy; };
  }
  function genRoute(k, openings, opt = {}) {
    const m = L(k), W = m.w, H = m.h, U = W >> 1, V = H >> 1, rnd = rng(opt.seed || 7);
    const open = Array.from({ length: V }, () => new Uint8Array(U)), lane = Array.from({ length: V }, () => new Uint8Array(U));
    const inU = (u, v) => u >= 0 && v >= 0 && u < U && v < V;
    const disc = (cu, cv, r, onLane) => {
      for (let v = Math.floor(cv - r); v <= Math.ceil(cv + r); v++) for (let u = Math.floor(cu - r); u <= Math.ceil(cu + r); u++)
        if (inU(u, v) && (u - cu) ** 2 + (v - cv) ** 2 <= r * r + 0.01) { open[v][u] = 1; if (onLane) lane[v][u] = 1; }
    };
    const vertical = H >= W, n = vertical ? V : U, w = vertical ? U : V;
    // where each opening enters (unit coordinates, just inside the edge)
    const ents = openings.map(o => {
      const a = (o.i0 / 2 + o.i1 / 2 - 1) / 2;
      return o.side === 'N' ? { u: a, v: 0.5 } : o.side === 'S' ? { u: a, v: V - 1.5 } : o.side === 'W' ? { u: 0.5, v: a } : { u: U - 1.5, v: a };
    });
    // the spine: from the first opening to the second, through waypoints that wander across the map
    const A = ents[0], B = ents[1] || ents[0], pts = [A];
    const aAlong = p => vertical ? p.v : p.u, cr = p => vertical ? p.u : p.v;
    const s0 = aAlong(A), s1 = aAlong(B), steps = Math.max(1, Math.round(Math.abs(s1 - s0) / (opt.step || 8)));
    let c = cr(A);
    for (let i = 1; i < steps; i++) {
      const t = s0 + (s1 - s0) * i / steps, target = cr(A) + (cr(B) - cr(A)) * i / steps;
      const wild = 2 + rnd() * (w - 5), mix = opt.wander ?? 0.5;
      c = Math.max(2, Math.min(w - 3, (target * 0.6 + c * 0.4) * (1 - mix) + wild * mix));
      pts.push(vertical ? { u: c, v: t } : { u: t, v: c });
    }
    pts.push(B);
    const R = opt.lane || 1.1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], r0 = R * (0.8 + rnd() * 0.5);
      // bends at right angles, like FireRed's paths: along the long axis, across, along again
      const mid = vertical ? { u: a.u, v: (a.v + b.v) / 2 } : { u: (a.u + b.u) / 2, v: a.v }, mid2 = vertical ? { u: b.u, v: (a.v + b.v) / 2 } : { u: (a.u + b.u) / 2, v: b.v };
      for (const [p, q] of [[a, mid], [mid, mid2], [mid2, b]]) {
        const l = Math.max(1, Math.ceil(Math.hypot(q.u - p.u, q.v - p.v) * 4));
        for (let j = 0; j <= l; j++) disc(p.u + (q.u - p.u) * j / l, p.v + (q.v - p.v) * j / l, r0, true);
      }
    }
    // more openings join the nearest waypoint
    for (const e of ents.slice(2)) {
      let best = pts[0]; for (const p of pts) if (Math.hypot(p.u - e.u, p.v - e.v) < Math.hypot(best.u - e.u, best.v - e.v)) best = p;
      const l = Math.ceil(Math.hypot(best.u - e.u, best.v - e.v) * 4) || 1;
      for (let j = 0; j <= l; j++) disc(e.u + (best.u - e.u) * j / l, e.v + (best.v - e.v) * j / l, R, true);
    }
    // clearings
    const clearings = [];
    for (const p of pts.slice(1, -1)) {
      if (rnd() > (opt.clearings ?? 0.75)) continue;
      const r = Math.min(w / 2 - 1, 1.8 + rnd() * 2.2), cu = vertical ? Math.max(r + 1, Math.min(U - r - 2, p.u + (rnd() - 0.5) * 3)) : p.u, cv = vertical ? p.v : Math.max(r + 1, Math.min(V - r - 2, p.v + (rnd() - 0.5) * 3));
      disc(cu, cv, r, false); clearings.push({ u: cu, v: cv, r });
    }
    // the outer ring of units stays trees, except at the openings
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) if ((u === 0 || v === 0 || u === U - 1 || v === V - 1) && !lane[v][u]) open[v][u] = 0;
    // lone trees in the big clearings (not on the path)
    for (const cl of clearings) if (cl.r > 2.4) for (let i = 0; i < 2; i++) {
      const u = Math.round(cl.u + (rnd() - 0.5) * cl.r), v = Math.round(cl.v + (rnd() - 0.5) * cl.r);
      if (inU(u, v) && !lane[v][u]) open[v][u] = 0;
    }
    // cells
    const cell = Array.from({ length: H }, () => new Uint16Array(W));
    const isOpen = (u, v) => inU(u, v) && !!open[v][u];
    const nz = noise(U, V, opt.grassScale || 3.5, rnd), grassCut = 1 - (opt.grass ?? 0.45), t = V_.tree;
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
      const x = u * 2, y = v * 2;
      if (!open[v][u]) {
        const L1 = isOpen(u - 1, v), R1 = isOpen(u + 1, v), D1 = isOpen(u, v + 1);
        cell[y][x] = L1 ? t.tlE : t.tl; cell[y][x + 1] = R1 ? t.trE : t.tr;
        cell[y + 1][x] = D1 ? (L1 ? t.blSE : t.blS) : (L1 ? t.blE : t.bl);
        cell[y + 1][x + 1] = D1 ? (R1 ? t.brSE : t.brS) : (R1 ? t.brE : t.br);
      } else {
        const grassy = nz(u, v) > grassCut && !(lane[v][u] && rnd() < 0.5);
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          let val = V_.ground[dy][dx];
          const r = rnd(); if (r < (opt.flowers ?? 0.015)) val = V_.flower; else if (r < 0.09) val = V_.plain;
          if (grassy) val = V_.grass;
          cell[y + dy][x + dx] = val;
        }
        if (v + 1 < V && !open[v + 1][u]) { cell[y + 1][x] = V_.top[0]; cell[y + 1][x + 1] = V_.top[1]; }     // the treetop below hangs up here
      }
    }
    // odd sizes: the last column / row repeats the tree border
    if (W & 1) for (let y = 0; y < H; y++) cell[y][W - 1] = y & 1 ? t.br : t.tr;
    if (H & 1) for (let x = 0; x < W; x++) cell[H - 1][x] = x & 1 ? t.br : t.bl;
    // ledges (jump south): across open ground, off the path, with ground above and below
    let placedL = 0;
    for (let tries = 0; tries < 400 && placedL < (opt.ledges ?? 3); tries++) {
      const v = 1 + Math.floor(rnd() * (V - 3)), u0 = 1 + Math.floor(rnd() * (U - 3)), len = 2 + Math.floor(rnd() * 3);
      let ok = true;
      for (let u = u0; u < u0 + len; u++) if (!isOpen(u, v) || !isOpen(u, v + 1) || !isOpen(u, v - 1) || lane[v][u] || lane[v + 1][u]) ok = false;
      if (!ok) continue;
      const y = v * 2 + 1;
      for (let x = u0 * 2; x < (u0 + len) * 2; x++) cell[y][x] = x === u0 * 2 ? V_.ledge[0] : x === (u0 + len) * 2 - 1 ? V_.ledge[2] : V_.ledge[1];
      placedL++;
    }
    // the exact opening cells, and three cells inward from each
    for (const o of openings) for (let i = o.i0; i < o.i1; i++) for (let d = 0; d < 3; d++) {
      const [x, y] = cellOf(m, o.side, i, d);
      if ((cell[y][x] >> 10) & 3) cell[y][x] = V_.ground[y & 1][x & 1];
    }
    const cells = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push([x, y, cell[y][x]]);
    return [{ t: 'paintfull', k, cells }];
  }
  // ---------- wild Pokémon for the new order ----------
  // plan: { 'g.n': [min, max] (land) | { from: 'g.n', land: [min, max] } }. Levels are stretched onto the new range;
  // a Pokémon whose level reaches its evolution level appears evolved. Surfing gets at least 25-35 (Surf comes after
  // the fourth gym); fishing (the rods) stays as it is.
  function evolveAt(sp, lv) {
    const base = G().offsets.evolutions;
    for (let k = 0; k < 3; k++) {
      let next = null;
      for (let i = 0; i < 5; i++) { const e = base + sp * 40 + i * 8, meth = R().r16(e); if (meth === 4 && R().r16(e + 2) <= lv) { next = R().r16(e + 4); break; } }
      if (!next) break; sp = next;
    }
    return sp;
  }
  function scaleSlots(slots, lo, hi) {
    const omin = Math.min(...slots.map(s => s.min)), omax = Math.max(...slots.map(s => s.max)), f = v => Math.round(lo + (v - omin) * (hi - lo) / Math.max(1, omax - omin));
    return slots.map(s => { const min = f(s.min), max = Math.max(min, f(s.max)); return { min, max, sp: evolveAt(s.sp, min) }; });
  }
  function scaleWild(plan) {
    const done = [];
    for (const [k, p] of Object.entries(plan)) {
      const [g, n] = P(k), spec = Array.isArray(p) ? { land: p } : p, [sg, sn] = P(spec.from || k);
      for (const kind of ['grass', 'water']) {
        const cur = Wild.read(sg, sn, kind); if (!cur) continue;
        const [lo, hi] = kind === 'grass' ? spec.land : [Math.max(25, spec.land[0]), Math.max(35, spec.land[1])];
        Wild.write(g, n, kind, cur.rate, scaleSlots(cur.slots, lo, hi)); done.push(k + ' ' + kind + ' ' + lo + '-' + hi);
      }
    }
    return done;
  }
  // ---------- trainers for the new order ----------
  // the species it would be at that level: evolve up (level evolutions), or step back while the level is below the
  // level its pre-evolution evolves at
  let preMap = null;
  function speciesAt(sp, lv) {
    if (!preMap) {
      preMap = new Map(); const base = G().offsets.evolutions;
      for (let s = 1; s < 412; s++) for (let i = 0; i < 5; i++) { const e = base + s * 40 + i * 8; if (R().r16(e) === 4 && !preMap.has(R().r16(e + 4))) preMap.set(R().r16(e + 4), [s, R().r16(e + 2)]); }
    }
    sp = evolveAt(sp, lv);
    for (let k = 0; k < 3; k++) { const p = preMap.get(sp); if (!p || lv >= p[1]) break; sp = p[0]; }
    return sp;
  }
  // the scripts of a map, all of them (people, triggers, signs, map scripts; trainer battles' after-battle scripts too)
  function walkAll(start, fn, seen = new Set(), depth = 0) {
    const r = R(), LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN;
    if (start < 0 || seen.has(start) || depth > 12) return; seen.add(start);
    for (let p = start, end = start + 1200; p < end && p < r.size - 24;) {
      const op = r.u8[p]; fn(op, p);
      if (op === 0x02 || op === 0x03) return;
      if (op === 0x04 || op === 0x05) { walkAll(r.ptr(p + 1), fn, seen, depth + 1); if (op === 0x05) return; }
      if (op === 0x06 || op === 0x07) walkAll(r.ptr(p + 2), fn, seen, depth + 1);
      if (op === 0x5C && [1, 2, 6, 8].includes(r.u8[p + 1])) walkAll(r.ptr(p + 14), fn, seen, depth + 1);
      const n = op === 0x5C ? (TL[r.u8[p + 1]] || 0) : LEN[op]; if (!n) return; p += n;
    }
  }
  function mapScripts(k) {
    const r = R(), [gi, ni] = P(k), hp = G().mapGroups[gi][ni], out = [], ev = r.ptr(hp + 4);
    if (ev >= 0) { const E = MapsTab.api.readEvents(ev); E.obj.forEach(o => out.push(r.ptr(o.off + 16))); E.coord.forEach(o => out.push(r.ptr(o.off + 12))); E.bg.forEach(o => { if (r.u8[o.off + 5] < 5) out.push(r.ptr(o.off + 8)); }); }
    const ms = r.ptr(hp + 8);
    if (ms >= 0) for (let i = 0; r.u8[ms + i * 5] && i < 16; i++) { const t = r.u8[ms + i * 5], p = r.ptr(ms + i * 5 + 1); if (p < 0) continue; if (t === 2 || t === 4) { for (let j = 0; j < 20 && r.r16(p + j * 8); j++) out.push(r.ptr(p + j * 8 + 4)); } else out.push(p); }
    return out;
  }
  function trainersOf(k) { const ids = new Set(), seen = new Set(); for (const sp of mapScripts(k)) walkAll(sp, (op, p) => { if (op === 0x5C) ids.add(R().r16(p + 2)); }, seen); return [...ids]; }
  function party(id) {
    const r = R(), b = G().offsets.trainers + id * 40, n = r.u8[b + 32], p = r.ptr(b + 36), sz = (r.u8[b] & 1) ? 16 : 8;
    return Array.from({ length: n }, (_, i) => ({ at: p + i * sz, lv: r.r16(p + i * sz + 2), sp: r.r16(p + i * sz + 4) }));
  }
  // plan: { 'g.n': top level } - every trainer of the map is stretched so the strongest Pokémon (of `leader` if
  // given) lands on that level; each trainer is changed once (the first map that names it)
  function scaleTrainers(plan, done = new Set()) {
    const log = [];
    for (const [k, spec] of Object.entries(plan)) {
      const { top, leader } = typeof spec === 'number' ? { top: spec } : spec;
      const ids = trainersOf(k).filter(id => !done.has(id)); if (!ids.length) continue;
      const ref = leader != null ? [leader] : ids, max = Math.max(...ref.flatMap(id => party(id).map(m => m.lv)));
      if (!max) continue;
      const f = top / max;
      for (const id of ids) { done.add(id); for (const m of party(id)) { const lv = Math.max(2, Math.min(100, Math.round(m.lv * f))); R().w16(m.at + 2, lv); R().w16(m.at + 4, speciesAt(m.sp, lv)); } }
      log.push(k + ' ×' + f.toFixed(2) + ' (' + ids.length + ' trainers)');
    }
    return log;
  }
  return { L, at, land, depth, crossing, carveOps, sealOps, rectNext, bestOff, groundOf, treeParity, dimsOf, beh, OPP, along, cellOf, genRoute, rng, evolveAt, scaleWild, speciesAt, trainersOf, party, scaleTrainers, mapScripts, walkAll };
})();
'IW ready';
