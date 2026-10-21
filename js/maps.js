// Map editor: renders maps with their real tilesets, paint blocks / collision, move & edit events,
// edit the text of NPC scripts, header settings and wild encounters.
'use strict';

const MapsTab = (() => {
  let cur = null;               // loaded map
  let selGroup = 0, selMap = 0, zoom = 2, mode = 'tiles', selBlock = 1, selColl = 1, selElev = 3;
  let showColl = false, showEvents = true, showGrid = false, playerView = false, selEvent = null, filterText = '';
  const tsCache = new Map(), mtCache = new Map();
  const undo = [];

  // ---------- data ----------
  function loadTileset(off, secondary) {
    const key = off + (secondary ? 's' : 'p');
    if (tsCache.has(key)) return tsCache.get(key);
    const rom = App.rom, g = App.game, comp = rom.u8[off];
    const tp = rom.ptr(off + 4), pp = rom.ptr(off + 8), mp = rom.ptr(off + 12);
    const attrP = rom.ptr(off + (g.isEmerald ? 16 : 20));
    const maxTiles = secondary ? 1024 - g.primaryTiles : g.primaryTiles;
    let tiles;
    if (comp) { const d = LZ.decompress(rom.u8, tp); tiles = d ? d.data : new Uint8Array(32); }
    else tiles = rom.u8.slice(tp, tp + maxTiles * 32);
    const pals = [];
    for (let i = 0; i < 16; i++) pals.push(Gfx.readPal(rom.u8, pp + i * 32));
    let count = secondary ? 1024 - g.primaryMetatiles : g.primaryMetatiles;
    if (attrP > mp && (attrP - mp) / 16 <= 1024) count = Math.min(count, (attrP - mp) / 16);
    const ts = { off, tiles, pals, meta: mp, count };
    tsCache.set(key, ts);
    return ts;
  }
  function loadMap(gi, mi) {
    const rom = App.rom, g = App.game, hdr = g.mapGroups[gi][mi];
    const lay = rom.ptr(hdr), ev = rom.ptr(hdr + 4);
    const m = {
      gi, mi, hdr, lay, w: rom.r32(lay), h: rom.r32(lay + 4), border: rom.ptr(lay + 8), blocks: rom.ptr(lay + 12),
      prim: loadTileset(rom.ptr(lay + 16), false), sec: loadTileset(rom.ptr(lay + 20), true), ev,
    };
    m.name = Game.mapName(rom, g, rom.u8[hdr + 20]);
    m.events = readEvents(ev);
    return m;
  }
  function readEvents(ev) {
    const rom = App.rom, E = { obj: [], warp: [], coord: [], bg: [] };
    if (ev < 0) return E;
    const add = (list, count, ptr, size, kind) => { const p = rom.ptr(ev + ptr); if (p < 0) return; for (let i = 0; i < count; i++) list.push({ kind, i, off: p + i * size }); };
    add(E.obj, rom.u8[ev], 4, 24, 'obj'); add(E.warp, rom.u8[ev + 1], 8, 8, 'warp');
    add(E.coord, rom.u8[ev + 2], 12, 16, 'coord'); add(E.bg, rom.u8[ev + 3], 16, 12, 'bg');
    return E;
  }
  const evXY = e => { const o = e.off + (e.kind === 'obj' ? 4 : 0); return [App.rom.s16(o), App.rom.s16(o + 2)]; };
  function setEvXY(e, x, y) { const o = e.kind === 'obj' ? 4 : 0; App.rom.w16(e.off + o, x & 0xFFFF); App.rom.w16(e.off + o + 2, y & 0xFFFF); }

  // ---------- rendering ----------
  function palFor(m, idx) { return idx < App.game.primaryPals ? m.prim.pals[idx] : m.sec.pals[idx]; }
  function drawTile(img, m, entry, dx, dy, transparent) {
    const g = App.game; let t = entry & 0x3FF;
    const hf = entry & 0x400, vf = entry & 0x800, pal = palFor(m, entry >> 12);
    const src = t < g.primaryTiles ? m.prim.tiles : m.sec.tiles; if (t >= g.primaryTiles) t -= g.primaryTiles;
    const base = t * 32; if (base + 32 > src.length) return;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = hf ? 7 - x : x, sy = vf ? 7 - y : y, b = src[base + sy * 4 + (sx >> 1)], c = sx & 1 ? b >> 4 : b & 15;
      if (c === 0 && transparent) continue;
      const col = pal[c], o = ((dy + y) * img.width + dx + x) * 4;
      img.data[o] = (col & 31) << 3; img.data[o + 1] = ((col >> 5) & 31) << 3; img.data[o + 2] = ((col >> 10) & 31) << 3; img.data[o + 3] = 255;
    }
  }
  function metatileCanvas(m, id) {
    const key = m.prim.off + ':' + m.sec.off + ':' + id;
    if (mtCache.has(key)) return mtCache.get(key);
    const g = App.game, rom = App.rom, img = new ImageData(16, 16);
    const isSec = id >= g.primaryMetatiles, ts = isSec ? m.sec : m.prim, local = isSec ? id - g.primaryMetatiles : id;
    if (local < ts.count) {
      const mo = ts.meta + local * 16;
      for (let layer = 0; layer < 2; layer++) for (let k = 0; k < 4; k++)
        drawTile(img, m, rom.r16(mo + layer * 8 + k * 2), (k & 1) * 8, (k >> 1) * 8, layer === 1);
    }
    const c = h('canvas', { width: 16, height: 16 }); c.getContext('2d').putImageData(img, 0, 0);
    mtCache.set(key, c); return c;
  }
  const block = (m, x, y) => App.rom.r16(m.blocks + (y * m.w + x) * 2);

  function drawMap(cv) {
    const m = cur, ctx = cv.getContext('2d'), rom = App.rom;
    cv.width = m.w * 16; cv.height = m.h * 16;
    cv.style.width = m.w * 16 * zoom + 'px'; cv.style.height = m.h * 16 * zoom + 'px';
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const b = block(m, x, y);
      ctx.drawImage(metatileCanvas(m, b & 0x3FF), x * 16, y * 16);
      if (showColl || mode === 'coll') collisionCell(ctx, b, x * 16, y * 16, 16);
    }
    if (showGrid) { ctx.strokeStyle = 'rgba(0,0,0,.2)'; for (let x = 0; x <= m.w; x++) { ctx.beginPath(); ctx.moveTo(x * 16 + .5, 0); ctx.lineTo(x * 16 + .5, m.h * 16); ctx.stroke(); } for (let y = 0; y <= m.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * 16 + .5); ctx.lineTo(m.w * 16, y * 16 + .5); ctx.stroke(); } }
    if (showEvents) {
      if (selEvent) { const [x, y] = evXY(selEvent); Objects.drawArea(ctx, selEvent, x * 16, y * 16, 16); }
      // people sorted by y so the lower ones are drawn in front
      const all = Object.values(m.events).flat().sort((a, b) => (a.kind === 'obj') - (b.kind === 'obj') || evXY(a)[1] - evXY(b)[1]);
      for (const e of all) { const [x, y] = evXY(e); Objects.draw(ctx, e, x * 16, y * 16, 16, { selected: selEvent && selEvent.off === e.off }); }
    }
  }

  // collision overlay for one cell (shared with the world view): red = blocked, blue = walkable, cyan = water level,
  // the elevation number on top
  function collisionCell(ctx, b, px, py, s) {
    const coll = (b >> 10) & 3, elev = b >> 12;
    ctx.fillStyle = coll ? 'rgba(235,40,40,.5)' : elev === 1 ? 'rgba(20,200,220,.35)' : 'rgba(40,120,255,.28)'; ctx.fillRect(px, py, s, s);
    if (s >= 10) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 2; ctx.font = 'bold ' + Math.round(s * 0.6) + 'px monospace';
      const t = (coll ? '×' : '') + elev.toString(16).toUpperCase();
      ctx.strokeText(t, px + s * 0.22, py + s * 0.72); ctx.fillText(t, px + s * 0.22, py + s * 0.72); ctx.lineWidth = 1;
    }
  }
  const COLL_LEGEND = () => h('div', { class: 'muted', style: { fontSize: '12px' } },
    h('span', { style: { background: 'rgba(40,120,255,.5)', padding: '0 5px' } }, 'walkable'), ' ', h('span', { style: { background: 'rgba(235,40,40,.6)', padding: '0 5px' } }, '× blocked'), ' ',
    h('span', { style: { background: 'rgba(20,200,220,.5)', padding: '0 5px' } }, 'water (1)'), ' · the number is the elevation (3 = normal ground, 0 = transition, F = bridge / multi-level)');

  // ---------- adding / deleting events ----------
  const EV_SIZE = { obj: 24, warp: 8, coord: 16, bg: 12 }, EV_SLOT = { obj: 0, warp: 1, coord: 2, bg: 3 };
  function defaultScript(kind) {
    const rom = App.rom, text = rom.writeNew(Charmap.encode('...', { rtl: App.settings.rtl }));
    const p = new Uint8Array(4); new DataView(p.buffer).setUint32(0, 0x08000000 + text, true);
    if (kind === 'obj') return rom.writeNew(Uint8Array.from([0x6A, 0x5A, 0x0F, 0x00, ...p, 0x09, 0x02, 0x6C, 0x02]));   // lock faceplayer msgbox release end
    return rom.writeNew(Uint8Array.from([0x0F, 0x00, ...p, 0x09, 0x03, 0x02]));                                     // sign: msgbox (signpost) end
  }
  // a new person / door / trigger / sign at (x, y) of map gi.mi; returns its event
  function addEvent(gi, mi, kind, x, y) {
    const rom = App.rom, hdr = App.game.mapGroups[gi][mi];
    let ev = rom.ptr(hdr + 4);
    if (ev < 0) { ev = rom.writeNew(new Uint8Array(20)); rom.wptr(hdr + 4, ev); }
    const n = rom.u8[ev + EV_SLOT[kind]], size = EV_SIZE[kind], old = rom.ptr(ev + 4 + EV_SLOT[kind] * 4);
    const e = new Uint8Array(size), dv = new DataView(e.buffer);
    if (kind === 'obj') {
      const tmplMap = n && old >= 0 ? old : (() => { const h3 = App.game.mapGroups[3][0], e3 = rom.ptr(rom.ptr(h3 + 4) + 4); return e3; })();
      e.set(rom.u8.subarray(tmplMap, tmplMap + 24));
      let maxId = 0; for (let k = 0; k < n && old >= 0; k++) maxId = Math.max(maxId, rom.u8[old + k * 24]);
      e[0] = maxId + 1; dv.setInt16(4, x, true); dv.setInt16(6, y, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0, true);
      e[9] = 8; e[10] = 0;                                            // stands still, facing down
      dv.setUint32(16, 0x08000000 + defaultScript('obj'), true); dv.setUint16(20, 0, true);
    } else if (kind === 'warp') {
      dv.setInt16(0, x, true); dv.setInt16(2, y, true); e[4] = 0; e[5] = 0; e[6] = mi; e[7] = gi;   // leads to this map, warp 0 (edit it)
    } else if (kind === 'coord') {
      dv.setInt16(0, x, true); dv.setInt16(2, y, true); e[4] = 3; dv.setUint16(6, 0x4000, true); dv.setUint16(8, 0xFFFF, true);
      dv.setUint32(12, 0x08000000 + rom.writeNew(Uint8Array.from([0x02])), true);       // var 0x4000 == 0xFFFF: never fires until you set it
    } else {
      dv.setInt16(0, x, true); dv.setInt16(2, y, true); e[4] = 0; e[5] = 0;
      dv.setUint32(8, 0x08000000 + defaultScript('bg'), true);
    }
    const arr = new Uint8Array((n + 1) * size);
    if (n && old >= 0) arr.set(rom.u8.subarray(old, old + n * size));
    arr.set(e, n * size);
    const na = rom.writeNew(arr);
    rom.w8(ev + EV_SLOT[kind], n + 1); rom.wptr(ev + 4 + EV_SLOT[kind] * 4, na);
    return { kind, i: n, off: na + n * size };
  }
  function deleteEvent(gi, mi, kind, i) {
    const rom = App.rom, ev = rom.ptr(App.game.mapGroups[gi][mi] + 4), n = rom.u8[ev + EV_SLOT[kind]], size = EV_SIZE[kind], old = rom.ptr(ev + 4 + EV_SLOT[kind] * 4);
    if (i >= n) return;
    const arr = new Uint8Array((n - 1) * size);
    arr.set(rom.u8.subarray(old, old + i * size)); arr.set(rom.u8.subarray(old + (i + 1) * size, old + n * size), i * size);
    rom.w8(ev + EV_SLOT[kind], n - 1);
    if (n - 1) rom.wptr(ev + 4 + EV_SLOT[kind] * 4, rom.writeNew(arr)); else rom.w32(ev + 4 + EV_SLOT[kind] * 4, 0);
  }
  let pendingAdd = null, pendingSel = null, pickPlay = false;
  function addButtons(onPick, onDelete) {
    return h('div', { class: 'row wrap', style: { margin: '6px 0' } },
      ...Objects.TEMPLATES.map(([k, l]) => h('button', { class: pendingAdd === k ? 'sel' : '', onclick: () => onPick(k) }, l)),
      onDelete ? h('button', { onclick: onDelete }, '🗑 Delete selected') : '',
      pendingAdd ? h('span', { class: 'warn' }, 'click on the map to place it') : '');
  }

  function drawPalette(cv, onPick) {
    const m = cur, g = App.game, ids = [];
    for (let i = 0; i < m.prim.count; i++) ids.push(i);
    for (let i = 0; i < m.sec.count; i++) ids.push(g.primaryMetatiles + i);
    const cols = 8, rows = Math.ceil(ids.length / cols);
    cv.width = cols * 16; cv.height = rows * 16; cv.style.width = cols * 32 + 'px';
    const ctx = cv.getContext('2d');
    ids.forEach((id, k) => {
      ctx.drawImage(metatileCanvas(m, id), (k % cols) * 16, Math.floor(k / cols) * 16);
      if (id === selBlock) { ctx.strokeStyle = '#ff2050'; ctx.lineWidth = 2; ctx.strokeRect((k % cols) * 16 + 1, Math.floor(k / cols) * 16 + 1, 14, 14); ctx.lineWidth = 1; }
    });
    cv.onclick = e => {
      const r = cv.getBoundingClientRect(), s = cv.width / r.width;
      const k = Math.floor((e.clientY - r.top) * s / 16) * cols + Math.floor((e.clientX - r.left) * s / 16);
      if (ids[k] != null) { selBlock = ids[k]; onPick(); }
    };
  }

  // ---------- UI ----------
  function render(root) {
    root.innerHTML = '';
    const g = App.game;
    if (!g.mapGroups.length) { root.append(h('div', { class: 'panel' }, 'Map table not found in this ROM.')); return; }
    if (!cur || cur.gi !== selGroup || cur.mi !== selMap) { try { cur = loadMap(selGroup, selMap); } catch (e) { root.append(h('div', { class: 'panel err' }, 'Could not load map: ' + e.message)); return; } selEvent = null; }
    if (pendingSel) { selEvent = (cur.events[pendingSel.kind] || [])[pendingSel.i] || null; if (selEvent) mode = 'events'; pendingSel = null; }

    // map list
    const list = h('select', { size: 30, class: 'maplist', onchange: e => { const [a, b] = e.target.value.split('.').map(Number); selGroup = a; selMap = b; render(root); } });
    const fillList = () => {
      list.innerHTML = '';
      const q = filterText.toLowerCase();
      g.mapGroups.forEach((maps, gi) => maps.forEach((hp, mi) => {
        const label = gi + '.' + mi + ' ' + Game.mapName(App.rom, g, App.rom.u8[hp + 20]);
        if (q && !label.toLowerCase().includes(q)) return;
        list.append(h('option', { value: gi + '.' + mi, selected: gi === selGroup && mi === selMap }, label));
      }));
    };
    fillList();
    const left = h('div', { class: 'panel maplistp' }, h('input', { type: 'search', placeholder: 'Filter maps…', value: filterText, oninput: e => { filterText = e.target.value; fillList(); } }), list);

    // toolbar
    const tb = h('div', { class: 'row wrap' },
      h('b', {}, `${selGroup}.${selMap} ${cur.name}`), h('span', { class: 'muted' }, `${cur.w}×${cur.h} · header ${hex(cur.hdr)}`),
      h('div', { class: 'tabs small' }, ...[['tiles', '🖌 Paint tiles'], ['coll', '⛔ Collision'], ['events', '👤 Events'], ['pick', '💧 Pick']].map(([k, n]) =>
        h('button', { class: mode === k ? 'sel' : '', onclick: () => { mode = k; if (k === 'coll') showColl = true; render(root); } }, n))),
      h('label', {}, 'Zoom ', h('select', { onchange: e => { zoom = +e.target.value; redraw(); } }, ...[1, 2, 3, 4].map(z => h('option', { value: z, selected: z === zoom }, z + '×')))),
      h('label', {}, h('input', { type: 'checkbox', checked: showColl, onchange: e => { showColl = e.target.checked; redraw(); } }), ' Collision'),
      h('label', {}, h('input', { type: 'checkbox', checked: showEvents, onchange: e => { showEvents = e.target.checked; redraw(); } }), ' Events'),
      h('label', {}, h('input', { type: 'checkbox', checked: showGrid, onchange: e => { showGrid = e.target.checked; redraw(); } }), ' Grid'),
      h('label', { title: T('A frame the size of the game screen (15×10 squares) around the mouse: what the player sees standing there') }, h('input', { type: 'checkbox', checked: playerView, onchange: e => { playerView = e.target.checked; pv.hidden = true; } }), ' 👁 ' + T('Player view')),
      h('button', { onclick: () => { const u = undo.pop(); if (u) { App.rom.write(u.off, u.data); redraw(); } } }, '↶ Undo'),
      h('button', { class: pickPlay ? 'sel' : '', title: 'Click a spot on the map: the game starts there', onclick: () => { pickPlay = !pickPlay; render(root); } }, '▶ Play from here'),
      h('button', { title: 'What happens on this map in the story of the game, in order', onclick: () => { StoryView.setPlace(cur.gi + '.' + cur.mi); App.show('story'); } }, '📖 ' + T('Story here')),
      h('button', { title: 'The Pokémon the player gets in the test', onclick: () => Emu.teamDialog() }, '🎒'),
      h('span', { class: 'muted', id: 'mapPos' }));
    const cv = h('canvas', { class: 'pixel mapcanvas' });
    const pv = h('div', { class: 'pv-frame', hidden: true }, h('span', {}, T('what the player sees')));     // the game screen around the mouse
    const redraw = () => drawMap(cv);
    redraw();

    // interactions
    let down = false, dragging = null;
    const cell = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / (16 * zoom)), Math.floor((e.clientY - r.top) / (16 * zoom))]; };
    const eventAt = (x, y) => { for (const l of Object.values(cur.events)) for (const ev of l) { const [ex, ey] = evXY(ev); if (ex === x && ey === y) return ev; } return null; };
    const paintAt = (x, y, e) => {
      if (x < 0 || y < 0 || x >= cur.w || y >= cur.h) return;
      const o = cur.blocks + (y * cur.w + x) * 2, b = App.rom.r16(o);
      if (mode === 'pick' || e.buttons === 2) { selBlock = b & 0x3FF; selColl = (b >> 10) & 3; selElev = b >> 12; render(root); return; }
      let nb = b;
      if (mode === 'tiles') nb = (b & ~0x3FF) | selBlock;
      else if (mode === 'coll') nb = (b & 0x3FF) | (selColl << 10) | (selElev << 12);
      if (nb !== b) { App.rom.w16(o, nb); redraw(); }
    };
    cv.oncontextmenu = e => e.preventDefault();
    cv.onmousedown = e => {
      const [x, y] = cell(e);
      if (pickPlay) { pickPlay = false; render(root); Emu.playFrom({ g: cur.gi, n: cur.mi, x, y, team: Emu.team(), label: cur.name + ' (' + x + ', ' + y + ')' }); return; }
      if (mode === 'events') {
        if (pendingAdd) {
          const tpl = pendingAdd, kind = Objects.KIND_OF[tpl]; pendingAdd = null;
          let e2; try { e2 = Objects.add(cur.gi, cur.mi, tpl, x, y); } catch (x2) { toast(x2.message, 'err'); renderSide(); return; }
          cur.events = readEvents(cur.ev = App.rom.ptr(cur.hdr + 4));
          selEvent = Object.values(cur.events).flat().find(q => q.kind === kind && q.i === e2.i) || null; renderSide(); redraw(); return;
        }
        const ev = eventAt(x, y); selEvent = ev; dragging = ev; renderSide(); redraw(); return;
      }
      undo.push({ off: cur.blocks, data: App.rom.u8.slice(cur.blocks, cur.blocks + cur.w * cur.h * 2) });
      if (undo.length > 30) undo.shift();
      down = true; paintAt(x, y, e);
    };
    cv.onmousemove = e => {
      const [x, y] = cell(e);
      if (playerView) { const s = 16 * zoom; pv.hidden = false; Object.assign(pv.style, { left: (x - 7) * s + 'px', top: (y - 4) * s + 'px', width: 15 * s + 'px', height: 10 * s + 'px' }); }
      if (x >= 0 && y >= 0 && x < cur.w && y < cur.h) {
        const b = block(cur, x, y);
        $('#mapPos').textContent = `(${x}, ${y}) block ${hex(b & 0x3FF, 3)} collision ${(b >> 10) & 3} elevation ${b >> 12}`;
        const ev = showEvents && eventAt(x, y); cv.title = ev ? Objects.tooltip(cur.gi, cur.mi, ev) : '';
      }
      if (dragging) { const [ox, oy] = evXY(dragging); if (ox !== x || oy !== y) { setEvXY(dragging, x, y); redraw(); renderSide(); } return; }
      if (down && mode !== 'pick') paintAt(x, y, e);
    };
    window.onmouseup = () => { down = false; dragging = null; };

    const side = h('div', { class: 'panel mapside' });
    function renderSide() {
      side.innerHTML = '';
      if (mode === 'tiles' || mode === 'pick') {
        const pcv = h('canvas', { class: 'pixel' });
        drawPalette(pcv, () => renderSide());
        const big = h('canvas', { class: 'pixel', width: 16, height: 16, style: { width: '32px' } });
        big.getContext('2d').drawImage(metatileCanvas(cur, selBlock), 0, 0);
        side.append(h('div', { class: 'row' }, h('b', {}, 'Block ' + hex(selBlock, 3)), big),
          h('p', { class: 'muted' }, 'Left click paints · right click picks'), h('div', { class: 'palscroll' }, pcv));
      } else if (mode === 'coll') {
        side.append(h('h3', {}, 'Collision brush'),
          h('label', { class: 'field' }, 'Collision', makeSelect(['0 passable', '1 blocked', '2', '3'], selColl, v => selColl = v)),
          h('label', { class: 'field' }, 'Elevation', makeSelect([...Array(16)].map((_, i) => 'level ' + i + (i === 0 ? ' (transition)' : i === 15 ? ' (multi)' : i === 1 ? ' (water/surf)' : '')), selElev, v => selElev = v)),
          COLL_LEGEND(), h('p', { class: 'muted' }, 'Left click paints collision + elevation, right click picks them from the map. Most walkable ground is collision 0, elevation 3.'));
      } else side.append(eventPanel(redraw, renderSide));
      side.append(headerPanel(), wildPanel());
    }
    renderSide();

    cv.onmouseleave = () => { pv.hidden = true; };
    cv.ondblclick = e => {                                   // edit what a person / sign says, right on the map
      const [x, y] = cell(e), ev = eventAt(x, y); if (!ev || ev.kind === 'warp' || ev.kind === 'coord') return;
      const r = cv.getBoundingClientRect(), s2 = 16 * zoom;
      Objects.inlineText(cur.gi, cur.mi, ev, r.left + x * s2 + s2 / 2, r.top + y * s2, (l, fn) => { try { fn(); return true; } catch (x2) { toast(x2.message, 'err'); return false; } }, () => { redraw(); renderSide(); });
    };
    root.append(h('div', { class: 'cols maps' }, left, h('div', { class: 'panel mapmain' }, tb, h('div', { class: 'mapscroll' }, h('div', { class: 'pv-wrap' }, cv, pv))), side));
  }

  // ---------- events ----------
  function eventPanel(redraw, rerender, opts = {}) {
    const rom = App.rom, e = selEvent;
    const wrap = h('div');
    const all = Object.values(cur.events).flat();
    wrap.append(h('h3', {}, 'Objects'), h('p', { class: 'muted' }, 'Click an object to select it, drag to move it. Hover for who it is.'),
      opts.noAdd ? '' : addButtons(k => { pendingAdd = pendingAdd === k ? null : k; rerender(); }, e ? async () => {
        if (!(await ask(Tf('Delete this {what}?', { what: T(Objects.info(cur.gi, cur.mi, e).type) }), { danger: true }))) return;
        deleteEvent(cur.gi, cur.mi, e.kind, e.i); cur.events = readEvents(cur.ev = App.rom.ptr(cur.hdr + 4)); selEvent = null; redraw(); rerender();
      } : null),
      h('select', { style: { maxWidth: '100%' }, onchange: ev => { selEvent = all[+ev.target.value]; redraw(); rerender(); } },
        h('option', {}, '— select —'),
        ...all.map((x, i) => { const [a, b] = evXY(x); return h('option', { value: i, selected: e && e.off === x.off }, Objects.tooltip(cur.gi, cur.mi, x).slice(0, 70) + ` (${a},${b})`); })));
    if (!e) return wrap;
    const m0 = cur;
    wrap.append(Objects.panel(e, { g: m0.gi, n: m0.mi,
      commit: (label, fn) => { try { fn(); return true; } catch (x) { console.error(x); toast(x.message, 'err'); return false; } },
      refresh: () => { cur = loadMap(m0.gi, m0.mi); selEvent = Object.values(cur.events).flat().find(q => q.kind === e.kind && q.i === e.i) || null; redraw(); rerender(); },
      jump: (g, n, w) => { selGroup = g; selMap = n; cur = null; pendingSel = { kind: 'warp', i: w }; App.show('maps'); } }));
    return wrap;
  }
  // ---------- header ----------
  function headerPanel() {
    const rom = App.rom, o = cur.hdr;
    const WEATHER = ['None', 'Sunny clouds', 'Sunny', 'Rain', 'Snow', 'Thunderstorm', 'Fog (horizontal)', 'Volcanic ash', 'Sandstorm', 'Fog (diagonal)', 'Underwater', 'Shade', 'Drought', 'Downpour', 'Underwater bubbles', 'Abnormal', 'Route 119 cycle', 'Route 123 cycle'];
    const TYPES = ['None', 'Town', 'City', 'Route', 'Underground', 'Underwater', 'Ocean route', 'Unknown', 'Indoor', 'Secret base'];
    return h('details', { class: 'hdr' }, h('summary', {}, 'Map header'),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, 'Music', h('input', { type: 'number', value: rom.r16(o + 16), onchange: e => rom.w16(o + 16, +e.target.value) })),
        h('label', { class: 'field' }, 'Name (map section)', h('input', { type: 'number', value: rom.u8[o + 20], onchange: e => { rom.w8(o + 20, +e.target.value); } })),
        h('label', { class: 'field' }, 'Weather', makeSelect(WEATHER, rom.u8[o + 22], v => rom.w8(o + 22, v))),
        h('label', { class: 'field' }, 'Map type', makeSelect(TYPES, rom.u8[o + 23], v => rom.w8(o + 23, v))),
        h('label', { class: 'field' }, 'Show name popup / flags', h('input', { type: 'number', value: rom.u8[o + 26], onchange: e => rom.w8(o + 26, +e.target.value) })),
        h('label', { class: 'field' }, 'Battle scene', h('input', { type: 'number', value: rom.u8[o + 27], onchange: e => rom.w8(o + 27, +e.target.value) }))));
  }

  // ---------- wild encounters ----------
  const WILD_KINDS = [['Grass / cave', 12], ['Surfing', 5], ['Rock Smash', 5], ['Fishing (old 0-1, good 2-4, super 5-9)', 10]];
  function wildHeaderFor(gi, mi) {
    const rom = App.rom, o = App.game.offsets.wild;
    if (o < 0) return -1;
    for (let p = o; p < o + 20 * 400; p += 20) {
      if (rom.u8[p] === 0xFF && rom.u8[p + 1] === 0xFF) break;
      if (rom.u8[p] === gi && rom.u8[p + 1] === mi) return p;
    }
    return -1;
  }
  function wildPanel() {
    const rom = App.rom, L = App.getLists(), w = wildHeaderFor(cur.gi, cur.mi);
    const box = h('details', { class: 'hdr', open: true }, h('summary', {}, 'Wild Pokémon'));
    if (w < 0) { box.append(h('p', { class: 'muted' }, 'No wild encounters on this map.')); return box; }
    WILD_KINDS.forEach(([name, n], k) => {
      const info = rom.ptr(w + 4 + k * 4); if (info < 0) return;
      const mons = rom.ptr(info + 4); if (mons < 0) return;
      const t = h('table', { class: 'grid compact' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Min'), h('th', {}, 'Max'), h('th', {}, 'Species')));
      for (let i = 0; i < n; i++) {
        const e = mons + i * 4;
        t.append(h('tr', {}, h('td', {}, i),
          h('td', {}, h('input', { type: 'number', value: rom.u8[e], style: { width: '48px' }, onchange: ev => rom.w8(e, +ev.target.value) })),
          h('td', {}, h('input', { type: 'number', value: rom.u8[e + 1], style: { width: '48px' }, onchange: ev => rom.w8(e + 1, +ev.target.value) })),
          h('td', {}, makeSelect(L.species, rom.r16(e + 2), v => rom.w16(e + 2, v)))));
      }
      box.append(h('h4', {}, name, ' — rate ', h('input', { type: 'number', value: rom.u8[info], style: { width: '52px' }, onchange: ev => rom.w8(info, +ev.target.value) })), t);
    });
    return box;
  }

  // sub-tabs: the single-map editor and the world view (js/world.js)
  let view = 'editor';
  function renderTab(root) {
    root.innerHTML = '';
    const body = h('div');
    root.append(h('div', { class: 'tabs' },
      h('button', { class: view === 'editor' ? 'sel' : '', onclick: () => { view = 'editor'; renderTab(root); } }, '🗺 Map editor'),
      h('button', { class: view === 'world' ? 'sel' : '', onclick: () => { view = 'world'; renderTab(root); } }, '🌍 World view (all connected maps)'),
      h('button', { class: view === 'tiles' ? 'sel' : '', onclick: () => { TilesetTab.open(selGroup, selMap); view = 'tiles'; renderTab(root); } }, '🧱 Blocks & tiles')), body);
    if (view === 'world') WorldTab.render(body); else if (view === 'tiles') TilesetTab.render(body); else render(body);
  }
  const setEvXYRaw = (e, x, y) => { const o = e.off + (e.kind === 'obj' ? 4 : 0), u = App.rom.u8; u[o] = x & 255; u[o + 1] = (x >> 8) & 255; u[o + 2] = y & 255; u[o + 3] = (y >> 8) & 255; };
  return { render: renderTab, reset: keep => { cur = null; tsCache.clear(); mtCache.clear(); if (typeof WorldTab !== 'undefined') WorldTab.reset(keep); },
    api: { loadMap, metatileCanvas, readEvents, evXY, setEvXY, setEvXYRaw, collisionCell, COLL_LEGEND, addEvent, deleteEvent,
      open: (g, n, sel) => { selGroup = g; selMap = n; cur = null; view = 'editor'; if (sel) pendingSel = sel; App.show('maps'); },
      openWorld: () => { view = 'world'; App.show('maps'); },
      openTiles: (g, n) => { TilesetTab.open(g, n); view = 'tiles'; App.show('maps'); },
      setMode: m => { mode = m; if (m === 'coll') showColl = true; App.show('maps'); },
      // the map editor's panels for any map (used by the world view's side panel)
      eventPanelFor(g, n, ev, redraw, rerender) { cur = loadMap(g, n); selEvent = ev ? Object.values(cur.events).flat().find(q => q.off === ev.off) || null : null; return eventPanel(redraw, rerender, { noAdd: true }); },
      selectedEvent: () => selEvent,
      headerPanelFor(g, n) { cur = loadMap(g, n); const p = headerPanel(); p.open = true; return p; },
      wildPanelFor(g, n) { cur = loadMap(g, n); return wildPanel(); } } };
})();
