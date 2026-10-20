// Blocks & tiles: the graphics maps are made of. A map uses two tilesets (primary: shared by many maps, secondary:
// the map's own). A block (metatile, 16x16) is 4 tiles below the player + 4 tiles above, each with a palette and
// flips, plus a behaviour (grass, water, door…) and whether its top layer covers the player.
// Edit tiles pixel by pixel, edit palettes, build blocks, or import a picture as new blocks.
'use strict';

const TilesetTab = (() => {
  const R = () => App.rom, G = () => App.game;
  let g0 = 3, n0 = 0, selBlock = 1, selSlot = 0, selPal = 2, selColor = 1, root = null, tileZoom = 3;
  // FireRed behaviours we can name for sure; others show their number
  const BEHAVIOURS = { 0x00: 'Normal ground', 0x02: 'Tall grass (wild Pokémon)', 0x03: 'Very tall grass', 0x08: 'Cave floor (wild Pokémon)', 0x10: 'Water (pond)', 0x11: 'Shallow water', 0x12: 'Deep water', 0x13: 'Waterfall', 0x15: 'Sea water', 0x60: 'Door / warp', 0x69: 'Door' };
  const LAYERS = [[0, 'Top layer covers the player (trees, roofs)'], [1, 'Everything below the player'], [2, 'Split (bridges)']];

  // ---------- data ----------
  function sets() {
    const m = MapsTab.api.loadMap(g0, n0);
    return { m, prim: m.prim, sec: m.sec, primOff: R().ptr(m.lay + 16), secOff: R().ptr(m.lay + 20) };
  }
  const isSec = id => id >= G().primaryMetatiles;
  const tsOf = (S, id) => isSec(id) ? S.sec : S.prim;
  const local = id => isSec(id) ? id - G().primaryMetatiles : id;
  const attrOff = (S, id) => { const ts = tsOf(S, id), base = R().ptr(ts.off + (G().isEmerald ? 16 : 20)); return base + local(id) * (G().isEmerald ? 2 : 4); };
  const metaOff = (S, id) => tsOf(S, id).meta + local(id) * 16;
  const palOf = (S, p) => p < G().primaryPals ? S.prim.pals[p] : S.sec.pals[p];
  // tile number t (0-1023) -> { ts, idx }
  const tileRef = (S, t) => t < G().primaryTiles ? { ts: S.prim, idx: t } : { ts: S.sec, idx: t - G().primaryTiles };
  function tilePixels(S, t) { const { ts, idx } = tileRef(S, t), px = new Uint8Array(64); for (let i = 0; i < 64; i++) { const b = ts.tiles[idx * 32 + (i >> 1)] || 0; px[i] = i & 1 ? b >> 4 : b & 15; } return px; }
  function setTilePixel(S, t, x, y, c) { const { ts, idx } = tileRef(S, t), o = idx * 32 + y * 4 + (x >> 1); if (o >= ts.tiles.length) return; ts.tiles[o] = x & 1 ? (ts.tiles[o] & 0x0F) | (c << 4) : (ts.tiles[o] & 0xF0) | c; ts.dirty = true; }
  // write a tileset's tiles back (compressed if it was)
  function saveTiles(ts) {
    const r = R(), comp = r.u8[ts.off], tp = r.ptr(ts.off + 4);
    if (comp) r.wptr(ts.off + 4, r.writeNew(LZ.compress(ts.tiles)));
    else r.write(tp, ts.tiles);
    ts.dirty = false;
  }
  function savePalette(ts, p) { const r = R(), pp = r.ptr(ts.off + 8); r.write(pp + p * 32, Gfx.palBytes(ts.pals[p])); }
  const refresh = () => { MapsTab.reset(true); if (root && root.isConnected) render(root); };

  // ---------- drawing ----------
  function drawTile(ctx, S, t, pal, hf, vf, dx, dy, s, transparent) {
    const px = tilePixels(S, t), rgb = pal.map(Gfx.toRGB);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const c = px[(vf ? 7 - y : y) * 8 + (hf ? 7 - x : x)]; if (!c && transparent) continue;
      ctx.fillStyle = 'rgb(' + rgb[c].join(',') + ')'; ctx.fillRect(dx + x * s, dy + y * s, s, s);
    }
  }
  function blockCanvas(S, id, s = 1, which = 'both') {
    const r = R(), cv = h('canvas', { width: 16 * s, height: 16 * s, class: 'pixel' }), ctx = cv.getContext('2d'), mo = metaOff(S, id);
    for (let layer = 0; layer < 2; layer++) {
      if (which === 'bottom' && layer === 1) continue; if (which === 'top' && layer === 0) continue;
      for (let k = 0; k < 4; k++) { const e = r.r16(mo + layer * 8 + k * 2); drawTile(ctx, S, e & 0x3FF, palOf(S, e >> 12), e & 0x400, e & 0x800, (k & 1) * 8 * s, (k >> 1) * 8 * s, s, layer === 1 || which === 'top'); }
    }
    return cv;
  }

  // ---------- UI ----------
  function render(el) {
    root = el; el.innerHTML = '';
    let S; try { S = sets(); } catch (e) { el.append(h('div', { class: 'panel err' }, e.message)); return; }
    const maps = []; G().mapGroups.forEach((ms, g) => ms.forEach((_, n) => maps.push(h('option', { value: g + '.' + n, selected: g === g0 && n === n0 }, g + '.' + n + ' ' + Game.mapName(R(), G(), R().u8[G().mapGroups[g][n] + 20])))));
    const head = h('div', { class: 'panel' }, h('div', { class: 'row wrap' }, h('b', {}, T('Graphics of the map')), h('select', { onchange: e => { [g0, n0] = e.target.value.split('.').map(Number); render(root); } }, ...maps),
      h('span', { class: 'muted' }, Tf('primary tileset {a} (shared by many maps) · secondary {b} (this area)', { a: hex(S.primOff), b: hex(S.secOff) })),
      h('button', { onclick: () => importDialog(S) }, '🖼 ' + T('Import a picture as new blocks…'))));
    el.append(head, h('div', { class: 'cols ts-cols' }, blockList(S), blockEditor(S), tileSheet(S)));
  }
  function blockList(S) {
    const g = G(), ids = []; for (let i = 0; i < S.prim.count; i++) ids.push(i); for (let i = 0; i < S.sec.count; i++) ids.push(g.primaryMetatiles + i);
    const cols = 8, cv = h('canvas', { width: cols * 16, height: Math.ceil(ids.length / cols) * 16, class: 'pixel ts-blocks' }), ctx = cv.getContext('2d');
    ids.forEach((id, k) => { ctx.drawImage(MapsTab.api.metatileCanvas(S.m, id), (k % cols) * 16, Math.floor(k / cols) * 16); if (id === selBlock) { ctx.strokeStyle = '#ff2050'; ctx.lineWidth = 2; ctx.strokeRect((k % cols) * 16 + 1, Math.floor(k / cols) * 16 + 1, 14, 14); } });
    cv.style.width = cols * 32 + 'px';
    cv.onclick = e => { const r = cv.getBoundingClientRect(), s = cv.width / r.width, k = Math.floor((e.clientY - r.top) * s / 16) * cols + Math.floor((e.clientX - r.left) * s / 16); if (ids[k] != null) { selBlock = ids[k]; render(root); } };
    return h('div', { class: 'panel ts-left' }, h('h4', {}, T('Blocks')), h('div', { class: 'muted' }, Tf('{a} shared + {b} of this area', { a: S.prim.count, b: S.sec.count })), h('div', { class: 'palscroll' }, cv));
  }
  function blockEditor(S) {
    const r = R(), id = selBlock, mo = metaOff(S, id), ao = attrOff(S, id), attr = G().isEmerald ? r.r16(ao) : r.r32(ao);
    const slotBox = (layer) => {
      const wrap = h('div', { class: 'ts-layer' }, h('div', { class: 'muted' }, layer ? T('Top (drawn over the player)') : T('Bottom')));
      const grid = h('div', { class: 'ts-slots' });
      for (let k = 0; k < 4; k++) {
        const slot = layer * 4 + k, e = r.r16(mo + slot * 2), cv = h('canvas', { width: 48, height: 48, class: 'pixel' });
        drawTile(cv.getContext('2d'), S, e & 0x3FF, palOf(S, e >> 12), e & 0x400, e & 0x800, 0, 0, 6, false);
        grid.append(h('button', { class: 'ts-slot' + (slot === selSlot ? ' sel' : ''), title: Tf('tile {t} · palette {p}', { t: e & 0x3FF, p: e >> 12 }), onclick: () => { selSlot = slot; selPal = e >> 12; render(root); } }, cv));
      }
      wrap.append(grid); return wrap;
    };
    const e = r.r16(mo + selSlot * 2), setE = v => { r.w16(mo + selSlot * 2, v); refresh(); };
    const slotProps = h('div', { class: 'ts-props' },
      h('div', {}, h('b', {}, Tf('Square {n}', { n: selSlot + 1 })), ' · ' + T('tile') + ' ' + (e & 0x3FF)),
      h('label', {}, T('Palette') + ' ', makeSelect([...Array(13)].map((_, i) => i < G().primaryPals ? T('shared') + ' ' + i : T('area') + ' ' + i), e >> 12, v => setE((e & 0x0FFF) | (v << 12)))),
      h('label', {}, h('input', { type: 'checkbox', checked: !!(e & 0x400), onchange: ev => setE(ev.target.checked ? e | 0x400 : e & ~0x400) }), ' ' + T('flip ↔')),
      h('label', {}, h('input', { type: 'checkbox', checked: !!(e & 0x800), onchange: ev => setE(ev.target.checked ? e | 0x800 : e & ~0x800) }), ' ' + T('flip ↕')),
      h('div', { class: 'muted' }, T('Click a tile on the right to put it in this square.')));
    // behaviour + layer
    const beh = attr & 0x1FF, layerType = G().isEmerald ? (attr >> 12) & 0xF : (attr >> 29) & 3;
    const setAttr = v => { if (G().isEmerald) r.w16(ao, v); else r.w32(ao, v >>> 0); refresh(); };
    const behSel = h('select', { onchange: ev => setAttr((attr & ~0x1FF) | +ev.target.value) },
      ...[...new Set([beh, ...Object.keys(BEHAVIOURS).map(Number)])].sort((a, b) => a - b).map(v => h('option', { value: v, selected: v === beh }, '0x' + v.toString(16).toUpperCase().padStart(2, '0') + ' ' + (BEHAVIOURS[v] ? T(BEHAVIOURS[v]) : ''))));
    const layerSel = makeSelect(LAYERS.map(l => T(l[1])), layerType, v => setAttr(G().isEmerald ? (attr & ~0xF000) | (v << 12) : (attr & ~(3 << 29)) | (v << 29)));
    // pixel editor for the selected tile
    const tile = e & 0x3FF, pal = palOf(S, e >> 12), s = 24, pcv = h('canvas', { width: 8 * s, height: 8 * s, class: 'pixel ts-pixels' });
    const drawP = () => { const c = pcv.getContext('2d'); drawTile(c, S, tile, pal, false, false, 0, 0, s, false); c.strokeStyle = 'rgba(0,0,0,.2)'; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, 8 * s); c.moveTo(0, i * s); c.lineTo(8 * s, i * s); c.stroke(); } };
    drawP();
    let painting = false;
    const paint = ev => { const rc = pcv.getBoundingClientRect(), x = Math.floor((ev.clientX - rc.left) / (rc.width / 8)), y = Math.floor((ev.clientY - rc.top) / (rc.height / 8)); if (x < 0 || y < 0 || x > 7 || y > 7) return;
      if (ev.buttons === 2) { selColor = tilePixels(S, tile)[y * 8 + x]; render(root); return; } setTilePixel(S, tile, x, y, selColor); drawP(); };
    pcv.onmousedown = ev => { painting = true; paint(ev); }; pcv.onmousemove = ev => { if (painting) paint(ev); }; pcv.oncontextmenu = ev => ev.preventDefault();
    window.addEventListener('mouseup', () => { if (painting) { painting = false; saveTiles(tileRef(S, tile).ts); MapsTab.reset(true); render(root); } }, { once: true });
    const swatches = h('div', { class: 'ts-swatches' }, ...pal.map((c, k) => h('button', { class: 'ts-sw' + (k === selColor ? ' sel' : ''), style: { background: Gfx.hex(c) }, title: k ? Gfx.hex(c) + ' · ' + T('double-click to change') : T('0 = see-through'),
      onclick: () => { selColor = k; render(root); }, ondblclick: () => { const inp = h('input', { type: 'color', value: Gfx.hex(c) }); inp.oninput = () => { const p = e >> 12, ts = p < G().primaryPals ? S.prim : S.sec; ts.pals[p][k] = Gfx.fromHex(inp.value); savePalette(ts, p); refresh(); }; inp.click(); } })));
    return h('div', { class: 'panel ts-mid' },
      h('div', { class: 'row' }, h('h3', {}, Tf('Block {n}', { n: '0x' + id.toString(16).toUpperCase() })), blockCanvas(S, id, 4), h('span', { class: 'muted' }, isSec(id) ? T('this area only') : T('shared by every map with this primary tileset'))),
      h('div', { class: 'row wrap' }, slotBox(0), slotBox(1)), slotProps,
      h('div', { class: 'ts-sec' }, h('h4', {}, T('Draw the tile')), h('div', { class: 'row wrap', style: { alignItems: 'flex-start' } }, pcv, h('div', {}, swatches,
        h('p', { class: 'muted' }, T('Left click paints with the chosen colour, right click picks a colour. Double-click a colour to change it (it changes everywhere the palette is used).'))))),
      h('div', { class: 'ts-sec' }, h('h4', {}, T('How the block behaves')), h('label', { class: 'field' }, T('Behaviour'), behSel), h('label', { class: 'field' }, T('Layers'), layerSel),
        h('p', { class: 'muted' }, T('Walls and blocked tiles are set per map with the Collision tool, not here.'))));
  }
  function tileSheet(S) {
    const r = R(), e = r.r16(metaOff(S, selBlock) + selSlot * 2), pal = palOf(S, e >> 12), total = G().primaryTiles + S.sec.tiles.length / 32;
    const cols = 16, rows = Math.ceil(total / cols), s = 2, cv = h('canvas', { width: cols * 8 * s, height: rows * 8 * s, class: 'pixel' }), ctx = cv.getContext('2d');
    for (let t = 0; t < total; t++) { if (t >= S.prim.tiles.length / 32 && t < G().primaryTiles) continue; drawTile(ctx, S, t, pal, false, false, (t % cols) * 8 * s, Math.floor(t / cols) * 8 * s, s, false); }
    const cur = e & 0x3FF; ctx.strokeStyle = '#ff2050'; ctx.lineWidth = 2; ctx.strokeRect((cur % cols) * 8 * s, Math.floor(cur / cols) * 8 * s, 8 * s, 8 * s);
    cv.onclick = ev => { const rc = cv.getBoundingClientRect(), k = Math.floor((ev.clientY - rc.top) / (rc.height / rows)) * cols + Math.floor((ev.clientX - rc.left) / (rc.width / cols)); if (k < total) { r.w16(metaOff(S, selBlock) + selSlot * 2, (e & 0xFC00) | k); refresh(); } };
    return h('div', { class: 'panel ts-right' }, h('h4', {}, T('Tiles')), h('div', { class: 'muted' }, Tf('shown with palette {p} · tiles {n}+ belong to this area', { p: e >> 12, n: G().primaryTiles })), h('div', { class: 'palscroll ts-sheet' }, cv));
  }

  // ---------- import a picture as new blocks (secondary tileset) ----------
  async function importDialog(S, preset) {
    let cv = preset;
    if (!cv) { const file = await ImgTools.pick('image/png,image/*'); if (!file) return; cv = await ImgTools.load(file); }
    if (cv.width % 16 || cv.height % 16) { toast(T('The picture must be a multiple of 16 pixels wide and high (one block = 16×16).'), 'err'); return; }
    const r = R(), g = G(), back = h('div', { class: 'modal-back' });
    let palSlot = g.primaryPals, ownColours = true;
    const prev = h('div');
    const run = (write) => {
      const id = ImgTools.data(cv), sec = S.sec, pal = sec.pals[palSlot].slice();
      if (ownColours) { const cols = ImgTools.medianCut(id, 15); for (let k = 0; k < 15; k++) pal[k + 1] = cols[k] != null ? cols[k] : 0; }
      const px = ImgTools.quantize(id, pal, 1), W = cv.width, H = cv.height, bw = W / 16, bh = H / 16;
      // tiles of the picture, deduplicated (with flips) against each other
      const tiles = [], map = [];
      const key = (tx, ty, hf, vf) => { let s = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += px[(ty * 8 + (vf ? 7 - y : y)) * W + tx * 8 + (hf ? 7 - x : x)].toString(16); return s; };
      const index = new Map();
      for (let ty = 0; ty < H / 8; ty++) for (let tx = 0; tx < W / 8; tx++) {
        let found = null;
        for (const [hf, vf] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const k = key(tx, ty, hf, vf); if (index.has(k)) { found = [index.get(k), hf, vf]; break; } }
        if (!found) { const k = key(tx, ty, 0, 0); index.set(k, tiles.length); tiles.push(k); found = [tiles.length - 1, 0, 0]; }
        map.push(found);
      }
      // free tiles in the secondary tileset: not used by any of its blocks (and not tile 0)
      const used = new Set([0]), secTiles = sec.tiles.length / 32;
      for (let b = 0; b < sec.count; b++) for (let k = 0; k < 8; k++) { const e = r.r16(sec.meta + b * 16 + k * 2) & 0x3FF; if (e >= g.primaryTiles) used.add(e - g.primaryTiles); }
      const maxTiles = 1024 - g.primaryTiles, free = []; for (let t = 1; t < maxTiles && free.length < tiles.length; t++) if (!used.has(t)) free.push(t);
      const needBlocks = bw * bh, maxBlocks = 1024 - g.primaryMetatiles;
      const emptyBlocks = []; for (let b = 1; b < sec.count && emptyBlocks.length < needBlocks; b++) { let z = true; for (let k = 0; k < 8; k++) if (r.r16(sec.meta + b * 16 + k * 2)) { z = false; break; } if (z) emptyBlocks.push(b); }
      const newBlocks = needBlocks - emptyBlocks.length;
      const ok = free.length >= tiles.length && sec.count + newBlocks <= maxBlocks;
      prev.innerHTML = '';
      prev.append(ImgTools.indexedCanvas(px, W, H, pal, Math.max(1, Math.floor(256 / Math.max(W, H)))),
        h('p', {}, Tf('{t} tiles needed ({f} free) · {b} blocks ({e} empty ones reused, {n} new)', { t: tiles.length, f: free.length, b: needBlocks, e: Math.min(emptyBlocks.length, needBlocks), n: Math.max(0, newBlocks) })),
        ok ? '' : h('p', { class: 'err' }, T('Not enough free room in this area\'s tileset for this picture. Use a smaller picture or fewer different tiles.')));
      if (!write || !ok) return null;
      // write tiles
      const need = Math.max(secTiles, free[free.length - 1] + 1 || 0), buf = new Uint8Array(need * 32); buf.set(sec.tiles.subarray(0, Math.min(sec.tiles.length, buf.length)));
      tiles.forEach((k, i) => { const t = free[i]; for (let p = 0; p < 64; p++) { const c = parseInt(k[p], 16), o = t * 32 + (p >> 1); buf[o] = p & 1 ? (buf[o] & 0x0F) | (c << 4) : (buf[o] & 0xF0) | c; } });
      sec.tiles = buf; saveTiles(sec);
      if (ownColours) { sec.pals[palSlot] = pal; savePalette(sec, palSlot); }
      // blocks: reuse empty ones, then grow the block + attribute tables
      let ids = emptyBlocks.slice(0, needBlocks);
      if (newBlocks > 0) {
        const metaN = new Uint8Array((sec.count + newBlocks) * 16); metaN.set(r.u8.subarray(sec.meta, sec.meta + sec.count * 16));
        const aw = g.isEmerald ? 2 : 4, ab = r.ptr(sec.off + (g.isEmerald ? 16 : 20)), attrN = new Uint8Array((sec.count + newBlocks) * aw); attrN.set(r.u8.subarray(ab, ab + sec.count * aw));
        const mOff = r.writeNew(metaN), aOff = r.writeNew(attrN);
        r.wptr(sec.off + 12, mOff); r.wptr(sec.off + (g.isEmerald ? 16 : 20), aOff);
        for (let k = 0; k < newBlocks; k++) ids.push(sec.count + k);
        sec.meta = mOff; sec.count += newBlocks;
      }
      const metaBase = r.ptr(sec.off + 12);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const b = ids[by * bw + bx], entries = [];
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const [ti, hf, vf] = map[(by * 2 + dy) * (W / 8) + bx * 2 + dx]; entries.push((free[ti] + g.primaryTiles) | (hf << 10) | (vf << 11) | (palSlot << 12)); }
        const arr = new Uint8Array(16); entries.forEach((v, k) => { arr[k * 2] = v & 255; arr[k * 2 + 1] = v >> 8; }); r.write(metaBase + b * 16, arr);   // bottom layer = the picture, top layer empty
      }
      return ids.map(b => b + g.primaryMetatiles);
    };
    const palSel = makeSelect([...Array(13)].map((_, i) => i < g.primaryPals ? '—' : T('area palette') + ' ' + i), palSlot, v => { if (v < g.primaryPals) return; palSlot = v; run(false); });
    back.append(h('div', { class: 'panel modal', style: { maxWidth: '640px' } }, h('h3', {}, '🖼 ' + T('Import a picture as new blocks')),
      h('p', { class: 'muted' }, T('Each 16×16 square of the picture becomes a block of this area (the secondary tileset). Identical squares share tiles.')),
      h('label', {}, T('Palette') + ' ', palSel), h('label', {}, h('input', { type: 'checkbox', checked: ownColours, onchange: e => { ownColours = e.target.checked; run(false); } }), ' ' + T('Use the picture\'s own colours (replaces this palette: blocks that use it change colour too)')),
      prev, h('div', { class: 'row ask-btns' }, h('button', { class: 'primary', onclick: () => { try { const ids = run(true); if (!ids) return; back.remove(); selBlock = ids[0]; toast(Tf('{n} new blocks: {list}. Paint with them in the map editor.', { n: ids.length, list: ids.map(b => '0x' + b.toString(16).toUpperCase()).join(', ') })); refresh(); } catch (x) { console.error(x); toast(x.message, 'err'); } } }, T('Import')),
        h('button', { onclick: () => back.remove() }, T('Cancel')))));
    document.body.append(back); run(false);
  }
  return { render, open: (g, n) => { g0 = g; n0 = n; }, _import: cv => importDialog(sets(), cv) };
})();
