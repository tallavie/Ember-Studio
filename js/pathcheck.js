// Game check → "Can the game be finished?": walks the whole world from the player's room the way a player can -
// walls, ledges, one-way tiles, heights, doors, map edges, water (Surf), waterfalls, Cut trees, Rock Smash rocks and
// Strength boulders - and unlocks each HM once its place is reached and the badge that allows it is won. It reports
// the order things open up, whether the league is reached, and the important places that never are.
// Not checked: people standing in the way and story roadblocks (guards, a sleeping Snorlax…).
'use strict';

const PathCheck = (() => {
  const R = () => App.rom, G = () => App.game;
  const HM = { 339: 'cut', 340: 'fly', 341: 'surf', 342: 'strength', 343: 'flash', 344: 'smash', 345: 'waterfall', 346: 'dive' };
  const BADGE_FOR = { cut: 2, flash: 1, smash: 6, strength: 4, surf: 5, fly: 3, waterfall: 7, dive: 8 };      // FireRed: the badge number each HM needs
  const WATER = new Set([0x10, 0x11, 0x12, 0x15, 0x1A]), WATERFALL = 0x13;
  const OBST = { 95: 'cut', 96: 'smash', 97: 'strength' };
  const DIRS = [[0, 1, 0x3B], [0, -1, 0x3A], [1, 0, 0x38], [-1, 0, 0x39]];

  // ---------- the world ----------
  let maps = null;
  function mapOf(g, n) {
    const k = g + '.' + n; if (maps.has(k)) return maps.get(k);
    const hp = (G().mapGroups[g] || [])[n]; if (hp == null) { maps.set(k, null); return null; }
    let m; try { m = MapsTab.api.loadMap(g, n); } catch (e) { maps.set(k, null); return null; }
    const r = R(), gm = G(), N = m.w * m.h, beh = new Uint16Array(N), coll = new Uint8Array(N), elev = new Uint8Array(N);
    const bcache = new Map();
    const behavior = id => {
      if (bcache.has(id)) return bcache.get(id);
      const sec = id >= gm.primaryMetatiles, ts = sec ? m.sec : m.prim, local = sec ? id - gm.primaryMetatiles : id;
      const attr = r.ptr(ts.off + (gm.isEmerald ? 16 : 20)); const v = attr < 0 ? 0 : gm.isEmerald ? r.r16(attr + local * 2) & 0xFF : r.r32(attr + local * 4) & 0x1FF;
      bcache.set(id, v); return v;
    };
    for (let i = 0; i < N; i++) { const v = r.r16(m.blocks + i * 2); coll[i] = (v >> 10) & 3; elev[i] = v >> 12; beh[i] = behavior(v & 0x3FF); }
    const openSet = new Set();
    for (const t of opened(g, n, hp)) { if (t.x < m.w && t.y < m.h) { const i = t.y * m.w + t.x; coll[i] = 0; beh[i] = behavior(t.id); openSet.add(i); } }
    const obst = new Map();
    for (const e of m.events.obj) { const gfx = r.u8[e.off + 1]; if (OBST[gfx]) { const [x, y] = MapsTab.api.evXY(e); obst.set(y * m.w + x, OBST[gfx]); } }
    const warps = new Map();
    for (const e of m.events.warp) { const [x, y] = MapsTab.api.evXY(e), o = e.off; warps.set(y * m.w + x, { g: r.u8[o + 7], n: r.u8[o + 6], id: r.u8[o + 5] }); }
    const conns = [], cp = r.ptr(hp + 12);
    if (cp >= 0) { const cn = r.r32(cp), l = r.ptr(cp + 4); for (let i = 0; i < cn && i < 32 && l >= 0; i++) { const c = l + i * 12; conns.push({ dir: r.r32(c), off: r.r32(c + 4) | 0, g: r.u8[c + 8], n: r.u8[c + 9] }); } }
    const info = { k, g, n, w: m.w, h: m.h, beh, coll, elev, obst, warps, conns, openSet, warpList: m.events.warp.map(e => MapsTab.api.evXY(e)), name: m.name };
    maps.set(k, info); return info;
  }

  // setmetatile x, y, block, passable (0xA2) in the scripts of a map: puzzles, locked doors and gates that open
  function opened(g, n, hp) {
    const r = R(), out = [], starts = [], ev = r.ptr(hp + 4), LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN;
    if (ev >= 0) {
      const no = r.u8[ev], po = r.ptr(ev + 4), nc = r.u8[ev + 2], pc = r.ptr(ev + 12), nb = r.u8[ev + 3], pb = r.ptr(ev + 16);
      for (let i = 0; i < no && po >= 0; i++) starts.push(r.ptr(po + i * 24 + 16));
      for (let i = 0; i < nc && pc >= 0; i++) starts.push(r.ptr(pc + i * 16 + 12));
      for (let i = 0; i < nb && pb >= 0; i++) if (r.u8[pb + i * 12 + 5] < 5) starts.push(r.ptr(pb + i * 12 + 8));
    }
    const ms = r.ptr(hp + 8);
    if (ms >= 0) for (let i = 0; i < 10 && r.u8[ms + i * 5]; i++) {
      const t = r.u8[ms + i * 5], p = r.ptr(ms + i * 5 + 1); if (p < 0) continue;
      if (t === 2 || t === 4) { for (let k = 0; k < 16 && r.r16(p + k * 8); k++) starts.push(r.ptr(p + k * 8 + 4)); } else starts.push(p);
    }
    const seen = new Set();
    const walk = (p0, depth) => {
      if (p0 < 0 || seen.has(p0) || depth > 6) return; seen.add(p0);
      for (let p = p0, end = p0 + 1500; p < end && p < r.size - 12;) {
        const op = r.u8[p];
        if (op === 0xA2) { const x = r.r16(p + 1), y = r.r16(p + 3), id = r.r16(p + 5), imp = r.r16(p + 7); if (x < 0x4000 && y < 0x4000 && !imp) out.push({ x, y, id: id & 0x3FF }); }
        if (op === 0x02 || op === 0x03) return;
        if (op === 0x04 || op === 0x05) { walk(r.ptr(p + 1), depth + 1); if (op === 0x05) return; }
        if (op === 0x06 || op === 0x07) walk(r.ptr(p + 2), depth + 1);
        const len = op === 0x5C ? (TL[r.u8[p + 1]] || 0) : LEN[op]; if (!len) return; p += len;
      }
    };
    starts.forEach(p => walk(p, 0));
    return out;
  }

  // ---------- walking ----------
  function bfs(start, can, extra = []) {
    const seen = new Map(), q = [];
    const visit = (mi, x, y) => { let s = seen.get(mi.k); if (!s) { s = new Uint8Array(mi.w * mi.h); seen.set(mi.k, s); } const i = y * mi.w + x; if (s[i]) return; s[i] = 1; q.push([mi, x, y]); };
    const free = (mi, i, from) => {
      if (mi.coll[i]) return false;
      const ob = mi.obst.get(i); if (ob && !can[ob]) return false;
      const b = mi.beh[i];
      if (WATER.has(b) && !can.surf) return false;
      if (b === WATERFALL && !can.waterfall) return false;
      if (from >= 0) { const e1 = mi.elev[from], e2 = mi.elev[i], wet = WATER.has(b) || WATER.has(mi.beh[from]); if (e1 && e2 && e1 !== 15 && e2 !== 15 && e1 !== e2 && !wet) return false; }
      return true;
    };
    visit(start.m, start.x, start.y);
    const jumps = extra.slice();                                          // warps done by scripts (ferries, teleports): from map A to map B
    for (let round = 0; round < 50; round++) {
    while (q.length) {
      const [mi, x, y] = q.pop(), here = y * mi.w + x;
      const w = mi.warps.get(here);
      if (w && (mi.beh[here] || mi.coll[here] || mi.openSet.has(here)) && w.g !== 127) { const t = mapOf(w.g, w.n); if (t && t.warpList[w.id]) { const [tx, ty] = t.warpList[w.id]; if (tx >= 0 && ty >= 0 && tx < t.w && ty < t.h) visit(t, tx, ty); } }
      if (mi.coll[here] && !w) continue;
      // arrived through a door with nowhere to step: the game walks the player in (E4 rooms, scripted entrances)
      if (w && DIRS.every(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= mi.w || ny >= mi.h || mi.coll[ny * mi.w + nx]; }))
        for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx > 0 && ny > 0 && nx < mi.w - 1 && ny < mi.h - 1) { const nx2 = nx + dx, ny2 = ny + dy; if (nx2 >= 0 && ny2 >= 0 && nx2 < mi.w && ny2 < mi.h && !mi.coll[ny2 * mi.w + nx2]) visit(mi, nx2, ny2); } }
      for (const [dx, dy, jump] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= mi.w || ny >= mi.h) {                // over the edge: the connected map
          const dir = ny >= mi.h ? 1 : ny < 0 ? 2 : nx < 0 ? 3 : 4;
          for (const c of mi.conns) {
            if (c.dir !== dir) continue; const t = mapOf(c.g, c.n); if (!t) continue;
            const tx = dir <= 2 ? nx - c.off : dir === 4 ? 0 : t.w - 1, ty = dir <= 2 ? (dir === 1 ? 0 : t.h - 1) : ny - c.off;
            if (tx >= 0 && ty >= 0 && tx < t.w && ty < t.h && free(t, ty * t.w + tx, -1)) visit(t, tx, ty);
          }
          continue;
        }
        const i = ny * mi.w + nx, b = mi.beh[i];
        if ((b === 0x32 && dy === 1) || (b === 0x33 && dy === -1) || (b === 0x30 && dx === -1) || (b === 0x31 && dx === 1)) continue;
        if (b >= 0x38 && b <= 0x3B) { if (b === jump) { const jx = nx + dx, jy = ny + dy; if (jx >= 0 && jy >= 0 && jx < mi.w && jy < mi.h && free(mi, jy * mi.w + jx, -1)) visit(mi, jx, jy); } continue; }
        if (mi.warps.has(i) || free(mi, i, here)) visit(mi, nx, ny);
      }
    }
    let more = false;
    for (let j = jumps.length - 1; j >= 0; j--) {
      const jw = jumps[j]; if (!seen.get(jw.from)) continue;
      jumps.splice(j, 1); const t = mapOf(jw.g, jw.n); if (!t) continue;
      let cx = -1, cy = -1;
      if (t.warpList.length) [cx, cy] = t.warpList[0]; else for (let i = 0; i < t.w * t.h; i++) if (!t.coll[i]) { cx = i % t.w; cy = (i / t.w) | 0; break; }
      if (cx >= 0) { visit(t, cx, cy); more = true; }
    }
    if (!more) break;
    }
    return seen;
  }
  const reached = (seen, g, n) => !!seen.get(g + '.' + n);

  // ---------- run ----------
  function run() {
    maps = new Map(); champClasses = null;
    const m = StoryMap.get(), start = mapOf(4, 1) || mapOf(...firstMap());
    const sx = start.warpList[0] ? start.warpList[0][0] : Math.floor(start.w / 2), sy = start.warpList[0] ? start.warpList[0][1] : Math.floor(start.h / 2);
    // where the HMs are got and the badges won, and where the game ends
    const hms = [], badges = [], ends = [];
    for (const b of m.beats) for (const e of b.events) {
      for (const gv of e.gives) if (HM[gv.item]) hms.push({ hm: HM[gv.item], item: gv.item, g: e.g, n: e.n, xy: e.xy, beat: b });
      for (const x of e.eff) if (x.k === 'flag' && x.set) { if (x.f >= 0x820 && x.f < 0x828) badges.push({ n: x.f - 0x820 + 1, g: e.g, n2: e.n, xy: e.xy, beat: b, trainer: (e.battles.find(t => t.k === 'trainer') || {}).id }); if (x.f === 0x82C) ends.push({ g: e.g, n: e.n, xy: e.xy, beat: b }); }
      for (const t of e.battles) if (t.k === 'trainer' && champion(t.id)) ends.push({ g: e.g, n: e.n, xy: e.xy, beat: b, champ: true });
    }
    const jumps = [];
    for (const b of m.beats) for (const e of b.events) for (const a of (e.acts || [])) if (a.k === 'warp' && a.g != null && a.g !== 127 && !(a.g === e.g && a.n === e.n)) jumps.push({ from: e.g + '.' + e.n, g: a.g, n: a.n });
    const have = new Set(), won = new Set(), steps = [];
    let seen = null;
    for (let round = 0; round < 30; round++) {
      const can = {}; for (const hm of have) if (won.has(BADGE_FOR[hm] || 0) || !BADGE_FOR[hm]) can[hm] = true;
      seen = bfs({ m: start, x: sx, y: sy }, can, jumps);
      let changed = false;
      for (const b of badges) if (!won.has(b.n) && reached(seen, b.g, b.n2, b.xy)) { won.add(b.n); changed = true; steps.push({ kind: 'badge', n: b.n, g: b.g, m: b.n2, trainer: b.trainer, beat: b.beat }); }
      for (const x of hms) if (!have.has(x.hm) && reached(seen, x.g, x.n, x.xy)) { have.add(x.hm); changed = true; steps.push({ kind: 'hm', hm: x.hm, item: x.item, g: x.g, m: x.n, needs: BADGE_FOR[x.hm], beat: x.beat }); }
      if (!changed) break;
    }
    const can = {}; for (const hm of have) if (won.has(BADGE_FOR[hm] || 0) || !BADGE_FOR[hm]) can[hm] = true;
    const end = ends.find(e => reached(seen, e.g, e.n, e.xy));
    // important places never reached: maps with moments of the main story
    // what comes after the end of the game (post-game islands…) is not part of finishing it
    const endCh = ends.length ? Math.max(...ends.map(e => e.beat.chapter)) : Infinity;
    const lost = new Map();
    for (const b of m.beats) if (b.main && b.chapter <= endCh && !seen.get(b.g + '.' + b.n)) { const k = b.g + '.' + b.n; if (!lost.has(k)) lost.set(k, b); }
    const lostBadges = [1, 2, 3, 4, 5, 6, 7, 8].filter(n => badges.some(b => b.n === n) && !won.has(n));
    const lostHms = [...new Set(hms.filter(x => x.beat.chapter <= endCh).map(x => x.hm))].filter(x => !have.has(x));
    const laterHms = [...new Set(hms.filter(x => x.beat.chapter > endCh).map(x => x.hm))].filter(x => !have.has(x) && !lostHms.includes(x));
    return { _seen: seen, _maps: maps, steps, end: !!end, endKnown: ends.length > 0, lost: [...lost.entries()], lostBadges, lostHms, laterHms, can, mapsReached: seen.size };
  }
  let champClasses = null;
  function champion(id) {
    if (!champClasses) { champClasses = new Set(); Objects.classNames().forEach((c, i) => { if (/champion|אלוף/i.test(c || '')) champClasses.add(i); }); }
    const t = Objects.trainer(id); return !!t && champClasses.has(t.cls);
  }
  function firstMap() { const gs = G().mapGroups; for (let g = 0; g < gs.length; g++) if (gs[g].length) return [g, 0]; return [0, 0]; }

  // ---------- report ----------
  const HM_NAME = { cut: 'Cut', fly: 'Fly', surf: 'Surf', strength: 'Strength', flash: 'Flash', smash: 'Rock Smash', waterfall: 'Waterfall', dive: 'Dive' };
  const HM_ICON = { cut: '✂', fly: '🕊', surf: '🌊', strength: '💪', flash: '🔦', smash: '🪨', waterfall: '🌀', dive: '🤿' };
  const mapName = (g, n) => { const hp = (G().mapGroups[g] || [])[n]; return hp == null ? g + '.' + n : Game.mapName(R(), G(), R().u8[hp + 20]) + ' ' + g + '.' + n; };
  function panel() {
    const box = h('div', { class: 'panel pc' }), body = h('div');
    const go = () => {
      body.innerHTML = ''; body.append(h('p', { class: 'muted' }, T('Walking through the whole game…')));
      setTimeout(() => { let res; try { res = run(); } catch (e) { console.error(e); body.innerHTML = ''; body.append(h('p', { class: 'err' }, e.message)); return; } show(res); }, 30);
    };
    const show = res => {
      body.innerHTML = '';
      const ok = res.end && !res.lostBadges.length;
      body.append(h('div', { class: 'pc-head ' + (ok ? 'pc-ok' : 'pc-bad') }, h('span', { class: 'pc-big' }, ok ? '✓' : '✗'),
        h('div', {}, h('b', {}, ok ? T('The game can be finished: the league can be reached.') : !res.endKnown ? T('The end of the game was not found in the scripts.') : T('The league cannot be reached with what the game gives.')),
          h('div', { class: 'muted' }, Tf('{n} maps can be reached.', { n: res.mapsReached })))));
      body.append(h('h4', {}, T('In this order')));
      const ol = h('ol', { class: 'pc-steps' });
      for (const s of res.steps) {
        if (s.kind === 'badge') { const t = s.trainer && Objects.trainer(s.trainer); ol.append(h('li', {}, '🏅 ' + Tf('Badge {n}', { n: s.n }) + (t ? ' · ' + (Objects.classNames()[t.cls] || '') + ' ' + t.name : '') + ' · ', h('a', { href: '#', onclick: ev => { ev.preventDefault(); MapsTab.api.open(s.g, s.m); App.show('maps'); } }, mapName(s.g, s.m)))); }
        else ol.append(h('li', {}, HM_ICON[s.hm] + ' ' + T(HM_NAME[s.hm]) + ' · ', h('a', { href: '#', onclick: ev => { ev.preventDefault(); MapsTab.api.open(s.g, s.m); App.show('maps'); } }, mapName(s.g, s.m)),
          s.needs ? h('span', { class: 'muted' }, ' · ' + Tf('works after badge {n}', { n: s.needs })) : ''));
      }
      body.append(ol);
      if (res.lostBadges.length) body.append(h('p', { class: 'err' }, '✗ ' + Tf('Badges that can never be won: {list}', { list: res.lostBadges.join(', ') })));
      if (res.lostHms.length) body.append(h('p', { class: 'warn' }, '⚠ ' + Tf('HMs that can never be got: {list}', { list: res.lostHms.map(x => T(HM_NAME[x])).join(', ') })));
      if (res.laterHms.length) body.append(h('p', { class: 'muted' }, 'ℹ ' + Tf('Only after the game: {list}', { list: res.laterHms.map(x => T(HM_NAME[x])).join(', ') })));
      if (res.lost.length) body.append(h('h4', {}, '⚠ ' + T('Places of the main story that cannot be reached')), h('div', { class: 'pc-lost' }, ...res.lost.map(([k, b]) => {
        const [g, n] = k.split('.').map(Number);
        return h('div', { class: 'doc-item doc-warn' }, h('span', { dir: 'auto', style: { flex: 1 } }, mapName(g, n) + ' — ' + b.title), h('button', { onclick: () => { MapsTab.api.open(g, n); App.show('maps'); } }, T('Show')));
      })));
      body.append(h('p', { class: 'muted', style: { fontSize: '12px' } }, T('Checked: walls, ledges, one-way tiles, heights, doors, map edges, water, waterfalls, Cut trees, Rock Smash rocks and Strength boulders, and which badge each HM needs. Not checked: people standing in the way and story roadblocks (guards, a sleeping Snorlax…).')));
    };
    box.append(h('div', { class: 'row' }, h('h3', {}, '🧭 ' + T('Can the game be finished?')), h('button', { class: 'primary', onclick: go }, T('Check the path'))),
      h('p', { class: 'muted' }, T('Walks the whole world from the player\'s room like a player: it opens each HM when its place is reached and the right badge is won, and checks that the league can be reached.')), body);
    return box;
  }
  return { run, panel };
})();
