// Seams: where two connected maps meet. Learns from the original game which blocks stand next to which (inside every
// map and across the game's own connections), then marks what the game never does at a seam: half a tree, water
// against land without a shore, a road that runs into a wall. It can also work out a fix (a few blocks of the map
// the user built change, or that map grows by up to 4 rows toward its neighbour).
// A seam is seen from its two sides: A is the upper / left map, B the lower / right one. Positions i run along the
// seam (0..n-1 = where both maps are), depth d runs away from it (0 = the row touching the seam).
'use strict';

const Seams = (() => {
  const DOWN = 0, UP = 1, RIGHT = 2, LEFT = 3;
  let L = null;                                   // what was learned from the original game

  const tkey = (prim, sec, id) => id < App.game.primaryMetatiles ? 'p' + prim + ':' + id : 's' + sec + ':' + id;
  const WATER = () => new Set(App.game.isEmerald ? [0x10, 0x11, 0x12, 0x14, 0x15, 0x50, 0x51, 0x52, 0x53] : [0x10, 0x11, 0x12, 0x15, 0x1A]);

  // ---------- learning: every pair of neighbouring blocks in the original game ----------
  function learn() {
    const orig = App.rom.original;
    if (L && L.orig === orig) return L;
    const uid = new Map(), uprim = [], uids = [], nb = [[], [], [], []], full = [];
    const r = new Rom(orig.buffer.slice(orig.byteOffset, orig.byteOffset + orig.byteLength), 'original.gba');
    const get = (prim, sec, v) => {
      const k = tkey(prim, sec, v & 0x3FF); let u = uid.get(k);
      if (u == null) { u = uprim.length; uid.set(k, u); uprim.push(k[0] === 'p' ? prim : sec); uids.push(v & 0x3FF); full.push(new Map()); for (const d of nb) d.push(null); }
      return u;
    };
    const add = (a, b, vert) => {
      const [f, back] = vert ? [DOWN, UP] : [RIGHT, LEFT];
      (nb[f][a] || (nb[f][a] = new Map())).set(b, (nb[f][a].get(b) || 0) + 1);
      (nb[back][b] || (nb[back][b] = new Map())).set(a, (nb[back][b].get(a) || 0) + 1);
    };
    let groups = [];
    try { groups = Game.readMapGroups(r, App.game.offsets.mapGroups); } catch (e) { groups = []; }
    const lays = new Map();                       // layout -> its blocks as uids
    const layOf = hp => {
      const lay = r.ptr(hp); if (lay < 0) return null;
      if (lays.has(lay)) return lays.get(lay);
      const w = r.r32(lay), hh = r.r32(lay + 4), bl = r.ptr(lay + 12), prim = r.ptr(lay + 16), sec = r.ptr(lay + 20);
      let o = null;
      if (w > 0 && hh > 0 && w * hh <= 0x2800 && bl >= 0 && prim >= 0 && sec >= 0) {
        const u = new Int32Array(w * hh);
        for (let i = 0; i < w * hh; i++) { const v = r.r16(bl + i * 2); u[i] = get(prim, sec, v); const f = full[u[i]]; f.set(v, (f.get(v) || 0) + 1); }
        o = { w, h: hh, u, fresh: true };
      }
      lays.set(lay, o); return o;
    };
    for (const grp of groups) for (const hp of grp) {
      const m = layOf(hp); if (!m || !m.fresh) continue; m.fresh = false;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const a = m.u[y * m.w + x];
        if (x + 1 < m.w) add(a, m.u[y * m.w + x + 1], false);
        if (y + 1 < m.h) add(a, m.u[(y + 1) * m.w + x], true);
      }
    }
    // the game's own seams look right by definition
    for (const grp of groups) for (const hp of grp) {
      const A = layOf(hp), cp = r.ptr(hp + 12); if (!A || cp < 0) continue;
      const n = r.r32(cp), lp = r.ptr(cp + 4); if (lp < 0 || n > 32) continue;
      for (let c = 0; c < n; c++) {
        const o = lp + c * 12, dir = r.r32(o), off = r.r32(o + 4) | 0, B = layOf((groups[r.u8[o + 8]] || [])[r.u8[o + 9]] || -1);
        if (!B) continue;
        if (dir === 1) for (let x = Math.max(0, off); x < Math.min(A.w, off + B.w); x++) add(A.u[(A.h - 1) * A.w + x], B.u[x - off], true);
        if (dir === 4) for (let y = Math.max(0, off); y < Math.min(A.h, off + B.h); y++) add(A.u[y * A.w + A.w - 1], B.u[(y - off) * B.w], false);
      }
    }
    L = { orig, uid, uprim, uids, nb, full, openC: new Map() };
    return L;
  }
  const uidOf = (prim, sec, v) => { const u = learn().uid.get(tkey(prim, sec, v & 0x3FF)); return u == null ? -1 : u; };
  const count = (a, b, vert) => { if (a < 0 || b < 0) return 0; const m = L.nb[vert ? DOWN : RIGHT][a]; return (m && m.get(b)) || 0; };
  // "open" toward a side: many different blocks stand there in the game (ground, grass), so a new neighbour is fine;
  // not open: always the same few (the lower half of a tree, the shore of the water)
  function open(u, dir) {
    if (u < 0) return true;
    const k = u * 4 + dir; if (L.openC.has(k)) return L.openC.get(k);
    const m = L.nb[dir][u]; let res = true;
    if (m) {
      let tot = 0, top = 0; for (const c of m.values()) { tot += c; top = Math.max(top, c); }
      let strong = 0; for (const c of m.values()) if (c >= tot * 0.03) strong++;
      res = tot < 4 || (top < tot * 0.6 && strong >= 4);
    }
    L.openC.set(k, res); return res;
  }
  // a and b (cells {u, cls}) next to each other: a above b (vert) or a left of b
  function pairOk(a, b, vert) {
    if (count(a.u, b.u, vert)) return true;
    if (a.u < 0 || b.u < 0) return a.cls === b.cls || a.u < 0 && b.u < 0;
    return a.cls === b.cls && open(a.u, vert ? DOWN : RIGHT) && open(b.u, vert ? UP : LEFT);
  }

  // ---------- checking a seam ----------
  // seam: { vert (A above B), n, A, B }; a side: { get(d, i) -> block value or -1, cell(v) -> { u, cls } }
  // cls: 'walk', 'wall' or 'water'
  function analyze(s) {
    learn();
    const issues = new Map(), cross = [];
    const at = (S, d, i) => { const v = S.get(d, i); return v < 0 ? null : S.cell(v); };
    for (let i = 0; i < s.n; i++) {
      const a = at(s.A, 0, i), b = at(s.B, 0, i); if (!a || !b) { cross.push(false); continue; }
      cross.push(a.cls === b.cls && a.cls !== 'wall');
      if (count(a.u, b.u, s.vert)) continue;
      if (a.cls !== b.cls && (a.cls === 'water') !== (b.cls === 'water') && a.cls !== 'wall' && b.cls !== 'wall') issues.set(i, 'terrain');
      else if (!pairOk(a, b, s.vert)) issues.set(i, 'cut');
    }
    // a road that reaches the seam and finds only wall on the other side: 2-6 wide, at least 2 deep, walls on both its
    // sides, and no door at its end (the game itself has roads that end at a gatehouse door)
    let roads = 0;
    for (const [X, Y] of [[s.A, s.B], [s.B, s.A]]) {
      const road = j => { const c0 = at(X, 0, j), c1 = at(X, 1, j); return c0 && c1 && c0.cls === 'walk' && c1.cls === 'walk'; };
      const wall = j => { const c = at(X, 0, j); return c && c.cls === 'wall'; };
      let i = 0;
      while (i < s.n) {
        if (!road(i)) { i++; continue; }
        let j = i; while (j < s.n && road(j)) j++;
        const door = [X, Y].some(Z => Z.door && [0, 1, 2].some(d => { for (let q = i; q < j; q++) if (Z.door(d, q)) return true; return false; }));
        if (j - i >= 2 && j - i <= 6 && wall(i - 1) && wall(j) && !door && !cross.slice(i, j).some(Boolean)) {
          roads++;
          for (let q = i; q < j; q++) { const y = at(Y, 0, q); if (y && y.cls === 'wall' && issues.get(q) !== 'terrain') issues.set(q, 'block'); }   // worse than "cut"
        }
        i = j;
      }
    }
    // s.keep(i): only these spots count (the world view leaves out what the original game has there itself)
    const list = [...issues].map(([i, kind]) => ({ i, kind })).filter(x => !s.keep || s.keep(x.i)).sort((p, q) => p.i - q.i);
    // nothing crosses at all: only a problem when a road leads there (the game has connections that are only scenery)
    return { issues: list, blocked: roads > 0 && !cross.some(Boolean) && list.some(x => x.kind === 'block') };
  }

  // ---------- a fix: a band of rows on the user's side, filled block by block (beam search) ----------
  // band: { side (the user's map: 'A' or 'B'), D rows, i0..i1, grow (new rows inserted at the seam) }
  function solveBand(s, user, band) {
    const S = s[user], O = user === 'A' ? s.B : s.A, first = user === 'A', vert = s.vert, { D, i0, i1, grow } = band;
    const W = i1 - i0, N = D * W, need = band.need || new Map();
    const at = (X, d, i) => { const v = X.get(d, i); return v < 0 ? null : Object.assign({ v }, X.cell(v)); };
    const old = (d, i) => grow ? (d >= D ? at(S, d - D, i) : null) : at(S, d, i);
    // pair score: seen in the game = good, plausible = 0, wrong = penalty
    const P = (a, b, v, hard) => { if (!a || !b) return 0; const c = count(a.u, b.u, v); if (c) return Math.min(4, Math.log(1 + c)); return pairOk(a, b, v) ? -0.5 : hard ? -1000 : -30; };
    // ordered pairs (upper / left first): on A the neighbour toward the seam is below / right of the block, on B above / left
    const across = (near, far, hard) => first ? P(near, far, vert, hard) : P(far, near, vert, hard);
    const along = (prev, next) => P(prev, next, !vert, false);
    const ts = S.tilesets, frequent = band.frequent || [];
    const cands = (toward, left, orig, inner) => {
      const set = new Map();
      const addFrom = (c, dir) => { if (!c || c.u < 0) return; const m = L.nb[dir][c.u]; if (!m) return; for (const [u, k] of m) set.set(u, (set.get(u) || 0) + k); };
      addFrom(toward, vert ? (first ? UP : DOWN) : (first ? LEFT : RIGHT));
      addFrom(left, vert ? RIGHT : DOWN);
      addFrom(inner, vert ? (first ? DOWN : UP) : (first ? RIGHT : LEFT));          // the last row also has to fit what is behind it
      const out = [];
      for (const [u, k] of [...set].sort((p, q) => q[1] - p[1])) {
        if (out.length >= 40) break;
        const own = L.uids[u] < App.game.primaryMetatiles ? L.uprim[u] === ts.prim : L.uprim[u] === ts.sec;
        if (!own) continue;
        const best = topFull(u);
        if (best >= 0) out.push(best);
      }
      for (const v of frequent) if (out.length < 36 && !out.includes(v)) out.push(v);
      if (orig && !out.includes(orig.v)) out.unshift(orig.v);
      return out;
    };
    // look ahead: per column, the blocks at each row from which the game has a way (block above block) to what is behind
    // the band, so an early row does not pick a block that leads nowhere (trees -> ground -> shore -> water)
    const backDir = vert ? (first ? DOWN : UP) : (first ? RIGHT : LEFT), ownU = u => L.uids[u] < App.game.primaryMetatiles ? L.uprim[u] === ts.prim : L.uprim[u] === ts.sec;
    const reach = new Map();
    for (let i = i0; i < i1; i++) {
      const inner = old(D, i); if (!inner || inner.u < 0) continue;
      const rows = []; let cur = new Set([inner.u]);
      for (let d = D - 1; d >= 0; d--) {
        const next = new Map();
        for (const u of cur) { const m = L.nb[backDir][u]; if (m) for (const [t, k] of m) if (ownU(t)) next.set(t, (next.get(t) || 0) + k); }
        cur = new Set([...next].sort((p, q) => q[1] - p[1]).slice(0, 300).map(x => x[0])); rows[d] = cur;
      }
      reach.set(i, rows);
    }
    let beam = [{ vals: [], score: 0, bad: 0 }];
    for (let c = 0; c < N; c++) {
      const d = Math.floor(c / W), i = i0 + (c % W), next = [];
      const orig = grow ? null : at(S, d, i), fixed = !grow && band.fixed && band.fixed(d, i);
      for (const st of beam) {
        const cellAt = (dd, ii) => { if (ii < i0 || ii >= i1) return old(dd, ii); if (dd >= D) return old(dd, ii); return st.vals[dd * W + ii - i0]; };
        const toward = d === 0 ? (i >= 0 && i < s.n ? at(O, 0, i) : null) : cellAt(d - 1, i);
        const left = i > i0 ? st.vals[c - 1] : (grow ? null : old(d, i - 1));
        const rr = reach.get(i), can = rr && rr[d] && rr[d].size ? rr[d] : null;
        // a new row first tries to continue the edge's own pattern (trees repeat every 2 rows)
        const pat = grow ? old(D + ((D - d) % 2), i) || old(D, i) : null;
        let list = fixed ? [orig.v] : cands(toward, left, orig, d === D - 1 ? old(D, i) : null);
        if (can && !fixed) {                                  // the ones that lead on first, plus a few of those even if the seam side never had them
          const go = list.filter(v => { const u = S.cell(v).u; return u >= 0 && can.has(u); }), extra = [];
          if (toward && toward.u >= 0) { const m = L.nb[vert ? (first ? UP : DOWN) : (first ? LEFT : RIGHT)][toward.u]; if (m) for (const [u] of [...m].sort((p, q) => q[1] - p[1])) if (can.has(u) && extra.length < 12) { const v = topFull(u); if (v >= 0 && !list.includes(v)) extra.push(v); } }
          list = [...go, ...extra, ...list.filter(v => !go.includes(v))];
        }
        if (pat && !list.includes(pat.v)) list.unshift(pat.v);
        for (const v of list) {
          const me = Object.assign({ v }, S.cell(v));
          let sc = st.score, bad = st.bad;
          const add = x => { sc += x; if (x <= -30) bad++; };
          if (d === 0) { if (toward) add(across(me, toward, need.has(i))); }
          else add(across(me, toward, false));
          if (left) add(along(left, me));
          if (i === i1 - 1 && !grow) { const rr = old(d, i1); if (rr) add(along(me, rr)); }
          if (d === D - 1) { const inner = old(D, i); if (inner) add(first ? P(inner, me, vert, false) : P(me, inner, vert, false)); }
          if (d === 0 && need.has(i) && need.get(i) !== me.cls) add(-1000);
          if (orig && v !== orig.v) sc -= grow ? 0 : 2;
          if (pat && v === pat.v) sc += 3;
          if (can && d < D - 1 && !can.has(me.u)) sc -= 40;               // a dead end: worse than one wrong pair
          next.push({ vals: st.vals.concat([me]), score: sc, bad });
        }
      }
      next.sort((p, q) => q.score - p.score);
      beam = next.slice(0, 40);
      if (!beam.length) return null;
    }
    const best = beam[0];
    const changes = [];
    for (let c = 0; c < N; c++) { const d = Math.floor(c / W), i = i0 + (c % W), o = grow ? null : at(S, d, i); if (!o || o.v !== best.vals[c].v) changes.push({ d, i, v: best.vals[c].v }); }
    return { changes, score: best.score, bad: best.bad };
  }
  function topFull(u) { let best = -1, bc = 0; for (const [v, c] of L.full[u]) if (c > bc) { bc = c; best = v; } return best; }
  // the seam as it would be after a fix (a side that reads the new blocks first)
  function overlay(s, user, fix) {
    const S = s[user], m = new Map(fix.changes.map(c => [c.d + ',' + c.i, c.v])), k = fix.grow || 0;
    const side = Object.assign({}, S, { get: (d, i) => { const v = m.get(d + ',' + i); if (v != null) return v; return d < k ? -1 : S.get(d - k, i); } });
    const touched = new Set(fix.changes.map(c => c.i)), keep = s.keep && (k ? null : i => touched.has(i) || s.keep(i));   // what the fix changes is checked too
    return Object.assign({}, s, { [user]: side, keep });
  }
  // what to change: a few blocks first (1 or 2 rows), then the map grows by 1..4 rows (the user asked: up to 4)
  function propose(s, user, opts = {}) {
    learn();
    const now = analyze(s); if (!now.issues.length && !now.blocked) return null;
    const S = s[user], O = user === 'A' ? s.B : s.A;
    const lo = Math.min(...now.issues.map(x => x.i)), hi = Math.max(...now.issues.map(x => x.i)) + 1;
    // where the other side is walkable / water and the user's side must match (a road that ends at the seam)
    const need = new Map();
    for (const x of now.issues) if (x.kind === 'block') { const v = O.get(0, x.i); if (v >= 0) need.set(x.i, O.cell(v).cls); }
    if (now.blocked && !need.size) {            // nothing crosses at all: open the widest walkable stretch of the other side
      let best = null;
      for (let i = 0; i < s.n;) { const ok = j => { const v = O.get(0, j); return v >= 0 && O.cell(v).cls === 'walk'; }; if (!ok(i)) { i++; continue; } let j = i; while (j < s.n && ok(j)) j++; if (!best || j - i > best[1] - best[0]) best = [i, j]; i = j; }
      if (best) for (let i = best[0]; i < Math.min(best[1], best[0] + 3); i++) need.set(i, 'walk');
    }
    const ext = S.ext, frequent = opts.frequent || [];
    const tries = [];
    const paint = D => { const m = D > 2 ? 3 : 2, i0 = Math.max(ext[0], Math.min(lo, ...need.keys()) - m), i1 = Math.min(ext[1], Math.max(hi, ...[...need.keys()].map(x => x + 1)) + m); tries.push({ D, i0, i1, grow: false }); };
    paint(1); paint(2);
    for (let k = 1; k <= (opts.maxGrow || 4); k++) tries.push({ D: k, i0: ext[0], i1: ext[1], grow: true });
    paint(3); paint(4);                                  // deeper changes in place: only when they come out better than growing
    let best = null;
    for (const t of tries) {
      if (t.i1 <= t.i0) continue;
      const res = solveBand(s, user, Object.assign({ need, fixed: opts.fixed, frequent }, t)); if (!res) continue;
      const fix = { grow: t.grow ? t.D : 0, changes: res.changes, bad: res.bad };
      const after = analyze(overlay(s, user, fix));
      fix.left = after.issues.length + (after.blocked ? 100 : 0);
      if (!fix.left && !res.bad) return fix;
      // what a fix costs: a problem left on the seam > a small mismatch inside > a row more > a block changed
      fix.cost = fix.left * 100 + fix.bad * 12 + fix.grow * 15 + fix.changes.length * 0.2;
      if (!best || fix.cost < best.cost) best = fix;
    }
    return best && best.left < now.issues.length + (now.blocked ? 100 : 0) ? best : null;
  }

  return { learn, uidOf, analyze, propose, overlay, WATER, reset: () => { L = null; } };
})();
