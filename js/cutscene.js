// Scene editor: a story event built like an animation. One row per character on a timeline (the player, people on
// the map, new characters, Pokémon), clips on the rows for walking, jumping, turning, emotes, text and waiting; the
// map above shows the scene at the time under the playhead. Time is counted in steps (one step = 16 frames, the time
// a person takes to walk one square), so what the editor shows is what the game does.
'use strict';

const Cutscene = (() => {
  const R = () => App.rom, G = () => App.game;
  const STEP_MS = 16 * 1000 / 60;
  // kind: [icon, label, colour]
  const KINDS = {
    walk: ['🚶', 'Walk', '#d97706'], jump: ['⤴', 'Jump', '#ea580c'], face: ['↻', 'Turn', '#ca8a04'], wait: ['⏱', 'Wait', '#64748b'],
    emote: ['❗', 'Emote', '#0284c7'], say: ['💬', 'Say', '#2563eb'], hide: ['👻', 'Disappear', '#7c3aed'], show: ['✨', 'Appear', '#7c3aed'],
  };
  const STRETCH = new Set(['wait', 'emote', 'say']);
  const SPEED = { walk: 1, run: 0.5, slow: 2 };                 // steps of time per square
  const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }, ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
  const EMOTES = { '!': '❗', '?': '❓', '♥': '♥' };
  const uid = () => 'c' + Math.random().toString(36).slice(2, 8);
  const clone = o => JSON.parse(JSON.stringify(o));
  const dur = c => c.k === 'walk' ? Math.max(1, Math.ceil((c.path || []).length * (SPEED[c.speed] || 1)))
    : c.k === 'jump' ? 2 : c.k === 'face' || c.k === 'hide' || c.k === 'show' ? 1 : Math.max(1, c.len || (c.k === 'say' ? 3 : 2));
  const endOf = sc => Math.max(0, ...sc.clips.map(c => c.t + dur(c)));

  // ---------- data: st.scene = { actors: [...], clips: [...] } ----------
  function scene(st) {
    const sc = st.scene = st.scene || { actors: [], clips: [] };
    sc.actors = sc.actors || []; sc.clips = sc.clips || [];
    if (!sc.actors.some(a => a.kind === 'player')) sc.actors.unshift({ id: 'player', kind: 'player', name: T('The player'), gfx: 0, x: null, y: null, dir: 'up' });
    return sc;
  }
  function objOf(g, n, localId) {
    if (g == null) return null;
    const ev = MapsTab.api.readEvents(R().ptr(G().mapGroups[g][n] + 4));
    return ev.obj.find(e => R().u8[e.off] === localId) || null;
  }
  const FACE_OF = { 7: 'up', 9: 'left', 10: 'right', 15: 'up', 16: 'up', 21: 'up' };
  // where a character stands when the scene starts
  function startOf(a, st, m) {
    if (a.kind === 'npc') {
      const e = objOf(st.g, st.n, a.localId);
      if (e) { const [x, y] = MapsTab.api.evXY(e); return { x, y, dir: a.dir || FACE_OF[R().u8[e.off + 9]] || 'down', gfx: R().u8[e.off + 1] }; }
    }
    if (a.x != null) return { x: a.x, y: a.y, dir: a.dir || 'down', gfx: a.gfx };
    if (a.kind === 'player' && st.trig === 'step' && st.x != null) return { x: st.x, y: st.y, dir: a.dir || 'up', gfx: a.gfx };
    if (a.kind === 'player' && st.trig === 'talk' && st.localId != null) { const e = objOf(st.g, st.n, st.localId); if (e) { const [x, y] = MapsTab.api.evXY(e); return { x, y: y + 1, dir: 'up', gfx: a.gfx }; } }
    return { x: Math.floor(m.w / 2), y: Math.floor(m.h / 2), dir: a.dir || 'down', gfx: a.gfx };
  }
  // everyone at time t (in steps): position (fractional while walking), facing, visible, emote; and the text on screen
  function stateAt(sc, st, m, t) {
    const actors = new Map(); let say = null;
    for (const a of sc.actors) {
      const p = startOf(a, st, m), s = { x: p.x, y: p.y, dir: p.dir, gfx: p.gfx, vis: true, emote: null, hop: 0 };
      const mine = sc.clips.filter(c => c.a === a.id).sort((x, y) => x.t - y.t);
      const firstVis = mine.find(c => c.k === 'show' || c.k === 'hide');
      if (firstVis && firstVis.k === 'show') s.vis = false;                   // someone who appears later is not there at first
      for (const c of mine) {
        if (c.t > t) break;
        const el = t - c.t;
        if (c.k === 'walk') {
          const sd = SPEED[c.speed] || 1;
          for (let i = 0; i < (c.path || []).length; i++) {
            const f = Math.min(1, Math.max(0, (el - i * sd) / sd)); if (f <= 0) break;
            const [dx, dy] = D[c.path[i]]; s.dir = c.path[i]; s.x += dx * f; s.y += dy * f;
            if (f < 1) break;
          }
        } else if (c.k === 'jump') { const [dx, dy] = D[c.dir || 'down'], f = Math.min(1, el / 2); s.dir = c.dir || 'down'; s.x += dx * 2 * f; s.y += dy * 2 * f; s.hop = f < 1 ? Math.sin(f * Math.PI) : 0; }
        else if (c.k === 'face') s.dir = c.dir || 'down';
        else if (c.k === 'emote') { if (el < dur(c)) s.emote = c.kind || '!'; }
        else if (c.k === 'hide') s.vis = false;
        else if (c.k === 'show') s.vis = true;
        else if (c.k === 'say') { if (el < dur(c)) say = { a, text: c.text || '' }; }
      }
      actors.set(a.id, s);
    }
    return { actors, say };
  }
  // the squares a person can walk on: no collision, not water, not a ledge (a ledge is only jumped down)
  const WATER = () => new Set(G().isEmerald ? [0x10, 0x11, 0x12, 0x14, 0x15, 0x50, 0x51, 0x52, 0x53] : [0x10, 0x11, 0x12, 0x15, 0x1A]), LEDGE = new Set([0x38, 0x39, 0x3A, 0x3B]);
  function walkGrid(m) {
    const r = R(), gm = G(), water = WATER(), bc = new Map(), ok = new Uint8Array(m.w * m.h);
    const beh = id => {
      if (bc.has(id)) return bc.get(id);
      const sec = id >= gm.primaryMetatiles, ts = sec ? m.sec : m.prim, local = sec ? id - gm.primaryMetatiles : id, attr = r.ptr(ts.off + (gm.isEmerald ? 16 : 20));
      const v = attr < 0 ? 0 : gm.isEmerald ? r.r16(attr + local * 2) & 0xFF : r.r32(attr + local * 4) & 0x1FF; bc.set(id, v); return v;
    };
    for (let i = 0; i < m.w * m.h; i++) { const v = r.r16(m.blocks + i * 2), b = beh(v & 0x3FF); ok[i] = !((v >> 10) & 3) && !water.has(b) && !LEDGE.has(b) ? 1 : 0; }
    return ok;
  }
  // the shortest way from a to b on free squares (few turns, so it looks like someone walking); [] when there is none
  function findPath(m, free, a, b) {
    if (a.x === b.x && a.y === b.y) return [];
    const W = m.w, H = m.h, N = W * H * 4, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), dirs = ['up', 'down', 'left', 'right'];
    const open = [];                                                // a small binary heap of [cost, state]
    const push = (c, st) => { open.push([c, st]); let i = open.length - 1; while (i) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r2 = l + 1; let k = i; if (l < open.length && open[l][0] < open[k][0]) k = l; if (r2 < open.length && open[r2][0] < open[k][0]) k = r2; if (k === i) break; [open[k], open[i]] = [open[i], open[k]]; i = k; } } return top; };
    for (let d = 0; d < 4; d++) { const st = (a.y * W + a.x) * 4 + d; cost[st] = 0; push(0, st); }
    while (open.length) {
      const [c, st] = pop(); if (c > cost[st]) continue;
      const cell = st >> 2, d0 = st & 3, x = cell % W, y = (cell - x) / W;
      if (x === b.x && y === b.y) {
        const out = []; let k = st; while (prev[k] >= 0) { out.push(dirs[k & 3]); k = prev[k]; } return out.reverse();
      }
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = D[dirs[d]], nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !free(nx, ny)) continue;
        const ns = (ny * W + nx) * 4 + d, nc = c + 1 + (d !== d0 && prev[st] >= 0 ? 0.3 : 0);
        if (nc < cost[ns]) { cost[ns] = nc; prev[ns] = st; push(nc, ns); }
      }
    }
    return null;
  }
  // what is wrong with clips: two of the same character at the same time, a walk through a wall
  function clipProblems(sc, st, m, grid) {
    const bad = new Map();
    for (const a of sc.actors) {
      const mine = sc.clips.filter(c => c.a === a.id).sort((x, y) => x.t - y.t);
      for (let i = 1; i < mine.length; i++) if (mine[i].t < mine[i - 1].t + dur(mine[i - 1])) { bad.set(mine[i].id, T('two actions of the same character at the same time')); bad.set(mine[i - 1].id, T('two actions of the same character at the same time')); }
      if (a.fly) continue;
      for (const c of mine) {
        if (c.k !== 'walk' || bad.has(c.id)) continue;
        const s0 = stateAt(sc, st, m, c.t - 0.001).actors.get(a.id); let x = Math.round(s0.x), y = Math.round(s0.y);
        for (const d of c.path || []) { x += D[d][0]; y += D[d][1]; if (x < 0 || y < 0 || x >= m.w || y >= m.h || !grid[y * m.w + x]) { bad.set(c.id, Tf('walks into a wall or water at ({x}, {y})', { x, y })); break; } }
      }
    }
    return bad;
  }

  // ---------- for the story compiler (until scenes compile to parallel movement): the clips in time order as blocks ----------
  function problems(st) {
    const sc = scene(st), out = [];
    if (sc.actors.some(a => a.kind === 'new' || a.kind === 'mon') && sc.clips.some(c => sc.actors.find(a => a.id === c.a && (a.kind === 'new' || a.kind === 'mon'))))
      out.push(T('new characters and Pokémon play in the editor; in the game they come in the next update (for now the player and people on the map)'));
    if (st.g != null) { const m = MapsTab.api.loadMap(st.g, st.n), bad = clipProblems(sc, st, m, walkGrid(m)); for (const [id, why] of bad) { const c = sc.clips.find(x => x.id === id), a = sc.actors.find(x => x.id === c.a); out.push((a.name || '') + ' · ' + Tf('Step {n}', { n: c.t }) + ': ' + why); } }
    return [...new Set(out)];
  }
  function toBlocks(st) {
    const sc = scene(st), out = [], who = id => { const a = sc.actors.find(x => x.id === id); return !a ? null : a.kind === 'player' ? 'player' : a.kind === 'npc' ? String(a.localId) : null; };
    let cur = 0;
    for (const c of sc.clips.slice().sort((x, y) => x.t - y.t || sc.actors.findIndex(a => a.id === x.a) - sc.actors.findIndex(a => a.id === y.a))) {
      const w = who(c.a); if (w == null && c.k !== 'say' && c.k !== 'wait') continue;
      if (c.t > cur) out.push({ op: 'wait', seconds: (c.t - cur) * 16 / 60 });
      if (c.k === 'walk') out.push({ op: 'move', who: w, steps: c.path || [], speed: c.speed === 'run' ? 'fast' : c.speed === 'slow' ? 'slow' : 'normal' });
      else if (c.k === 'jump') out.push({ op: 'jump', who: w, dir: c.dir || 'down' });
      else if (c.k === 'face') out.push({ op: 'face', who: w, dir: c.dir || 'down' });
      else if (c.k === 'emote') out.push({ op: 'emote', who: w, kind: c.kind || '!' });
      else if (c.k === 'say') out.push({ op: 'say', text: c.text || ' ' });
      else if (c.k === 'wait') out.push({ op: 'wait', seconds: dur(c) * 16 / 60 });
      else if (c.k === 'hide' || c.k === 'show') out.push({ op: c.k, who: w });
      cur = Math.max(cur, c.t + dur(c));
    }
    return out;
  }
  const summary = st => { const sc = scene(st), n = endOf(sc); return Tf('{a} characters · {c} actions · {s} seconds', { a: sc.actors.length, c: sc.clips.length, s: (n * STEP_MS / 1000).toFixed(1) }); };

  // ---------- the editor ----------
  let clipboard = null;
  function open(st, opts = {}) {
    if (st.g == null) { toast(T('Choose the map of the scene first'), 'err'); return; }
    const sc = scene(st), m = MapsTab.api.loadMap(st.g, st.n);
    const E = { t: 0, sel: null, actor: 'player', zoom: 1, playing: false, placing: null, hist: [], fut: [] };
    const PX = () => 30 * E.zoom, LEFT = 180;
    const save = () => { if (opts.onChange) opts.onChange(); };
    // every change: the old scene goes on the undo list
    const commit = fn => { E.hist.push(JSON.stringify(sc)); if (E.hist.length > 80) E.hist.shift(); E.fut = []; fn(); save(); refresh(); };
    const restore = json => { const o = JSON.parse(json); sc.actors = o.actors; sc.clips = o.clips; if (E.sel && !sc.clips.some(c => c.id === E.sel)) E.sel = null; if (!sc.actors.some(a => a.id === E.actor)) E.actor = 'player'; save(); refresh(); };
    const undo = () => { const j = E.hist.pop(); if (!j) return; E.fut.push(JSON.stringify(sc)); restore(j); };
    const redo = () => { const j = E.fut.pop(); if (!j) return; E.hist.push(JSON.stringify(sc)); restore(j); };
    const clipOf = id => sc.clips.find(c => c.id === id);
    const actorOf = id => sc.actors.find(a => a.id === id);
    const nameOf = a => a.name || (a.kind === 'npc' ? '#' + a.localId : Objects.gfxName(a.gfx));

    // --- the map ---
    const bg = h('canvas', { width: m.w * 16, height: m.h * 16 }), bctx = bg.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) bctx.drawImage(MapsTab.api.metatileCanvas(m, R().r16(m.blocks + (y * m.w + x) * 2) & 0x3FF), x * 16, y * 16);
    const cv = h('canvas', { class: 'pixel cs-map', width: m.w * 16, height: m.h * 16, style: { width: m.w * 32 + 'px' } }), c2 = cv.getContext('2d');
    const sayBox = h('div', { class: 'cs-say', dir: 'auto' });
    function drawMap() {
      const S = stateAt(sc, st, m, E.t);
      c2.drawImage(bg, 0, 0);
      // the people of the map who are not in the scene stay where they are
      const inScene = new Set(sc.actors.filter(a => a.kind === 'npc').map(a => a.localId));
      for (const e of m.events.obj) if (!inScene.has(R().u8[e.off])) { const [x, y] = MapsTab.api.evXY(e); c2.globalAlpha = 0.55; Objects.draw(c2, e, x * 16, y * 16, 16); c2.globalAlpha = 1; }
      // the path of the selected walk
      const sel = clipOf(E.sel);
      if (sel && sel.k === 'walk') {
        const before = stateAt(sc, st, m, sel.t - 0.001).actors.get(sel.a);
        if (before) { let x = Math.round(before.x), y = Math.round(before.y); c2.strokeStyle = 'rgba(255,220,0,.9)'; c2.lineWidth = 3; c2.beginPath(); c2.moveTo(x * 16 + 8, y * 16 + 8);
          for (const d of sel.path || []) { x += D[d][0]; y += D[d][1]; c2.lineTo(x * 16 + 8, y * 16 + 8); } c2.stroke(); c2.fillStyle = '#ffd43b'; c2.fillRect(x * 16 + 5, y * 16 + 5, 6, 6); c2.lineWidth = 1; }
      }
      if (E.drawPath) {                                            // the way being drawn: blue, red where there is none
        const dp = E.drawPath; let x = dp.from.x, y = dp.from.y;
        c2.strokeStyle = dp.ok ? '#4dabf7' : '#fa5252'; c2.lineWidth = 3; c2.setLineDash([5, 3]); c2.beginPath(); c2.moveTo(x * 16 + 8, y * 16 + 8);
        if (dp.ok) for (const d of dp.path) { x += D[d][0]; y += D[d][1]; c2.lineTo(x * 16 + 8, y * 16 + 8); } else c2.lineTo(dp.to.x * 16 + 8, dp.to.y * 16 + 8);
        c2.stroke(); c2.setLineDash([]); c2.lineWidth = 1;
        c2.strokeStyle = dp.ok ? '#4dabf7' : '#fa5252'; c2.lineWidth = 2; c2.strokeRect(dp.to.x * 16 + 1, dp.to.y * 16 + 1, 14, 14); c2.lineWidth = 1;
        if (dp.ok) { c2.fillStyle = 'rgba(0,0,0,.7)'; c2.fillRect(dp.to.x * 16 - 4, dp.to.y * 16 - 13, 24, 11); c2.fillStyle = '#fff'; c2.font = '9px sans-serif'; c2.fillText(dp.path.length + '', dp.to.x * 16, dp.to.y * 16 - 4); }
      }
      const list = sc.actors.map(a => [a, S.actors.get(a.id)]).filter(([, s]) => s && s.vis).sort((p, q) => p[1].y - q[1].y);
      for (const [a, s] of list) {
        const spr = Objects.sprite(s.gfx, s.dir);
        const px = s.x * 16 + 8, py = s.y * 16 + 16 - s.hop * 10;
        if (spr) c2.drawImage(spr, Math.round(px - spr.width / 2), Math.round(py - spr.height));
        else { c2.fillStyle = '#e03131'; c2.fillRect(s.x * 16 + 3, s.y * 16 + 3, 10, 10); }
        if (a.id === E.actor) { c2.strokeStyle = '#ffd43b'; c2.lineWidth = 2; c2.strokeRect(Math.round(s.x * 16) + 1, Math.round(s.y * 16) + 1, 14, 14); c2.lineWidth = 1; }
        if (s.emote) {                                            // the game's emote: a white bubble above the head
          const bx = Math.round(px - 7), by = Math.round(py - (spr ? spr.height : 16) - 16);
          c2.fillStyle = '#fff'; c2.strokeStyle = '#222'; c2.fillRect(bx, by, 14, 13); c2.strokeRect(bx + .5, by + .5, 13, 12);
          c2.fillStyle = s.emote === '♥' ? '#e03131' : '#222'; c2.font = 'bold 11px sans-serif'; c2.textAlign = 'center'; c2.fillText(s.emote, bx + 7, by + 11); c2.textAlign = 'start';
        }
      }
      for (const a of sc.actors) {                                 // the hidden ones as a faint ghost, so they can be found
        const s = S.actors.get(a.id); if (!s || s.vis) continue;
        c2.globalAlpha = 0.25; const spr = Objects.sprite(s.gfx, s.dir); if (spr) c2.drawImage(spr, Math.round(s.x * 16 + 8 - spr.width / 2), Math.round(s.y * 16 + 16 - spr.height)); c2.globalAlpha = 1;
      }
      sayBox.textContent = S.say ? nameOf(S.say.a) + ': ' + S.say.text : '';
      sayBox.style.display = S.say ? '' : 'none';
      timeLabel.textContent = Tf('Step {n}', { n: (Math.round(E.t * 10) / 10) }) + ' · ' + (E.t * STEP_MS / 1000).toFixed(1) + ' ' + T('s');
      if (playhead) playhead.style.left = (LEFT + E.t * PX()) + 'px';
    }
    const cellOf = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / (r.width / m.w)), Math.floor((e.clientY - r.top) / (r.height / m.h))]; };
    const walk = walkGrid(m), still = new Set();                     // people of the map who are not in the scene stand in the way
    const stillSet = () => { still.clear(); const inScene = new Set(sc.actors.filter(a => a.kind === 'npc').map(a => a.localId)); for (const e of m.events.obj) if (!inScene.has(R().u8[e.off])) { const [x, y] = MapsTab.api.evXY(e); still.add(x + ',' + y); } };
    // free for a: walkable, nobody of the map there, nobody of the scene standing there at time t (a flying one goes over all)
    const freeFor = (a, t) => {
      if (a.fly) return (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
      stillSet(); const S = stateAt(sc, st, m, t), taken = new Set();
      for (const o of sc.actors) { const s = S.actors.get(o.id); if (o.id !== a.id && s && s.vis) taken.add(Math.round(s.x) + ',' + Math.round(s.y)); }
      return (x, y) => walk[y * m.w + x] && !still.has(x + ',' + y) && !taken.has(x + ',' + y);
    };
    // the end of a walk clip on the map (drag it to make the way longer)
    const walkEnd = c => { const s0 = stateAt(sc, st, m, c.t - 0.001).actors.get(c.a); let x = Math.round(s0.x), y = Math.round(s0.y); const from = { x, y }; for (const d of c.path || []) { x += D[d][0]; y += D[d][1]; } return { from, x, y }; };
    cv.onmousedown = e => {
      if (e.button !== 0) return;
      const [x, y] = cellOf(e);
      if (E.placing) { const a = actorOf(E.placing); E.placing = null; if (a) commit(() => { a.x = x; a.y = y; }); return; }
      stop();
      const S = stateAt(sc, st, m, E.t), sel = clipOf(E.sel);
      let mode = null;
      if (sel && sel.k === 'walk') { const we = walkEnd(sel); if (we.x === x && we.y === y) mode = { kind: 'extend', clip: sel, a: actorOf(sel.a), from: { x, y }, t: sel.t }; }
      if (!mode) {
        const hit = sc.actors.find(a => { const s = S.actors.get(a.id); return s && Math.round(s.x) === x && Math.round(s.y) === y; });
        if (!hit) return;
        // a new walk starts at the playhead, or right after what the character is doing then
        const t0 = sc.clips.filter(c => c.a === hit.id).reduce((v, c) => c.t <= v && c.t + dur(c) > v ? c.t + dur(c) : v, Math.round(E.t));
        const s0 = stateAt(sc, st, m, t0).actors.get(hit.id);
        mode = { kind: 'new', a: hit, from: { x: Math.round(s0.x), y: Math.round(s0.y) }, t: t0 };
        if (E.actor !== hit.id || E.sel) { E.actor = hit.id; E.sel = null; drawProps(); drawTimeline(); }
      }
      e.preventDefault();
      const free = freeFor(mode.a, mode.t);
      let last = null;
      const mv = ev => {
        const [tx, ty] = cellOf(ev); if (last && last[0] === tx && last[1] === ty) return; last = [tx, ty];
        const path = tx === mode.from.x && ty === mode.from.y ? [] : findPath(m, free, mode.from, { x: tx, y: ty });
        E.drawPath = { from: mode.from, path: path || [], ok: !!path, to: { x: tx, y: ty } }; drawMap();
      };
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        const dp = E.drawPath; E.drawPath = null;
        if (!dp || !last) { drawMap(); return; }                                   // a click: the character is selected
        if (!dp.ok) { toast(T('There is no way there (walls, water or people in the way)'), 'err'); drawMap(); return; }
        if (!dp.path.length) { drawMap(); return; }
        if (mode.kind === 'extend') commit(() => {                  // going back the way it came cancels out (no walking back and forth)
          const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' }, p = mode.clip.path, add = dp.path.slice();
          while (p.length && add.length && OPP[p[p.length - 1]] === add[0]) { p.pop(); add.shift(); }
          p.push(...add); if (!p.length) { sc.clips = sc.clips.filter(c => c !== mode.clip); E.sel = null; }
        });
        else { const c = { id: uid(), a: mode.a.id, t: mode.t, k: 'walk', path: dp.path, speed: 'walk' }; commit(() => { sc.clips.push(c); E.sel = c.id; E.actor = mode.a.id; }); }
      };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };
    cv.onmousemove = e => {
      if (E.drawPath) return;
      const [x, y] = cellOf(e), S = stateAt(sc, st, m, E.t), sel = clipOf(E.sel);
      const onActor = sc.actors.some(a => { const s = S.actors.get(a.id); return s && Math.round(s.x) === x && Math.round(s.y) === y; });
      const onEnd = sel && sel.k === 'walk' && (() => { const we = walkEnd(sel); return we.x === x && we.y === y; })();
      cv.title = E.placing ? T('Click where the character starts') : onEnd ? T('Drag to make the way longer') : onActor ? T('Drag to where the character walks') : '(' + x + ', ' + y + ')';
      cv.style.cursor = E.placing ? 'crosshair' : onActor || onEnd ? 'grab' : 'default';
    };

    // --- playing ---
    let raf = 0, last = 0;
    const stop = () => { E.playing = false; cancelAnimationFrame(raf); playBtn.textContent = '▶ ' + T('Play'); };
    const play = () => {
      if (E.playing) { stop(); return; }
      if (E.t >= endOf(sc)) E.t = 0;
      E.playing = true; playBtn.textContent = '⏸ ' + T('Pause'); last = performance.now();
      const tick = now => { if (!E.playing) return; E.t += (now - last) / STEP_MS; last = now; if (E.t >= endOf(sc)) { E.t = endOf(sc); drawMap(); stop(); return; } drawMap(); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    };

    // --- adding ---
    const NEW_CLIP = { walk: { path: [], speed: 'walk' }, jump: { dir: 'down' }, face: { dir: 'down' }, wait: { len: 2 }, emote: { kind: '!', len: 2 }, say: { text: '', len: 3 }, hide: {}, show: {} };
    function addClip(k, aId = E.actor, t = Math.round(E.t)) {
      const mine = sc.clips.filter(c => c.a === aId), free = mine.reduce((v, c) => c.t <= t && c.t + dur(c) > t ? c.t + dur(c) : v, t);   // after a clip already there
      const c = Object.assign({ id: uid(), a: aId, t: free, k }, clone(NEW_CLIP[k]));
      commit(() => { sc.clips.push(c); E.sel = c.id; E.actor = aId; });
    }
    function addMenu(x, y, aId, t) {
      const back = h('div', { class: 'cs-menu-back', onclick: e => { if (e.target === back) back.remove(); } });
      const menu = h('div', { class: 'panel cs-menu', style: { left: x + 'px', top: y + 'px' } },
        h('div', { class: 'muted' }, nameOf(actorOf(aId)) + ' · ' + Tf('Step {n}', { n: t })),
        ...Object.entries(KINDS).map(([k, [ic, l]]) => h('button', { onclick: () => { back.remove(); addClip(k, aId, t); } }, ic + ' ' + T(l))));
      back.append(menu); document.body.append(back);
      const rc = menu.getBoundingClientRect();                      // keep it on the screen
      if (rc.bottom > innerHeight) menu.style.top = Math.max(0, y - rc.height) + 'px';
      if (rc.right > innerWidth) menu.style.left = Math.max(0, x - rc.width) + 'px';
    }
    function addActor() {
      const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) back.remove(); } });
      const done = a => { back.remove(); commit(() => { sc.actors.push(a); E.actor = a.id; E.sel = null; }); if (a.kind !== 'npc' && a.x == null) { E.placing = a.id; toast(T('Click on the map where the character starts')); } };
      back.append(h('div', { class: 'panel modal' }, h('h3', {}, T('Who joins the scene?')),
        h('div', { class: 'col' },
          sc.actors.some(a => a.kind === 'player') ? null : h('button', { onclick: () => done({ id: 'player', kind: 'player', name: T('The player'), gfx: 0, x: null, y: null, dir: 'up' }) }, '🧍 ' + T('The player')),
          h('button', { onclick: async () => { back.remove(); const p = await Blocks.pickOnMap(st.g, st.n, { person: true }); if (!p) return;
            if (sc.actors.some(a => a.kind === 'npc' && a.localId === p.obj.localId)) { toast(T('This person is already in the scene'), 'err'); return; }
            const e = objOf(st.g, st.n, p.obj.localId); commit(() => { const a = { id: uid(), kind: 'npc', localId: p.obj.localId, name: Objects.tooltip(st.g, st.n, e).split(/[·:(]/)[0].trim().slice(0, 24), gfx: R().u8[e.off + 1] }; sc.actors.push(a); E.actor = a.id; E.sel = null; }); } }, '👤 ' + T('A person already on the map')),
          h('button', { onclick: () => Objects.gallery(18, gfx => done({ id: uid(), kind: 'new', gfx, name: Objects.gfxName(gfx), x: null, y: null, dir: 'down' })) }, '✨ ' + T('A new character for the scene')),
          h('button', { onclick: () => Objects.gallery(138, gfx => done({ id: uid(), kind: 'mon', gfx, name: Objects.gfxName(gfx), x: null, y: null, dir: 'down' })) }, '🐾 ' + T('A Pokémon or a legendary'))),
        h('button', { onclick: () => back.remove() }, T('Cancel'))));
      document.body.append(back);
    }

    // --- properties of the selected clip / character ---
    const props = h('div', { class: 'cs-props' });
    function drawProps() {
      props.innerHTML = '';
      const add = (...kids) => props.append(...kids.filter(k => k != null && k !== ''));
      const c = clipOf(E.sel), a = actorOf(E.actor);
      const field = (label, ...kids) => h('div', { class: 'st-field' }, h('label', {}, label), ...kids);
      const set = (fn) => commit(fn);
      if (c) {
        const ac = actorOf(c.a);
        add(h('h3', {}, KINDS[c.k][0] + ' ' + T(KINDS[c.k][1])), h('div', { class: 'muted' }, nameOf(ac) + ' · ' + Tf('Step {n}', { n: c.t }) + ' – ' + (c.t + dur(c))));
        const dirSel = (v, on) => h('select', { onchange: e => on(e.target.value) }, ...Object.keys(ARROW).map(d => h('option', { value: d, selected: d === v }, ARROW[d] + ' ' + T(d))));
        if (c.k === 'walk') {
          add(field(T('The way'), h('div', { class: 'row wrap' }, ...Object.keys(ARROW).map(d => h('button', { class: 'bl-dir', title: T(d), onclick: () => set(() => c.path.push(d)) }, ARROW[d])),
            h('button', { class: 'bl-dir', title: T('Remove the last step'), onclick: () => set(() => c.path.pop()) }, '⌫'),
            h('button', { onclick: () => set(() => { c.path = []; }) }, T('Clear'))),
            h('div', { class: 'bl-path' }, (c.path || []).map(d => ARROW[d]).join(' ') || T('(no steps yet)'))),
            field(T('Speed'), h('select', { onchange: e => set(() => { c.speed = e.target.value; }) }, ...[['walk', T('walk')], ['run', T('run')], ['slow', T('slowly')]].map(([k, l]) => h('option', { value: k, selected: c.speed === k }, l)))),
            h('p', { class: 'muted' }, T('The yellow line on the map is the way. Drag the yellow square at its end to make it longer, or drag from the character to draw a new way.')));
          const pb = clipProblems(sc, st, m, walk).get(c.id); if (pb) add(h('div', { class: 'warn' }, '⚠ ' + pb));
        } else if (c.k === 'jump') add(field(T('Direction (2 squares)'), dirSel(c.dir, v => set(() => { c.dir = v; }))));
        else if (c.k === 'face') add(field(T('Look'), dirSel(c.dir, v => set(() => { c.dir = v; }))));
        else if (c.k === 'emote') add(field(T('Emote'), h('select', { onchange: e => set(() => { c.kind = e.target.value; }) }, ...Object.entries(EMOTES).map(([k, ic]) => h('option', { value: k, selected: c.kind === k }, ic + ' ' + T({ '!': 'surprised', '?': 'confused', '♥': 'happy' }[k]))))));
        else if (c.k === 'say') { const t = h('textarea', { rows: 3, dir: 'auto', placeholder: T('what they say…'), onchange: e => set(() => { c.text = e.target.value; }) }); t.value = c.text || ''; add(field(T('Text'), t), h('p', { class: 'muted' }, T('In the game the scene waits here until the player presses A.'))); }
        if (STRETCH.has(c.k)) add(field(T('Length (steps)'), h('input', { type: 'number', min: 1, max: 99, value: dur(c), style: { width: '70px' }, onchange: e => set(() => { c.len = Math.max(1, +e.target.value || 1); }) })));
        add(field(T('Starts at step'), h('input', { type: 'number', min: 0, value: c.t, style: { width: '70px' }, onchange: e => set(() => { c.t = Math.max(0, Math.round(+e.target.value || 0)); }) })),
          h('div', { class: 'row wrap' }, h('button', { onclick: () => duplicate() }, '⧉ ' + T('Duplicate')), h('button', { class: 'danger', onclick: () => del() }, '✕ ' + T('Delete'))));
      } else if (a) {
        const p = startOf(a, st, m);
        add(h('h3', {}, nameOf(a)), h('div', { class: 'muted' }, { player: T('The player'), npc: T('A person on the map'), new: T('A new character for the scene'), mon: T('A Pokémon or a legendary') }[a.kind]));
        add(field(T('Name (only for you)'), h('input', { value: a.name || '', dir: 'auto', onchange: e => set(() => { a.name = e.target.value; }) })));
        if (a.kind === 'new' || a.kind === 'mon') add(field(T('Looks like'), h('button', { onclick: () => Objects.gallery(a.gfx, v => set(() => { a.gfx = v; })) }, '🖼 ' + Objects.gfxName(a.gfx))));
        if (a.kind !== 'npc') add(field(T('Starts at'), h('div', { class: 'row' }, h('span', {}, '(' + p.x + ', ' + p.y + ')'), h('button', { class: E.placing === a.id ? 'sel' : '', onclick: () => { E.placing = a.id; toast(T('Click on the map where the character starts')); drawProps(); } }, '👆 ' + T('Pick on the map')))));
        else add(h('p', { class: 'muted' }, Tf('Starts where they stand on the map ({x}, {y}).', { x: p.x, y: p.y })));
        if (a.kind === 'mon' || a.kind === 'new') add(h('label', {}, h('input', { type: 'checkbox', checked: !!a.fly, onchange: e => set(() => { a.fly = e.target.checked; }) }), ' 🪽 ' + T('Flies (goes over walls, trees and water)')));
        add(field(T('Looks at first'), h('select', { onchange: e => set(() => { a.dir = e.target.value; }) }, ...Object.keys(ARROW).map(d => h('option', { value: d, selected: p.dir === d }, ARROW[d] + ' ' + T(d))))));
        add(h('div', { class: 'cs-addrow' }, ...Object.entries(KINDS).map(([k, [ic, l]]) => h('button', { title: T(l), onclick: () => addClip(k) }, ic + ' ' + T(l)))),
          h('p', { class: 'muted' }, T('Adds at the playhead. Or double-click the character\'s row on the timeline.')),
          h('p', { class: 'muted' }, '🖱 ' + T('To make them walk: drag from the character on the map to where they go. The way goes around walls, water and people by itself.')),
          a.kind !== 'player' ? h('button', { class: 'danger', onclick: async () => { if (!(await ask(Tf('Remove {a} and their actions from the scene?', { a: nameOf(a) }), { danger: true }))) return; commit(() => { sc.clips = sc.clips.filter(c => c.a !== a.id); sc.actors = sc.actors.filter(x => x !== a); E.actor = 'player'; }); } }, '✕ ' + T('Remove from the scene')) : null);
      }
    }
    const duplicate = () => { const c = clipOf(E.sel); if (!c) return; const d = Object.assign(clone(c), { id: uid(), t: c.t + dur(c) }); commit(() => { sc.clips.push(d); E.sel = d.id; }); };
    const del = () => { const c = clipOf(E.sel); if (!c) return; commit(() => { sc.clips = sc.clips.filter(x => x !== c); E.sel = null; }); };

    // --- the timeline ---
    const tlScroll = h('div', { class: 'cs-tl-scroll' });
    let playhead = null;
    function drawTimeline() {
      const keep = tlScroll.scrollLeft, keepY = tlScroll.scrollTop, px = PX();
      const len = Math.max(endOf(sc) + 10, 24), W = len * px, bad = clipProblems(sc, st, m, walk);
      const grid = h('div', { class: 'cs-grid', style: { width: (LEFT + W) + 'px' } }); grid.style.setProperty('--z', E.zoom);
      const ruler = h('div', { class: 'cs-track cs-ruler', style: { width: W + 'px' } });
      for (let i = 0; i <= len; i++) ruler.append(h('div', { class: 'cs-tick' + (i % 4 ? '' : ' big'), style: { left: i * px + 'px' } }, i % 4 ? '' : String(i)));
      const scrub = e => { const r = ruler.getBoundingClientRect(); E.t = Math.max(0, Math.min(len, (e.clientX - r.left) / px)); if (!e.shiftKey) E.t = Math.round(E.t * 4) / 4; drawMap(); };
      ruler.onmousedown = e => { stop(); scrub(e); const mv = ev => scrub(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
      grid.append(h('div', { class: 'cs-row cs-head' }, h('div', { class: 'cs-who' }, h('b', {}, T('Characters')), h('button', { title: T('Add a character'), onclick: addActor }, '+ ' + T('Add'))), ruler));
      for (const a of sc.actors) {
        const p = startOf(a, st, m), icon = h('canvas', { class: 'pixel cs-icon', width: 32, height: 32 }), spr = Objects.sprite(p.gfx, 'down');
        if (spr) icon.getContext('2d').drawImage(spr, Math.round(16 - spr.width / 2), Math.max(0, 32 - spr.height));
        const track = h('div', { class: 'cs-track', style: { width: W + 'px' } });
        track.ondblclick = e => { if (e.target !== track) return; const r = track.getBoundingClientRect(); addMenu(e.clientX, e.clientY, a.id, Math.max(0, Math.floor((e.clientX - r.left) / px))); };
        track.oncontextmenu = e => { if (e.target !== track) return; e.preventDefault(); track.ondblclick(e); };
        for (const c of sc.clips.filter(x => x.a === a.id)) {
          const [ic, l, col] = KINDS[c.k], label = c.k === 'walk' ? (c.path || []).map(d => ARROW[d]).join('') || T(l) : c.k === 'say' ? (c.text || T(l)) : c.k === 'emote' ? (EMOTES[c.kind] || '!') : c.k === 'face' || c.k === 'jump' ? ARROW[c.dir || 'down'] : T(l);
          const el = h('div', { class: 'cs-clip' + (c.id === E.sel ? ' sel' : '') + (bad.has(c.id) ? ' bad' : ''), title: T(l) + (bad.has(c.id) ? ' · ' + bad.get(c.id) : ''),
            style: { left: c.t * px + 'px', width: Math.max(8, dur(c) * px - 2) + 'px', background: col } }, h('span', {}, ic + ' ' + label));
          if (STRETCH.has(c.k)) el.append(h('div', { class: 'cs-grip', title: T('Drag to make it longer or shorter') }));
          el.onmousedown = e => dragClip(e, c, el);
          track.append(el);
        }
        grid.append(h('div', { class: 'cs-row' + (a.id === E.actor ? ' sel' : ''), 'data-actor': a.id },
          h('div', { class: 'cs-who', onclick: () => { E.actor = a.id; E.sel = null; refresh(); } }, icon, h('span', { dir: 'auto' }, nameOf(a))), track));
      }
      playhead = h('div', { class: 'cs-playhead', style: { left: (LEFT + E.t * px) + 'px' } });
      grid.append(playhead);
      tlScroll.innerHTML = ''; tlScroll.append(grid); tlScroll.scrollLeft = keep; tlScroll.scrollTop = keepY;
    }
    // drag a clip: along the row = when, to another row = who; the grip on the right = how long
    function dragClip(e, c, el) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); stop();
      const grip = e.target.classList.contains('cs-grip'), x0 = e.clientX, t0 = c.t, len0 = dur(c), px = PX();
      if (E.sel !== c.id || E.actor !== c.a) { E.sel = c.id; E.actor = c.a; drawProps(); drawMap(); tlScroll.querySelectorAll('.cs-clip.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); }
      let nt = t0, nlen = len0, na = c.a, moved = false;
      const mv = ev => {
        const d = Math.round((ev.clientX - x0) / px);
        if (grip) { nlen = Math.max(1, len0 + d); el.style.width = (nlen * px - 2) + 'px'; }
        else {
          nt = Math.max(0, t0 + d); el.style.left = nt * px + 'px';
          const row = document.elementsFromPoint(ev.clientX, ev.clientY).map(x => x.closest && x.closest('.cs-row[data-actor]')).find(Boolean);
          if (row) na = row.dataset.actor;
          tlScroll.querySelectorAll('.cs-row.drop').forEach(x => x.classList.remove('drop')); if (row && na !== c.a) row.classList.add('drop');
        }
        moved = moved || d !== 0 || na !== c.a;
      };
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        if (!moved) return;
        commit(() => { if (grip) c.len = nlen; else { c.t = nt; c.a = na; E.actor = na; } });
      };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }

    // --- the window ---
    const playBtn = h('button', { class: 'primary', onclick: play }, '▶ ' + T('Play'));
    const timeLabel = h('span', { class: 'cs-time' });
    const close = () => { stop(); window.removeEventListener('keydown', keys, true); back.remove(); if (opts.onClose) opts.onClose(); };
    const trigText = st.trig === 'step' ? T('when the player steps on a square') : st.trig === 'talk' ? T('when the player talks to someone') : T('when the player arrives on the map');
    const back = h('div', { class: 'cs-back' },
      h('div', { class: 'cs-win' },
        h('div', { class: 'cs-top' },
          h('b', { dir: 'auto' }, '🎞 ' + (st.title || T('An animated scene'))), h('span', { class: 'muted', dir: 'auto' }, m.name + ' · ' + trigText),
          h('span', { style: { flex: 1 } }),
          h('button', { title: T('Back to the start'), onclick: () => { stop(); E.t = 0; drawMap(); } }, '⏮'), playBtn, timeLabel,
          h('button', { title: T('Undo') + ' (Ctrl+Z)', onclick: undo }, '↶'), h('button', { title: T('Redo') + ' (Ctrl+Y)', onclick: redo }, '↷'),
          h('button', { title: T('Zoom out'), onclick: () => { E.zoom = Math.max(0.4, E.zoom / 1.25); drawTimeline(); } }, '−'), h('button', { title: T('Zoom in'), onclick: () => { E.zoom = Math.min(3, E.zoom * 1.25); drawTimeline(); } }, '+'),
          h('button', { onclick: close }, '✓ ' + T('Done'))),
        h('div', { class: 'cs-main' }, h('div', { class: 'cs-mapbox' }, cv, sayBox), props),
        h('div', { class: 'cs-tlbox' }, tlScroll,
          h('div', { class: 'muted cs-hint' }, T('Double-click a row to add an action · drag a clip to move it (also to another character) · drag its right edge to make it longer · click the ruler to move the playhead · Space = play · Delete · Ctrl+C / Ctrl+V / Ctrl+D · Ctrl+Z')))));
    tlScroll.onwheel = e => { if (!e.ctrlKey) return; e.preventDefault(); E.zoom = Math.max(0.4, Math.min(3, E.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); drawTimeline(); };
    function keys(e) {
      if (!back.isConnected) return;
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (e.key === 'Escape' && !document.querySelector('.modal-back, .cs-menu-back')) { e.preventDefault(); if (E.placing) { E.placing = null; drawProps(); } else close(); return; }
      if (typing) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { e.preventDefault(); play(); }
      else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && k === 'c') { const c = clipOf(E.sel); if (c) { clipboard = clone(c); toast(T('Copied')); } }
      else if (mod && k === 'v') { if (!clipboard) return; e.preventDefault(); const c = Object.assign(clone(clipboard), { id: uid(), t: Math.round(E.t), a: actorOf(clipboard.a) && clipboard.a === E.actor ? clipboard.a : E.actor }); commit(() => { sc.clips.push(c); E.sel = c.id; }); }
      else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (E.sel) { e.preventDefault(); del(); } }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stop(); E.t = Math.max(0, Math.round(E.t) + (e.key === 'ArrowRight' ? 1 : -1)); drawMap(); }   // time runs left to right, in Hebrew too
    }
    window.addEventListener('keydown', keys, true);
    const refresh = () => { drawTimeline(); drawProps(); drawMap(); };
    document.body.append(back);
    refresh();
    return { close, E, sc };
  }

  return { open, scene, toBlocks, problems, summary, stateAt, dur, endOf, KINDS };
})();
