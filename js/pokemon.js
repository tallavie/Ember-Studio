// Pokémon editor: one card per Pokémon (picture, name, stat bars) with tabs - Basics, Moves, Evolutions, Pokédex,
// Pictures, Where it's found, Used in the game - plus helpers: start from a template, stat balance, warnings.
// "Adding" a Pokémon = turning an existing (or unused) one into a new one. Starters and gift Pokémon too.
'use strict';

const PokemonTab = (() => {
  let sel = 1, tab = 'basics', advanced = false, filter = '', view = 'mon', picKind = 'front', picShiny = false;
  const GROWTH = ['Medium Fast', 'Erratic', 'Fluctuating', 'Medium Slow', 'Fast', 'Slow'];
  const EGG = ['(none)', 'Monster', 'Water 1', 'Bug', 'Flying', 'Field', 'Fairy', 'Grass', 'Human-Like', 'Water 3', 'Mineral', 'Amorphous', 'Water 2', 'Ditto', 'Dragon', 'Undiscovered'];
  const COLORS = ['Red', 'Blue', 'Yellow', 'Green', 'Black', 'Brown', 'Purple', 'Gray', 'White', 'Pink'];
  const STATS = ['HP', 'Attack', 'Defense', 'Speed', 'Sp. Atk', 'Sp. Def'];
  const TYPE_COLORS = ['#a8a878', '#c03028', '#a890f0', '#a040a0', '#e0c068', '#b8a038', '#a8b820', '#705898', '#b8b8d0', '#68a090', '#f08030', '#6890f0', '#78c850', '#f8d030', '#f85888', '#98d8d8', '#7038f8', '#705848'];
  // evolution methods as a sentence, and what the parameter means
  const EVO = [[4, 'at level', 'level'], [7, 'with the item', 'item'], [5, 'when traded', null], [6, 'when traded holding', 'item'], [1, 'with high friendship', null],
    [2, 'with high friendship (day)', null], [3, 'with high friendship (night)', null], [8, 'at level, if Attack > Defense', 'level'], [9, 'at level, if Attack = Defense', 'level'],
    [10, 'at level, if Attack < Defense', 'level'], [11, 'at level (Silcoon)', 'level'], [12, 'at level (Cascoon)', 'level'], [13, 'at level (Ninjask)', 'level'], [14, 'at level (Shedinja)', 'level'], [15, 'with high Beauty', 'value']];
  const rom = () => App.rom, O = () => App.game.offsets, L = () => App.getLists();
  const N = () => App.game.speciesCount;
  const valid = sp => sp > 0 && sp < N() && !(sp >= 252 && sp <= 276);       // 252-276: the game's unused "?" slots

  // ---------- data ----------
  const base = sp => O().baseStats + sp * 28;
  const total = sp => { let t = 0; for (let i = 0; i < 6; i++) t += rom().u8[base(sp) + i]; return t; };
  function learnset(sp) {
    const r = rom(), p = r.ptr(O().learnsets + sp * 4), out = [];
    if (p < 0) return out;
    for (let q = p; r.r16(q) !== 0xFFFF && out.length < 64; q += 2) out.push({ lvl: r.r16(q) >> 9, move: r.r16(q) & 0x1FF });
    return out;
  }
  function writeLearnset(sp, list) {
    const r = rom(), tbl = O().learnsets + sp * 4, old = r.ptr(tbl), oldLen = learnset(sp).length * 2 + 2;
    list = [...list].sort((a, b) => a.lvl - b.lvl);
    const data = new Uint8Array(list.length * 2 + 2);
    list.forEach((m, i) => { const v = (m.lvl << 9) | m.move; data[i * 2] = v & 255; data[i * 2 + 1] = v >> 8; });
    data[list.length * 2] = 0xFF; data[list.length * 2 + 1] = 0xFF;
    let shared = false;
    for (let i = 0; i < N(); i++) if (i !== sp && r.ptr(O().learnsets + i * 4) === old) shared = true;
    if (shared || data.length > oldLen) r.wptr(tbl, r.writeNew(data)); else r.replaceData(old, oldLen, data, [tbl]);
  }
  function evolutions(sp) {
    const r = rom(), out = [];
    for (let i = 0; i < 5; i++) { const e = O().evolutions + sp * 40 + i * 8; if (r.r16(e)) out.push({ method: r.r16(e), param: r.r16(e + 2), target: r.r16(e + 4) }); }
    return out;
  }
  function writeEvolutions(sp, list) {
    const b = new Uint8Array(40), dv = new DataView(b.buffer);
    list.slice(0, 5).forEach((e, i) => { dv.setUint16(i * 8, e.method, true); dv.setUint16(i * 8 + 2, e.param, true); dv.setUint16(i * 8 + 4, e.target, true); });
    rom().write(O().evolutions + sp * 40, b);
  }
  let preCache = null;
  const preEvo = sp => {
    if (!preCache) { preCache = new Map(); for (let s = 1; s < N(); s++) for (const e of evolutions(s)) if (!preCache.has(e.target)) preCache.set(e.target, s); }
    return preCache.get(sp) || 0;
  };
  const tmBit = (sp, i) => O().tmCompat >= 0 && (rom().u8[O().tmCompat + sp * 8 + (i >> 3)] >> (i & 7)) & 1;
  const tmMove = i => rom().r16(O().tmMoves + i * 2);
  const moveInfo = m => O().moveData < 0 ? null : { power: rom().u8[O().moveData + m * 12 + 1], type: rom().u8[O().moveData + m * 12 + 2], acc: rom().u8[O().moveData + m * 12 + 3], pp: rom().u8[O().moveData + m * 12 + 4] };
  const dexNum = sp => O().dexNums >= 0 && sp > 0 ? rom().r16(O().dexNums + (sp - 1) * 2) : 0;
  const dexEntry = sp => { const n = dexNum(sp); return n && O().dexEntries >= 0 ? O().dexEntries + n * 36 : -1; };
  function setName(sp, text) {
    const b = Charmap.encode(text, { rtl: App.settings.rtl });
    if (b.length > 11) throw new Error('The name is too long (max 10 characters)');
    const pad = new Uint8Array(11).fill(0xFF); pad.set(b); rom().write(O().speciesNames + sp * 11, pad); App.lists = null;
  }
  // stage = how many Pokémon come before it; final = nothing after it
  function stageOf(sp) { let s = 0, p = sp; for (let k = 0; k < 3; k++) { p = preEvo(p); if (!p) break; s++; } return { stage: Math.min(2, s), final: !evolutions(sp).length }; }
  let avgCache = null;
  function averages() {
    if (avgCache) return avgCache;
    const groups = {};
    for (let s = 1; s < N(); s++) if (valid(s)) { const st = stageOf(s), k = st.stage + (st.final ? 'f' : ''); (groups[k] = groups[k] || []).push(total(s)); }
    avgCache = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
    return avgCache;
  }
  // trainers whose team has a species: [{i, name, level}]
  function trainersWith(sp) {
    const r = rom(), t = O().trainers, out = [];
    if (t < 0) return out;
    for (let i = 0; i < App.game.trainerCount; i++) {
      const e = t + i * 40, size = (r.u8[e] & 1) ? 16 : 8, n = r.u8[e + 32], p = r.ptr(e + 36);
      if (p < 0 || n > 6) continue;
      for (let k = 0; k < n; k++) if (r.r16(p + k * size + 4) === sp) out.push({ i, name: Charmap.decode(r.u8, e + 4, 12).text, level: r.r16(p + k * size + 2) });
    }
    return out;
  }

  // ---------- pictures ----------
  const picture = (sp, kind, shiny) => Graphics.monInfo(sp, kind, shiny);
  function saveLZ(entry, raw, tableBase) {
    const r = rom(), old = r.ptr(entry), d = old >= 0 ? LZ.decompress(r.u8, old) : null, data = LZ.compress(raw);
    let shared = false; for (let i = 0; i < N(); i++) { const e = tableBase + i * 8; if (e !== entry && r.ptr(e) === old) { shared = true; break; } }
    if (shared || !d) r.wptr(entry, r.writeNew(data)); else r.replaceData(old, d.srcLen, data, [entry]);
  }
  function savePicture(sp, kind, px) { const t = kind === 'front' ? O().frontPics : O().backPics; saveLZ(t + sp * 8, Gfx.pixelsToTiles(px, 64, 64), t); }
  function savePalette(sp, shiny, pal) { const t = shiny ? O().shinyPals : O().pals; saveLZ(t + sp * 8, Gfx.palBytes(pal), t); }
  function icon(sp) {
    const o = O(), r = rom(); if (o.iconTable < 0) return null;
    const p = r.ptr(o.iconTable + sp * 4); if (p < 0) return null;
    const idx = r.u8[o.iconPalIdx + sp], pal = Gfx.readPal(r.u8, o.iconPals + Math.min(2, idx) * 32);
    return { px: Gfx.tilesToPixels(r.u8.subarray(p, p + 0x400), 32, 64), pal, idx, p };
  }
  function iconCanvas(sp, size = 32) {
    const ic = icon(sp), c = h('canvas', { class: 'pixel', width: 32, height: 32, style: { width: size + 'px', height: size + 'px' } });
    if (ic) c.getContext('2d').putImageData(Gfx.toImageData(ic.px.subarray(0, 32 * 32), 32, 32, ic.pal, true), 0, 0);
    return c;
  }
  // image file -> size x size indexed picture: background removed, fitted bottom-centre, 15 colours + transparent
  // (or mapped to fixedPal)
  async function convertImage(file, size, fixedPal) {
    const bmp = await createImageBitmap(file);
    const src = h('canvas', { width: bmp.width, height: bmp.height }), sc = src.getContext('2d'); sc.drawImage(bmp, 0, 0);
    const id = sc.getImageData(0, 0, bmp.width, bmp.height), d = id.data, W = bmp.width, H = bmp.height;
    let hasAlpha = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 128) { hasAlpha = true; break; }
    if (!hasAlpha) {                                                   // a plain background: flood it from the corners
      const bg = [d[0], d[1], d[2]], seen = new Uint8Array(W * H), st = [0, W - 1, (H - 1) * W, H * W - 1];
      const near = i => Math.abs(d[i * 4] - bg[0]) + Math.abs(d[i * 4 + 1] - bg[1]) + Math.abs(d[i * 4 + 2] - bg[2]) < 48;
      while (st.length) {
        const i = st.pop(); if (seen[i] || !near(i)) continue; seen[i] = 1; d[i * 4 + 3] = 0;
        const x = i % W, y = (i / W) | 0;
        if (x > 0) st.push(i - 1); if (x < W - 1) st.push(i + 1); if (y > 0) st.push(i - W); if (y < H - 1) st.push(i + W);
      }
      sc.putImageData(id, 0, 0);
    }
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 < 0) throw new Error('The image is empty');
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, fit = Math.min((size - 2) / bw, (size - 2) / bh), tw = Math.max(1, Math.round(bw * fit)), th = Math.max(1, Math.round(bh * fit));
    const out = h('canvas', { width: size, height: size }), oc = out.getContext('2d');
    oc.imageSmoothingEnabled = fit < 1; oc.drawImage(src, x0, y0, bw, bh, Math.floor((size - tw) / 2), size - 1 - th, tw, th);
    const od = oc.getImageData(0, 0, size, size).data, px = new Uint8Array(size * size);
    let pal = fixedPal;
    if (!pal) {                                                        // median cut to 15 colours
      const cols = []; for (let i = 0; i < size * size; i++) if (od[i * 4 + 3] >= 128) cols.push([od[i * 4] & 0xF8, od[i * 4 + 1] & 0xF8, od[i * 4 + 2] & 0xF8]);
      let boxes = [cols];
      while (boxes.length < 15) {
        let bi = -1, br = 0, bc = 0;
        boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (const p of b) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); } if (hi - lo > br) { br = hi - lo; bi = i; bc = c; } } });
        if (bi < 0 || br === 0) break;
        const b = boxes[bi].sort((p, q) => p[bc] - q[bc]), m = b.length >> 1; boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
      }
      pal = [0x7FFF, ...boxes.map(b => { const a = [0, 0, 0]; for (const p of b) for (let c = 0; c < 3; c++) a[c] += p[c]; return Gfx.fromRGB(...a.map(v => Math.round(v / b.length))); })];
      while (pal.length < 16) pal.push(0);
    }
    const rgb = pal.map(Gfx.toRGB);
    for (let i = 0; i < size * size; i++) {
      if (od[i * 4 + 3] < 128) { px[i] = 0; continue; }
      let best = 1, bd = 1e9;
      for (let k = 1; k < 16; k++) { const dd = (rgb[k][0] - od[i * 4]) ** 2 + (rgb[k][1] - od[i * 4 + 1]) ** 2 + (rgb[k][2] - od[i * 4 + 2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
      px[i] = best;
    }
    return { px, pal };
  }
  const remap = (px, fromPal, toPal) => {
    const a = fromPal.map(Gfx.toRGB), b = toPal.map(Gfx.toRGB);
    return px.map(v => { if (!v) return 0; let best = 1, bd = 1e9; for (let k = 1; k < 16; k++) { const dd = (a[v][0] - b[k][0]) ** 2 + (a[v][1] - b[k][1]) ** 2 + (a[v][2] - b[k][2]) ** 2; if (dd < bd) { bd = dd; best = k; } } return best; });
  };
  function hueShift(pal, deg) {
    return pal.map((c, i) => {
      if (!i) return c;
      const [r, g, b] = Gfx.toRGB(c).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
      if (!dl) return c;
      const s = dl / (1 - Math.abs(2 * l - 1));
      let hh = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; hh = ((hh * 60 + deg) % 360 + 360) % 360;
      const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((hh / 60) % 2 - 1)), m = l - C / 2;
      const [r1, g1, b1] = hh < 60 ? [C, X, 0] : hh < 120 ? [X, C, 0] : hh < 180 ? [0, C, X] : hh < 240 ? [0, X, C] : hh < 300 ? [X, 0, C] : [C, 0, X];
      return Gfx.fromRGB(...[r1, g1, b1].map(v => Math.max(0, Math.min(255, Math.round((v + m) * 255)))));
    });
  }
  function spriteCanvas(px, pal, w = 64, h0 = 64, scale = 2) {
    const c = h('canvas', { class: 'pixel', width: w, height: h0, style: { width: w * scale + 'px', height: h0 * scale + 'px' } });
    c.getContext('2d').putImageData(Gfx.toImageData(px.subarray(0, w * h0), w, h0, pal, true), 0, 0); return c;
  }
  function battlePreview(sp) {
    const c = h('canvas', { class: 'pixel', width: 240, height: 160, style: { width: '360px', height: '240px', borderRadius: '6px' } }), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, '#f8f8d8'); g.addColorStop(0.55, '#d8f0b0'); g.addColorStop(1, '#a8d880'); x.fillStyle = g; x.fillRect(0, 0, 240, 160);
    x.fillStyle = '#88c070'; x.beginPath(); x.ellipse(176, 70, 52, 12, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(64, 124, 60, 14, 0, 0, 7); x.fill();
    const draw = (m, dx, dy) => { if (!m) return; const t = h('canvas', { width: 64, height: 64 }); t.getContext('2d').putImageData(Gfx.toImageData(m.px.subarray(0, 4096), 64, 64, m.pal, true), 0, 0); x.drawImage(t, dx, dy); };
    draw(picture(sp, 'front', picShiny), 144, 8); draw(picture(sp, 'back', picShiny), 32, 64);
    x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(8, 10, 100, 26); x.fillStyle = '#333'; x.font = 'bold 10px sans-serif'; x.fillText(L().species[sp] || '', 14, 22); x.font = '9px sans-serif'; x.fillText('Lv50', 78, 22);
    x.fillStyle = '#48c048'; x.fillRect(14, 27, 88, 4);
    return c;
  }

  // ---------- warnings ----------
  function warnings(sp) {
    const w = [], ls = learnset(sp), ev = evolutions(sp);
    if (!ls.length || ls[0].lvl > 1) w.push('No move at level 1: a Pokémon caught or given at a low level may know no moves.');
    if (ls.filter(m => m.lvl === 1).length > 4) w.push('More than 4 moves at level 1: only the last 4 are kept.');
    const found = Wild.whereFound(sp);
    for (const e of ev) {
      if (e.target === sp) w.push('Evolves into itself.');
      if (![4, 8, 9, 10, 11, 12, 13, 14].includes(e.method)) continue;
      const high = found.filter(f => f.min > e.param);
      if (high.length) w.push('Evolves at level ' + e.param + ' but appears in the wild from level ' + Math.min(...high.map(f => f.min)) + ' (' + areaName(high[0].g, high[0].n) + ').');
    }
    const st = stageOf(sp), avg = averages()[st.stage + (st.final ? 'f' : '')], t = total(sp);
    if (avg && t > avg + 130) w.push('Stat total ' + t + ' is much higher than similar Pokémon (≈' + avg + ').');
    if (avg && t < avg - 130) w.push('Stat total ' + t + ' is much lower than similar Pokémon (≈' + avg + ').');
    return w;
  }
  const areaName = (g, n) => Game.mapName(rom(), App.game, rom().u8[App.game.mapGroups[g][n] + 20]) + ' ' + g + '.' + n;

  // ---------- UI ----------
  function render(root) {
    root.innerHTML = '';
    if (O().baseStats < 0) { root.append(h('div', { class: 'panel' }, 'Base stats table not found in this ROM.')); return; }
    avgCache = null; preCache = null;
    root.append(h('div', { class: 'cols mon2' }, listPanel(root), view === 'gifts' ? giftsPanel(root) : view === 'legends' ? Legends.panel(root, () => render(root)) : card(root)));
  }
  function listPanel(root) {
    const box = h('div', { class: 'monrows' });
    const fill = () => {
      box.innerHTML = '';
      const q = filter.trim().toLowerCase();
      for (let s = 1; s < N(); s++) {
        const name = L().species[s] || '';
        if (q && !name.toLowerCase().includes(q) && String(s) !== q && String(dexNum(s)) !== q) continue;
        box.append(h('div', { class: 'monrow' + (s === sel && view === 'mon' ? ' sel' : '') + (valid(s) ? '' : ' unused'), onclick: () => { sel = s; view = 'mon'; render(root); } },
          iconCanvas(s, 32), h('span', { class: 'muted' }, String(s)), h('span', {}, valid(s) ? name : 'unused slot ' + s)));
      }
    };
    fill();
    const inp = h('input', { type: 'search', placeholder: 'search name / number', value: filter, oninput: e => { filter = e.target.value; fill(); } });
    setTimeout(() => { const r = box.querySelector('.sel'); if (r) r.scrollIntoView({ block: 'center' }); }, 0);
    return h('div', { class: 'panel monlistp' },
      h('button', { class: view === 'gifts' ? 'sel' : '', style: { width: '100%', marginBottom: '6px' }, onclick: () => { view = 'gifts'; render(root); } }, '🎁 Starters & gift Pokémon'),
      h('button', { class: view === 'legends' ? 'sel' : '', style: { width: '100%', marginBottom: '6px' }, onclick: () => { view = 'legends'; render(root); } }, '🐉 ' + T('Legendaries in the world')),
      h('button', { style: { width: '100%', marginBottom: '6px' }, title: 'for build.py: data/kachol_lavan/pokemon_edits.json', onclick: () => PokeExport.exportFile() }, '💾 Export Pokémon changes'),
      inp, box);
  }
  function card(root) {
    const sp = sel, r = rom(), b = base(sp), rerender = () => render(root);
    const nameIn = h('input', { value: L().species[sp] || '', dir: 'auto', maxlength: 10, style: { fontSize: '18px', width: '180px' } });
    const count = h('span', { class: 'muted' }), pv = h('span');
    const upd = () => { count.textContent = nameIn.value.length + '/10'; pv.innerHTML = ''; try { pv.append(TextTab.preview(Charmap.encode(nameIn.value || ' ', { rtl: App.settings.rtl }), App.game.dialogueFont, 1)); } catch (e) { } };
    nameIn.oninput = upd; nameIn.onchange = () => { try { setName(sp, nameIn.value); toast('Name saved'); rerender(); } catch (e) { toast(e.message, 'err'); } }; upd();
    const types = h('div', { class: 'row' }, ...[6, 7].filter((k, i) => i === 0 || r.u8[b + 7] !== r.u8[b + 6]).map(k => h('span', { class: 'typebadge', style: { background: TYPE_COLORS[r.u8[b + k]] || '#888' } }, L().types[r.u8[b + k]] || '?')));
    const st = stageOf(sp), avg = averages()[st.stage + (st.final ? 'f' : '')], t = total(sp);
    const bars = h('div', { class: 'statbars' }, ...STATS.map((n, i) => {
      const v = r.u8[b + i];
      return h('div', { class: 'statbar' }, h('span', {}, n), h('b', {}, String(v)), h('div', { class: 'bar' }, h('div', { style: { width: Math.min(100, v / 1.8) + '%', background: v < 50 ? '#f08030' : v < 90 ? '#f8d030' : v < 120 ? '#78c850' : '#3fa8e0' } })));
    }), h('div', { class: 'statbar' }, h('span', {}, 'Total'), h('b', {}, String(t)), h('span', { class: avg && Math.abs(t - avg) > 130 ? 'warn' : 'muted', style: { fontSize: '12px' } },
      avg ? '≈' + avg + ' is usual for ' + ['a first stage', 'a second stage', 'a third stage'][st.stage] + (st.final ? ' that does not evolve' : '') : '')));
    const front = picture(sp, 'front', false);
    const head = h('div', { class: 'panel moncard' },
      h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '16px' } },
        h('div', { class: 'monpic' }, front ? spriteCanvas(front.px, front.pal, 64, 64, 2) : ''),
        h('div', { style: { flex: 1 } },
          h('div', { class: 'row wrap' }, h('span', { class: 'muted', style: { fontSize: '18px' } }, '#' + sp + (dexNum(sp) ? ' · Pokédex ' + dexNum(sp) : '')), nameIn, count, pv),
          types, bars),
        h('div', { style: { gap: '6px', display: 'flex', flexDirection: 'column' } },
          h('button', { onclick: () => templateDialog(sp, rerender) }, '📋 Start from template…'),
          h('button', { onclick: () => Tester.battle(sp) }, '🎮 Test in battle'),
          h('label', {}, h('input', { type: 'checkbox', checked: advanced, onchange: e => { advanced = e.target.checked; rerender(); } }), ' Advanced fields'))));
    const ws = warnings(sp);
    const warnBox = ws.length ? h('div', { class: 'panel warn' }, h('b', {}, '⚠ Worth checking'), h('ul', {}, ...ws.map(x => h('li', {}, x)))) : '';
    const TABS = [['basics', 'Basics'], ['moves', 'Moves'], ['evo', 'Evolutions'], ['dex', 'Pokédex'], ['pics', 'Pictures'], ['where', 'Where it\'s found'], ['usage', 'Used in the game']];
    const tabs = h('div', { class: 'tabs' }, ...TABS.map(([k, l]) => h('button', { class: tab === k ? 'sel' : '', onclick: () => { tab = k; rerender(); } }, l)));
    const body = { basics: basicsTab, moves: movesTab, evo: evoTab, dex: dexTab, pics: picsTab, where: whereTab, usage: usageTab }[tab](sp, rerender);
    return h('div', { style: { flex: 1, minWidth: 0 } }, head, warnBox, h('div', { class: 'panel' }, tabs, body));
  }

  // --- Basics
  function basicsTab(sp, rerender) {
    const r = rom(), b = base(sp);
    const num = (off, label, max = 255) => h('label', { class: 'field' }, label, h('input', { type: 'number', min: 0, max, value: max > 255 ? r.r16(b + off) : r.u8[b + off],
      onchange: e => { const v = Math.max(0, Math.min(max, +e.target.value)); max > 255 ? r.w16(b + off, v) : r.w8(b + off, v); rerender(); } }));
    const pick = (off, opts, label, wide = false) => h('label', { class: 'field' }, label, makeSelect(opts, wide ? r.r16(b + off) : r.u8[b + off], v => { wide ? r.w16(b + off, v) : r.w8(b + off, v); rerender(); }));
    const gr = r.u8[b + 16];
    const genderSel = h('select', { onchange: e => r.w8(b + 16, +e.target.value) }, ...[[0, '100% male'], [31, '87.5% male'], [63, '75% male'], [127, '50 / 50'], [191, '75% female'], [223, '87.5% female'], [254, '100% female'], [255, 'Genderless']].map(([v, n]) => h('option', { value: v, selected: v === gr }, n)));
    const ev = r.r16(b + 10);
    const out = h('div', {},
      h('h4', {}, 'Stats'), h('div', { class: 'fields' }, ...STATS.map((n, i) => num(i, n))),
      h('h4', {}, 'Types & abilities'), h('div', { class: 'fields' }, pick(6, L().types, 'Type 1'), pick(7, L().types, 'Type 2 (same = single type)'), pick(22, L().abilities, 'Ability 1'), pick(23, L().abilities, 'Ability 2')),
      h('h4', {}, 'Catching'), h('div', { class: 'fields' }, h('label', { class: 'field' }, 'Catch rate', h('input', { type: 'number', min: 1, max: 255, value: r.u8[b + 8], onchange: e => r.w8(b + 8, +e.target.value) }),
        h('span', { class: 'muted' }, '3 = legendary · 45 = starter · 190 = common · 255 = very easy'))));
    if (advanced) out.append(h('h4', {}, 'Advanced'), h('div', { class: 'fields' },
      num(9, 'Base EXP'), num(18, 'Base friendship'), num(17, 'Egg cycles'), h('label', { class: 'field' }, 'Gender', genderSel),
      pick(19, GROWTH, 'Growth rate'), pick(20, EGG, 'Egg group 1'), pick(21, EGG, 'Egg group 2'),
      pick(12, L().items, 'Wild held item (50%)', true), pick(14, L().items, 'Wild held item (5%)', true), num(24, 'Safari flee rate'),
      h('label', { class: 'field' }, 'Body colour', makeSelect(COLORS, r.u8[b + 25] & 0x7F, v => r.w8(b + 25, (r.u8[b + 25] & 0x80) | v))),
      ...STATS.map((n, i) => h('label', { class: 'field' }, n + ' EV given', h('input', { type: 'number', min: 0, max: 3, value: (ev >> (i * 2)) & 3,
        onchange: e => { const cur = r.r16(b + 10) & ~(3 << (i * 2)); r.w16(b + 10, cur | ((Math.min(3, +e.target.value) & 3) << (i * 2))); } })))));
    return out;
  }

  // --- Moves: level list with search, TM / HM grid, copy from another Pokémon
  function moveLabel(m) { const i = moveInfo(m), n = L().moves[m] || '#' + m; return i ? n + ' · ' + (L().types[i.type] || '') + (i.power > 1 ? ' · power ' + i.power : '') : n; }
  function movePicker(value, onPick) {
    const id = 'mv' + Math.random().toString(36).slice(2);
    const list = h('datalist', { id }, ...L().moves.map((n, i) => i ? h('option', { value: i + ' ' + n }) : null));
    const inp = h('input', { list: id, value: value ? value + ' ' + (L().moves[value] || '') : '', placeholder: 'type to search…', style: { width: '190px' },
      onchange: e => { const m = parseInt(e.target.value); if (m > 0 && m < L().moves.length) onPick(m); else toast('Pick a move from the list', 'err'); } });
    return h('span', {}, inp, list);
  }
  function movesTab(sp, rerender) {
    const ls = learnset(sp), out = h('div');
    const save = list => { writeLearnset(sp, list); rerender(); };
    const tb = h('tbody');
    ls.forEach((m, i) => tb.append(h('tr', {},
      h('td', {}, h('input', { type: 'number', min: 1, max: 100, value: m.lvl, style: { width: '56px' }, onchange: e => { ls[i].lvl = Math.max(1, Math.min(100, +e.target.value)); save(ls); } })),
      h('td', {}, movePicker(m.move, v => { ls[i].move = v; save(ls); })),
      h('td', { class: 'muted' }, moveLabel(m.move)),
      h('td', {}, h('button', { class: 'mu-x', onclick: () => { ls.splice(i, 1); save(ls); } }, '✕')))));
    const copySel = makeSelect(L().species, 0, async v => {
      if (!v || !(await ask(Tf('Replace the moves of {a} with those of {b}?', { a: L().species[sp], b: L().species[v] })))) return;
      writeLearnset(sp, learnset(v)); if (O().tmCompat >= 0) rom().write(O().tmCompat + sp * 8, rom().u8.slice(O().tmCompat + v * 8, O().tmCompat + v * 8 + 8)); rerender();
    });
    copySel.firstChild.textContent = 'copy all moves from…';
    const lv = h('input', { type: 'number', min: 1, max: 100, value: ls.length ? Math.min(100, ls[ls.length - 1].lvl + 4) : 1, style: { width: '56px' } });
    out.append(h('div', { class: 'row wrap' }, h('h4', {}, 'Learned by level'), copySel),
      h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, h('th', {}, 'Level'), h('th', {}, 'Move'), h('th', {}, ''), h('th', {}, ''))), tb),
      h('div', { class: 'row', style: { marginTop: '6px' } }, 'Add at level ', lv, ' ', movePicker(0, v => { ls.push({ lvl: +lv.value, move: v }); save(ls); })));
    if (O().tmCompat >= 0 && O().tmMoves >= 0) {
      const grid = h('div', { class: 'tmgrid' });
      for (let i = 0; i < 58; i++) {
        const m = tmMove(i), on = tmBit(sp, i), info = moveInfo(m);
        grid.append(h('label', { class: 'tm' + (on ? ' on' : ''), style: { borderLeftColor: info ? TYPE_COLORS[info.type] : '#888' } },
          h('input', { type: 'checkbox', checked: !!on, onchange: e => { const a = O().tmCompat + sp * 8 + (i >> 3); rom().w8(a, e.target.checked ? rom().u8[a] | (1 << (i & 7)) : rom().u8[a] & ~(1 << (i & 7))); } }),
          ' ' + (i < 50 ? 'TM' + String(i + 1).padStart(2, '0') : 'HM' + String(i - 49).padStart(2, '0')) + ' ' + (L().moves[m] || '')));
      }
      out.append(h('div', { class: 'row', style: { marginTop: '10px' } }, h('h4', {}, 'TM / HM it can learn'),
        h('button', { onclick: () => { const a = new Uint8Array(8).fill(0xFF); a[7] = 0x03; rom().write(O().tmCompat + sp * 8, a); rerender(); } }, 'All'),
        h('button', { onclick: () => { rom().write(O().tmCompat + sp * 8, new Uint8Array(8)); rerender(); } }, 'None')), grid);
    }
    return out;
  }

  // --- Evolutions as sentences
  function describe(e) { if (!e) return ''; const m = EVO.find(x => x[0] === e.method); return (m ? m[1] : 'method ' + e.method) + (m && m[2] === 'level' ? ' ' + e.param : m && m[2] === 'item' ? ' ' + (L().items[e.param] || e.param) : ''); }
  function evoTab(sp, rerender) {
    const list = evolutions(sp), out = h('div'), save = () => { writeEvolutions(sp, list); rerender(); };
    const pre = preEvo(sp);
    out.append(h('p', { class: 'muted' }, pre ? 'Evolves from ' + L().species[pre] + ' (' + describe(evolutions(pre).find(e => e.target === sp)) + ').' : 'Does not evolve from another Pokémon.'));
    list.forEach((e, i) => {
      const m = EVO.find(x => x[0] === e.method) || [e.method, 'method ' + e.method, 'value'];
      const methodSel = h('select', { onchange: ev => { e.method = +ev.target.value; const k = EVO.find(x => x[0] === e.method)[2]; if (k === 'level' && (e.param < 1 || e.param > 100)) e.param = 16; if (k === 'item' && !e.param) e.param = 93; save(); } },
        ...EVO.map(([v, l]) => h('option', { value: v, selected: v === e.method }, l)));
      const param = m[2] === 'level' ? h('input', { type: 'number', min: 1, max: 100, value: e.param, style: { width: '60px' }, onchange: ev => { e.param = +ev.target.value; save(); } })
        : m[2] === 'item' ? makeSelect(L().items, e.param, v => { e.param = v; save(); }) : m[2] ? h('input', { type: 'number', value: e.param, style: { width: '60px' }, onchange: ev => { e.param = +ev.target.value; save(); } }) : '';
      out.append(h('div', { class: 'evoline' }, h('b', {}, L().species[sp]), ' evolves into ', makeSelect(L().species, e.target, v => { e.target = v; save(); }), ' ', methodSel, ' ', param, ' ',
        h('button', { class: 'mu-x', onclick: () => { list.splice(i, 1); save(); } }, '✕')));
    });
    if (list.length < 5) out.append(h('button', { onclick: () => { list.push({ method: 4, param: 16, target: Math.min(N() - 1, sp + 1) }); save(); } }, '+ add an evolution'));
    return out;
  }

  // --- Pokédex
  function dexTab(sp) {
    const r = rom(), e = dexEntry(sp); if (e < 0) return h('p', { class: 'muted' }, 'No Pokédex entry for this Pokémon (or the table was not found).');
    const desc = r.ptr(e + 16), d = desc >= 0 ? Charmap.decodeEditable(r.u8, desc, App.settings.rtl).text : '';
    const ta = h('textarea', { dir: 'auto', rows: 4 }); ta.value = d;
    return h('div', {},
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, 'Category ("… Pokémon")', h('input', { dir: 'auto', value: Charmap.decode(r.u8, e, 12).text, maxlength: 11, onchange: ev => {
          try { const bts = Charmap.encode(ev.target.value, { rtl: App.settings.rtl }); if (bts.length > 12) throw new Error('Too long (max 11)'); const p = new Uint8Array(12).fill(0xFF); p.set(bts); r.write(e, p); toast('Saved'); } catch (x) { toast(x.message, 'err'); } } })),
        h('label', { class: 'field' }, 'Height (m)', h('input', { type: 'number', step: 0.1, value: r.r16(e + 12) / 10, onchange: ev => r.w16(e + 12, Math.round(+ev.target.value * 10)) })),
        h('label', { class: 'field' }, 'Weight (kg)', h('input', { type: 'number', step: 0.1, value: r.r16(e + 14) / 10, onchange: ev => r.w16(e + 14, Math.round(+ev.target.value * 10)) }))),
      h('label', { class: 'field' }, 'Description', ta),
      h('button', { class: 'primary', onclick: () => { try { r.wptr(e + 16, r.writeNew(Charmap.encode(ta.value, { rtl: App.settings.rtl }))); toast('Description saved'); } catch (x) { toast(x.message, 'err'); } } }, 'Save description'),
      h('p', { class: 'muted' }, 'Pokédex ' + dexNum(sp) + '. Enter = new line (the Pokédex page shows about 3 short lines).'));
  }

  // --- Pictures: battle preview, front / back / shiny / icon, PNG import (automatic) + pixel editor
  function picsTab(sp, rerender) {
    const out = h('div');
    const f = picture(sp, 'front', false); if (!f) return h('p', { class: 'muted' }, 'Picture tables not found.');
    const ic = icon(sp);
    const cell = (k, sh, label) => { const m = picture(sp, k, sh); return h('div', { class: 'piccell' + (picKind === k && picShiny === sh ? ' sel' : ''), onclick: () => { picKind = k; picShiny = sh; rerender(); } }, m ? spriteCanvas(m.px, m.pal, 64, 64, 1.5) : '', h('div', {}, label)); };
    out.append(h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '16px' } },
      h('div', {}, h('h4', {}, 'In battle' + (picShiny ? ' (shiny)' : '')), battlePreview(sp)),
      h('div', {}, h('h4', {}, 'Pictures (click one to edit it)'),
        h('div', { class: 'row wrap' }, cell('front', false, 'Front'), cell('back', false, 'Back'), cell('front', true, 'Shiny front'), cell('back', true, 'Shiny back'),
          ic ? h('div', { class: 'piccell' + (picKind === 'icon' ? ' sel' : ''), onclick: () => { picKind = 'icon'; rerender(); } }, iconCanvas(sp, 64), h('div', {}, 'Menu icon')) : ''))));
    if (picKind === 'icon' && ic) { out.append(iconEditor(sp, ic, rerender)); return out; }
    const m = picture(sp, picKind, picShiny);
    const ed = PixelEditor({ px: m.px.slice(0, 4096), w: 64, h: 64, pal: m.pal, transparent: true, name: (L().species[sp] || sp) + '_' + picKind });
    const imp = async file => {
      try {
        if (picKind === 'front' && !picShiny) {                         // a new front: its own palette; the back is recoloured to it; shiny = shifted colours
          const c = await convertImage(file, 64, null), back = picture(sp, 'back', false);
          savePicture(sp, 'front', c.px);
          savePicture(sp, 'back', remap(back.px.slice(0, 4096), back.pal, c.pal));
          savePalette(sp, false, c.pal); savePalette(sp, true, hueShift(c.pal, 40));
          toast('New front picture (15 colours). The back was recoloured to its palette and a shiny palette was made (adjust it under "Shiny front").');
        } else { const c = await convertImage(file, 64, m.pal); savePicture(sp, picKind, c.px); toast('Imported with the Pokémon\'s current colours'); }
        rerender();
      } catch (x) { toast(x.message, 'err'); }
    };
    out.append(h('h4', {}, 'Edit: ' + (picShiny ? 'shiny ' : '') + picKind),
      h('div', { class: 'row wrap' },
        h('label', { class: 'btn primary' }, '🖼 Import PNG (automatic)', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => e.target.files[0] && imp(e.target.files[0]) })),
        h('button', { class: 'primary', onclick: () => { savePicture(sp, picKind, ed.px); savePalette(sp, picShiny, ed.pal); toast('Saved'); rerender(); } }, '💾 Save picture + colours'),
        picShiny ? h('label', {}, 'Shiny = normal colours shifted by ', h('input', { type: 'range', min: -180, max: 180, value: 40, onchange: e => { savePalette(sp, true, hueShift(picture(sp, 'front', false).pal, +e.target.value)); rerender(); } }), '°') : '',
        h('span', { class: 'muted' }, picKind === 'front' && !picShiny ? 'A new front picture gets its own 15 colours (the back is recoloured to match).' : 'Imports use the current colours (front and back share them).')),
      ed.el);
    return out;
  }
  function iconEditor(sp, ic, rerender) {
    const r = rom(), o = O();
    const ed = PixelEditor({ px: ic.px.slice(0, 1024), w: 32, h: 32, pal: ic.pal, transparent: true, name: 'icon_' + sp });
    const save = px => {
      const raw = new Uint8Array(0x400), t = Gfx.pixelsToTiles(px, 32, 32); raw.set(t); raw.set(t, 0x200);       // both animation frames
      let shared = false; for (let i = 0; i < N(); i++) if (i !== sp && r.ptr(o.iconTable + i * 4) === ic.p) shared = true;
      if (shared) r.wptr(o.iconTable + sp * 4, r.writeNew(raw)); else r.write(ic.p, raw);
    };
    return h('div', {}, h('h4', {}, 'Menu icon (32×32, one of the game\'s 3 icon palettes)'),
      h('div', { class: 'row wrap' },
        h('label', {}, 'Palette ', makeSelect(['0', '1', '2'], Math.min(2, ic.idx), v => { r.w8(o.iconPalIdx + sp, v); rerender(); })),
        h('label', { class: 'btn primary' }, '🖼 Import PNG (automatic)', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
          const f = e.target.files[0]; if (!f) return;
          try { save((await convertImage(f, 32, ic.pal)).px); toast('Icon imported'); rerender(); } catch (x) { toast(x.message, 'err'); } } })),
        h('button', { class: 'primary', onclick: () => { save(ed.px); toast('Icon saved'); rerender(); } }, '💾 Save icon')), ed.el);
  }

  // --- Where it's found: edit per area, add to an area, show on the world map
  function whereTab(sp, rerender) {
    const out = h('div'), list = Wild.whereFound(sp);
    if (!list.length) out.append(h('p', { class: 'muted' }, (L().species[sp] || '') + ' does not appear in the wild.'));
    else out.append(h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ...['Area', 'Where', 'Percent', 'Levels', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, ...list.map(f => h('tr', {},
        h('td', {}, areaName(f.g, f.n)), h('td', { class: 'muted' }, Wild.KINDS[f.kind].name),
        h('td', {}, h('input', { type: 'number', min: 1, max: 100, value: f.pct, style: { width: '56px' }, onchange: e => {
          const w = Wild.read(f.g, f.n, f.kind), sl = Wild.toSimple(w.slots, f.kind), i = sl.findIndex(x => x.sp === sp);
          Wild.setPct(sl, i, +e.target.value); Wild.write(f.g, f.n, f.kind, w.rate, Wild.fromSimple(sl, f.kind)); rerender(); } }), '%'),
        h('td', {}, f.min + '–' + f.max),
        h('td', {}, h('button', { class: 'mu-x', title: 'remove from this area', onclick: () => {
          const w = Wild.read(f.g, f.n, f.kind), sl = Wild.toSimple(w.slots, f.kind), i = sl.findIndex(x => x.sp === sp);
          if (sl.length === 1) { toast('It is the only Pokémon there: change the area in the World view instead', 'err'); return; }
          const p = sl[i].pct; sl.splice(i, 1); sl[0].pct += p; Wild.write(f.g, f.n, f.kind, w.rate, Wild.fromSimple(sl, f.kind)); rerender(); } }, '✕')))))));
    const areas = []; App.game.mapGroups.forEach((maps, g) => maps.forEach((hp, n) => { if ([1, 2, 3, 6].includes(rom().u8[hp + 23]) || Wild.read(g, n, 'grass')) areas.push([g, n]); }));
    const areaSel = h('select', {}, h('option', { value: '' }, 'add to an area…'), ...areas.map(([g, n]) => h('option', { value: g + '.' + n }, areaName(g, n))));
    const kindSel = h('select', {}, h('option', { value: 'grass' }, 'grass / cave'), h('option', { value: 'water' }, 'surfing'));
    const pct = h('input', { type: 'number', value: 10, min: 1, max: 100, style: { width: '56px' } }), lmin = h('input', { type: 'number', value: 5, style: { width: '50px' } }), lmax = h('input', { type: 'number', value: 8, style: { width: '50px' } });
    out.append(h('div', { class: 'row wrap', style: { marginTop: '8px' } }, areaSel, kindSel, pct, '% · levels', lmin, '–', lmax,
      h('button', { class: 'primary', onclick: () => {
        if (!areaSel.value) return;
        const [g, n] = areaSel.value.split('.').map(Number), kind = kindSel.value, w = Wild.read(g, n, kind), sl = w ? Wild.toSimple(w.slots, kind) : [];
        if (sl.some(x => x.sp === sp)) { toast('Already there: change its percent above', 'err'); return; }
        sl.push({ sp, pct: sl.length ? 0 : 100, min: +lmin.value, max: Math.max(+lmin.value, +lmax.value) }); if (sl.length > 1) Wild.setPct(sl, sl.length - 1, +pct.value);
        Wild.write(g, n, kind, w ? w.rate : 21, Wild.fromSimple(sl, kind)); toast('Added to ' + areaName(g, n)); rerender(); } }, 'Add')),
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { onclick: () => { WorldTab.highlight(sp); MapsTab.api.openWorld(); } }, '🗺 Show on the world map')));
    return out;
  }
  // --- Used in the game
  function usageTab(sp) {
    const tr = trainersWith(sp), wf = Wild.whereFound(sp), gifts = Gifts.scan().filter(x => x.species === sp);
    return h('div', {},
      h('h4', {}, 'In the wild: ' + wf.length + ' area(s)'), wf.length ? h('div', { class: 'muted' }, wf.map(f => areaName(f.g, f.n) + ' ' + f.pct + '%').join(' · ')) : '',
      h('h4', {}, 'Trainers: ' + tr.length), tr.length ? h('div', { class: 'muted' }, tr.slice(0, 60).map(t => (t.name || '#' + t.i) + ' (lv ' + t.level + ')').join(' · ')) : '',
      h('h4', {}, 'Gift / starter / fixed battle: ' + gifts.length), gifts.length ? h('div', { class: 'muted' }, gifts.map(x => x.label).join(' · ')) : '',
      h('h4', {}, 'Evolution'), h('div', { class: 'muted' }, (preEvo(sp) ? 'from ' + L().species[preEvo(sp)] + ' · ' : '') + (evolutions(sp).map(e => 'into ' + L().species[e.target] + ' (' + describe(e) + ')').join(' · ') || 'no further evolution')));
  }

  // --- template: copy another Pokémon's data onto this one
  function templateDialog(sp, rerender) {
    const back = h('div', { class: 'modal-back' });
    const src = makeSelect(L().species, sp > 1 ? sp - 1 : 1, () => {});
    const parts = [['stats', 'Stats, types, abilities, catching (+ advanced)', true], ['moves', 'Moves (level list + TM/HM)', true], ['evo', 'Evolutions', false], ['pics', 'Pictures (front, back, shiny, icon)', false], ['dex', 'Pokédex height / weight / category', false]];
    const checks = parts.map(([k, l, on]) => { const c = h('input', { type: 'checkbox', checked: on }); c.dataset.k = k; return h('label', { style: { display: 'block' } }, c, ' ' + l); });
    back.append(h('div', { class: 'panel modal' }, h('h3', {}, 'Start ' + (L().species[sp] || '#' + sp) + ' from a template'),
      h('p', { class: 'muted' }, 'Copies the chosen parts from another Pokémon onto #' + sp + '. Then change only what is different (name, picture, a few stats…).'),
      h('label', { class: 'field' }, 'Template', src), ...checks,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', { class: 'primary', onclick: () => {
          const from = +src.value, on = k => checks.some(l => { const c = l.querySelector('input'); return c.dataset.k === k && c.checked; }), r = rom(), o = O();
          if (on('stats')) r.write(base(sp), r.u8.slice(base(from), base(from) + 28));
          if (on('moves')) { writeLearnset(sp, learnset(from)); if (o.tmCompat >= 0) r.write(o.tmCompat + sp * 8, r.u8.slice(o.tmCompat + from * 8, o.tmCompat + from * 8 + 8)); }
          if (on('evo')) writeEvolutions(sp, evolutions(from));
          if (on('pics')) for (const t of [o.frontPics, o.backPics, o.pals, o.shinyPals]) r.wptr(t + sp * 8, r.ptr(t + from * 8));
          if (on('pics') && o.iconTable >= 0) { r.wptr(o.iconTable + sp * 4, r.ptr(o.iconTable + from * 4)); r.w8(o.iconPalIdx + sp, r.u8[o.iconPalIdx + from]); }
          if (on('dex') && dexEntry(sp) >= 0 && dexEntry(from) >= 0) r.write(dexEntry(sp), r.u8.slice(dexEntry(from), dexEntry(from) + 16));
          back.remove(); toast('Copied from ' + L().species[from]); rerender();
        } }, 'Copy'), h('button', { onclick: () => back.remove() }, 'Cancel'))));
    document.body.append(back);
  }

  // --- starters & gifts
  function giftsPanel(root) {
    const list = Gifts.scan();
    return h('div', { class: 'panel', style: { flex: 1 } }, h('h3', {}, '🎁 Starters, gift Pokémon and fixed battles'),
      h('p', { class: 'muted' }, 'Found in the scripts of every map: givemon (gift / starter) and setwildbattle (a fixed battle, e.g. a legendary). Changing the Pokémon also changes its picture and name shown in the same script.'),
      list.length ? h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ...['Map', 'Kind', 'Pokémon', 'Level', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, ...list.map(x => h('tr', {}, h('td', {}, x.mapName), h('td', { class: 'muted' }, x.kind),
          h('td', {}, h('span', { class: 'row' }, iconCanvas(x.species, 24), makeSelect(L().species, x.species, v => { Gifts.setSpecies(x, v); render(root); }))),
          h('td', {}, h('input', { type: 'number', min: 1, max: 100, value: x.level, style: { width: '56px' }, onchange: e => { Gifts.setLevel(x, +e.target.value); render(root); } })),
          h('td', {}, h('button', { onclick: () => { sel = x.species; view = 'mon'; render(root); } }, 'open'))))))
        : h('p', {}, 'None found.'));
  }

  return { render, select: s => { sel = s; view = 'mon'; }, iconCanvas };
})();

