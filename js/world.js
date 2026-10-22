// World view (sub-tab of Maps & Wild): every outdoor map joined by its connections, drawn with real tiles.
// Edit from here: paint blocks, drag people / doors / signs, resize a map by dragging its edges (like a window),
// move a map along its neighbour (connection offsets), add / remove connections. Ctrl+Z undoes any of it.
'use strict';

const WorldTab = (() => {
  const S = {
    zoom: 0.35, panX: -200, panY: -200, mode: 'manage', active: null, selBlock: 1, root: '3.0',
    floating: new Map(), lastPos: new Map(), touched: new Set(), undo: [], log: [], showEvents: true, showNames: true, fitted: false, pending: null,
    tab: 'blocks', trail: [], brush: null, selColl: 0, selElev: 3, hover: null, space: false, addKind: null, selEv: null,
  };
  const cache = new Map();              // map key -> { cv, m }
  const LIMIT = 0x2800;                 // the game's map buffer: (width + 15) * (height + 14) blocks
  const MODES = [['manage', '🧭 General map management'], ['paint', '🖌 Paint'], ['coll', '⛔ Collision'], ['events', '👤 People & doors'], ['resize', '↔ Resize'], ['connect', '🔗 Connections']];
  const MODE_TAB = { paint: 'blocks', coll: 'coll', events: 'objects' }, TAB_MODE = { blocks: 'paint', coll: 'coll', objects: 'events' };
  const DIR_NAME = { 1: 'south', 2: 'north', 3: 'west', 4: 'east' };
  const rom = () => App.rom, game = () => App.game;
  const key = (g, n) => g + '.' + n;
  const parse = k => k.split('.').map(Number);
  const hdrOf = k => { const [g, n] = parse(k); return (game().mapGroups[g] || [])[n]; };
  const dims = k => { const r = rom(), h0 = hdrOf(k), lay = h0 ? r.ptr(h0) : -1; return lay < 0 ? { w: 0, h: 0, lay } : { w: r.r32(lay), h: r.r32(lay + 4), lay }; };
  const nameOf = k => Game.mapName(rom(), game(), rom().u8[hdrOf(k) + 20]);
  const isOutdoor = k => [1, 2, 3, 6].includes(rom().u8[hdrOf(k) + 23]);

  // ---------- connections ----------
  function conns(h) {
    const r = rom(), p = r.ptr(h + 12); if (p < 0) return [];
    const n = r.r32(p), l = r.ptr(p + 4); if (l < 0 || n > 32) return [];
    const out = [];
    for (let i = 0; i < n; i++) { const o = l + i * 12; out.push({ dir: r.r32(o), off: r.r32(o + 4) | 0, g: r.u8[o + 8], n: r.u8[o + 9] }); }
    return out;
  }
  function setConns(h, list) {
    const r = rom();
    if (!list.length) { r.w32(h + 12, 0); return; }
    const b = new Uint8Array(list.length * 12), dv = new DataView(b.buffer);
    list.forEach((c, i) => { dv.setUint32(i * 12, c.dir, true); dv.setInt32(i * 12 + 4, c.off, true); b[i * 12 + 8] = c.g; b[i * 12 + 9] = c.n; });
    const lp = r.writeNew(b), s = new Uint8Array(8), sv = new DataView(s.buffer);
    sv.setUint32(0, list.length, true); sv.setUint32(4, 0x08000000 + lp, true);
    r.wptr(h + 12, r.writeNew(s));
  }
  function allMaps() { const out = [], seen = new Set(); game().mapGroups.forEach((maps, g) => maps.forEach((h, n) => { if (!seen.has(h)) { seen.add(h); out.push(key(g, n)); } })); return out; }

  // ---------- layout of the world: breadth-first from the start map along the connections ----------
  // FireRed's own connections do not close everywhere (Route 1 / Viridian City disagree by 12 squares): only
  // mismatches that the original game does not have are worth a warning
  let baseMis = null;
  function baseMismatches() {
    const orig = rom().original; if (!orig) return new Set();
    if (baseMis && baseMis.root === S.root && baseMis.orig === orig) return baseMis.set;
    const keep = App.rom, set = new Set();
    try {
      App.rom = new Rom(orig.buffer.slice(orig.byteOffset, orig.byteOffset + orig.byteLength), 'original.gba');
      const pos = new Map([[S.root, { x: 0, y: 0 }]]), q = [S.root];
      while (q.length) {
        const k = q.shift(), m = dims(k), p = pos.get(k);
        for (const c of conns(hdrOf(k))) {
          if (c.dir < 1 || c.dir > 4) continue;
          const k2 = key(c.g, c.n); if (!hdrOf(k2)) continue;
          const d2 = dims(k2), x = c.dir <= 2 ? p.x + c.off : c.dir === 3 ? p.x - d2.w : p.x + m.w, y = c.dir === 2 ? p.y - d2.h : c.dir === 1 ? p.y + m.h : p.y + c.off;
          if (!pos.has(k2)) { pos.set(k2, { x, y }); q.push(k2); } else { const o = pos.get(k2); if (o.x !== x || o.y !== y) set.add(k + '>' + k2 + ':' + (x - o.x) + ',' + (y - o.y)); }
        }
      }
    } catch (e) { /* the original cannot be read: warn about everything */ } finally { App.rom = keep; }
    baseMis = { root: S.root, orig, set };
    return set;
  }
  function layoutWorld() {
    const pos = new Map(), warn = [];
    if (!hdrOf(S.root) || !isOutdoor(S.root)) {                     // another game (Emerald: 3.0 is a house): its first town, else any connected outdoor map
      const first = game().isEmerald ? '0.9' : '3.0';
      S.root = hdrOf(first) && isOutdoor(first) ? first : allMaps().find(k => isOutdoor(k) && conns(hdrOf(k)).length) || '0.0';
    }
    pos.set(S.root, { x: 0, y: 0 });
    const q = [S.root];
    while (q.length) {
      const k = q.shift(), m = dims(k), p = pos.get(k);
      for (const c of conns(hdrOf(k))) {
        if (c.dir < 1 || c.dir > 4) continue;
        const k2 = key(c.g, c.n); if (!hdrOf(k2)) continue;
        const d2 = dims(k2);
        const x = c.dir <= 2 ? p.x + c.off : c.dir === 3 ? p.x - d2.w : p.x + m.w;
        const y = c.dir === 2 ? p.y - d2.h : c.dir === 1 ? p.y + m.h : p.y + c.off;
        if (!pos.has(k2)) { pos.set(k2, { x, y }); q.push(k2); }
        else { const o = pos.get(k2); if ((o.x !== x || o.y !== y) && !baseMismatches().has(k + '>' + k2 + ':' + (x - o.x) + ',' + (y - o.y))) warn.push(nameOf(k) + ' → ' + nameOf(k2) + ': ' + T('connections disagree by') + ' (' + (x - o.x) + ', ' + (y - o.y) + ')'); }
      }
    }
    // maps that dropped out of the world (connection removed) stay where they were, as floating maps
    for (const [k, p] of S.lastPos) if (!pos.has(k) && !S.floating.has(k) && hdrOf(k)) S.floating.set(k, p);
    for (const k of [...S.floating.keys()]) if (pos.has(k) || !hdrOf(k)) S.floating.delete(k);   // gone (e.g. a new map undone)
    if (S.active && !hdrOf(S.active)) S.active = null;
    S.lastPos = new Map(pos);
    return { pos, warn };
  }
  function placed() {
    const { pos, warn } = layoutWorld(), list = [];
    for (const [k, p] of pos) { const d = dims(k); list.push({ k, x: p.x, y: p.y, w: d.w, h: d.h, floating: false }); }
    for (const [k, p] of S.floating) { const d = dims(k); list.push({ k, x: p.x, y: p.y, w: d.w, h: d.h, floating: true }); }
    return { list, warn };
  }
  function overlaps(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
      if (x1 > x0 && y1 > y0) out.push({ x0, y0, x1, y1, a: a.k, b: b.k });
    }
    return out;
  }

  // ---------- map pictures ----------
  function entry(k) {
    if (cache.has(k)) return cache.get(k);
    const [g, n] = parse(k), m = MapsTab.api.loadMap(g, n);
    const cv = h('canvas', { width: m.w * 16, height: m.h * 16 }), ctx = cv.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) ctx.drawImage(MapsTab.api.metatileCanvas(m, rom().r16(m.blocks + (y * m.w + x) * 2) & 0x3FF), x * 16, y * 16);
    const e = { cv, m }; cache.set(k, e); return e;
  }

  // ---------- undo: record the old bytes of every ROM write made during one edit ----------
  function op(label, fn, log, town) {
    const r = rom(), rec = [];
    const wrap = (name, len) => { const orig = Rom.prototype[name]; r[name] = function (o, v) { rec.push([o, this.u8.slice(o, o + (len || v.length))]); return orig.call(this, o, v); }; };
    wrap('w8', 1); wrap('w16', 2); wrap('w32', 4); wrap('write', 0);
    let ok = true;
    try { fn(); if (town) updateTownMap(); }
    catch (e) { ok = false; console.error(e); toast(e.message, 'err'); }
    finally { delete r.w8; delete r.w16; delete r.w32; delete r.write; }
    if (rec.length) { S.undo.push({ label, rec }); S.log.push(log || { t: 'raw', label }); if (S.undo.length > 60) S.undo.shift(); if (!ok) undo(true); }
    return ok;
  }
  function undo(silent) {
    const u = S.undo.pop(); if (!u) { if (!silent) toast('Nothing to undo'); return; }
    const r = rom();
    for (let i = u.rec.length - 1; i >= 0; i--) r.u8.set(u.rec[i][1], u.rec[i][0]);
    S.log.pop(); S.selEv = null;
    game().mapGroups = Game.readMapGroups(r, game().offsets.mapGroups);
    r.changed(); cache.clear(); S.layoutTable = null;
    if (!silent) toast('Undone: ' + u.label);
    draw(); side();
  }

  // ---------- layout table (the game loads a map's layout from gMapLayouts[layoutId - 1]) ----------
  function layoutTable() {
    if (S.layoutTable) return S.layoutTable;
    const r = rom(), maps = allMaps().slice(0, 40).map(hdrOf).filter(h => r.r16(h + 18) > 0);
    const [h0] = maps, L0 = r.ptr(h0), id0 = r.r16(h0 + 18);
    // a table that was moved (maps added) leaves old copies behind: the real one is the copy the game's code points to
    let best = null;
    for (const ref of r.findPointers(L0, true)) {
      const base = ref - (id0 - 1) * 4;
      if (!maps.slice(1, 8).every(h => r.ptr(base + (r.r16(h + 18) - 1) * 4) === r.ptr(h))) continue;
      const refs = r.findPointers(base, true).length;
      if (!best || refs > best.refs) best = { base, refs };
    }
    if (!best || !best.refs) throw new Error('Map layout table not found');
    return S.layoutTable = { base: best.base, count: Math.max(...allMaps().map(k => r.r16(hdrOf(k) + 18))) };
  }
  // a map's own layout (copied, with a new layout id, when other maps share it)
  function ownLayout(k) {
    const r = rom(), h = hdrOf(k), lay = r.ptr(h), id = r.r16(h + 18);
    const sharers = allMaps().filter(k2 => k2 !== k && (r.ptr(hdrOf(k2)) === lay || r.r16(hdrOf(k2) + 18) === id));
    if (!sharers.length) return lay;
    const t = layoutTable();
    const nl = r.writeNew(r.u8.slice(lay, lay + 28));
    const table = new Uint8Array((t.count + 1) * 4); table.set(r.u8.subarray(t.base, t.base + t.count * 4));
    new DataView(table.buffer).setUint32(t.count * 4, 0x08000000 + nl, true);
    const nt = r.writeNew(table);
    for (const p of r.findPointers(t.base, true)) r.wptr(p, nt);
    S.layoutTable = { base: nt, count: t.count + 1 };
    r.w16(h + 18, t.count + 1); r.wptr(h, nl);
    toast('This map shared its layout with ' + sharers.length + ' other map(s): it now has its own copy');
    return nl;
  }

  // ---------- edits ----------
  function events(k) { return MapsTab.api.readEvents(rom().ptr(hdrOf(k) + 4)); }
  function eventBox(k) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of Object.values(events(k))) for (const e of l) { const [x, y] = MapsTab.api.evXY(e); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }
  // dl/dt/dr/db: blocks added on the left / top / right / bottom (negative = removed)
  function resizeMap(k, dl, dt, dr, db) {
    const r = rom(), h = hdrOf(k), d = dims(k), W = d.w + dl + dr, H = d.h + dt + db;
    if (W < 1 || H < 1) throw new Error('A map needs at least one block');
    if ((W + 15) * (H + 14) > LIMIT) throw new Error('Too big for the game: (' + W + '+15)×(' + H + '+14) > ' + LIMIT);
    const box = eventBox(k);
    if (box && (box.x0 + dl < 0 || box.y0 + dt < 0 || box.x1 + dl >= W || box.y1 + dt >= H)) throw new Error('People / doors / signs would fall outside the map');
    const lay = ownLayout(k);
    const blocks = r.ptr(lay + 12), border = r.ptr(lay + 8);
    const bw = game().isEmerald ? 2 : (r.u8[lay + 24] || 2), bh = game().isEmerald ? 2 : (r.u8[lay + 25] || 2);
    const out = new Uint8Array(W * H * 2), dv = new DataView(out.buffer);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ox = x - dl, oy = y - dt;
      const v = ox >= 0 && oy >= 0 && ox < d.w && oy < d.h ? r.r16(blocks + (oy * d.w + ox) * 2) : r.r16(border + ((y % bh) * bw + (x % bw)) * 2);
      dv.setUint16((y * W + x) * 2, v, true);
    }
    const nb = r.writeNew(out);
    r.w32(lay, W); r.w32(lay + 4, H); r.wptr(lay + 12, nb);
    if (dl || dt) {
      for (const l of Object.values(events(k))) for (const e of l) { const [x, y] = MapsTab.api.evXY(e); MapsTab.api.setEvXY(e, x + dl, y + dt); }
      shiftConnections(k, dl, dt);
    }
    S.touched.add(k);
  }
  // the map's top-left moved by (-dx, -dy) in the world while its neighbours stay: fix both sides of each connection
  function shiftConnections(k, dx, dy) {
    const [g, n] = parse(k), h = hdrOf(k);
    const own = conns(h), done = new Set([h]);      // a header can be listed under two keys: update each header once
    if (own.length) setConns(h, own.map(c => Object.assign({}, c, { off: c.off + (c.dir <= 2 ? dx : dy) })));
    for (const k2 of allMaps()) {
      const h2 = hdrOf(k2); if (done.has(h2)) continue; done.add(h2);
      const list = conns(h2);
      if (!list.some(c => c.g === g && c.n === n && c.dir >= 1 && c.dir <= 4)) continue;
      setConns(h2, list.map(c => c.g === g && c.n === n && c.dir >= 1 && c.dir <= 4 ? Object.assign({}, c, { off: c.off - (c.dir <= 2 ? dx : dy) }) : c));
      S.touched.add(k2);
    }
  }
  function moveMap(k, dx, dy) {
    const [g, n] = parse(k), own = conns(hdrOf(k)).filter(c => c.dir >= 1 && c.dir <= 4);
    const rev = allMaps().flatMap(k2 => conns(hdrOf(k2)).filter(c => c.g === g && c.n === n && c.dir >= 1 && c.dir <= 4));
    const side = [...own, ...rev].some(c => c.dir >= 3), vert = [...own, ...rev].some(c => c.dir <= 2);
    if (dx && side) throw new Error('This map touches a neighbour on its west/east side: it can only slide up/down along it');
    if (dy && vert) throw new Error('This map touches a neighbour on its north/south side: it can only slide left/right along it');
    shiftConnections(k, -dx, -dy);
    S.touched.add(k);
  }
  function touching(a, b) {
    const yo = a.y < b.y + b.h && b.y < a.y + a.h, xo = a.x < b.x + b.w && b.x < a.x + a.w;
    if (yo && a.x + a.w === b.x) return [4, b.y - a.y, 3, a.y - b.y];
    if (yo && b.x + b.w === a.x) return [3, b.y - a.y, 4, a.y - b.y];
    if (xo && a.y + a.h === b.y) return [1, b.x - a.x, 2, a.x - b.x];
    if (xo && b.y + b.h === a.y) return [2, b.x - a.x, 1, a.x - b.x];
    return null;
  }
  function connect(a, b) {
    const t = touching(a, b); if (!t) throw new Error(nameOf(a.k) + ' and ' + nameOf(b.k) + ' do not touch: move one next to the other first');
    const [ga, na] = parse(a.k), [gb, nb] = parse(b.k);
    const la = conns(hdrOf(a.k)).filter(c => !(c.g === gb && c.n === nb)), lb = conns(hdrOf(b.k)).filter(c => !(c.g === ga && c.n === na));
    setConns(hdrOf(a.k), [...la, { dir: t[0], off: t[1], g: gb, n: nb }]);
    setConns(hdrOf(b.k), [...lb, { dir: t[2], off: t[3], g: ga, n: na }]);
    S.touched.add(a.k); S.touched.add(b.k);
  }
  function disconnect(ka, kb) {
    if (hdrOf(ka) === hdrOf(kb)) throw new Error('same map');
    const [ga, na] = parse(ka), [gb, nb] = parse(kb);
    setConns(hdrOf(ka), conns(hdrOf(ka)).filter(c => !(c.g === gb && c.n === nb)));
    setConns(hdrOf(kb), conns(hdrOf(kb)).filter(c => !(c.g === ga && c.n === na)));
    S.touched.add(ka); S.touched.add(kb);
  }

  // move a map anywhere: connections to neighbours it no longer touches are removed, the ones it still touches get
  // their new offset, and every map it touches now is connected (so a map can be pulled out of a row and put elsewhere)
  function freeMove(k, dx, dy) {
    const list = S.list || placed().list, p = list.find(q => q.k === k); if (!p) throw new Error(nameOf(k) + ' is not in the world view');
    const me = { k, x: p.x + dx, y: p.y + dy, w: p.w, h: p.h }, [g, n] = parse(k), h0 = hdrOf(k);
    const linked = new Set(conns(h0).filter(c => c.dir >= 1 && c.dir <= 4).map(c => key(c.g, c.n)));
    for (const k2 of allMaps()) if (hdrOf(k2) !== h0 && conns(hdrOf(k2)).some(c => c.g === g && c.n === n && c.dir >= 1 && c.dir <= 4)) linked.add(k2);
    const out = { cut: [], joined: [] };
    for (const k2 of linked) {
      const q = list.find(x => x.k === k2 || hdrOf(x.k) === hdrOf(k2));
      if (!q || !touching(me, q)) { disconnect(k, k2); out.cut.push(k2); }
    }
    for (const q of list) {
      if (q.k === k || hdrOf(q.k) === h0 || !touching(me, q)) continue;
      connect(me, q); if (!linked.has(q.k)) out.joined.push(q.k);
    }
    S.touched.add(k);
    return out;
  }
  // after a move: keep the map where it was dropped (also when it is no longer reachable from the start map), and
  // if the start map itself moved, shift the view so that nothing else seems to jump
  function placeMoved(p, dx, dy) {
    if (p.k === S.root) {
      const sh = m => { for (const [k2, v] of m) m.set(k2, { x: v.x - dx, y: v.y - dy }); };
      sh(S.floating); sh(S.lastPos); S.panX -= dx * 16; S.panY -= dy * 16;
    } else S.floating.set(p.k, { x: p.x + dx, y: p.y + dy });
  }
  function startMove(p, e, r, wx0, wy0) {
    activate(p.k);
    S.drag = { kind: 'move', dx: 0, dy: 0 };
    follow(ev => { const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top); S.drag.dx = Math.round(wx - wx0); S.drag.dy = Math.round(wy - wy0); snap(p); draw(); },
      () => {
        const { dx, dy } = S.drag; S.drag = null;
        if (!dx && !dy) { draw(); side(); return; }
        let res = null;
        const before = S.list.slice(), oldRect = { k: p.k, x: p.x, y: p.y, w: p.w, h: p.h }, newRect = { k: p.k, x: p.x + dx, y: p.y + dy, w: p.w, h: p.h };
        if (op('move ' + nameOf(p.k), () => { res = freeMove(p.k, dx, dy); }, { t: 'freemove', k: p.k, dx, dy }, true)) {
          placeMoved(p, dx, dy);
          moveFx(oldRect, newRect, before);
          const msg = [res.cut.length ? T('Disconnected from') + ' ' + res.cut.map(nameOf).join(', ') : '', res.joined.length ? T('Connected to') + ' ' + res.joined.map(nameOf).join(', ') : ''].filter(Boolean).join(' · ');
          if (msg) toast(nameOf(p.k) + ': ' + msg);
        }
        draw(); side();
      });
  }
  // delete a map: all its connections go; when it is the last map of its group and no door of another map leads to it,
  // it also leaves the group (the game's map list), otherwise it stays in the list (renumbering would break doors) and
  // only leaves the world
  function doorsInto(k) {
    const [g, n] = parse(k), h0 = hdrOf(k), out = [];
    for (const k2 of allMaps()) { if (hdrOf(k2) === h0) continue; for (const w of (events(k2).warp || [])) if (rom().u8[w.off + 7] === g && rom().u8[w.off + 6] === n) out.push(k2); }
    return [...new Set(out)];
  }
  function deleteMap(k) {
    const [g, n] = parse(k), h0 = hdrOf(k);
    const linked = new Set(conns(h0).filter(c => c.dir >= 1 && c.dir <= 4).map(c => key(c.g, c.n)));
    for (const k2 of allMaps()) if (hdrOf(k2) !== h0 && conns(hdrOf(k2)).some(c => c.g === g && c.n === n)) linked.add(k2);
    for (const k2 of linked) if (hdrOf(k2)) disconnect(k, k2);
    const maps = game().mapGroups[g], doors = doorsInto(k);
    let removed = false;
    if (n === maps.length - 1 && !doors.length && k !== S.root) {
      const r = rom(), arr = new Uint8Array(maps.length * 4), dv = new DataView(arr.buffer);   // the last slot stays 0: the list ends there
      maps.slice(0, -1).forEach((hp, i) => dv.setUint32(i * 4, 0x08000000 + hp, true));
      r.wptr(game().offsets.mapGroups + g * 4, r.writeNew(arr));
      maps.pop(); removed = true;
    }
    S.touched.add(k);
    return { removed, doors, last: n === maps.length - (removed ? 0 : 1) };
  }
  async function askDelete(p) {
    closeMenu();
    const doors = doorsInto(p.k);
    const msg = Tf('Delete {a}?', { a: nameOf(p.k) + ' ' + p.k }) + (doors.length ? ' ' + Tf('Doors of {b} lead to it: it stays in the map list and only leaves the world.', { b: doors.map(nameOf).join(', ') }) : '');
    if (!(await ask(msg, { danger: true }))) return;
    let res = null;
    if (op('delete map ' + nameOf(p.k), () => { res = deleteMap(p.k); }, { t: 'delmap', k: p.k }, true)) {
      S.floating.delete(p.k); S.lastPos.delete(p.k); cache.delete(p.k);
      toast(res.removed ? Tf('{a} was deleted', { a: nameOf(p.k) }) : Tf('{a} left the world (it stays in the map list)', { a: nameOf(p.k) }));
      deselect();
    }
  }
  // a short animation after a move: the moved map pulses, joined edges glow green, cut edges flash red
  function edgeSeg(a, b) {
    const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h), x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
    if (a.x + a.w === b.x || b.x + b.w === a.x) return { x0: a.x + a.w === b.x ? b.x : a.x, y0, x1: a.x + a.w === b.x ? b.x : a.x, y1 };
    return { x0, y0: a.y + a.h === b.y ? b.y : a.y, x1, y1: a.y + a.h === b.y ? b.y : a.y };
  }
  function moveFx(oldRect, newRect, list) {
    const t0 = performance.now(), fx = [];
    for (const q of list) {
      if (q.k === newRect.k) continue;
      const was = !!touching(oldRect, q), now = !!touching(newRect, q);
      if (now && !was) fx.push({ kind: 'join', seg: edgeSeg(newRect, q) });
      if (was && !now) fx.push({ kind: 'cut', seg: edgeSeg(oldRect, q) });
    }
    if (newRect.k === S.root) {             // the start map stays at (0, 0): everything else moved the other way
      const dx = newRect.x - oldRect.x, dy = newRect.y - oldRect.y;
      for (const f of fx) { f.seg.x0 -= dx; f.seg.x1 -= dx; f.seg.y0 -= dy; f.seg.y1 -= dy; }
      newRect = Object.assign({}, newRect, { x: newRect.x - dx, y: newRect.y - dy });
    }
    S.fx = { t0, items: fx, pulse: newRect };
    const tick = () => { if (!S.fx) return; draw(); if (performance.now() - S.fx.t0 < 900) requestAnimationFrame(tick); else { S.fx = null; draw(); } };
    requestAnimationFrame(tick);
  }
  function drawFx(ctx) {
    if (!S.fx) return;
    const age = performance.now() - S.fx.t0, k = Math.min(1, age / 900), z = S.zoom;
    for (const f of S.fx.items) {
      const [x0, y0] = W2S(f.seg.x0, f.seg.y0), [x1, y1] = W2S(f.seg.x1, f.seg.y1);
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.lineCap = 'round';
      ctx.strokeStyle = f.kind === 'join' ? '#40c057' : '#fa5252'; ctx.lineWidth = 4 + 10 * (1 - k);
      if (f.kind === 'cut') ctx.setLineDash([10, 8]);
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16 * (1 - k);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
    }
    const p = S.fx.pulse; if (p && age < 500) {
      const g = (age / 500) * 14, [sx, sy] = W2S(p.x, p.y);
      ctx.save(); ctx.globalAlpha = 1 - age / 500; ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3;
      ctx.strokeRect(sx - g, sy - g, p.w * 16 * z + 2 * g, p.h * 16 * z + 2 * g); ctx.restore();
    }
  }
  function dropOnMap(d, p, x, y) {
    const [g, n] = parse(p.k), r = rom(), L = App.getLists(); let what = '';
    const ok = op('add ' + d.kind, () => {
      if (d.kind === 'pokemon') { Legends.create(d.id, d.level || 30, g, n, x, y); what = Tf('{name} stands here now (a legendary: talk to it to battle)', { name: L.species[d.id] }); }
      else if (d.kind === 'item') { const e = Objects.add(g, n, 'item', x, y); r.w16(r.ptr(e.off + 16) + 3, d.id); what = Tf('An item ball with {name}', { name: L.items[d.id] }); }
      else if (d.kind === 'trainer') { const e = Objects.add(g, n, 'trainer', x, y); r.w16(r.ptr(e.off + 16) + 2, d.id); const t = Objects.trainer(d.id); what = Tf('{name} stands here now', { name: t ? (Objects.classNames()[t.cls] || '') + ' ' + t.name : '#' + d.id }); }
      S.touched.add(p.k);
    }, { t: 'raw', label: 'add ' + d.kind });
    if (!ok) return;
    activate(p.k); S.mode = 'events'; S.tab = 'objects';
    S.selEv = Object.values(events(p.k)).flat().find(q => { const [ex, ey] = MapsTab.api.evXY(q); return ex === x && ey === y && q.kind === 'obj'; }) || null;
    toast(what); cache.clear(); render(S.root_el);
  }
  // the library: things to drag onto the map
  function libraryBox() {
    const L = App.getLists(), G0 = game(); let kind = S.libKind || 'pokemon', q = '';
    const list = h('div', { class: 'lib-list' }), tabs = h('div', { class: 'tabs small' });
    const unused = name => !name || /^\?+$/.test(name);
    const fill = () => {
      list.innerHTML = ''; const qq = q.toLowerCase(); let n = 0;
      const row = (id, name, icon, extra) => {
        if (qq && !name.toLowerCase().includes(qq) && String(id) !== qq) return; if (n++ > 150) return;
        const el = h('div', { class: 'lib-row', draggable: 'true', title: T('Drag onto the map') }, icon || '', h('span', { dir: 'auto' }, name), extra ? h('span', { class: 'muted' }, extra) : '');
        el.ondragstart = e => { e.dataTransfer.setData('application/x-ember', JSON.stringify({ kind, id })); e.dataTransfer.effectAllowed = 'copy'; };
        list.append(el);
      };
      if (kind === 'pokemon') { for (let s = 1; s < G0.speciesCount; s++) if (!unused(L.species[s])) row(s, L.species[s], PokemonTab.iconCanvas(s, 24)); }
      else if (kind === 'item') { for (let i = 1; i < G0.itemsCount; i++) if (!unused(L.items[i])) row(i, L.items[i], ItemsTab.icon(i)); }
      else for (let id = 1; id < (TrainersTab.COUNT || 743); id++) { const t = Objects.trainer(id); if (t && t.name) row(id, (Objects.classNames()[t.cls] || '') + ' ' + t.name, '🧢', '#' + id); }
    };
    const setKind = k => { kind = S.libKind = k; [...tabs.children].forEach(b => b.classList.toggle('sel', b.dataset.k === k)); fill(); };
    for (const [k, l] of [['pokemon', '🐾 ' + T('A Pokémon')], ['item', '🎒 ' + T('Item')], ['trainer', '🧢 ' + T('Trainer')]]) tabs.append(h('button', { 'data-k': k, class: k === kind ? 'sel' : '', onclick: () => setKind(k) }, l));
    fill();
    return h('details', { class: 'hdr lib', open: S.libOpen !== false, ontoggle: e => { S.libOpen = e.target.open; } }, h('summary', {}, '📚 ' + T('Drag onto the map')),
      h('p', { class: 'muted', style: { fontSize: '12px', margin: '4px 0' } }, T('Drag a Pokémon (a legendary that stands there), an item (an item ball) or a trainer onto any map. Double-click a person or a sign to edit what they say.')),
      tabs, h('input', { type: 'search', placeholder: T('Search…'), oninput: e => { q = e.target.value; fill(); } }), list);
  }
  function labelAt(sx, sy) { for (const l of (S.labels || []).slice().reverse()) if (sx >= l.x && sy >= l.y && sx < l.x + l.w && sy < l.y + l.h) return l.k; return null; }
  function deselect() { S.active = null; S.selEv = null; S.blocking = null; S.pickPlay = false; closeMenu(); playBtn(); draw(); side(); }

  // ---------- right click on a map: everything you can do with it ----------
  function closeMenu() { if (S.menu) { S.menu.remove(); S.menu = null; } }
  function mapMenu(p, lx, ly, cx, cy) {
    closeMenu();
    const go = (mode, tab) => () => { closeMenu(); activate(p.k); S.mode = mode; if (tab) S.tab = tab; S.addKind = null; render(S.root_el); };
    const [g, n] = parse(p.k), sel = S.active === p.k;
    const door = (events(p.k).warp || []).find(w => { const [x, y] = MapsTab.api.evXY(w); return x === lx && y === ly; });
    const dt = door && doorTarget(door), last = S.trail[S.trail.length - 1];
    const items = [
      door ? ['🚪 ' + Tf('Go through the door to {a}', { a: dt.g === 127 ? T('the previous map') : hdrOf(key(dt.g, dt.n)) ? nameOf(key(dt.g, dt.n)) + ' ' + key(dt.g, dt.n) : key(dt.g, dt.n) }), () => goThroughDoor(p.k, door)] : null,
      last ? ['↩ ' + Tf('Back to {a}', { a: trailName(last) }), () => goBack(false)] : null,
      S.trail.length > 1 ? ['🌍 ' + Tf('Back to the world map ({a})', { a: trailName(S.trail[0]) }), () => goBack(true)] : null,
      sel ? ['✖ Deselect', () => deselect()] : ['✔ Select this map', () => { closeMenu(); activate(p.k); draw(); }],
      ['🧭 General map management', go('manage')],
      ['🖌 Paint', go('paint', 'blocks')], ['⛔ Collision', go('coll', 'coll')], ['👤 People & doors', go('events', 'objects')],
      ['↔ Resize: drag an edge', () => { go('resize')(); toast(T('Drag an edge or a corner of the yellow frame to make the map bigger or smaller')); }], ['🔗 Connections', go('connect')],
      ['🎯 Pick this block', () => { closeMenu(); const b = rom().r16(entry(p.k).m.blocks + (ly * p.w + lx) * 2); activate(p.k);
        if (S.mode === 'coll') { S.selColl = (b >> 10) & 3; S.selElev = b >> 12; } else { S.selBlock = b & 0x3FF; S.brush = null; S.mode = 'paint'; S.tab = 'blocks'; } render(S.root_el); }],
      p.floating ? null : ['▶ ' + T('Play from here'), () => { closeMenu(); Emu.playFrom({ g, n, x: lx, y: ly, team: Emu.team(), label: nameOf(p.k) + ' (' + lx + ', ' + ly + ')' }); }],
      ['📂 Open in map editor', () => { closeMenu(); MapsTab.api.open(g, n); }],
      ['🌍 Build the world from this map', () => { closeMenu(); S.root = p.k; S.lastPos.clear(); S.floating.clear(); S.fitted = false; draw(); }],
      ['🗑 Delete map', () => askDelete(p), true],
    ].filter(Boolean);
    const m = h('div', { class: 'wv-menu', style: { position: 'fixed', left: cx + 'px', top: cy + 'px', zIndex: 1000, background: 'var(--panel, #1b1e27)', border: '1px solid var(--line, #444)', borderRadius: '6px', padding: '4px', boxShadow: '0 6px 18px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', minWidth: '190px' } },
      h('div', { class: 'muted', style: { padding: '4px 8px', fontSize: '12px' } }, nameOf(p.k) + ' ' + p.k + ' · (' + lx + ', ' + ly + ')'),
      ...items.map(([l, fn, danger]) => h('button', { class: danger ? 'danger' : '', style: { textAlign: 'start', margin: '1px 0' }, onclick: fn }, l)));
    document.body.append(m); S.menu = m;
    const rc = m.getBoundingClientRect();                 // keep it on the screen
    if (rc.right > innerWidth) m.style.left = Math.max(0, cx - rc.width) + 'px';
    if (rc.bottom > innerHeight) m.style.top = Math.max(0, cy - rc.height) + 'px';
    setTimeout(() => { const off = ev => { if (S.menu && !S.menu.contains(ev.target)) { closeMenu(); window.removeEventListener('mousedown', off, true); } }; window.addEventListener('mousedown', off, true); });
  }

  // ---------- seams: do two connected maps meet in a way that looks right? (the Seams module learns it from the game) ----------
  // how much a map is the user's own: 2 = its blocks changed or it is new, 1 = only its header (e.g. a new connection)
  function builtScore(k, memo) {
    if (memo.has(k)) return memo.get(k);
    const r = rom(), o = r.original, h0 = hdrOf(k), d = dims(k);
    const same = (a, n) => { if (a < 0 || a + n > o.length) return false; for (let i = 0; i < n; i++) if (r.u8[a + i] !== o[a + i]) return false; return true; };
    const v = d.lay < 0 || !same(d.lay, 24) || !same(r.ptr(d.lay + 12), d.w * d.h * 2) ? 2 : same(h0, 28) ? 0 : 1;
    memo.set(k, v); return v;
  }
  function seamList(list) {
    const out = [], at = new Map(list.filter(p => !p.floating).map(p => [p.k, p])), seen = new Set();
    for (const p of at.values()) for (const c of conns(hdrOf(p.k))) {
      const q0 = c.dir >= 1 && c.dir <= 4 && at.get(key(c.g, c.n)); if (!q0 || q0.k === p.k) continue;
      const id = [p.k, q0.k].sort().join('|'); if (seen.has(id)) continue; seen.add(id);
      // where the game puts the neighbour: by the connection itself (the world view may show it elsewhere when the
      // game's own connections disagree, as Emerald's do in a few places)
      const q = { k: q0.k, w: q0.w, h: q0.h, x: c.dir <= 2 ? p.x + c.off : c.dir === 3 ? p.x - q0.w : p.x + p.w, y: c.dir === 2 ? p.y - q0.h : c.dir === 1 ? p.y + p.h : p.y + c.off };
      const [a, b] = c.dir === 1 || c.dir === 4 ? [p, q] : [q, p], vert = c.dir <= 2;
      const o = vert ? Math.max(a.x, b.x) : Math.max(a.y, b.y), n = (vert ? Math.min(a.x + a.w, b.x + b.w) : Math.min(a.y + a.h, b.y + b.h)) - o;
      if (n > 0) out.push({ id, vert, o, n, a, b, from: p.k, conn: c });
    }
    return out;
  }
  // one side of a seam, in seam coordinates: d = rows away from the seam, i = along it (0 = where both maps start)
  function seamSide(P, first, vert, o, water) {
    const m = entry(P.k).m, r = rom(), cells = new Map(), doors = new Set((events(P.k).warp || []).map(w => MapsTab.api.evXY(w).join(',')));
    const xy = (d, i) => { const w = o + i; return vert ? [w - P.x, first ? P.h - 1 - d : d] : [first ? P.w - 1 - d : d, w - P.y]; };
    return { k: P.k, m, xy, tilesets: { prim: m.prim.off, sec: m.sec.off }, ext: vert ? [P.x - o, P.x + P.w - o] : [P.y - o, P.y + P.h - o],
      door: (d, i) => doors.has(xy(d, i).join(',')),
      changed(d, i) { const [x, y] = xy(d, i); if (x < 0 || y < 0 || x >= P.w || y >= P.h) return false; const a = m.blocks + (y * P.w + x) * 2, o = r.original; return a + 1 >= o.length || r.u8[a] !== o[a] || r.u8[a + 1] !== o[a + 1]; },
      get(d, i) { const [x, y] = xy(d, i); return x < 0 || y < 0 || x >= P.w || y >= P.h ? -1 : r.r16(m.blocks + (y * P.w + x) * 2); },
      cell(v) {
        let c = cells.get(v); if (c) return c;
        c = { u: Seams.uidOf(m.prim.off, m.sec.off, v), cls: water.has(behavior(m, v & 0x3FF)) ? 'water' : (v >> 10) & 3 ? 'wall' : 'walk' };
        cells.set(v, c); return c;
      } };
  }
  // the same connection in the original game (then only the spots where blocks changed are checked)
  function sameConnAsGame(s) {
    const o = rom().original, hp = hdrOf(s.from); if (hp + 28 > o.length) return false;
    const dv = new DataView(o.buffer, o.byteOffset, o.byteLength), ptr = a => { const v = dv.getUint32(a, true); return v >= 0x08000000 && v - 0x08000000 < o.length - 8 ? v - 0x08000000 : -1; };
    const cp = ptr(hp + 12); if (cp < 0) return false;
    const n = dv.getUint32(cp, true), lp = ptr(cp + 4); if (lp < 0 || n > 32) return false;
    const [g, nn] = parse(s.conn.g + '.' + s.conn.n);
    for (let i = 0; i < n; i++) { const e = lp + i * 12; if (dv.getUint32(e, true) === s.conn.dir && dv.getInt32(e + 4, true) === s.conn.off && o[e + 8] === g && o[e + 9] === nn) return true; }
    return false;
  }
  function checkSeams(list) {
    const ign = new Set(Project.getData('seamIgnore', () => []) || []), memo = new Map(), water = Seams.WATER(), out = [];
    for (const s of seamList(list)) {
      const sa = builtScore(s.a.k, memo), sb = builtScore(s.b.k, memo);
      if (!sa && !sb) continue;                                      // the game's own seam, untouched
      const seam = { vert: s.vert, n: s.n, A: seamSide(s.a, true, s.vert, s.o, water), B: seamSide(s.b, false, s.vert, s.o, water) };
      if (sameConnAsGame(s)) seam.keep = i => [0, 1, 2].some(d => seam.A.changed(d, i) || seam.B.changed(d, i));   // the game's own dead ends stay unmarked
      const res = Seams.analyze(seam);
      if (!res.issues.length && !res.blocked) continue;
      // the map that changes in a fix: the one the user built; if both, the selected one, else the smaller one
      const user = sa !== sb ? (sa > sb ? 'A' : 'B') : S.active === s.b.k ? 'B' : S.active === s.a.k ? 'A' : s.a.w * s.a.h <= s.b.w * s.b.h ? 'A' : 'B';
      out.push(Object.assign(s, { seam, res, user, ignored: ign.has(s.id) }));
    }
    return out;
  }
  const seamWorst = s => s.res.blocked || s.res.issues.some(x => x.kind === 'block') ? 'red' : 'orange';
  function drawSeams(ctx) {
    S.seamBadges = [];
    const z = S.zoom, th = Math.max(3, 5 * z), len = 16 * z;
    for (const s of S.seams || []) {
      if (s.ignored) continue;
      const [lx, ly] = s.vert ? W2S(s.o, s.b.y) : W2S(s.b.x, s.o);
      if (s.res.blocked) { ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = '#fa5252'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + (s.vert ? s.n * len : 0), ly + (s.vert ? 0 : s.n * len)); ctx.stroke(); ctx.restore(); }
      for (const it of s.res.issues) {
        ctx.fillStyle = it.kind === 'block' ? 'rgba(250,82,82,.95)' : 'rgba(253,126,20,.95)';
        if (s.vert) ctx.fillRect(lx + it.i * len + 1, ly - th / 2, len - 2, th); else ctx.fillRect(lx - th / 2, ly + it.i * len + 1, th, len - 2);
      }
      const is = s.res.issues.length ? s.res.issues : [{ i: s.n / 2 }], mid = (is[0].i + is[is.length - 1].i + 1) / 2;
      const bx = s.vert ? lx + mid * len : lx, by = s.vert ? ly : ly + mid * len;
      ctx.fillStyle = seamWorst(s) === 'red' ? '#e03131' : '#f76707'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#fff'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', bx, by + 5); ctx.textAlign = 'start';
      S.seamBadges.push({ s, sx: bx, sy: by });
    }
  }
  const seamBadgeAt = (sx, sy) => (S.seamBadges || []).find(b => Math.hypot(b.sx - sx, b.sy - sy) < 12);
  function seamSummary(s) {
    const c = k => s.res.issues.filter(x => x.kind === k).length, out = [];
    if (s.res.blocked) out.push(T('the player cannot cross between these maps'));
    if (c('block')) out.push(Tf('a road runs into a wall ({n} blocks)', { n: c('block') }));
    if (c('terrain')) out.push(Tf('water meets land without a shore ({n} blocks)', { n: c('terrain') }));
    if (c('cut')) out.push(Tf('{n} blocks look cut (half a tree, a fence, a cliff)', { n: c('cut') }));
    return out;
  }
  // the seam and a few rows on each side, before or after a fix
  function seamPicture(s, fix, marks) {
    const seam = fix ? Seams.overlay(s.seam, s.user, fix) : s.seam, g = fix ? fix.grow : 0;
    const is = s.res.issues.length ? s.res.issues.map(x => x.i) : [0, s.n - 1];
    const lo = Math.max(Math.min(s.seam.A.ext[0], s.seam.B.ext[0]), Math.min(...is) - 4), hi = Math.min(Math.max(s.seam.A.ext[1], s.seam.B.ext[1]), Math.max(...is) + 5);
    const DA = 5 + (s.user === 'A' ? g : 0), DB = 5 + (s.user === 'B' ? g : 0), W = hi - lo, H = DA + DB;
    const cv = h('canvas', { class: 'pixel', width: (s.vert ? W : H) * 16, height: (s.vert ? H : W) * 16, style: { width: (s.vert ? W : H) * 32 + 'px', maxWidth: '100%', border: '1px solid var(--line)' } }), c = cv.getContext('2d');
    const put = (row, i, fn) => { const x = s.vert ? (i - lo) * 16 : row * 16, y = s.vert ? row * 16 : (i - lo) * 16; fn(x, y); };
    for (const [X, D, rowOf] of [[seam.A, DA, d => DA - 1 - d], [seam.B, DB, d => DA + d]])
      for (let d = 0; d < D; d++) for (let i = lo; i < hi; i++) {
        const v = X.get(d, i);
        put(rowOf(d), i, (x, y) => { if (v < 0) { c.fillStyle = '#000'; c.fillRect(x, y, 16, 16); } else c.drawImage(MapsTab.api.metatileCanvas(X.m, v & 0x3FF), x, y); });
      }
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.setLineDash([4, 3]); c.beginPath();
    if (s.vert) { c.moveTo(0, DA * 16); c.lineTo(W * 16, DA * 16); } else { c.moveTo(DA * 16, 0); c.lineTo(DA * 16, W * 16); }
    c.stroke(); c.setLineDash([]); c.lineWidth = 2;
    for (const m of marks) { c.strokeStyle = m.color; put(m.side === 'A' ? DA - 1 - m.d : DA + m.d, m.i, (x, y) => c.strokeRect(x + 1, y + 1, 14, 14)); }
    return cv;
  }
  function seamDialog(s) {
    const userP = s.user === 'A' ? s.a : s.b, other = s.user === 'A' ? s.b : s.a, side0 = s.seam[s.user];
    const evs = new Set(Object.values(events(userP.k)).flat().map(e => MapsTab.api.evXY(e).join(',')));
    const cnt = new Map(), m = entry(userP.k).m;
    for (let i = 0; i < m.w * m.h; i++) { const v = rom().r16(m.blocks + i * 2); cnt.set(v, (cnt.get(v) || 0) + 1); }
    const frequent = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]);
    const fix = Seams.propose(s.seam, s.user, { frequent, fixed: (d, i) => evs.has(side0.xy(d, i).join(',')) });
    const before = seamPicture(s, null, s.res.issues.flatMap(x => [{ side: 'A', d: 0, i: x.i, color: x.kind === 'block' ? '#ff4040' : '#ff9f1a' }, { side: 'B', d: 0, i: x.i, color: x.kind === 'block' ? '#ff4040' : '#ff9f1a' }]));
    const after = fix && seamPicture(s, fix, fix.changes.map(c => ({ side: s.user, d: c.d, i: c.i, color: '#51cf66' })));
    const close = () => back.remove();
    const what = !fix ? T('No automatic fix was found within 4 rows. Paint the edge by hand, or make the map bigger.')
      : fix.grow ? Tf('{a} (the map you built) grows by {k} rows toward {b}, and the new rows close the edge naturally. {b} moves {k} squares; people, doors and connections move with the maps.', { a: nameOf(userP.k), b: nameOf(other.k), k: fix.grow })
      : Tf('{n} blocks of {a} (the map you built) change.', { n: fix.changes.length, a: nameOf(userP.k) });
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } },
      h('div', { class: 'panel modal', style: { maxWidth: '760px' } },
        h('h3', {}, Tf('Where {a} meets {b}', { a: nameOf(s.a.k), b: nameOf(s.b.k) })),
        h('ul', {}, ...seamSummary(s).map(t => h('li', {}, t))),
        h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '12px' } },
          h('div', {}, h('div', { class: 'muted' }, T('Now')), before),
          after ? h('div', {}, h('div', { class: 'muted' }, T('After the fix')), after) : null),
        h('p', { dir: 'auto' }, what),
        fix && (fix.left || fix.bad) ? h('p', { class: 'warn' }, Tf('{n} small problems stay: the fix makes it better, not perfect.', { n: (fix.left % 100) + fix.bad })) : null,
        h('div', { class: 'row wrap ask-btns' },
          fix ? h('button', { class: 'primary', onclick: () => { close(); applySeamFix(s, fix); } }, '✔ ' + T('Fix')) : null,
          h('button', { onclick: () => { close(); const l = Project.getData('seamIgnore', () => []) || []; Project.setData('seamIgnore', [...new Set([...l, s.id])]); draw(); side(); toast(T('This connection is no longer checked')); } }, T('Ignore this connection')),
          h('button', { onclick: close }, T('Close')))));
    document.body.append(back);
  }
  // a fix as edits the world view knows (resize + blocks), one undo step; replayed from the log like any other edit
  function applyOp(o) {
    if (o.t === 'resize') resizeMap(o.k, o.dl, o.dt, o.dr, o.db);
    else if (o.t === 'paintfull') { const lay = rom().ptr(hdrOf(o.k)), bl = rom().ptr(lay + 12), w = rom().r32(lay); for (const [x, y, v] of o.cells) rom().w16(bl + (y * w + x) * 2, v); S.touched.add(o.k); }
  }
  function applySeamFix(s, fix) {
    const P = s.user === 'A' ? s.a : s.b, first = s.user === 'A', vert = s.vert, k = fix.grow, ops = [];
    const ok = op('fix the seam ' + nameOf(s.a.k) + ' / ' + nameOf(s.b.k), () => {
      if (k) { const g = vert ? (first ? [0, 0, 0, k] : [0, k, 0, 0]) : (first ? [0, 0, k, 0] : [k, 0, 0, 0]); const o = { t: 'resize', k: P.k, dl: g[0], dt: g[1], dr: g[2], db: g[3] }; applyOp(o); ops.push(o); }
      const W = P.w + (vert ? 0 : k), H = P.h + (vert ? k : 0), cells = [];
      for (const c of fix.changes) {
        const w = s.o + c.i, x = vert ? w - P.x : (first ? W - 1 - c.d : c.d), y = vert ? (first ? H - 1 - c.d : c.d) : w - P.y;
        if (x >= 0 && y >= 0 && x < W && y < H) cells.push([x, y, c.v]);
      }
      const o = { t: 'paintfull', k: P.k, cells }; applyOp(o); ops.push(o);
    }, { t: 'multi', ops }, true);
    if (!ok) return;
    cache.clear();
    if (k && S.floating.has(P.k) && !first) { const f = S.floating.get(P.k); S.floating.set(P.k, { x: f.x - (vert ? 0 : k), y: f.y - (vert ? k : 0) }); }
    toast(k ? Tf('{a} grew by {k} rows: the seam looks right now', { a: nameOf(P.k), k }) : Tf('{n} blocks fixed in {a}', { n: fix.changes.length, a: nameOf(P.k) }));
    draw(); side();
  }
  // the side panel: the seams that need a look (all of them, or the selected map's)
  function seamPanel(k) {
    const list = (S.seams || []).filter(s => !s.ignored && (!k || s.a.k === k || s.b.k === k)), ign = (S.seams || []).filter(s => s.ignored).length;
    const box = h('details', { class: 'hdr', open: list.length > 0 }, h('summary', {}, '🧩 ' + T('Where maps meet') + ' (' + list.length + ')'));
    if (!list.length) box.append(h('p', { class: 'muted' }, T('Every connection looks right: no cut trees, no roads into walls, no water without a shore.')));
    for (const s of list) box.append(h('div', { class: 'seam-row' },
      h('span', { class: 'seam-dot ' + seamWorst(s) }), h('b', {}, nameOf(s.a.k) + ' ↔ ' + nameOf(s.b.k)),
      h('div', { class: 'muted', style: { fontSize: '12px' } }, seamSummary(s).join(' · ')),
      h('div', { class: 'row' }, h('button', { onclick: () => { const mid = s.o + (s.res.issues.length ? s.res.issues[0].i : s.n / 2), cv = S.cv; S.panX = (s.vert ? mid : s.b.x) * 16 - cv.width / S.zoom / 2; S.panY = (s.vert ? s.b.y : mid) * 16 - cv.height / S.zoom / 2; draw(); } }, T('Show')),
        h('button', { class: 'primary', onclick: () => seamDialog(s) }, T('Fix…')))));
    if (ign) box.append(h('button', { onclick: () => { Project.setData('seamIgnore', []); draw(); side(); } }, Tf('Check the {n} ignored connections again', { n: ign })));
    box.append(h('p', { class: 'muted', style: { fontSize: '12px' } }, T('Checked all the time, like the game would show it: the ! on a seam opens the fix.')));
    return box;
  }

  // ---------- drawing ----------
  const W2S = (bx, by) => [(bx * 16 - S.panX) * S.zoom, (by * 16 - S.panY) * S.zoom];
  const S2W = (sx, sy) => [(sx / S.zoom + S.panX) / 16, (sy / S.zoom + S.panY) / 16];
  function draw() {
    const cv = S.cv; if (!cv || !cv.isConnected) return;
    const box = cv.parentElement; cv.width = box.clientWidth; cv.height = box.clientHeight;
    const ctx = cv.getContext('2d'), z = S.zoom, dark = matchMedia('(prefers-color-scheme: dark)').matches;
    ctx.fillStyle = dark ? '#0d0f14' : '#cfd5e2'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    const { list, warn } = placed(); S.list = list; S.warn = warn;
    if (!S.fitted) { fit(list); S.fitted = true; }
    for (const p of list) {
      const [sx, sy] = W2S(p.x, p.y), sw = p.w * 16 * z, sh = p.h * 16 * z;
      if (sx > cv.width || sy > cv.height || sx + sw < 0 || sy + sh < 0) continue;
      ctx.globalAlpha = p.floating ? 0.55 : 1;
      ctx.drawImage(entry(p.k).cv, sx, sy, sw, sh);
      ctx.globalAlpha = 1;
      if (S.active && p.k !== S.active) { ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(sx, sy, sw, sh); }      // focus: the others a bit darker
      if (S.mode === 'coll' && p.k === S.active) {
        const m = entry(p.k).m, s = 16 * z, r0 = rom();
        const x0 = Math.max(0, Math.floor(-sx / s)), y0 = Math.max(0, Math.floor(-sy / s)), x1 = Math.min(p.w, Math.ceil((cv.width - sx) / s)), y1 = Math.min(p.h, Math.ceil((cv.height - sy) / s));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) MapsTab.api.collisionCell(ctx, r0.r16(m.blocks + (y * m.w + x) * 2), sx + x * s, sy + y * s, s);
      }
      ctx.strokeStyle = p.floating ? '#f59f00' : 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.strokeRect(sx + .5, sy + .5, sw, sh);
    }
    for (const o of overlaps(list)) {
      const [x0, y0] = W2S(o.x0, o.y0), [x1, y1] = W2S(o.x1, o.y1);
      ctx.fillStyle = 'rgba(240,40,40,.45)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (!S.drag || !['move', 'resize'].includes(S.drag.kind)) { try { S.seams = checkSeams(list); } catch (e) { console.error(e); S.seams = []; } drawSeams(ctx); } else S.seamBadges = [];
    if (S.showEvents && z >= 0.2) {
      const s = 16 * z, sel = S.mode === 'events' && S.selEv;
      for (const p of list) {
        const evs = Object.values(events(p.k)).flat().sort((a, b) => (a.kind === 'obj') - (b.kind === 'obj') || MapsTab.api.evXY(a)[1] - MapsTab.api.evXY(b)[1]);
        if (sel && p.k === S.active) { const e0 = evs.find(q => q.off === sel.off); if (e0) { const [ex, ey] = MapsTab.api.evXY(e0), [sx, sy] = W2S(p.x + ex, p.y + ey); Objects.drawArea(ctx, e0, sx, sy, s); } }
        for (const e of evs) {
          const [ex, ey] = MapsTab.api.evXY(e), [sx, sy] = W2S(p.x + ex, p.y + ey);
          if (sx < -s * 2 || sy < -s * 2 || sx > cv.width + s || sy > cv.height + s * 2) continue;
          Objects.draw(ctx, e, sx, sy, s, { blocking: S.blocking && S.blocking.includes(e.off), selected: (S.drag && S.drag.ev && S.drag.ev.off === e.off) || (sel && sel.off === e.off && p.k === S.active) });
        }
      }
    }
    if (S.mode === 'connect') for (const c of connMarkers(list)) {
      ctx.fillStyle = '#1c7ed6'; ctx.beginPath(); ctx.arc(c.sx, c.sy, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.sx - 4, c.sy - 4); ctx.lineTo(c.sx + 4, c.sy + 4); ctx.moveTo(c.sx + 4, c.sy - 4); ctx.lineTo(c.sx - 4, c.sy + 4); ctx.stroke(); ctx.lineWidth = 1;
    }
    if (S.showNames) {
      ctx.font = '600 12px system-ui, sans-serif'; S.labels = [];
      for (const p of list) {
        const [sx, sy] = W2S(p.x, p.y); if (sx > cv.width || sy > cv.height) continue;
        const t = nameOf(p.k) + ' ' + p.k + (p.floating ? ' · ' + T('not connected') : '');
        const w = ctx.measureText(t).width;
        ctx.fillStyle = p.k === S.active ? 'rgba(120,90,0,.85)' : 'rgba(0,0,0,.6)'; ctx.fillRect(sx + 2, sy + 2, w + 8, 17); S.labels.push({ k: p.k, x: sx + 2, y: sy + 2, w: w + 8, h: 17 });
        ctx.fillStyle = '#fff'; ctx.fillText(t, sx + 6, sy + 15);
      }
    }
    const nr = S.drag && S.drag.kind === 'newmap' ? S.drag : S.pending;
    if (nr) {
      const [sx, sy] = W2S(nr.x, nr.y), sw = nr.w * 16 * z, sh = nr.h * 16 * z, okSize = (nr.w + 15) * (nr.h + 14) <= LIMIT && nr.w >= 4 && nr.h >= 4;
      ctx.fillStyle = okSize ? 'rgba(80,200,120,.25)' : 'rgba(240,60,60,.3)'; ctx.fillRect(sx, sy, sw, sh);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = okSize ? '#69db7c' : '#ff6b6b'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, sw, sh); ctx.setLineDash([]); ctx.lineWidth = 1;
      const t = 'new map ' + nr.w + '×' + nr.h + ' · buffer ' + (nr.w + 15) * (nr.h + 14) + '/' + LIMIT;
      ctx.font = '600 13px system-ui'; const tw = ctx.measureText(t).width;
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(sx + 4, sy + 4, tw + 12, 22); ctx.fillStyle = okSize ? '#69db7c' : '#ff6b6b'; ctx.fillText(t, sx + 10, sy + 20);
    }
    const act = list.find(p => p.k === S.active);
    if (act) {
      let { x, y, w, h: hh } = act;
      if (S.drag && S.drag.kind === 'resize') { x -= S.drag.dl; y -= S.drag.dt; w += S.drag.dl + S.drag.dr; hh += S.drag.dt + S.drag.db; }
      if (S.drag && S.drag.kind === 'move') { x += S.drag.dx; y += S.drag.dy; }
      const [sx, sy] = W2S(x, y), sw = w * 16 * z, sh = hh * 16 * z;
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3; ctx.strokeRect(sx, sy, sw, sh); ctx.lineWidth = 1;
      if (S.drag && (S.drag.kind === 'resize' || S.drag.kind === 'move')) {
        const t = S.drag.kind === 'resize' ? w + '×' + hh + ' · buffer ' + (w + 15) * (hh + 14) + '/' + LIMIT : 'move ' + S.drag.dx + ', ' + S.drag.dy;
        ctx.font = '600 13px system-ui'; const tw = ctx.measureText(t).width;
        ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(sx + sw / 2 - tw / 2 - 6, sy + sh / 2 - 12, tw + 12, 22);
        ctx.fillStyle = '#ffd43b'; ctx.fillText(t, sx + sw / 2 - tw / 2, sy + sh / 2 + 4);
      }
      if (S.mode === 'resize') { ctx.strokeStyle = 'rgba(255,212,59,.55)'; ctx.lineWidth = 7; ctx.strokeRect(sx, sy, sw, sh); ctx.lineWidth = 1; }
      if (S.mode === 'resize') for (const [hx, hy] of handles(sx, sy, sw, sh)) { ctx.fillStyle = '#ffd43b'; ctx.fillRect(hx - 5, hy - 5, 10, 10); ctx.strokeStyle = '#000'; ctx.strokeRect(hx - 5.5, hy - 5.5, 11, 11); }
    }
    drawFx(ctx);
    if (S.playerView && S.hoverW && !S.drag) {             // the game screen (15x10 squares) around the mouse, the rest darker
      const [bx, by] = S.hoverW, [x0, y0] = W2S(bx - 7, by - 4), w = 15 * 16 * z, hh = 10 * 16 * z;
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.rect(x0, y0, w, hh); ctx.fill('evenodd');
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, w, hh);
      ctx.font = '600 11px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(T('what the player sees'), x0 + 4, y0 - 5); ctx.restore();
    }
    // brush ghost (where a click would stamp) and the copy rectangle being dragged with the right button
    if (S.mode === 'paint' && S.brush && S.hover && S.hover.k === S.active && !S.drag) {
      const p = list.find(q => q.k === S.hover.k);
      if (p) { const [gx, gy] = W2S(p.x + S.hover.x, p.y + S.hover.y); ctx.globalAlpha = 0.65; ctx.drawImage(S.brush.cv, gx, gy, S.brush.w * 16 * z, S.brush.h * 16 * z); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ff2050'; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, S.brush.w * 16 * z, S.brush.h * 16 * z); ctx.lineWidth = 1; }
    }
    if (S.drag && S.drag.kind === 'select') {
      const d = S.drag, p = list.find(q => q.k === d.k);
      if (p) { const [ax, ay] = W2S(p.x + Math.min(d.x0, d.x1), p.y + Math.min(d.y0, d.y1));
        ctx.setLineDash([5, 3]); ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 2; ctx.strokeRect(ax, ay, (Math.abs(d.x1 - d.x0) + 1) * 16 * z, (Math.abs(d.y1 - d.y0) + 1) * 16 * z); ctx.setLineDash([]); ctx.lineWidth = 1; }
    }
    if (S.mode === 'events' && S.selEv) {
      const p = list.find(q => q.k === S.active);
      if (p) { const [ex, ey] = MapsTab.api.evXY(S.selEv), [sx, sy] = W2S(p.x + ex, p.y + ey); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, 16 * z, 16 * z); ctx.lineWidth = 1; }
    }
    if (S.highlight) {
      ctx.font = '600 13px system-ui';
      for (const p of list) {
        const t = S.highlight.areas.get(p.k); if (!t) continue;
        const [sx, sy] = W2S(p.x, p.y), sw = p.w * 16 * z, sh = p.h * 16 * z;
        ctx.fillStyle = 'rgba(80,220,120,.30)'; ctx.fillRect(sx, sy, sw, sh); ctx.strokeStyle = '#40c057'; ctx.lineWidth = 3; ctx.strokeRect(sx, sy, sw, sh); ctx.lineWidth = 1;
        const tw = ctx.measureText(t).width; ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(sx + sw / 2 - tw / 2 - 6, sy + sh / 2 - 11, tw + 12, 22);
        ctx.fillStyle = '#8ce99a'; ctx.fillText(t, sx + sw / 2 - tw / 2, sy + sh / 2 + 5);
      }
    }
    drawMini(list);
    const wb = $('#wv-warn');
    if (wb) { const ov = overlaps(list).length; wb.textContent = (ov ? ov + ' ' + T('overlap(s) shown in red.') + ' ' : '') + (warn.length ? warn.length + ' ' + T('connection mismatch(es):') + ' ' + warn.slice(0, 2).join('; ') : '')
      + ((S.seams || []).some(s => !s.ignored) ? ' ' + Tf('{n} places where maps meet need a look (click the ! on the seam).', { n: S.seams.filter(s => !s.ignored).length }) : ''); }
  }
  function handles(sx, sy, sw, sh) { return [[sx, sy], [sx + sw / 2, sy], [sx + sw, sy], [sx, sy + sh / 2], [sx + sw, sy + sh / 2], [sx, sy + sh], [sx + sw / 2, sy + sh], [sx + sw, sy + sh]]; }
  function connMarkers(list) {
    const out = [], at = new Map(list.map(p => [p.k, p]));
    for (const p of list) for (const c of conns(hdrOf(p.k))) {
      const k2 = key(c.g, c.n); if (k2 < p.k || !at.has(k2) || c.dir < 1 || c.dir > 4) continue;
      const q = at.get(k2); let mx, my;
      if (c.dir <= 2) { const x0 = Math.max(p.x, q.x), x1 = Math.min(p.x + p.w, q.x + q.w); mx = (x0 + x1) / 2; my = c.dir === 2 ? p.y : p.y + p.h; }
      else { const y0 = Math.max(p.y, q.y), y1 = Math.min(p.y + p.h, q.y + q.h); my = (y0 + y1) / 2; mx = c.dir === 3 ? p.x : p.x + p.w; }
      const [sx, sy] = W2S(mx, my); out.push({ a: p.k, b: k2, sx, sy });
    }
    return out;
  }
  function bounds(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of list) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); }
    return { x0, y0, x1, y1 };
  }
  function fit(list) {
    const b = bounds(list), cv = S.cv; if (!isFinite(b.x0)) return;
    S.zoom = Math.max(0.05, Math.min(2, Math.min(cv.width / ((b.x1 - b.x0) * 16), cv.height / ((b.y1 - b.y0) * 16)) * 0.95));
    S.panX = b.x0 * 16 - (cv.width / S.zoom - (b.x1 - b.x0) * 16) / 2; S.panY = b.y0 * 16 - (cv.height / S.zoom - (b.y1 - b.y0) * 16) / 2;
  }
  function drawMini(list) {
    const mc = S.mini; if (!mc) return;
    const b = bounds(list); if (!isFinite(b.x0)) return;
    const W = mc.width, H = mc.height, s = Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0));
    const c = mc.getContext('2d'); c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, W, H);
    for (const p of list) {
      const t = rom().u8[hdrOf(p.k) + 23];
      c.fillStyle = p.k === S.active ? '#ffd43b' : p.floating ? '#f59f00' : t === 1 || t === 2 ? '#74c0fc' : t === 6 ? '#4dabf7' : '#8ce99a';
      c.fillRect((p.x - b.x0) * s, (p.y - b.y0) * s, Math.max(1, p.w * s - 1), Math.max(1, p.h * s - 1));
    }
    const cv = S.cv, [vx, vy] = S2W(0, 0), [vx1, vy1] = S2W(cv.width, cv.height);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect((vx - b.x0) * s, (vy - b.y0) * s, (vx1 - vx) * s, (vy1 - vy) * s);
    mc.onmousedown = e => {
      const go = ev => { const r = mc.getBoundingClientRect(); const wx = (ev.clientX - r.left) / s + b.x0, wy = (ev.clientY - r.top) / s + b.y0; S.panX = wx * 16 - cv.width / S.zoom / 2; S.panY = wy * 16 - cv.height / S.zoom / 2; draw(); };
      go(e); const mv = ev => go(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.stopPropagation();
    };
  }

  // ---------- mouse ----------
  function mapAt(bx, by) { const l = S.list || []; for (let i = l.length - 1; i >= 0; i--) { const p = l[i]; if (bx >= p.x && by >= p.y && bx < p.x + p.w && by < p.y + p.h) return p; } return null; }
  function eventAt(p, lx, ly) { for (const l of Object.values(events(p.k))) for (const e of l) { const [x, y] = MapsTab.api.evXY(e); if (x === lx && y === ly) return e; } return null; }
  function handleAt(sx, sy) {
    const act = (S.list || []).find(p => p.k === S.active); if (!act) return null;
    const [ax, ay] = W2S(act.x, act.y), aw = act.w * 16 * S.zoom, ah = act.h * 16 * S.zoom, near = 8;
    const l = Math.abs(sx - ax) < near, r = Math.abs(sx - ax - aw) < near, t = Math.abs(sy - ay) < near, b = Math.abs(sy - ay - ah) < near;
    const inX = sx > ax - near && sx < ax + aw + near, inY = sy > ay - near && sy < ay + ah + near;
    if (!inX || !inY || !(l || r || t || b)) return null;
    return { l: l && inY, r: r && inY, t: t && inX, b: b && inX };
  }
  function activate(k) { if (S.active !== k) { S.active = k; S.blocking = null; side(); } playBtn(); }
  // "Play from here": grey until a map is selected; then click a spot on the map
  function playBtn() {
    const b = $('#wv-play'); if (!b) return;
    if (!S.active) S.pickPlay = false;
    b.disabled = !S.active; b.classList.toggle('sel', !!S.pickPlay);
    b.textContent = S.pickPlay ? '👆 ' + T('Click a spot on the map') : '▶ ' + T('Play from here');
    b.title = S.active ? T('Click a spot on the map: the game starts there') : T('Select a map first');
  }
  function bind(cv) {
    cv.oncontextmenu = e => e.preventDefault();
    cv.ondblclick = e => {
      if (S.mode !== 'events' && S.mode !== 'manage') return;
      const r = cv.getBoundingClientRect(), [wx, wy] = S2W(e.clientX - r.left, e.clientY - r.top), p = mapAt(Math.floor(wx), Math.floor(wy)); if (!p) return;
      const ev = eventAt(p, Math.floor(wx) - p.x, Math.floor(wy) - p.y);
      if (ev && ev.kind === 'warp') goThroughDoor(p.k, ev);
      else if (ev) {
        const [g, n] = parse(p.k), [ex, ey] = MapsTab.api.evXY(ev), [sx, sy] = W2S(p.x + ex + 0.5, p.y + ey);
        Objects.inlineText(g, n, ev, r.left + sx, r.top + sy, (label, fn) => op(label, () => { fn(); S.touched.add(p.k); }, { t: 'raw', label }), () => { draw(); side(); });
      }
    };
    // drop from the library: a Pokémon becomes a legendary, an item an item ball, a trainer a trainer on the map
    cv.ondragover = e => { if ([...e.dataTransfer.types].includes('application/x-ember')) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } };
    cv.ondrop = e => {
      const raw = e.dataTransfer.getData('application/x-ember'); if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      const d = JSON.parse(raw), r = cv.getBoundingClientRect(), [wx, wy] = S2W(e.clientX - r.left, e.clientY - r.top), p = mapAt(Math.floor(wx), Math.floor(wy));
      if (!p || p.floating) { toast(T('Drop it on a map'), 'err'); return; }
      dropOnMap(d, p, Math.floor(wx) - p.x, Math.floor(wy) - p.y);
    };
    cv.onwheel = e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, [wx, wy] = S2W(sx, sy);
      S.zoom = Math.max(0.05, Math.min(4, S.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      S.panX = wx * 16 - sx / S.zoom; S.panY = wy * 16 - sy / S.zoom; draw();
    };
    cv.onmousemove = e => {
      const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, [wx, wy] = S2W(sx, sy);
      if (S.drag) return;
      const p = mapAt(Math.floor(wx), Math.floor(wy)), st = $('#wv-pos');
      if (st) {
        let t = '';
        if (p) { const lx = Math.floor(wx) - p.x, ly = Math.floor(wy) - p.y, b = rom().r16(entry(p.k).m.blocks + (ly * p.w + lx) * 2);
          t = nameOf(p.k) + ' ' + p.k + ' · (' + lx + ', ' + ly + ') · block ' + hex(b & 0x3FF, 3) + ' · collision ' + ((b >> 10) & 3) + ' · elevation ' + (b >> 12); }
        st.textContent = t;
      }
      const hv = p ? { k: p.k, x: Math.floor(wx) - p.x, y: Math.floor(wy) - p.y } : null;
      S.hoverW = [Math.floor(wx), Math.floor(wy)]; if (S.playerView) draw();
      const hev = p && S.showEvents && S.zoom >= 0.2 ? eventAt(p, hv.x, hv.y) : null;
      const sbd = seamBadgeAt(sx, sy);
      cv.title = sbd ? Tf('Where {a} meets {b}', { a: nameOf(sbd.s.a.k), b: nameOf(sbd.s.b.k) }) + ': ' + seamSummary(sbd.s).join(', ') + ' · ' + T('click to see and fix')
        : hev ? (() => { const [g, n] = parse(p.k); return Objects.tooltip(g, n, hev); })() : '';
      if (sbd) { cv.style.cursor = 'pointer'; return; }
      if (S.brush && S.mode === 'paint' && JSON.stringify(hv) !== JSON.stringify(S.hover)) { S.hover = hv; draw(); } else S.hover = hv;
      const hd = S.mode === 'resize' && handleAt(sx, sy);
      cv.style.cursor = S.pickPlay ? (p ? 'crosshair' : 'not-allowed') : hd ? ((hd.l && hd.t) || (hd.r && hd.b) ? 'nwse-resize' : (hd.r && hd.t) || (hd.l && hd.b) ? 'nesw-resize' : hd.l || hd.r ? 'ew-resize' : 'ns-resize')
        : S.showNames && labelAt(sx, sy) ? 'move' : (S.mode === 'manage' || S.mode === 'move') && p ? 'grab' : S.mode === 'paint' && p && p.k === S.active ? 'crosshair' : 'default';
    };
    cv.onmousedown = e => {
      const r = cv.getBoundingClientRect(), sx0 = e.clientX - r.left, sy0 = e.clientY - r.top, [wx0, wy0] = S2W(sx0, sy0);
      const bx = Math.floor(wx0), by = Math.floor(wy0), p = mapAt(bx, by);
      if (S.pickPlay && e.button === 0) {                                              // "Play from here": this spot
        S.pickPlay = false; playBtn();
        if (p && !p.floating) { const [g, n] = parse(p.k), x = bx - p.x, y = by - p.y; Emu.playFrom({ g, n, x, y, team: Emu.team(), label: nameOf(p.k) + ' (' + x + ', ' + y + ')' }); }
        else toast(T('Click on a map'), 'err');
        return;
      }
      const sbd = e.button === 0 && !S.space && seamBadgeAt(sx0, sy0);
      if (sbd) { seamDialog(sbd.s); return; }
      if (p && S.pending && e.button === 0) { S.pending = null; S.active = null; playBtn(); }      // clicking a map closes the new-map form
      let moved = false;
      const pan = (button) => {
        const px = S.panX, py = S.panY;
        S.drag = { kind: 'pan' };
        follow(ev => { moved = true; S.panX = px - (ev.clientX - e.clientX) / S.zoom; S.panY = py - (ev.clientY - e.clientY) / S.zoom; draw(); },
          () => { S.drag = null; if (!moved && button === 2 && p) { const b = rom().r16(entry(p.k).m.blocks + ((by - p.y) * p.w + (bx - p.x)) * 2); activate(p.k); S.selBlock = b & 0x3FF; side(); } });
      };
      if (e.button === 1 || (e.button === 0 && S.space)) return pan(1);
      if (e.button === 2) return p ? selectDrag(e, r, p, bx - p.x, by - p.y) : pan(2);
      // resize handles
      if (S.mode === 'resize') {
        const hd = handleAt(sx0, sy0);
        if (hd) {
          const act = S.list.find(q => q.k === S.active), box = eventBox(act.k);
          S.drag = { kind: 'resize', dl: 0, dt: 0, dr: 0, db: 0 };
          follow(ev => {
            const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top), dx = Math.round(wx - wx0), dy = Math.round(wy - wy0);
            const d = S.drag; d.dl = hd.l ? -dx : 0; d.dr = hd.r ? dx : 0; d.dt = hd.t ? -dy : 0; d.db = hd.b ? dy : 0;
            S.blocking = [];
            if (box) {                                           // shrinking stops at people / doors / signs
              const evs = Object.values(events(act.k)).flat();
              const lim = (cond, val, pick) => { if (cond) S.blocking.push(...evs.filter(pick).map(x => x.off)); return val; };
              if (d.dl < -box.x0) d.dl = lim(true, -box.x0, x => MapsTab.api.evXY(x)[0] === box.x0);
              if (d.dt < -box.y0) d.dt = lim(true, -box.y0, x => MapsTab.api.evXY(x)[1] === box.y0);
              if (act.w + d.dr - 1 < box.x1) d.dr = lim(true, box.x1 - act.w + 1, x => MapsTab.api.evXY(x)[0] === box.x1);
              if (act.h + d.db - 1 < box.y1) d.db = lim(true, box.y1 - act.h + 1, x => MapsTab.api.evXY(x)[1] === box.y1);
            }
            d.dl = Math.max(d.dl, 1 - act.w - d.dr); d.dt = Math.max(d.dt, 1 - act.h - d.db);
            while ((act.w + d.dl + d.dr + 15) * (act.h + d.dt + d.db + 14) > LIMIT && (d.dl > 0 || d.dr > 0 || d.dt > 0 || d.db > 0)) {   // stop at the game's limit
              if (d.dl > 0) d.dl--; else if (d.dr > 0) d.dr--; if ((act.w + d.dl + d.dr + 15) * (act.h + d.dt + d.db + 14) <= LIMIT) break;
              if (d.dt > 0) d.dt--; else if (d.db > 0) d.db--;
            }
            draw();
          }, () => {
            const d = S.drag; S.drag = null;
            if (d.dl || d.dt || d.dr || d.db) {
              if (op('resize ' + nameOf(act.k), () => resizeMap(act.k, d.dl, d.dt, d.dr, d.db), { t: 'resize', k: act.k, dl: d.dl, dt: d.dt, dr: d.dr, db: d.db }, true)) {
                cache.delete(act.k);
                const w2 = act.w + d.dl + d.dr, h2 = act.h + d.dt + d.db;
                toast(nameOf(act.k) + ': ' + act.w + '×' + act.h + ' → ' + w2 + '×' + h2 + ((d.dl > 0 || d.dt > 0) ? '. Note: scripts with fixed coordinates (e.g. setobjectxyperm) are not shifted.' : ''));
                if (S.floating.has(act.k)) { const f = S.floating.get(act.k); S.floating.set(act.k, { x: f.x - d.dl, y: f.y - d.dt }); }
              }
            }
            setTimeout(() => { S.blocking = null; draw(); }, 1200);
            draw(); side();
          });
          return;
        }
      }
      const lk = e.button === 0 && S.showNames && labelAt(sx0, sy0);          // the name tag: drag = move the map, in any mode
      if (lk) return startMove(S.list.find(q => q.k === lk), e, r, wx0, wy0);
      if (!p) return newMapDrag(e, r, wx0, wy0);
      if (S.mode === 'manage' || S.mode === 'move') return startMove(p, e, r, wx0, wy0);
      if (p.k !== S.active && S.mode !== 'events' && S.mode !== 'resize') { activate(p.k); draw(); if (S.mode !== 'move') return; }
      const lx = bx - p.x, ly = by - p.y;
      if (S.mode === 'paint' || S.mode === 'coll') {
        const r2 = rom(), ent = entry(p.k), rec = [], cellsLog = [];
        const set = (x, y, nb) => {
          if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
          const o = ent.m.blocks + (y * p.w + x) * 2, b = r2.r16(o);
          if (nb === b) return;
          cellsLog.push([x, y, nb]);
          rec.push([o, r2.u8.slice(o, o + 2)]); r2.u8[o] = nb & 255; r2.u8[o + 1] = nb >> 8;
          if ((nb & 0x3FF) !== (b & 0x3FF)) ent.cv.getContext('2d').drawImage(MapsTab.api.metatileCanvas(ent.m, nb & 0x3FF), x * 16, y * 16);
        };
        const cell = (x, y) => { const o = ent.m.blocks + (y * p.w + x) * 2; return r2.r16(o); };
        const B = S.brush;
        const stamp = (x, y) => {
          if (S.mode === 'coll') { if (x >= 0 && y >= 0 && x < p.w && y < p.h) set(x, y, (cell(x, y) & 0x3FF) | (S.selColl << 10) | (S.selElev << 12)); return; }
          if (!B) { if (x >= 0 && y >= 0 && x < p.w && y < p.h) set(x, y, (cell(x, y) & ~0x3FF) | S.selBlock); return; }
          for (let j = 0; j < B.h; j++) for (let i = 0; i < B.w; i++) {
            const tx = x + i, ty = y + j; if (tx < 0 || ty < 0 || tx >= p.w || ty >= p.h) continue;
            const v = B.cells[j][i]; set(tx, ty, B.full ? v : (cell(tx, ty) & ~0x3FF) | v);
          }
        };
        stamp(lx, ly); draw();
        follow(ev => {
          const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top), cx = Math.floor(wx) - p.x, cy = Math.floor(wy) - p.y;
          if (B && S.mode === 'paint') { if ((cx - lx) % B.w || (cy - ly) % B.h) return; }          // a copied area repeats like tiles
          stamp(cx, cy); draw();
        }, () => { if (rec.length) { S.undo.push({ label: (S.mode === 'coll' ? 'collision ' : 'paint ') + nameOf(p.k), rec }); S.log.push({ t: 'paintfull', k: p.k, cells: cellsLog }); r2.changed(); S.touched.add(p.k); } });
        return;
      }
      if (S.mode === 'events') {
        if (p.k !== S.active) { S.selEv = null; activate(p.k); }
        if (S.addKind) {
          const tpl = S.addKind, kind = Objects.KIND_OF[tpl], [g, n] = parse(p.k); S.addKind = null;
          let made = null;
          if (op('add ' + tpl, () => { made = Objects.add(g, n, tpl, lx, ly); S.touched.add(p.k); }, { t: 'addobj', k: p.k, tpl, x: lx, y: ly }))
            S.selEv = Object.values(events(p.k)).flat().find(q => q.kind === kind && q.i === made.i) || null;
          draw(); side(); return;
        }
        const ev0 = eventAt(p, lx, ly);
        S.selEv = ev0; side();
        if (!ev0) { draw(); return; }
        const [ox, oy] = MapsTab.api.evXY(ev0); S.drag = { kind: 'event', ev: ev0 };
        let nx = ox, ny = oy;
        follow(ev => { const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top); nx = Math.max(0, Math.min(p.w - 1, Math.floor(wx) - p.x)); ny = Math.max(0, Math.min(p.h - 1, Math.floor(wy) - p.y));
          MapsTab.api.setEvXYRaw(ev0, nx, ny); draw(); },
          () => { S.drag = null; MapsTab.api.setEvXYRaw(ev0, ox, oy); if (nx !== ox || ny !== oy) op('move ' + ({ obj: 'person', warp: 'door', coord: 'trigger', bg: 'sign' })[ev0.kind], () => { MapsTab.api.setEvXY(ev0, nx, ny); S.touched.add(p.k); }, { t: 'event', k: p.k, kind: ev0.kind, i: ev0.i, x: nx, y: ny }); draw(); side(); });
        return;
      }
      if (S.mode === 'connect') {
        const mk = connMarkers(S.list).find(c => Math.hypot(c.sx - sx0, c.sy - sy0) < 11);
        if (mk) { ask(Tf('Remove the connection between {a} and {b}?', { a: nameOf(mk.a), b: nameOf(mk.b) }), { danger: true }).then(yes => { if (yes) op('disconnect', () => disconnect(mk.a, mk.b), { t: 'disconnect', a: mk.a, b: mk.b }, true); draw(); side(); }); return; }
        if (S.active && p.k !== S.active) {
          const a = S.list.find(q => q.k === S.active);
          if (op('connect', () => connect(a, p), { t: 'connect', a: rectOf(a), bs: [rectOf(p)] }, true)) toast('Connected ' + nameOf(a.k) + ' ↔ ' + nameOf(p.k));
          draw(); side();
        } else activate(p.k);
      }
    };
  }
  // right button: drag a rectangle on any map (a neighbour too) to copy those blocks as a brush; a click picks one block
  function selectDrag(e, r, p, lx, ly) {
    S.drag = { kind: 'select', k: p.k, x0: lx, y0: ly, x1: lx, y1: ly };
    let moved = false;
    follow(ev => {
      const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top);
      S.drag.x1 = Math.max(0, Math.min(p.w - 1, Math.floor(wx) - p.x)); S.drag.y1 = Math.max(0, Math.min(p.h - 1, Math.floor(wy) - p.y));
      moved = moved || S.drag.x1 !== lx || S.drag.y1 !== ly; draw();
    }, () => {
      const d = S.drag; S.drag = null;
      const m = entry(p.k).m, at = (x, y) => rom().r16(m.blocks + (y * m.w + x) * 2);
      if (!moved) { draw(); mapMenu(p, lx, ly, e.clientX, e.clientY); return; }     // a right click: the map's menu
      const x0 = Math.min(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0) + 1, h = Math.abs(d.y1 - d.y0) + 1;
      const cells = Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => at(x0 + i, y0 + j)));
      S.brush = makeBrush(cells, true, p.k);
      if (!S.active) activate(p.k);
      S.mode = 'paint'; S.tab = 'blocks';
      toast('Copied ' + w + '×' + h + ' blocks from ' + nameOf(p.k) + ' (with collision): click on the selected map to stamp them');
      render(S.root_el);
    });
  }
  function makeBrush(cells, full, src) {
    const h0 = cells.length, w0 = cells[0].length, m = entry(src).m, cv = h('canvas', { width: w0 * 16, height: h0 * 16 }), c = cv.getContext('2d');
    cells.forEach((row, j) => row.forEach((v, i) => c.drawImage(MapsTab.api.metatileCanvas(m, v & 0x3FF), i * 16, j * 16)));
    return { w: w0, h: h0, cells, full, src, cv, sec: m.sec.off };
  }
  function allConns(k) {
    const [g, n] = parse(k), own = conns(hdrOf(k)).filter(c => c.dir >= 1 && c.dir <= 4);
    const rev = allMaps().flatMap(k2 => conns(hdrOf(k2)).filter(c => c.g === g && c.n === n && c.dir >= 1 && c.dir <= 4));
    const all = [...own, ...rev];
    return { side: all.some(c => c.dir >= 3), vert: all.some(c => c.dir <= 2) };
  }
  // a floating map snaps to an edge of a connected map when it gets within 2 blocks
  function snap(p) {
    const d = S.drag, me = { x: p.x + d.dx, y: p.y + d.dy, w: p.w, h: p.h };
    for (const q of S.list) {
      if (q.k === p.k) continue;
      const yo = me.y < q.y + q.h && q.y < me.y + me.h, xo = me.x < q.x + q.w && q.x < me.x + me.w;
      if (yo && Math.abs(me.x + me.w - q.x) <= 2) { d.dx += q.x - (me.x + me.w); return; }
      if (yo && Math.abs(q.x + q.w - me.x) <= 2) { d.dx += q.x + q.w - me.x; return; }
      if (xo && Math.abs(me.y + me.h - q.y) <= 2) { d.dy += q.y - (me.y + me.h); return; }
      if (xo && Math.abs(q.y + q.h - me.y) <= 2) { d.dy += q.y + q.h - me.y; return; }
    }
  }
  function follow(move, up) {
    const mv = e => move(e), u = e => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', u); up(e); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', u);
  }

  // ======================================================================================================
  // New maps: drag a rectangle on the black area -> form -> createMap (layout, header, group, connections,
  // map-section name, and for a city: Pokémon Center + Mart interiors copied, a Fly point and a respawn spot)
  // ======================================================================================================
  const rectOf = p => ({ k: p.k, x: p.x, y: p.y, w: p.w, h: p.h });
  const TREE = [[0x41C, 0x41D], [0x414, 0x415]];                // primary tileset trees (blocked)
  const PC_STAMP = [[12667, 12668, 12669, 12670, 12671], [1096, 1097, 1098, 1099, 1415], [1104, 1105, 1106, 1107, 1423], [1112, 1113, 1114, 1115, 1431], [1120, 1121, 1122, 1414, 1439]];
  const MART_STAMP = [[12328, 12329, 12330, 12331], [1072, 1073, 1074, 1075], [1080, 1081, 1082, 1083], [1088, 1089, 1122, 1123]];
  const PC_SRC = [5, 4], MART_SRC = [6, 3];                    // FireRed: Viridian Pokémon Center 1F, Pewter Mart
  // Emerald: the buildings of Oldale Town (primary tileset, plus the Mart's roof corner every town tileset has), its Center and Mart
  const EM_NEW = { group: 0, pcSrc: [2, 2], martSrc: [2, 4], pcDoor: [1, 3], martDoor: [1, 3],
    pc: [[0x48, 0x49, 0x4A, 0x4B], [0x50, 0x51, 0x52, 0x53], [0x58, 0x59, 0x5A, 0x5B], [0x60, 0x61, 0x62, 0x63]],
    mart: [[0x28, 0x29, 0x29, 0x285], [0x30, 0x31, 0x32, 0x33], [0x38, 0x39, 0x3A, 0x3B], [0x60, 0x41, 0x42, 0x43]] };
  const FR_NEW = { group: 3, pcSrc: PC_SRC, martSrc: MART_SRC, pcDoor: [2, 4], martDoor: [2, 3], pc: PC_STAMP, mart: MART_STAMP };
  const NEW = () => game().isEmerald ? EM_NEW : FR_NEW;
  // where the name of a map section is: FireRed's own name table; Emerald's region map entries (8 bytes, name at +4)
  const secNameAt = s => game().isEmerald ? game().offsets.regionMapEntries + s * 8 + 4 : TOWNMAP_DATA.names + (s - 0x58) * 4;
  function newMapDrag(e, r, wx0, wy0) {
    const bx = Math.floor(wx0), by = Math.floor(wy0);
    S.pending = null;
    S.drag = { kind: 'newmap', x: bx, y: by, w: 1, h: 1 };
    let moved = false;
    follow(ev => {
      const [wx, wy] = S2W(ev.clientX - r.left, ev.clientY - r.top), ex = Math.floor(wx), ey = Math.floor(wy);
      moved = true; S.drag.x = Math.min(bx, ex); S.drag.y = Math.min(by, ey); S.drag.w = Math.abs(ex - bx) + 1; S.drag.h = Math.abs(ey - by) + 1; draw();
    }, () => {
      let rc = { x: S.drag.x, y: S.drag.y, w: S.drag.w, h: S.drag.h }; S.drag = null;
      if (!moved && S.mode === 'manage' && S.active) { deselect(); return; }  // a click on the empty area: nothing selected
      if (!moved || rc.w < 3 || rc.h < 3) { draw(); side(); return; }      // a plain click is not a new map
      rc = snapRect(rc);
      if ((S.list || []).some(q => !q.floating && rc.x < q.x + q.w && q.x < rc.x + rc.w && rc.y < q.y + q.h && q.y < rc.y + rc.h)) { toast('The new map overlaps a map: draw it on the black area', 'err'); draw(); return; }
      const touch = (S.list || []).filter(q => !q.floating && touching(rc, q));
      S.pending = Object.assign(rc, { type: rc.w >= 18 && rc.h >= 14 ? 'city' : 'route', name: '', from: touch.length ? touch[0].k : nearest(rc), fly: true });
      draw(); side();
    });
  }
  // edges within 2 blocks of a map's edge snap to it (so the new map touches and connects)
  function snapRect(rc) {
    for (const q of (S.list || [])) {
      if (q.floating) continue;
      const yo = rc.y < q.y + q.h && q.y < rc.y + rc.h, xo = rc.x < q.x + q.w && q.x < rc.x + rc.w;
      if (yo && Math.abs(rc.x - (q.x + q.w)) <= 2) { rc.w += rc.x - (q.x + q.w); rc.x = q.x + q.w; }
      else if (yo && Math.abs(rc.x + rc.w - q.x) <= 2) rc.w = q.x - rc.x;
      if (xo && Math.abs(rc.y - (q.y + q.h)) <= 2) { rc.h += rc.y - (q.y + q.h); rc.y = q.y + q.h; }
      else if (xo && Math.abs(rc.y + rc.h - q.y) <= 2) rc.h = q.y - rc.y;
    }
    return rc;
  }
  function nearest(rc) {
    let best = null, bd = Infinity;
    for (const q of (S.list || [])) { if (q.floating) continue; const d = Math.hypot(q.x + q.w / 2 - rc.x - rc.w / 2, q.y + q.h / 2 - rc.y - rc.h / 2); if (d < bd) { bd = d; best = q.k; } }
    return best;
  }

  // ---------- map sections (names on the town map): free ones first, then the Sevii Islands ----------
  function reachableSections() {
    const r = rom(), seen = new Set([S.root]), q = [S.root], secs = new Set();
    while (q.length) {
      const k = q.pop(), h = hdrOf(k); if (!h) continue;
      secs.add(r.u8[h + 20]);
      const next = conns(h).map(c => key(c.g, c.n));
      const ev = r.ptr(h + 4);
      if (ev >= 0) { const nw = r.u8[ev + 1], wp = r.ptr(ev + 8); if (wp >= 0) for (let i = 0; i < nw; i++) next.push(key(r.u8[wp + i * 8 + 7], r.u8[wp + i * 8 + 6])); }
      for (const k2 of next) if (!seen.has(k2) && hdrOf(k2)) { seen.add(k2); q.push(k2); }
    }
    return secs;
  }
  function freeSections(fly) {
    const r = rom(), used = reachableSections(), D = TOWNMAP_DATA, out = [];
    if (game().isEmerald) {                                          // the Kanto names Emerald keeps but no map uses; no Fly points yet
      if (fly) return out;
      const all = new Set(); for (const grp of game().mapGroups) for (const hp of grp) all.add(r.u8[hp + 20]);
      for (let s = 0x58; s < 0xC5; s++) if (!all.has(s) && !used.has(s) && r.ptr(secNameAt(s)) >= 0) out.push(s);
      return out;
    }
    for (let s = 0x58; s < 0xC5; s++) {
      if (used.has(s) || r.ptr(D.names + (s - 0x58) * 4) < 0) continue;
      const heal = r.u8[D.fly + (s - 0x58) * 3 + 2];
      if (fly ? (heal >= 14 && heal <= 20) : !heal) out.push(s);    // Fly: the seven Sevii island towns (heal locations 14-20)
    }
    return out;
  }
  const FLY_FLAG = s => 0x89B + (s - 0x8F);                          // FLAG_WORLD_MAP_ONE_ISLAND ... SIX_ISLAND

  // ---------- adding maps to a map group / copying interiors ----------
  function appendToGroup(g, hdr) {
    const r = rom(), maps = game().mapGroups[g], arr = new Uint8Array((maps.length + 1) * 4), dv = new DataView(arr.buffer);
    maps.forEach((hp, i) => dv.setUint32(i * 4, 0x08000000 + hp, true)); dv.setUint32(maps.length * 4, 0x08000000 + hdr, true);
    r.wptr(game().offsets.mapGroups + g * 4, r.writeNew(arr));
    maps.push(hdr); return maps.length - 1;
  }
  function newLayoutId(lay) {
    const r = rom(), t = layoutTable(), table = new Uint8Array((t.count + 1) * 4);
    table.set(r.u8.subarray(t.base, t.base + t.count * 4)); new DataView(table.buffer).setUint32(t.count * 4, 0x08000000 + lay, true);
    const nt = r.writeNew(table); for (const p of r.findPointers(t.base, true)) r.wptr(p, nt);
    S.layoutTable = { base: nt, count: t.count + 1 }; return t.count + 1;
  }
  // copy a map header + its events into group g; editWarp(warp) -> changed warp; scripts: a new map-script table or null
  function cloneMap(g, n, editWarp, scripts) {
    const r = rom(), src = game().mapGroups[g][n], ev = r.ptr(src + 4);
    const no = r.u8[ev], nw = r.u8[ev + 1], nc = r.u8[ev + 2], nb = r.u8[ev + 3];
    const copy = (ptrOff, size, count) => { const p = r.ptr(ev + ptrOff); return count && p >= 0 ? r.writeNew(r.u8.slice(p, p + size * count)) : 0; };
    const warps = r.u8.slice(r.ptr(ev + 8), r.ptr(ev + 8) + nw * 8), wv = new DataView(warps.buffer);
    for (let i = 0; i < nw; i++) {
      const w = { x: wv.getInt16(i * 8, true), y: wv.getInt16(i * 8 + 2, true), elev: warps[i * 8 + 4], warp: warps[i * 8 + 5], num: warps[i * 8 + 6], group: warps[i * 8 + 7] };
      const w2 = editWarp(w, i); warps[i * 8 + 5] = w2.warp; warps[i * 8 + 6] = w2.num; warps[i * 8 + 7] = w2.group;
    }
    const evs = new Uint8Array(20), ed = new DataView(evs.buffer);
    evs.set([no, nw, nc, nb]);
    const po = copy(4, 24, no), pw = nw ? r.writeNew(warps) : 0, pc = copy(12, 16, nc), pb = copy(16, 12, nb);
    [po, pw, pc, pb].forEach((p, i) => ed.setUint32(4 + i * 4, p ? 0x08000000 + p : 0, true));
    const hdr = r.u8.slice(src, src + 28);
    new DataView(hdr.buffer).setUint32(4, 0x08000000 + r.writeNew(evs), true);
    if (scripts != null) new DataView(hdr.buffer).setUint32(8, 0x08000000 + scripts, true);
    return appendToGroup(g, r.writeNew(hdr));
  }

  // ---------- the template: trees, open paths toward the neighbours, a PC and a Mart in a city ----------
  // metatile behaviour (FireRed tileset attributes: u32 per metatile, behaviour = low 9 bits); 0 = plain ground
  function behavior(m, id) {
    const g = game(), sec = id >= g.primaryMetatiles, ts = sec ? m.sec : m.prim, local = sec ? id - g.primaryMetatiles : id;
    const attr = rom().ptr(ts.off + (g.isEmerald ? 16 : 20)); if (attr < 0) return 0;
    return g.isEmerald ? rom().r16(attr + local * 2) & 0xFF : rom().r32(attr + local * 4) & 0x1FF;
  }
  // the most used walkable plain-ground block of a map (not tall grass / water), else primary ground 0x001
  function groundOf(m) {
    const r = rom(), cnt = new Map();
    for (let i = 0; i < m.w * m.h; i++) { const v = r.r16(m.blocks + i * 2); if (!((v >> 10) & 3) && !behavior(m, v & 0x3FF)) cnt.set(v, (cnt.get(v) || 0) + 1); }
    return cnt.size ? [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0] : 0x3001;
  }
  function template(spec, touch) {
    const r = rom(), { w, h } = spec, src = entry(spec.from).m;
    const ground = groundOf(src);
    const fill = game().isEmerald ? (() => { const bd = src.border; return [[rom().r16(bd), rom().r16(bd + 2)], [rom().r16(bd + 4), rom().r16(bd + 6)]]; })() : TREE;
    const b = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => fill[y & 1][x & 1]));
    const city = spec.type === 'city', edge = city ? 2 : 0;
    if (city) for (let y = edge; y < h - edge; y++) for (let x = edge; x < w - edge; x++) b[y][x] = ground;
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const carve = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) b[y][x] = ground; };
    // openings: the neighbour's walkable cells along the shared edge, carried to the middle of the new map
    for (const q of touch) {
      const qm = entry(q.k).m, walk = (qx, qy) => !((r.r16(qm.blocks + (qy * qm.w + qx) * 2) >> 10) & 3);
      // the neighbour's edge is blocked (trees): clear a 2-wide path into it, up to its first walkable cell
      const qground = groundOf(qm);
      const cutInto = (cells) => {                                  // cells: [[qx, qy, stepX, stepY], ...] along the edge
        for (const [qx0, qy0, sx, sy] of cells) for (let i = 0, qx = qx0, qy = qy0; i < 14 && qx >= 0 && qy >= 0 && qx < qm.w && qy < qm.h; i++, qx += sx, qy += sy) {
          if (walk(qx, qy) && i) break;
          r.w16(qm.blocks + (qy * qm.w + qx) * 2, qground);
        }
        cache.delete(q.k); S.touched.add(q.k);
      };
      const open = [];
      if (q.y + q.h === spec.y || spec.y + h === q.y) {
        const above = q.y + q.h === spec.y, qy = above ? q.h - 1 : 0, ly = above ? 0 : h - 1;
        for (let wx = Math.max(spec.x, q.x); wx < Math.min(spec.x + w, q.x + q.w); wx++) if (walk(wx - q.x, qy)) open.push([wx - spec.x, ly]);
        if (!open.length) {
          const mid = Math.floor((Math.max(spec.x, q.x) + Math.min(spec.x + w, q.x + q.w)) / 2);
          cutInto([[mid - 1 - q.x, qy, 0, above ? -1 : 1], [mid - q.x, qy, 0, above ? -1 : 1]]);
          open.push([mid - 1 - spec.x, ly], [mid - spec.x, ly]);
        }
        for (const [x, y0] of open) { const dir = y0 === 0 ? 1 : -1; for (let y = y0; y !== cy + dir; y += dir) carve(x, y); for (let x2 = Math.min(x, cx); x2 <= Math.max(x, cx); x2++) carve(x2, cy); }
      } else {
        const left = q.x + q.w === spec.x, qx = left ? q.w - 1 : 0, lx = left ? 0 : w - 1;
        for (let wy = Math.max(spec.y, q.y); wy < Math.min(spec.y + h, q.y + q.h); wy++) if (walk(qx, wy - q.y)) open.push([lx, wy - spec.y]);
        if (!open.length) {
          const mid = Math.floor((Math.max(spec.y, q.y) + Math.min(spec.y + h, q.y + q.h)) / 2);
          cutInto([[qx, mid - 1 - q.y, left ? -1 : 1, 0], [qx, mid - q.y, left ? -1 : 1, 0]]);
          open.push([lx, mid - 1 - spec.y], [lx, mid - spec.y]);
        }
        for (const [x0, y] of open) { const dir = x0 === 0 ? 1 : -1; for (let x = x0; x !== cx + dir; x += dir) carve(x, y); for (let y2 = Math.min(y, cy); y2 <= Math.max(y, cy); y2++) carve(cx, y2); }
      }
    }
    if (!city) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) carve(x, y);
    // a city gets a Pokémon Center and a Mart near the middle (if there is room)
    let pc = null, mart = null;
    if (city && w >= 16 && h >= 13) {
      const px = cx - 7, py = cy - 5, mx = cx + 2, my = cy - 4;
      const N = NEW();
      N.pc.forEach((row, y) => row.forEach((v, x) => { b[py + y][px + x] = v; }));
      N.mart.forEach((row, y) => row.forEach((v, x) => { b[my + y][mx + x] = v; }));
      pc = [px + N.pcDoor[0], py + N.pcDoor[1]]; mart = [mx + N.martDoor[0], my + N.martDoor[1]];
      for (let x = px; x <= mx + 3; x++) carve(x, py + 5);        // a street in front of both doors
    }
    return { blocks: b, pc, mart };
  }

  function createMap(spec) {
    const r = rom(), g = game(), D = TOWNMAP_DATA;
    const { w, h } = spec;
    if ((w + 15) * (h + 14) > LIMIT || w < 4 || h < 4) throw new Error('Size ' + w + '×' + h + ' is outside the game\'s limits');
    const touch = (S.list || []).filter(q => !q.floating && touching(spec, q));
    const nb = hdrOf(spec.from), nlay = r.ptr(nb);
    const tpl = template(spec, touch);
    const city = spec.type === 'city', fly = !!(city && spec.fly && tpl.pc);
    // map section + its name
    const pool = freeSections(fly);
    if (!pool.length) throw new Error(fly ? 'No free Fly slot left (the 7 Sevii island towns are used)' : 'No free map-section (name) slot left');
    const sec = pool[0];
    const name = (spec.name || '').trim() || (city ? 'עיר חדשה' : 'דרך חדשה');
    r.wptr(secNameAt(sec), r.writeNew(Charmap.encode(name, { rtl: App.settings.rtl })));
    const OG = NEW().group, [PCG, PCN] = NEW().pcSrc, [MG, MN] = NEW().martSrc;      // the outdoor map group, the interiors to copy
    // layout (+ a new layout id)
    const blk = new Uint8Array(w * h * 2), bv = new DataView(blk.buffer);
    tpl.blocks.forEach((row, y) => row.forEach((v, x) => bv.setUint16((y * w + x) * 2, v, true)));
    const bw = g.isEmerald ? 2 : r.u8[nlay + 24] || 2, bh = g.isEmerald ? 2 : r.u8[nlay + 25] || 2, nbd = r.ptr(nlay + 8);   // Emerald: always 2x2
    const lay = r.u8.slice(nlay, nlay + 28), lv = new DataView(lay.buffer);
    lv.setUint32(0, w, true); lv.setUint32(4, h, true);
    lv.setUint32(8, 0x08000000 + r.writeNew(r.u8.slice(nbd, nbd + bw * bh * 2)), true);
    lv.setUint32(12, 0x08000000 + r.writeNew(blk), true);
    const layOff = r.writeNew(lay), layId = newLayoutId(layOff);
    // numbers of the new maps (the city first, then its interiors)
    const num = g.mapGroups[OG].length;
    const warps = [];
    let pc1 = null, martNum = null;
    if (tpl.pc) {
      pc1 = g.mapGroups[PCG].length;
      martNum = g.mapGroups[MG].length + (MG === PCG ? 2 : 0);
      warps.push([tpl.pc[0], tpl.pc[1], 3, 1, pc1, PCG], [tpl.mart[0], tpl.mart[1], 3, 1, martNum, MG]);
    }
    // events: the two doors
    const evs = new Uint8Array(20), ed = new DataView(evs.buffer);
    evs[1] = warps.length;
    if (warps.length) {
      const wb = new Uint8Array(warps.length * 8), wd = new DataView(wb.buffer);
      warps.forEach(([x, y, el, wi, mn, mg], i) => { wd.setInt16(i * 8, x, true); wd.setInt16(i * 8 + 2, y, true); wb.set([el, wi, mn, mg], i * 8 + 4); });
      ed.setUint32(8, 0x08000000 + r.writeNew(wb), true);
    }
    // map scripts: a Fly city marks itself visited when you enter it (setworldmapflag)
    let scr;
    if (fly) {
      const flag = FLY_FLAG(sec), code = r.writeNew(new Uint8Array([0xD0, flag & 255, flag >> 8, 0x02]));
      const t = new Uint8Array(6); t[0] = 3; new DataView(t.buffer).setUint32(1, 0x08000000 + code, true); scr = r.writeNew(t);
    } else scr = r.writeNew(new Uint8Array([0]));
    // header: like the neighbour's (music, weather, flags), with its own layout, events, scripts, name and type
    const hdr = r.u8.slice(nb, nb + 28), hv = new DataView(hdr.buffer);
    hv.setUint32(0, 0x08000000 + layOff, true); hv.setUint32(4, 0x08000000 + r.writeNew(evs), true); hv.setUint32(8, 0x08000000 + scr, true);
    hv.setUint32(12, 0, true); hv.setUint16(18, layId, true); hdr[20] = sec; hdr[23] = city ? 2 : 3;
    if (appendToGroup(OG, r.writeNew(hdr)) !== num) throw new Error('map number mismatch');
    const k = key(OG, num);
    // interiors: Pokémon Center 1F / 2F and the Mart; their doors lead back here
    if (tpl.pc) {
      const pg = PCG, pn = PCN, src1 = g.mapGroups[pg][pn], ev1 = r.ptr(src1 + 4), wp1 = r.ptr(ev1 + 8);
      let up = null; for (let i = 0; i < r.u8[ev1 + 1]; i++) if (r.u8[wp1 + i * 8 + 7] === pg && r.u8[wp1 + i * 8 + 6] !== pn) up = r.u8[wp1 + i * 8 + 6];
      const heal = fly ? r.u8[D.fly + (sec - 0x58) * 3 + 2] : 0;
      let scripts1 = null;
      if (fly) {                                                    // setrespawn <our heal location> on entering the center
        const ms = r.ptr(src1 + 8), ents = [];
        for (let i = 0; r.u8[ms + i * 5]; i++) ents.push([r.u8[ms + i * 5], r.r32(ms + i * 5 + 1)]);
        const code = r.writeNew(new Uint8Array([0x9F, heal & 255, heal >> 8, 0x02]));
        const t = new Uint8Array(ents.length * 5 + 1), tv = new DataView(t.buffer);
        ents.forEach(([ty, p], i) => { t[i * 5] = ty; tv.setUint32(i * 5 + 1, ty === 3 ? 0x08000000 + code : p, true); });
        scripts1 = r.writeNew(t);
      }
      const n1 = cloneMap(pg, pn, w0 => w0.group === OG ? Object.assign(w0, { num, warp: 0 }) : (w0.group === pg && w0.num === up ? Object.assign(w0, { num: pc1 + 1 }) : w0), scripts1);
      const n2 = up != null ? cloneMap(pg, up, w0 => w0.group === pg && w0.num === pn ? Object.assign(w0, { num: n1 }) : w0, null) : null;
      const nm = cloneMap(MG, MN, w0 => w0.group === OG ? Object.assign(w0, { num, warp: 1 }) : w0, null);
      if (n1 !== pc1 || (n2 != null && n2 !== pc1 + 1) || nm !== martNum) throw new Error('interior number mismatch');
      if (fly) {
        r.write(D.fly + (sec - 0x58) * 3, new Uint8Array([OG, num, heal]));
        const he = new Uint8Array(8), hd = new DataView(he.buffer); he[0] = OG; he[1] = num; hd.setInt16(2, tpl.pc[0], true); hd.setInt16(4, tpl.pc[1] + 1, true);
        r.write(D.heal + (heal - 1) * 8, he);
        const rs = new Uint8Array(4), rv = new DataView(rs.buffer); rv.setUint16(0, pg, true); rv.setUint16(2, n1, true);
        r.write(D.respawn + (heal - 1) * 4, rs); r.w8(D.healer + heal - 1, r.u8[D.healer + 1]);
      }
    }
    S.touched.add(k);
    for (const q of touch) connect(Object.assign(rectOf(spec), { k }), q);
    if (!touch.length) S.floating.set(k, { x: spec.x, y: spec.y });
    S.active = k;
    return { k, sec, name, fly };
  }

  // ---------- the town map follows the world ----------
  const waterCache = new Map();
  function isWater(k) {
    const r = rom(), h0 = hdrOf(k), lay = r.ptr(h0), b = r.ptr(lay + 12), n = r.r32(lay) * r.r32(lay + 4), ck = b + ':' + n;
    if (r.u8[h0 + 23] === 6) return true;
    if (waterCache.has(ck)) return waterCache.get(ck);
    let wtr = 0; for (let i = 0; i < n; i++) if ((r.r16(b + i * 2) >> 12) === 1) wtr++;
    const v = wtr > n * 0.5; waterCache.set(ck, v); return v;
  }
  // a project can keep a town map of its own (drawn elsewhere): then world edits leave it alone
  const townLocked = () => !!(Project.getData('townmap', () => ({})) || {}).locked;
  function updateTownMap() {
    if (!TownMap.supported() || townLocked()) return;
    const { list } = placed(), maps = list.filter(p => !p.floating && isOutdoor(p.k));
    if (!maps.length) return;
    const linked = new Set();
    for (const p of maps) for (const c of conns(hdrOf(p.k))) { linked.add(p.k + '|' + key(c.g, c.n)); linked.add(key(c.g, c.n) + '|' + p.k); }
    const gen = TownMap.generate(maps, k => ({ sec: rom().u8[hdrOf(k) + 20], city: [1, 2].includes(rom().u8[hdrOf(k) + 23]), water: isWater(k) }), (a, b) => linked.has(a + '|' + b),
      k => [...new Set(conns(hdrOf(k)).filter(c => c.dir >= 1 && c.dir <= 4 && maps.some(p => p.k === key(c.g, c.n))).map(c => c.dir))]);
    TownMap.write(rom(), gen);
  }
  function townPanel() {
    const cv = h('canvas', { class: 'pixel wv-town', width: 240, height: 160 }), tip = h('div', { class: 'muted', style: { fontSize: '12px', minHeight: '16px' } }, ' ');
    TownMap.render(rom(), cv);
    cv.onmousemove = e => {
      const c = TownMap.cellAt(cv, e); if (!c) { tip.textContent = ' '; return; }
      const s = TownMap.grid(rom())[c[1] * TownMap.W + c[0]];
      tip.textContent = s === TownMap.NONE ? '(' + c + ')' : Game.mapName(rom(), game(), s) + ' · section ' + hex(s, 2);
    };
    const lock = h('label', { style: { fontSize: '12px' } }, h('input', { type: 'checkbox', checked: townLocked(), onchange: e => { Project.setData('townmap', Object.assign({}, Project.getData('townmap', () => ({})), { locked: e.target.checked })); side(); } }),
      ' ' + T('Keep this town map (do not redraw it after world changes)'));
    return h('details', { class: 'hdr', open: true }, h('summary', {}, 'Town map in the game'), cv, tip, lock,
      h('div', { class: 'muted', style: { fontSize: '12px' } }, townLocked() ? T('Kept as it is: world changes do not touch it.') : 'Redrawn automatically after every change to the world (resize, move, connect, new map). Blue rings = Fly points.'));
  }
  function newMapForm(el) {
    const P = S.pending, touch = (S.list || []).filter(q => !q.floating && touching(P, q));
    const srcs = [...new Set([...touch.map(q => q.k), P.from].filter(Boolean))];
    const flyFree = freeSections(true).length, secFree = freeSections(false).length;
    const sizeOk = (P.w + 15) * (P.h + 14) <= LIMIT && P.w >= 4 && P.h >= 4;
    const typeSel = h('select', { onchange: e => { P.type = e.target.value; side(); } }, h('option', { value: 'route' }, 'Route'), h('option', { value: 'city' }, 'City'));
    typeSel.value = P.type;
    const srcSel = h('select', { onchange: e => P.from = e.target.value }, ...srcs.map(k => h('option', { value: k }, nameOf(k) + ' ' + k)));
    srcSel.value = P.from;
    el.append(h('h3', {}, 'New map'),
      h('div', { class: 'muted' }, P.w + '×' + P.h + ' blocks at (' + P.x + ', ' + P.y + ') · ' + (touch.length ? 'connects to ' + touch.map(q => nameOf(q.k)).join(', ') : 'touches no map (it will float until you connect it)')),
      h('div', { class: 'fields', style: { marginTop: '6px' } },
        h('label', { class: 'field' }, 'Type', typeSel),
        h('label', { class: 'field' }, 'Width', h('input', { type: 'number', value: P.w, onchange: e => { P.w = Math.max(4, +e.target.value); draw(); side(); } })),
        h('label', { class: 'field' }, 'Height', h('input', { type: 'number', value: P.h, onchange: e => { P.h = Math.max(4, +e.target.value); draw(); side(); } })),
        h('label', { class: 'field' }, 'Graphics like', srcSel)),
      h('label', { class: 'field', style: { marginTop: '6px' } }, 'Name in the game (Hebrew)',
        h('input', { dir: 'rtl', placeholder: P.type === 'city' ? 'שם העיר' : 'שם הדרך', value: P.name, style: { width: '100%' }, oninput: e => P.name = e.target.value })),
      P.type === 'city' ? h('label', {}, h('input', { type: 'checkbox', checked: P.fly && flyFree > 0, disabled: !flyFree, onchange: e => P.fly = e.target.checked }),
        ' Fly point + Pokémon Center to return to (' + flyFree + ' free)' + (P.w < 16 || P.h < 13 ? ' · needs at least 16×13 for the Center and Mart' : '')) : '',
      h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Free name slots: ' + secFree + '. The town map in the game is redrawn after creating.'),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'primary', disabled: !sizeOk, onclick: () => {
          const spec = Object.assign({}, P);
          let res = null;
          if (op('new map ' + (spec.name || spec.type), () => { res = createMap(spec); }, { t: 'create', spec }, true)) {
            S.pending = null; cache.clear();
            toast('Created ' + res.name + ' (' + res.k + ', section ' + hex(res.sec, 2) + ')' + (res.fly ? ' with a Fly point and a Pokémon Center' : ''));
          }
          render(S.root_el);
        } }, 'Create map'),
        h('button', { onclick: () => { S.pending = null; draw(); side(); } }, 'Cancel')));
  }

  // ---------- export (format 2): exact byte changes + the list of edits, for build.py and for replaying ----------
  const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  function crc32(u) { let c = -1; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function patches() {
    const a = rom().original, b = rom().u8, out = [];
    const diff = j => j >= a.length || a[j] !== b[j];
    let i = 0;
    while (i < b.length) {
      if (!diff(i)) { i++; continue; }
      let j = i, same = 0;
      while (j < b.length && same < 8) { if (diff(j)) same = 0; else same++; j++; }
      const end = j - same;
      out.push([i, Array.from(b.subarray(i, end), v => v.toString(16).padStart(2, '0')).join('')]); i = end;
    }
    return out;
  }
  function exportData() {
    return { format: 'kl-world-2', base_crc: crc32(rom().original), base_size: rom().original.length, size: rom().size, patches: patches(), ops: S.log };
  }
  async function importEdits(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.format !== 'kl-world-2') throw new Error('not a world_edits.json (format 2) file');
      const same = crc32(rom().original) === j.base_crc && rom().u8.length === rom().original.length && crc32(rom().u8) === j.base_crc;
      if (same) {
        op('import edits', () => {
          if (j.size > rom().size) { const n = new Uint8Array(j.size).fill(0xFF); n.set(rom().u8); rom().u8 = n; }
          for (const [o, hx] of j.patches) rom().write(o, Uint8Array.from(hx.match(/../g), v => parseInt(v, 16)));
        }, { t: 'raw', label: 'import' });
        game().mapGroups = Game.readMapGroups(rom(), game().offsets.mapGroups);
        S.log = (j.ops || []).slice(); toast('Edits applied (same ROM): ' + j.patches.length + ' changed areas');
      } else {
        if (!(await ask(Tf('This ROM is not the one the edits were made on (the build changed). Replay the {n} edits on this ROM?', { n: j.ops.length })))) return;
        const errors = replay(j.ops); toast('Replayed ' + (j.ops.length - errors) + ' of ' + j.ops.length + ' edits', errors ? 'err' : 'ok');
      }
      cache.clear(); S.fitted = false; render(S.root_el);
    } catch (e) { console.error(e); toast(e.message, 'err'); }
  }
  function replay(ops) {
    let errors = 0;
    for (const o of ops) {
      S.list = placed().list;
      let ok = true;
      switch (o.t) {
        case 'resize': ok = op('resize', () => resizeMap(o.k, o.dl, o.dt, o.dr, o.db), o, true); break;
        case 'move': ok = op('move', () => moveMap(o.k, o.dx, o.dy), o, true); break;
        case 'delmap': ok = op('delete map', () => deleteMap(o.k), o, true); if (ok) { S.floating.delete(o.k); S.lastPos.delete(o.k); } break;
        case 'freemove': { const p0 = S.list.find(q => q.k === o.k); ok = op('move', () => freeMove(o.k, o.dx, o.dy), o, true); if (ok && p0) placeMoved(p0, o.dx, o.dy); break; }
        case 'connect': ok = op('connect', () => o.bs.forEach(b => connect(o.a, b)), o, true); break;
        case 'disconnect': ok = op('disconnect', () => disconnect(o.a, o.b), o, true); break;
        case 'paint': ok = op('paint', () => { const m = entry(o.k).m; for (const [x, y, v] of o.cells) { const a = m.blocks + (y * m.w + x) * 2; rom().w16(a, (rom().r16(a) & ~0x3FF) | v); } S.touched.add(o.k); }, o); break;
        case 'event': ok = op('event', () => { const e = events(o.k)[o.kind][o.i]; MapsTab.api.setEvXY(e, o.x, o.y); }, o); break;
        case 'create': ok = op('create', () => createMap(o.spec), o, true); break;
        case 'paintfull': ok = op('paint', () => { const m = entry(o.k).m; for (const [x, y, v] of o.cells) rom().w16(m.blocks + (y * m.w + x) * 2, v); S.touched.add(o.k); }, o); break;
        case 'addev': ok = op('add', () => { const [g, n] = parse(o.k); MapsTab.api.addEvent(g, n, o.kind, o.x, o.y); }, o); break;
        case 'delev': ok = op('delete', () => { const [g, n] = parse(o.k); MapsTab.api.deleteEvent(g, n, o.kind, o.i); }, o); break;
        case 'townmap': ok = op('town map', () => {}, o, true); break;
        case 'multi': ok = op('fix', () => o.ops.forEach(applyOp), o, true); break;
        case 'addobj': ok = op('add', () => { const [g, n] = parse(o.k); Objects.add(g, n, o.tpl, o.x, o.y); }, o); break;
        case 'evbyte': ok = op('object', () => {
          const e = events(o.k)[o.kind][o.i], a = e.off + o.at;
          if (o.size === 'raw') o.v.forEach((v, j) => rom().w8(a + j, v)); else if (o.size === 1) rom().w8(a, o.v); else if (o.size === 2) rom().w16(a, o.v); else rom().w32(a, o.v);
        }, o); break;
      }
      if (!ok) errors++;
      cache.clear();
    }
    return errors;
  }

  // ---------- show where a Pokémon appears (from the Pokémon card) ----------
  function highlight(sp) {
    if (sp == null) { S.highlight = null; return; }
    const areas = new Map();
    for (const f of Wild.whereFound(sp)) { const k = key(f.g, f.n), prev = areas.get(k); areas.set(k, (prev ? prev + ' · ' : '') + (f.kind === 'water' ? '🌊 ' : '🌿 ') + f.pct + '%'); }
    S.highlight = { sp, areas };
  }

  // ---------- objects ----------
  function objectsList(k, g, n) {
    const all = Object.values(events(k)).flat();
    return h('select', { style: { maxWidth: '100%', margin: '4px 0' }, onchange: ev => { S.selEv = all[+ev.target.value] || null; draw(); side(); } },
      h('option', {}, '— ' + all.length + ' objects on this map —'),
      ...all.map((x, i) => { const [a, b] = MapsTab.api.evXY(x); return h('option', { value: i, selected: S.selEv && S.selEv.off === x.off }, Objects.tooltip(g, n, x).slice(0, 70) + ' (' + a + ',' + b + ')'); }));
  }
  // select a door (warp) of another map: in the world view if that map is shown, otherwise in the map editor
  function jumpTo(k2, w) {
    const p = (S.list || []).find(q => q.k === k2 && !q.floating);
    const [g, n] = parse(k2);
    if (!p) { toast(nameOf(k2) + ' is not part of the connected world: opening it in the map editor'); MapsTab.api.open(g, n, { kind: 'warp', i: w }); return; }
    activate(k2); S.mode = 'events'; S.tab = 'objects';
    S.selEv = (events(k2).warp || [])[w] || null;
    const [ex, ey] = S.selEv ? MapsTab.api.evXY(S.selEv) : [p.w / 2, p.h / 2], cv = S.cv;
    S.panX = (p.x + ex) * 16 - cv.width / S.zoom / 2; S.panY = (p.y + ey) * 16 - cv.height / S.zoom / 2;
    render(S.root_el);
  }

  // ---------- through a door: to the map it leads to, and back (a trail of where we came from) ----------
  function doorTarget(w) { const u = rom().u8; return { g: u[w.off + 7], n: u[w.off + 6], w: u[w.off + 5] }; }
  function viewState(door) { return { root: S.root, panX: S.panX, panY: S.panY, zoom: S.zoom, active: S.active, mode: S.mode, tab: S.tab, door }; }
  function centerOn(k, x, y, fitMap) {
    const p = (S.list || []).find(q => q.k === k), cv = S.cv; if (!p || !cv) return;
    if (fitMap) S.zoom = Math.max(0.3, Math.min(3, Math.min(cv.width / (p.w * 16), cv.height / (p.h * 16)) * 0.8));
    S.panX = (p.x + x + 0.5) * 16 - cv.width / S.zoom / 2; S.panY = (p.y + y + 0.5) * 16 - cv.height / S.zoom / 2;
  }
  function goThroughDoor(k, w) {
    closeMenu();
    const t = doorTarget(w), k2 = key(t.g, t.n);
    if (t.g === 127 || t.n === 127 || !hdrOf(k2)) { toast(T('This door leads back to wherever the player came from (decided in the game): there is no fixed map to go to'), 'err'); return; }
    S.trail.push(viewState({ k, kind: 'warp', i: w.i }));
    const inWorld = (S.list || []).some(q => q.k === k2 && !q.floating);
    if (!inWorld) { S.root = k2; S.lastPos.clear(); S.floating.clear(); S.list = placed().list; }
    activate(k2); S.mode = 'events'; S.tab = 'objects';
    S.selEv = (events(k2).warp || [])[t.w] || null;
    const [ex, ey] = S.selEv ? MapsTab.api.evXY(S.selEv) : [0, 0];
    centerOn(k2, ex, ey, !inWorld);
    S.fitted = true; render(S.root_el);
  }
  function goBack(all) {
    closeMenu();
    if (!S.trail.length) return;
    const st = all ? S.trail[0] : S.trail[S.trail.length - 1];
    S.trail = all ? [] : S.trail.slice(0, -1);
    if (st.root !== S.root) { S.root = st.root; S.lastPos.clear(); S.floating.clear(); }
    Object.assign(S, { panX: st.panX, panY: st.panY, zoom: st.zoom, mode: st.mode, tab: st.tab, fitted: true });
    S.list = placed().list;
    const back = st.door && hdrOf(st.door.k) ? st.door.k : st.active;
    if (back && hdrOf(back)) activate(back); else S.active = null;
    S.selEv = st.door && hdrOf(st.door.k) ? (events(st.door.k)[st.door.kind] || [])[st.door.i] || null : null;
    render(S.root_el);
  }
  const trailName = st => st.door ? nameOf(st.door.k) : nameOf(st.root);

  // ---------- side panel ----------
  function side() {
    const el = $('#wv-side'); if (!el) return;
    el.innerHTML = '';
    el.append(h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginBottom: '8px' } },
      h('button', { class: S.mode === 'manage' ? 'sel' : '', style: { whiteSpace: 'nowrap' }, onclick: () => { S.mode = 'manage'; S.addKind = null; render(S.root_el); } }, '🧭 General map management'),
      h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Change the world on the big map: click a map to select it, drag it to move it (connections to maps it leaves are removed, maps it touches are connected). In every mode the name tag drags the map. Right click a map for everything you can do with it. Esc or a click on the empty area deselects.')));
    if ((S.mode === 'events' || S.mode === 'manage') && !S.pending) el.append(libraryBox());
    if (S.pending) { newMapForm(el); if (S.active) el.append(paletteSection(S.active)); if (TownMap.supported()) el.append(townPanel()); return; }
    const k = S.active;
    if (!k) { el.append(h('p', { class: 'muted' }, 'Click a map to select it, or drag on the black area to add a new map.')); el.append(seamPanel(null)); addMapBox(el); if (TownMap.supported()) el.append(townPanel()); return; }
    const d = dims(k), r = rom(), h0 = hdrOf(k), used = (d.w + 15) * (d.h + 14);
    const sharers = allMaps().filter(k2 => k2 !== k && r.r16(hdrOf(k2) + 18) === r.r16(h0 + 18)).length;
    el.append(h('h3', {}, nameOf(k) + ' ' + k),
      h('div', { class: 'muted' }, d.w + '×' + d.h + ' ' + T('blocks · game buffer') + ' ' + used + ' / ' + LIMIT + (used > LIMIT * 0.9 ? ' ' + T('(near the limit)') : '')),
      sharers ? h('div', { class: 'warn' }, 'Layout shared with ' + sharers + ' other map(s): resizing gives this map its own copy') : '',
      h('div', { class: 'row wrap', style: { margin: '6px 0' } },
        h('button', { onclick: () => { const [g, n] = parse(k); MapsTab.api.open(g, n); } }, 'Open in map editor'),
        h('button', { onclick: () => { S.root = k; S.lastPos.clear(); S.floating.clear(); S.fitted = false; draw(); } }, 'Build the world from this map')),
      h('div', { class: 'muted' }, T('Connections:') + ' ' + (conns(h0).filter(c => c.dir >= 1 && c.dir <= 4).map(c => T(DIR_NAME[c.dir]) + ' → ' + nameOf(key(c.g, c.n)) + ' (' + c.off + ')').join(' · ') || 'none')));
    const tabs = [['blocks', '🖌 Blocks'], ['coll', '⛔ Collision'], ['objects', '👤 Objects'], ['header', '⚙ Header'], ['wild', '🌿 Wild']];
    el.append(h('div', { class: 'tabs small', style: { marginTop: '8px' } }, ...tabs.map(([t, l]) => h('button', { class: S.tab === t ? 'sel' : '', onclick: () => {
      S.tab = t; if (TAB_MODE[t]) S.mode = TAB_MODE[t]; S.addKind = null; render(S.root_el); } }, l))));
    const [g, n] = parse(k);
    if (['resize', 'connect'].includes(S.mode)) {
      const help = {
        resize: 'Drag an edge or corner of the selected map (yellow handles) to grow or shrink it, like a window. New area gets the map\'s border pattern; people, doors and signs move with the content. Shrinking stops at the nearest object (shown in red).',
        move: 'Drag a map along its neighbour to change where the road joins (connection offset). A map that is not connected can be dragged anywhere and connects when you drop it touching another map.',
        connect: 'Blue ✕ = a connection: click to remove it. To connect two maps that touch: select one, then click the other.' }[S.mode];
      el.append(h('p', { class: 'warn', style: { marginTop: '6px' } }, help));
    }
    if (S.tab === 'blocks') el.append(blocksTab(k));
    else if (S.tab === 'coll') {
      el.append(h('div', { class: 'fields', style: { marginTop: '6px' } },
        h('label', { class: 'field' }, 'Collision', makeSelect(['0 walkable', '1 blocked', '2', '3'], S.selColl, v => S.selColl = v)),
        h('label', { class: 'field' }, 'Elevation', makeSelect([...Array(16)].map((_, i) => 'level ' + i + (i === 0 ? ' (transition)' : i === 15 ? ' (bridge / multi)' : i === 1 ? ' (water / surf)' : i === 3 ? ' (normal ground)' : '')), S.selElev, v => S.selElev = v))),
        MapsTab.api.COLL_LEGEND(),
        h('p', { class: 'muted' }, 'The selected map shows its collision on the world. Left drag paints collision + elevation, right click picks them from the map. The status line shows the values under the mouse.'));
    } else if (S.tab === 'objects') {
      const pick = kind => { S.addKind = S.addKind === kind ? null : kind; side(); };
      el.append(h('div', { class: 'row wrap', style: { margin: '6px 0' } },
        ...Objects.TEMPLATES.map(([kd, l]) => h('button', { class: S.addKind === kd ? 'sel' : '', onclick: () => pick(kd) }, l)),
        S.selEv ? h('button', { onclick: async () => {
          const e2 = S.selEv; if (!(await ask(Tf('Delete this {what}?', { what: T(Objects.info(g, n, e2).type) }), { danger: true }))) return;
          op('delete ' + e2.kind, () => { MapsTab.api.deleteEvent(g, n, e2.kind, e2.i); S.touched.add(k); }, { t: 'delev', k, kind: e2.kind, i: e2.i });
          S.selEv = null; draw(); side(); } }, '🗑 Delete selected') : null),
        S.addKind ? h('p', { class: 'warn' }, 'Click on the selected map where the new ' + Objects.TEMPLATES.find(t => t[0] === S.addKind)[1].slice(2).toLowerCase() + ' goes.') : '',
        objectsList(k, g, n));
      if (S.selEv) {
        const e0 = S.selEv;
        el.append(Objects.panel(e0, { g, n,
          commit: (label, fn, log) => { const ok = op(label, () => { fn(); S.touched.add(k); }, log || { t: 'raw', label }); cache.clear(); return ok; },
          refresh: () => { S.selEv = Object.values(events(k)).flat().find(q => q.kind === e0.kind && q.i === e0.i) || null; draw(); side(); },
          jump: (dg, dn, w) => jumpTo(key(dg, dn), w) }));
      } else el.append(h('p', { class: 'muted' }, 'Click a person, sign or door on the selected map (or pick it in the list) to see who it is and edit it. Hover over any object for a quick description.'));
    } else if (S.tab === 'header') el.append(MapsTab.api.headerPanelFor(g, n));
    else if (S.tab === 'wild') el.append(h('h4', {}, 'Wild Pokémon'), Wild.panel(g, n, () => { if (S.highlight) highlight(S.highlight.sp); draw(); }));
    if (S.tab !== 'blocks') el.append(paletteSection(k));
    el.append(seamPanel(k));
    addMapBox(el);
    if (TownMap.supported()) el.append(townPanel());
  }
  // the block palette: click = one block, drag = a rectangle of blocks; plus the current brush
  function blocksTab(k) {
    const m = entry(k).m, g = game(), ids = [], wrap = h('div');
    for (let i = 0; i < m.prim.count; i++) ids.push(i);
    for (let i = 0; i < m.sec.count; i++) ids.push(g.primaryMetatiles + i);
    const cols = 8, rows = Math.ceil(ids.length / cols);
    const cv = h('canvas', { class: 'pixel', width: cols * 16, height: rows * 16, style: { width: cols * 32 + 'px', cursor: 'crosshair' } }), c = cv.getContext('2d');
    const paintPal = sel => {
      ids.forEach((id, i) => c.drawImage(MapsTab.api.metatileCanvas(m, id), (i % cols) * 16, Math.floor(i / cols) * 16));
      c.strokeStyle = '#ff2050'; c.lineWidth = 2;
      if (sel) c.strokeRect(sel.x0 * 16 + 1, sel.y0 * 16 + 1, (sel.x1 - sel.x0 + 1) * 16 - 2, (sel.y1 - sel.y0 + 1) * 16 - 2);
      else if (!S.brush) { const i = ids.indexOf(S.selBlock); if (i >= 0) c.strokeRect((i % cols) * 16 + 1, Math.floor(i / cols) * 16 + 1, 14, 14); }
    };
    paintPal(null);
    const cellOf = e => { const rr = cv.getBoundingClientRect(), s = cv.width / rr.width; return [Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - rr.left) * s / 16))), Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - rr.top) * s / 16)))]; };
    cv.onmousedown = e => {
      const [x0, y0] = cellOf(e); let sel = { x0, y0, x1: x0, y1: y0 };
      follow(ev => { const [x1, y1] = cellOf(ev); sel = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }; paintPal(sel); }, () => {
        if (sel.x0 === sel.x1 && sel.y0 === sel.y1) { const id = ids[sel.y0 * cols + sel.x0]; if (id != null) { S.selBlock = id; S.brush = null; } }
        else {
          const cells = []; for (let y = sel.y0; y <= sel.y1; y++) { const row = []; for (let x = sel.x0; x <= sel.x1; x++) row.push(ids[y * cols + x] ?? ids[ids.length - 1]); cells.push(row); }
          S.brush = makeBrush(cells, false, k);
        }
        S.mode = 'paint'; S.tab = 'blocks'; S.pending = null; render(S.root_el);
      });
    };
    const B = S.brush;
    if (B) {
      const prev = h('canvas', { class: 'pixel', width: B.w * 16, height: B.h * 16, style: { maxWidth: '100%', width: Math.min(260, B.w * 32) + 'px', border: '1px solid var(--line)' } });
      prev.getContext('2d').drawImage(B.cv, 0, 0);
      const otherTs = B.src !== k && B.sec !== m.sec.off;
      wrap.append(h('div', { style: { marginTop: '8px' } }, h('b', {}, 'Brush ' + B.w + '×' + B.h + (B.full ? ' (blocks + collision, from ' + nameOf(B.src) + ')' : ' (blocks)')), ' ',
        h('button', { onclick: () => { S.brush = null; render(S.root_el); } }, 'Single block')),
        prev, otherTs ? h('div', { class: 'warn' }, 'Copied from a map with a different tileset: city-specific blocks may look different here (shared blocks such as trees, grass and buildings stay the same).') : '');
    } else {
      const big = h('canvas', { class: 'pixel', width: 16, height: 16, style: { width: '32px' } }); big.getContext('2d').drawImage(MapsTab.api.metatileCanvas(m, S.selBlock), 0, 0);
      wrap.append(h('div', { class: 'row', style: { marginTop: '8px' } }, h('b', {}, 'Block ' + hex(S.selBlock, 3)), big));
    }
    wrap.append(h('p', { class: 'muted' }, 'Left drag paints on the selected map. Palette: click = one block, drag = several. On the world: right-drag over any map (a neighbour too) copies that area with its collision; right click picks one block. Space + drag or the middle button pans.'),
      h('div', { class: 'palscroll' }, cv));
    return wrap;
  }
  // the tileset blocks of the selected map, always at hand: picking one switches to painting
  function paletteSection(k) {
    const box = h('details', { class: 'hdr', open: true }, h('summary', {}, T('Tileset blocks') + ' · ' + nameOf(k)));
    const t = blocksTab(k); box.append(t);
    return box;
  }
  function addMapBox(el) {
    const inWorld = new Set((S.list || []).map(p => p.k));
    const opts = allMaps().filter(k => !inWorld.has(k) && isOutdoor(k));
    const sel = h('select', {}, h('option', { value: '' }, 'add a map that is not connected…'), ...opts.map(k => h('option', { value: k }, k + ' ' + nameOf(k))));
    sel.onchange = () => {
      const k = sel.value; if (!k) return;
      const cv = S.cv, [wx, wy] = S2W(cv.width / 2, cv.height / 2);
      S.floating.set(k, { x: Math.round(wx), y: Math.round(wy) }); S.active = k; S.mode = 'manage';
      toast(nameOf(k) + ' added in the middle of the view: drag it next to a map to connect it'); render(S.root_el);
    };
    el.append(h('details', { class: 'hdr' }, h('summary', {}, 'Add a map to the world'), sel));
  }

  // ---------- export for build.py ----------
  function exportEdits() {
    if (!S.log.length) { toast('No map changes yet in the world view'); return; }
    const out = exportData();
    download(JSON.stringify(out), 'world_edits.json', 'application/json');
    toast('Saved ' + out.ops.length + ' edits (' + out.patches.length + ' changed areas). Put world_edits.json in data/kachol_lavan/maps_edit/ and build.py applies it.');
  }

  // ---------- tab ----------
  function render(root) {
    if (S.romVer !== App.romVersion) { cache.clear(); waterCache.clear(); S.layoutTable = null; S.romVer = App.romVersion; }
    S.root_el = root; root.innerHTML = '';
    const cv = h('canvas', { class: 'wv-canvas', tabindex: 0 }); S.cv = cv;
    const mini = h('canvas', { class: 'wv-mini', width: 220, height: 160 }); S.mini = mini;
    const tb = h('div', { class: 'row wrap' },
      h('div', { class: 'tabs small' }, ...MODES.map(([m, l]) => h('button', { class: S.mode === m ? 'sel' : '', onclick: () => { S.mode = m; if (MODE_TAB[m]) S.tab = MODE_TAB[m]; S.addKind = null; render(root); } }, l))),
      S.trail.length ? h('button', { class: 'sel', title: T('Back through the door you came in by'), onclick: () => goBack(false) }, '↩ ' + Tf('Back to {a}', { a: trailName(S.trail[S.trail.length - 1]) })) : null,
      S.trail.length > 1 ? h('button', { onclick: () => goBack(true) }, '🌍 ' + Tf('Back to the world map ({a})', { a: trailName(S.trail[0]) })) : null,
      h('button', { onclick: () => undo() }, '↶ Undo (Ctrl+Z)'),
      h('button', { onclick: () => { S.fitted = false; draw(); } }, 'Fit all'),
      h('label', {}, h('input', { type: 'checkbox', checked: S.showNames, onchange: e => { S.showNames = e.target.checked; draw(); } }), ' names'),
      h('label', {}, h('input', { type: 'checkbox', checked: S.showEvents, onchange: e => { S.showEvents = e.target.checked; draw(); } }), ' people & doors'),
      h('label', { title: T('A frame the size of the game screen (15×10 squares) around the mouse: what the player sees standing there') }, h('input', { type: 'checkbox', checked: !!S.playerView, onchange: e => { S.playerView = e.target.checked; draw(); } }), ' 👁 ' + T('Player view')),
      h('button', { onclick: () => exportEdits(), title: 'Saves your world edits to world_edits.json (also used by build steps)' }, '💾 ' + T('Export map changes') + ' (' + S.log.length + ')'),
      h('label', { class: 'btn', title: 'Load world_edits.json: applied directly if this is the same ROM, otherwise the edits are replayed' }, '📂 Import edits', h('input', { type: 'file', accept: '.json', hidden: true, onchange: e => e.target.files[0] && importEdits(e.target.files[0]) })),
      TownMap.supported() ? h('button', { onclick: () => { op('redraw town map', () => {}, { t: 'townmap' }, true); side(); } }, '🗺 Redraw town map') : null,
      h('button', { id: 'wv-play', disabled: !S.active, onclick: () => { S.pickPlay = !S.pickPlay; playBtn(); } }, '▶ ' + T('Play from here')),
      h('button', { title: T('The Pokémon the player gets in the test'), onclick: () => Emu.teamDialog() }, '🎒'),
      S.highlight ? h('span', { class: 'hl-chip' }, '🌿 ' + (App.getLists().species[S.highlight.sp] || '') + ' (' + S.highlight.areas.size + ' areas) ',
        h('button', { class: 'mu-x', onclick: () => { S.highlight = null; render(root); } }, '✕')) : '',
      '');
    root.append(h('div', { class: 'cols wv-cols' },
      h('div', { class: 'panel wv-main' }, tb, h('div', { id: 'wv-warn', class: 'warn', style: { minHeight: '18px', fontSize: '12px' } }),
        h('div', { class: 'wv-box' }, cv, mini, h('div', { id: 'wv-pos', class: 'wv-pos' })),     // the square under the mouse: over the map, so nothing moves
        h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Wheel = zoom · Space + drag or middle button = pan · drag a name tag = move the map · drag on the black area = new map · right-drag on a map = copy blocks · right click = the map menu · Esc = deselect · Ctrl+Z = undo')),
      h('div', { class: 'panel wv-side', id: 'wv-side' })));
    bind(cv);
    requestAnimationFrame(() => { draw(); side(); });
    if (!S.keys) {
      S.keys = true;
      window.addEventListener('keydown', e => { if (S.cv && S.cv.isConnected && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); } });
      window.addEventListener('resize', () => draw());
      window.addEventListener('keydown', e => { if (e.code === 'Space' && S.cv && S.cv.isConnected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { S.space = true; e.preventDefault(); } });
      window.addEventListener('keyup', e => { if (e.code === 'Space') S.space = false; });
      window.addEventListener('keydown', e => { if (e.key === 'Escape' && S.cv && S.cv.isConnected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (S.menu) closeMenu(); else if (S.pickPlay) { S.pickPlay = false; playBtn(); } else if (S.active) deselect(); } });
    }
  }
  return { render, exportEdits, ops: () => S.log.slice(), replayOps: ops => { const e = replay(ops); cache.clear(); return e; }, highlight: sp => { highlight(sp); S.fitted = false; }, reset: keep => { cache.clear(); S.floating.clear(); S.lastPos.clear(); S.touched.clear(); S.undo = []; S.log = []; S.pending = null; S.layoutTable = null; S.brush = null; S.selEv = null;
      if (!keep) { S.active = null; S.fitted = false; } },
    _test: { S, exportData, createMap, updateTownMap, freeSections, replay, crc32, placed, resizeMap, moveMap, connect, disconnect, conns, op, undo, layoutTable, dims, checkSeams, applySeamFix, seamDialog, seamList, seamSide } };
})();
