// Graphics: reusable pixel editor, Pokémon sprite editor, browser for every LZ77 image in the ROM.
'use strict';

// ---------- Pixel editor component ----------
function PixelEditor(opts) {
  const { w, h: H } = opts;
  let px = opts.px, pal = opts.pal.slice(), color = 1, tool = 'pen', zoom = opts.zoom || Math.max(2, Math.min(12, Math.floor(560 / Math.max(w, H)))), grid = w <= 128;
  const undo = [];
  const canvas = h('canvas', { class: 'pixel editor-canvas', width: w, height: H });
  const gridCv = h('canvas', { class: 'gridlayer' });
  const wrap = h('div', { class: 'pe-canvas' }, canvas, gridCv);
  const swatches = h('div', { class: 'swatches' });
  const info = h('span', { class: 'muted' });
  const draw = () => {
    canvas.getContext('2d').putImageData(Gfx.toImageData(px, w, H, pal), 0, 0);
    canvas.style.width = w * zoom + 'px'; canvas.style.height = H * zoom + 'px';
    gridCv.width = w * zoom; gridCv.height = H * zoom;
    const g = gridCv.getContext('2d'); g.clearRect(0, 0, gridCv.width, gridCv.height);
    if (grid && zoom >= 4) {
      g.strokeStyle = 'rgba(0,0,0,.12)';
      for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * zoom + .5, 0); g.lineTo(x * zoom + .5, H * zoom); g.stroke(); }
      for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(0, y * zoom + .5); g.lineTo(w * zoom, y * zoom + .5); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,160,.35)';
      for (let x = 0; x <= w; x += 8) { g.beginPath(); g.moveTo(x * zoom + .5, 0); g.lineTo(x * zoom + .5, H * zoom); g.stroke(); }
      for (let y = 0; y <= H; y += 8) { g.beginPath(); g.moveTo(0, y * zoom + .5); g.lineTo(w * zoom, y * zoom + .5); g.stroke(); }
    }
  };
  const drawSw = () => {
    swatches.innerHTML = '';
    pal.forEach((c, i) => {
      const s = h('div', { class: 'sw' + (i === color ? ' sel' : ''), style: { background: Gfx.hex(c) }, title: i + ': ' + Gfx.hex(c) + ' (double-click to change)' }, i.toString(16).toUpperCase());
      s.onclick = () => { color = i; drawSw(); };
      s.ondblclick = () => {
        const inp = h('input', { type: 'color', value: Gfx.hex(c) });
        inp.oninput = () => { pal[i] = Gfx.fromHex(inp.value); draw(); drawSw(); opts.onPal && opts.onPal(pal); };
        inp.click();
      };
      swatches.append(s);
    });
  };
  const at = e => {
    const r = canvas.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)];
  };
  const fill = (x, y) => {
    const target = px[y * w + x]; if (target === color) return;
    const st = [[x, y]];
    while (st.length) {
      const [a, b] = st.pop();
      if (a < 0 || b < 0 || a >= w || b >= H || px[b * w + a] !== target) continue;
      px[b * w + a] = color; st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
  };
  let down = false;
  const act = e => {
    const [x, y] = at(e); if (x < 0 || y < 0 || x >= w || y >= H) return;
    info.textContent = `x ${x}, y ${y}, color ${px[y * w + x]}`;
    if (!down) return;
    if (tool === 'pick' || e.buttons === 2) { color = px[y * w + x]; drawSw(); return; }
    if (tool === 'fill') fill(x, y); else px[y * w + x] = color;
    draw();
  };
  canvas.onmousedown = e => { undo.push(px.slice()); if (undo.length > 50) undo.shift(); down = true; act(e); };
  canvas.onmousemove = act;
  canvas.oncontextmenu = e => e.preventDefault();
  window.addEventListener('mouseup', () => down = false);
  const btn = (t, label) => h('button', { class: tool === t ? 'sel' : '', 'data-tool': t, onclick: e => { tool = t; $$('[data-tool]', el).forEach(b => b.classList.toggle('sel', b.dataset.tool === t)); } }, label);
  const el = h('div', { class: 'pixeleditor', tabindex: 0 },
    h('div', { class: 'row wrap' }, btn('pen', '✏ Pen'), btn('fill', '🪣 Fill'), btn('pick', '💧 Pick'),
      h('button', { onclick: () => { if (undo.length) { px.set(undo.pop()); draw(); } } }, '↶ Undo'),
      h('label', {}, 'Zoom ', h('input', { type: 'range', min: 1, max: 16, value: zoom, oninput: e => { zoom = +e.target.value; draw(); } })),
      h('label', {}, h('input', { type: 'checkbox', checked: grid, onchange: e => { grid = e.target.checked; draw(); } }), ' Grid'),
      h('button', { onclick: () => exportPNG() }, 'Export PNG'),
      h('label', { class: 'btn' }, 'Import PNG', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => importPNG(e.target.files[0]) })),
      info),
    swatches, h('div', { class: 'pe-scroll' }, wrap),
    h('p', { class: 'muted' }, 'Right-click picks a color. Double-click a swatch to change it. Import maps the image to this palette (use "Import with palette" in the sprite editor to take the image\'s colors).'));
  el.onkeydown = e => { if (e.ctrlKey && e.key === 'z') { if (undo.length) { px.set(undo.pop()); draw(); } e.preventDefault(); } };
  function exportPNG() {
    const c = h('canvas', { width: w, height: H }); c.getContext('2d').putImageData(Gfx.toImageData(px, w, H, pal, opts.transparent), 0, 0);
    c.toBlob(b => download(b, (opts.name || 'graphic') + '.png', 'image/png'));
  }
  async function importPNG(file, takePalette = false) {
    if (!file) return;
    const img = await createImageBitmap(file);
    const c = h('canvas', { width: w, height: H }), ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, H).data;
    undo.push(px.slice());
    if (takePalette) {
      const colors = [];
      for (let i = 0; i < w * H; i++) {
        const c15 = d[i * 4 + 3] < 128 ? -1 : Gfx.fromRGB(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
        if (c15 >= 0 && !colors.includes(c15)) colors.push(c15);
      }
      if (colors.length > 15) { toast('Image has ' + colors.length + ' colors; max 15 + transparent. Mapping to current palette instead.', 'err'); }
      else colors.forEach((c15, i) => pal[i + 1] = c15);
      opts.onPal && opts.onPal(pal);
    }
    const rgb = pal.map(Gfx.toRGB);
    for (let i = 0; i < w * H; i++) {
      if (d[i * 4 + 3] < 128) { px[i] = 0; continue; }
      let best = 1, bd = 1e9;
      for (let k = opts.transparent ? 1 : 0; k < 16; k++) {
        const dd = (rgb[k][0] - d[i * 4]) ** 2 + (rgb[k][1] - d[i * 4 + 1]) ** 2 + (rgb[k][2] - d[i * 4 + 2]) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      }
      px[i] = best;
    }
    draw(); drawSw();
  }
  draw(); drawSw();
  return { el, get px() { return px; }, get pal() { return pal; }, setPal(p) { pal = p.slice(); draw(); drawSw(); }, importPNG, redraw: draw };
}