// ---------- starters & gift Pokémon: givemon / setwildbattle in the maps' scripts ----------
const Gifts = (() => {
  const SCRIPT_LIMIT = 900;
  // total length (opcode + arguments) of FireRed script commands; 0 = unknown (stop decoding)
  const LEN = new Uint8Array(256);
  Object.entries({0:1,1:1,2:1,3:1,4:5,5:5,6:6,7:6,8:2,9:2,10:3,11:3,12:1,13:1,14:2,15:6,16:3,17:6,18:6,19:6,20:3,21:9,22:5,23:5,24:5,25:5,26:5,27:3,28:3,29:6,30:6,31:6,32:9,33:5,34:5,35:5,36:5,37:3,38:5,39:1,40:3,41:3,42:3,43:3,44:5,45:1,46:1,47:3,48:1,49:3,50:1,51:4,52:3,53:1,54:3,55:2,56:2,57:8,58:8,59:8,60:3,61:8,62:8,63:8,64:8,65:8,66:5,67:1,68:5,69:5,70:5,71:5,72:3,73:5,74:5,75:3,76:3,77:3,78:3,79:7,80:9,81:3,82:5,83:3,84:5,85:3,86:5,87:7,88:5,89:5,90:1,91:4,93:1,94:1,95:1,96:3,97:3,98:3,99:7,100:3,101:4,102:1,103:5,104:1,105:1,106:1,107:1,108:1,109:1,110:3,111:5,112:6,113:6,114:1,115:5,116:5,117:5,118:1,119:2,120:5,121:15,122:3,123:5,124:3,125:4,126:2,127:4,128:4,129:4,130:4,131:4,132:4,133:6,134:5,135:5,136:5,137:3,138:4,139:1,140:1,141:1,142:1,143:3,144:6,145:6,146:6,147:4,148:1,149:4,150:3,151:2,152:3,153:3,154:2,155:5,156:3,157:4,158:3,159:3,160:1,161:4,162:9,163:1,164:3,165:1,166:2,167:3,168:5,169:4,170:9,171:3,172:5,173:5,174:1,175:5,176:5,177:8,178:1,179:3,180:3,181:3,182:6,183:1,184:5,185:5,186:5,187:6,188:6,189:5,190:5,191:6,192:3,193:3,194:3,195:2,196:8,197:1,198:4,199:2,200:5,201:1,202:1,203:1,205:3,206:3,207:1,208:3,209:8,210:4,211:3,212:1,213:3,214:1,215:8,216:1,217:1,218:1,219:5,220:2,221:4,222:4,223:5,224:8,225:4,226:6}).forEach(([k, v]) => LEN[k] = v);
  const TRAINER_LEN = [14, 18, 18, 10, 18, 14, 22, 18, 22, 14];
  function walk(r, start, visit, seen, depth) {                         // decode a script, following call / goto
    if (start < 0 || seen.has(start) || depth > 5) return; seen.add(start);
    for (let p = start, end = start + SCRIPT_LIMIT; p < end && p < r.size - 24;) {
      const op = r.u8[p];
      if (op === 0x79) visit({ kind: 'gift', at: p, species: r.r16(p + 1), level: r.u8[p + 3] });
      else if (op === 0xB6) visit({ kind: 'fixed battle', at: p, species: r.r16(p + 1), level: r.u8[p + 3] });
      if (op === 0x02 || op === 0x03) return;                                                                 // end / return
      if (op === 0x04 || op === 0x05) { walk(r, r.ptr(p + 1), visit, seen, depth + 1); if (op === 0x05) return; }   // call / goto
      if (op === 0x06 || op === 0x07) walk(r, r.ptr(p + 2), visit, seen, depth + 1);                          // goto_if / call_if
      const n = op === 0x5C ? (TRAINER_LEN[r.u8[p + 1]] || 0) : LEN[op];
      if (!n) return;
      p += n;
    }
  }
  let cache = null, ver = -1;
  function scan() {
    if (cache && ver === App.romVersion) return cache;
    const r = App.rom, out = [], seenAt = new Set();
    App.game.mapGroups.forEach((maps, g) => maps.forEach((hp, n) => {
      const scripts = [], ev = r.ptr(hp + 4);
      if (ev >= 0) {
        const no = r.u8[ev], po = r.ptr(ev + 4), nc = r.u8[ev + 2], pc = r.ptr(ev + 12), nb = r.u8[ev + 3], pb = r.ptr(ev + 16);
        for (let i = 0; i < no && po >= 0; i++) scripts.push(r.ptr(po + i * 24 + 16));
        for (let i = 0; i < nc && pc >= 0; i++) scripts.push(r.ptr(pc + i * 16 + 12));
        for (let i = 0; i < nb && pb >= 0; i++) if (r.u8[pb + i * 12 + 5] < 5) scripts.push(r.ptr(pb + i * 12 + 8));
      }
      const ms = r.ptr(hp + 8);
      if (ms >= 0) for (let i = 0; i < 10 && r.u8[ms + i * 5]; i++) if ([1, 3, 5, 7].includes(r.u8[ms + i * 5])) scripts.push(r.ptr(ms + i * 5 + 1));
      let k = 0;
      const mapName = Game.mapName(r, App.game, r.u8[hp + 20]) + ' ' + g + '.' + n;
      for (const s of scripts) walk(r, s, x => {
        if (seenAt.has(x.at) || x.species < 1 || x.species >= App.game.speciesCount || x.level < 1 || x.level > 100) return;
        seenAt.add(x.at);
        out.push(Object.assign(x, { g, n, idx: k++, mapName, label: mapName + ' (' + x.kind + ', lv ' + x.level + ')' }));
      }, new Set(), 0);
    }));
    cache = out; ver = App.romVersion; return out;
  }
  // the givemon / setwildbattle itself, plus showmonpic / bufferspeciesname / setvar of the same species around it
  function setSpecies(x, sp) {
    const r = App.rom, old = x.species, lo = Math.max(0, x.at - 160), hi = x.at + 120;
    for (let p = lo; p < hi; p++) {
      const op = r.u8[p];
      if ((op === 0x75 || op === 0x79 || op === 0xB6) && r.r16(p + 1) === old) r.w16(p + 1, sp);
      else if (op === 0x7D && r.r16(p + 2) === old) r.w16(p + 2, sp);
      else if (op === 0xA1 && r.r16(p + 1) === old) r.w16(p + 1, sp);                       // playmoncry
      else if (op === 0x16 && r.r16(p + 3) === old && r.r16(p + 1) >= 0x4000) r.w16(p + 3, sp);
    }
    x.species = sp;
  }
  function setLevel(x, lv) { lv = Math.max(1, Math.min(100, lv)); App.rom.w8(x.at + 3, lv); x.level = lv; }
  return { scan, setSpecies, setLevel, LEN, TRAINER_LEN };
})();

// ---------- quick test in mGBA (through tools/devserver.py) ----------
const Tester = {
  // a copy of the ROM where a person in the player's room gives a level-50 partner and starts a battle against `sp`
  async battle(sp) {
    const src = App.rom, r = new Rom(src.u8.slice().buffer, 'test.gba'); r.freeStart = src.freeStart; r.freeEnd = src.freeEnd;
    const keep = App.rom; App.rom = r;
    try {
      if (!App.game.mapGroups[4] || !App.game.mapGroups[4][1]) throw new Error("The player's room (map 4.1) was not found");
      const e = MapsTab.api.addEvent(4, 1, 'obj', 7, 8), partner = 6;
      r.w8(e.off + 9, 7);                                             // faces up, towards the room's middle
      const code = [0x6A, 0x5A, 0x79, partner & 255, partner >> 8, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xB6, sp & 255, sp >> 8, 50, 0, 0, 0xB7, 0x6C, 0x02];
      r.wptr(e.off + 16, r.writeNew(Uint8Array.from(code)));
    } catch (x) { App.rom = keep; toast(x.message, 'err'); return; }
    App.rom = keep;
    try {
      const res = await fetch('/__mgba', { method: 'POST', body: r.u8 });
      if (!res.ok) throw new Error(await res.text());
      toast('mGBA started. Start a new game and talk to the person in your room: a battle against ' + (App.getLists().species[sp] || sp) + ' begins.');
    } catch (x) {
      download(r.u8, 'test_' + sp + '.gba');
      toast('mGBA can only be started when the editor runs through tools/devserver.py. The test ROM was downloaded instead: open it in mGBA.', 'err');
    }
  },
};