const Graphics = (() => {
  let mode = 'mon', monSel = 1, monKind = 'front', monShiny = false;
  let lzList = null, lzPage = 0, lzSel = null, lzPal = 'gray', lzWidth = 16, lzFilter = 'all';

  // ---------- Pokémon sprites ----------
  function monInfo(sp, kind, shiny) {
    const o = App.game.offsets, rom = App.rom;
    const tbl = kind === 'front' ? o.frontPics : o.backPics, ptbl = shiny ? o.shinyPals : o.pals;
    if (tbl < 0 || ptbl < 0) return null;
    const gEntry = tbl + sp * 8, pEntry = ptbl + sp * 8, gp = rom.ptr(gEntry), pp = rom.ptr(pEntry);
    if (gp < 0 || pp < 0) return null;
    const gd = LZ.decompress(rom.u8, gp), pd = LZ.decompress(rom.u8, pp);
    if (!gd || !pd) return null;
    const H = Math.floor(gd.data.length / 32 / 8) * 8;
    return { gEntry, pEntry, gp, pp, gLen: gd.srcLen, pLen: pd.srcLen, w: 64, h: H, px: Gfx.tilesToPixels(gd.data, 64, H), pal: Gfx.readPal(pd.data, 0) };
  }
  function monSprite(sp, kind, shiny) {
    const m = monInfo(sp, kind, shiny); if (!m) return null;
    const c = h('canvas', { class: 'pixel', width: 64, height: Math.min(64, m.h) });
    c.getContext('2d').putImageData(Gfx.toImageData(m.px.subarray(0, 64 * Math.min(64, m.h)), 64, Math.min(64, m.h), m.pal, true), 0, 0);
    c.style.width = '128px'; return c;
  }
  // Store LZ data, relocating if it doesn't fit or if other table entries share the old data.
  function saveLZ(entryLoc, oldPtr, oldLen, raw, tableBase, count) {
    const rom = App.rom, data = LZ.compress(raw);
    let shared = false;
    if (tableBase != null) for (let i = 0; i < count; i++) { const e = tableBase + i * 8; if (e !== entryLoc && rom.ptr(e) === oldPtr) { shared = true; break; } }
    if (shared) { const n = rom.writeNew(data); rom.wptr(entryLoc, n); return n; }
    return rom.replaceData(oldPtr, oldLen, data, [entryLoc]);
  }

  function renderMon(root) {
    const L = App.getLists(), g = App.game;
    const m = monInfo(monSel, monKind, monShiny);
    const head = h('div', { class: 'panel row wrap' },
      h('label', {}, 'Pokémon ', makeSelect(L.species, monSel, v => { monSel = v; render(root); })),
      h('div', { class: 'tabs small' }, ...[['front', 'Front'], ['back', 'Back']].map(([k, n]) => h('button', { class: monKind === k ? 'sel' : '', onclick: () => { monKind = k; render(root); } }, n))),
      h('label', {}, h('input', { type: 'checkbox', checked: monShiny, onchange: e => { monShiny = e.target.checked; render(root); } }), ' Shiny palette'));
    root.append(head);
    if (!m) { root.append(h('div', { class: 'panel' }, 'Sprite tables not found.')); return; }
    const ed = PixelEditor({ px: m.px, w: m.w, h: m.h, pal: m.pal, transparent: true, name: L.species[monSel] + '_' + monKind });
    const save = h('button', { class: 'primary', onclick: () => {
      const o = g.offsets, tbl = monKind === 'front' ? o.frontPics : o.backPics, ptbl = monShiny ? o.shinyPals : o.pals;
      const gNew = saveLZ(m.gEntry, m.gp, m.gLen, Gfx.pixelsToTiles(ed.px, m.w, m.h), tbl, g.speciesCount);
      const pNew = saveLZ(m.pEntry, m.pp, m.pLen, Gfx.palBytes(ed.pal), ptbl, g.speciesCount);
      toast('Sprite saved' + (gNew !== m.gp ? ' (graphics moved to ' + hex(gNew) + ')' : '') + (pNew !== m.pp ? ' (palette moved to ' + hex(pNew) + ')' : ''));
      render(root);
    } }, 'Save sprite + palette');
    root.append(h('div', { class: 'panel' },
      h('div', { class: 'row wrap' }, save,
        h('label', { class: 'btn' }, 'Import with palette', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => ed.importPNG(e.target.files[0], true) })),
        h('span', { class: 'muted' }, `graphics ${hex(m.gp)} · palette ${hex(m.pp)} · ${m.w}×${m.h}. Color 0 is transparent. Front and back share the palette.`)),
      ed.el));
  }

  // ---------- LZ browser ----------
  function scanLZ(done, progress) {
    const rom = App.rom, u8 = rom.u8, N = u8.length, seen = new Map();
    let i = 0;
    const step = () => {
      const stop = Math.min(N - 4, i + 0x100000);
      for (; i < stop; i += 4) {
        if (u8[i + 3] !== 8 && u8[i + 3] !== 9) continue;
        const t = u8[i] | (u8[i + 1] << 8) | (u8[i + 2] << 16) | ((u8[i + 3] & 1) << 24);
        if (t >= N || u8[t] !== 0x10) continue;
        const r = seen.get(t);
        if (r) { if (r.refs) r.refs.push(i); continue; }
        const size = u8[t + 1] | (u8[t + 2] << 8) | (u8[t + 3] << 16);
        if (size < 32 || size > 0x10000 || size % 32) { seen.set(t, {}); continue; }
        const d = LZ.decompress(u8, t);
        if (!d) { seen.set(t, {}); continue; }
        seen.set(t, { off: t, size, srcLen: d.srcLen, refs: [i], pal: size <= 0x200 });
      }
      progress(i / N);
      if (i < N - 4) setTimeout(step, 0);
      else done([...seen.values()].filter(x => x.off != null).sort((a, b) => a.off - b.off));
    };
    step();
  }
  function lzPalette() {
    const rom = App.rom;
    if (lzPal === 'gray') return Gfx.grayPal();
    if (lzPal.startsWith('mon:')) { const m = monInfo(+lzPal.slice(4), 'front', false); return m ? m.pal : Gfx.grayPal(); }
    const [kind, off, idx] = lzPal.split(':');
    if (kind === 'lz') { const d = LZ.decompress(rom.u8, +off); return d ? Gfx.readPal(d.data, (+idx || 0) * 32) : Gfx.grayPal(); }
    if (kind === 'raw') return Gfx.readPal(rom.u8, +off);
    return Gfx.grayPal();
  }
  function thumb(item, pal) {
    const d = LZ.decompress(App.rom.u8, item.off).data;
    if (item.pal) { // show as palette strip
      const n = Math.min(16 * 16, d.length / 2), c = h('canvas', { class: 'pixel', width: 16, height: Math.ceil(n / 16) });
      const ctx = c.getContext('2d');
      for (let i = 0; i < n; i++) { ctx.fillStyle = Gfx.hex(d[i * 2] | (d[i * 2 + 1] << 8)); ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1); }
      c.style.width = '96px'; c.style.height = Math.ceil(n / 16) * 6 + 'px';
      return c;
    }
    const tiles = d.length / 32, tw = Math.min(lzWidth, tiles), th = Math.ceil(tiles / tw);
    const padded = new Uint8Array(tw * th * 32); padded.set(d);
    const W = tw * 8, H = th * 8, c = h('canvas', { class: 'pixel', width: W, height: H });
    c.getContext('2d').putImageData(Gfx.toImageData(Gfx.tilesToPixels(padded, W, H), W, H, pal), 0, 0);
    const s = Math.min(2, 160 / W); c.style.width = W * s + 'px';
    return c;
  }
  function renderLZ(root) {
    if (!lzList) {
      const prog = h('progress', { max: 1, value: 0 });
      root.append(h('div', { class: 'panel' }, h('p', {}, 'Finds every LZ77-compressed graphic referenced by a pointer: title screen, intro, menus, trainer sprites, tilesets, palettes…'), prog));
      scanLZ(list => { lzList = list; render(root); }, p => prog.value = p);
      return;
    }
    const pals = lzList.filter(x => x.pal);
    const palSel = h('select', { onchange: e => { lzPal = e.target.value; render(root); } },
      h('option', { value: 'gray' }, 'Grayscale'),
      ...pals.flatMap(p => Array.from({ length: Math.min(16, p.size / 32) }, (_, k) => h('option', { value: 'lz:' + p.off + ':' + k, selected: lzPal === 'lz:' + p.off + ':' + k }, 'LZ palette ' + hex(p.off) + (p.size > 32 ? ' #' + k : '')))));
    palSel.value = lzPal;
    const rawPal = h('input', { placeholder: 'or raw palette offset (hex)', style: { width: '200px' }, onchange: e => { lzPal = 'raw:' + parseNum(e.target.value); render(root); } });
    const items = lzList.filter(x => lzFilter === 'all' ? !x.pal : lzFilter === 'pal' ? x.pal : true);
    const PER = 40, pages = Math.ceil(items.length / PER);
    lzPage = Math.min(lzPage, pages - 1);
    const pal = lzPalette();
    const grid = h('div', { class: 'lzgrid' });
    for (const it of items.slice(lzPage * PER, lzPage * PER + PER))
      grid.append(h('div', { class: 'lzitem' + (lzSel === it ? ' sel' : ''), onclick: () => { lzSel = it; render(root); } },
        thumb(it, pal), h('div', { class: 'muted' }, hex(it.off) + ' · ' + (it.pal ? it.size / 32 + ' pal' : it.size / 32 + ' tiles'))));
    root.append(h('div', { class: 'panel row wrap' },
      h('select', { onchange: e => { lzFilter = e.target.value; lzPage = 0; render(root); } },
        ...[['all', 'Graphics'], ['pal', 'Palettes'], ['both', 'Everything']].map(([v, n]) => h('option', { value: v, selected: lzFilter === v }, n))),
      'Palette ', palSel, rawPal,
      h('label', {}, 'Width (tiles) ', h('input', { type: 'number', min: 1, max: 64, value: lzWidth, style: { width: '60px' }, onchange: e => { lzWidth = +e.target.value; render(root); } })),
      h('button', { disabled: lzPage <= 0, onclick: () => { lzPage--; render(root); } }, '◀'), `page ${lzPage + 1}/${pages}`,
      h('button', { disabled: lzPage >= pages - 1, onclick: () => { lzPage++; render(root); } }, '▶'),
      h('span', { class: 'muted' }, items.length + ' items')));
    const cols = h('div', { class: 'cols lz' }, h('div', { class: 'panel' }, grid));
    if (lzSel && !lzSel.pal) cols.append(lzEditor(lzSel, pal, root));
    else if (lzSel && lzSel.pal) cols.append(paletteEditor(lzSel, root));
    root.append(cols);
  }
  function paletteEditor(it, root) {
    const rom = App.rom, d = LZ.decompress(rom.u8, it.off).data, n = d.length / 32;
    const pals = Array.from({ length: n }, (_, k) => Gfx.readPal(d, k * 32));
    const rows = pals.map((p, k) => h('div', { class: 'row' }, h('span', { class: 'muted', style: { width: '28px' } }, '#' + k),
      ...p.map((c, i) => h('input', { type: 'color', value: Gfx.hex(c), title: 'color ' + i, style: { width: '30px', padding: 0 }, oninput: e => { p[i] = Gfx.fromHex(e.target.value); } }))));
    return h('div', { class: 'panel' }, h('h3', {}, 'Palette ' + hex(it.off), h('span', { class: 'muted' }, ` · ${n} × 16 colors · ${it.refs.length} pointer(s)`)),
      ...rows,
      h('div', { class: 'row' },
        h('button', { onclick: () => { lzPal = 'lz:' + it.off + ':0'; render(root); } }, 'Use as preview palette'),
        h('button', { class: 'primary', onclick: () => {
          const raw = new Uint8Array(d.length); pals.forEach((p, k) => raw.set(Gfx.palBytes(p), k * 32));
          const data = LZ.compress(raw), at = rom.replaceData(it.off, it.srcLen, data, it.refs);
          it.off = at; it.srcLen = data.length; toast('Palette saved at ' + hex(at)); render(root);
        } }, 'Save palette')),
      h('p', { class: 'muted' }, 'GBA colors are 15-bit, so the picker rounds each channel to a multiple of 8.'));
  }
  function lzEditor(it, pal, root) {
    const rom = App.rom, d = LZ.decompress(rom.u8, it.off).data;
    const tiles = d.length / 32, tw = Math.min(lzWidth, tiles), th = Math.ceil(tiles / tw);
    const padded = new Uint8Array(tw * th * 32); padded.set(d);
    const ed = PixelEditor({ px: Gfx.tilesToPixels(padded, tw * 8, th * 8), w: tw * 8, h: th * 8, pal, name: 'gfx_' + hex(it.off) });
    return h('div', { class: 'panel' }, h('div', { class: 'row wrap' },
      h('b', {}, hex(it.off)), h('span', { class: 'muted' }, `${tiles} tiles · ${it.refs.length} pointer(s)`),
      h('button', { class: 'primary', onclick: () => {
        const raw = Gfx.pixelsToTiles(ed.px, tw * 8, th * 8).subarray(0, d.length);
        const data = LZ.compress(raw);
        const n = rom.replaceData(it.off, it.srcLen, data, it.refs);
        it.off = n; it.srcLen = data.length; toast('Graphic saved at ' + hex(n));
        render(root);
      } }, 'Save graphic')),
      h('p', { class: 'muted' }, 'Palette edits here are preview-only; to change colors in game, edit the palette entry (select it from "Palettes").'),
      ed.el);
  }

  function render(root) {
    root.innerHTML = '';
    root.append(h('div', { class: 'tabs' },
      h('button', { class: mode === 'mon' ? 'sel' : '', onclick: () => { mode = 'mon'; render(root); } }, 'Pokémon sprites'),
      h('button', { class: mode === 'lz' ? 'sel' : '', onclick: () => { mode = 'lz'; render(root); } }, 'All compressed graphics (title, intro, menus…)'),
      h('button', { class: mode === 'art' ? 'sel' : '', onclick: () => { mode = 'art'; render(root); } }, '🧍 Characters & title screen')));
    const body = h('div'); root.append(body);
    if (mode === 'mon') renderMon(body); else if (mode === 'art') ArtStudio.render(body); else renderLZ(body);
  }

  return { render, monSprite, monInfo, openMon: sp => { mode = 'mon'; monSel = sp; }, reset: () => { lzList = null; lzSel = null; } };
})();
