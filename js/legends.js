// Pokémon → "Legendaries in the world": every Pokémon that stands on a map and is battled once (Articuno, Mewtwo,
// Lugia, Snorlax…), how it looks on the map, where it stands, and new ones. FireRed (US) v1.1.
//   two ways the game starts such a battle:
//     setwildbattle SPECIES, LEVEL, ITEM (0xB6)                                   - birds, Mewtwo, Snorlax, Electrode…
//     setvar 0x8004 SPECIES; setvar 0x8005 LEVEL; setvar 0x8006 ITEM; special 0x1BB  - Lugia, Ho-Oh, Deoxys
'use strict';

const Legends = (() => {
  const R = () => App.rom, G = () => App.game, L = () => App.getLists();
  const PAL_REF = () => App.game.offsets.owPalRef;

  // ---------- scan ----------
  function scriptsOf(g, n) {                          // [{ start, obj }] of a map: people, triggers, signs, map scripts
    const r = R(), hp = G().mapGroups[g][n], out = [], ev = r.ptr(hp + 4);
    if (ev >= 0) {
      const no = r.u8[ev], po = r.ptr(ev + 4), nc = r.u8[ev + 2], pc = r.ptr(ev + 12), nb = r.u8[ev + 3], pb = r.ptr(ev + 16);
      for (let i = 0; i < no && po >= 0; i++) out.push({ start: r.ptr(po + i * 24 + 16), obj: i });
      for (let i = 0; i < nc && pc >= 0; i++) out.push({ start: r.ptr(pc + i * 16 + 12), obj: -1 });
      for (let i = 0; i < nb && pb >= 0; i++) if (r.u8[pb + i * 12 + 5] < 5) out.push({ start: r.ptr(pb + i * 12 + 8), obj: -1 });
    }
    const ms = r.ptr(hp + 8);
    if (ms >= 0) for (let i = 0; i < 10 && r.u8[ms + i * 5]; i++) {
      const t = r.u8[ms + i * 5], p = r.ptr(ms + i * 5 + 1); if (p < 0) continue;
      if (t === 2 || t === 4) { for (let k = 0; k < 16 && r.r16(p + k * 8); k++) out.push({ start: r.ptr(p + k * 8 + 4), obj: -1 }); }
      else out.push({ start: p, obj: -1 });
    }
    return out.filter(s => s.start >= 0);
  }
  function walk(r, start, visit, seen, depth) {        // like Gifts' walker, with the "special 0x1BB" pattern too
    if (start < 0 || seen.has(start) || depth > 6) return; seen.add(start);
    const LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN, N = G().speciesCount;
    for (let p = start, end = start + 1200; p < end && p < r.size - 24;) {
      const op = r.u8[p];
      if (op === 0xB6) { const sp = r.r16(p + 1), lv = r.u8[p + 3]; if (sp > 0 && sp < N && lv >= 1 && lv <= 100) visit({ how: 'b6', at: p }); }
      if (op === 0x16 && r.r16(p + 1) === 0x8004 && r.u8[p + 5] === 0x16 && r.r16(p + 6) === 0x8005 && r.u8[p + 10] === 0x16 && r.r16(p + 11) === 0x8006 && r.u8[p + 15] === 0x25 && r.r16(p + 16) === 0x1BB) visit({ how: 'special', at: p });
      if (op === 0x02 || op === 0x03) return;
      if (op === 0x04 || op === 0x05) { walk(r, r.ptr(p + 1), visit, seen, depth + 1); if (op === 0x05) return; }
      if (op === 0x06 || op === 0x07) walk(r, r.ptr(p + 2), visit, seen, depth + 1);
      const n = op === 0x5C ? (TL[r.u8[p + 1]] || 0) : LEN[op];
      if (!n) return;
      p += n;
    }
  }
  const SPECIES = { b6: 1, special: 3 }, LEVEL = { b6: 3, special: 8 }, ITEM = { b6: 4, special: 13 };
  let cache = null, ver = -1;
  function scan() {
    if (cache && ver === App.romVersion) return cache;
    const r = R(), out = [], seenAt = new Set();
    G().mapGroups.forEach((maps, g) => maps.forEach((hp, n) => {
      const found = [];
      for (const s of scriptsOf(g, n)) walk(r, s.start, x => { if (!seenAt.has(x.at)) { seenAt.add(x.at); found.push(Object.assign(x, { obj: s.obj })); } }, new Set(), 0);
      if (!found.length) return;
      const ev = r.ptr(hp + 4), no = r.u8[ev], po = r.ptr(ev + 4);
      for (const x of found) {
        // the person on the map: the one whose script it is, or else a Pokémon sprite standing on that map
        if (x.obj < 0) for (let i = 0; i < no; i++) { const gfx = r.u8[po + i * 24 + 1]; if (gfx >= 107 && gfx !== 108 && gfx !== 151 && !found.some(y => y.obj === i)) { x.obj = i; break; } }
        out.push(Object.assign(x, { g, n }));
      }
    }));
    cache = out; ver = App.romVersion; return out;
  }
  // only fixed battles against one Pokémon on a map (not trainers' scripts with a test battle)
  const species = x => R().r16(x.at + SPECIES[x.how]), level = x => R().u8[x.at + LEVEL[x.how]], item = x => R().r16(x.at + ITEM[x.how]);
  function objOff(x) { if (x.obj < 0) return -1; const r = R(), ev = r.ptr(G().mapGroups[x.g][x.n] + 4); return r.ptr(ev + 4) + x.obj * 24; }
  const mapName = (g, n) => Game.mapName(R(), G(), R().u8[G().mapGroups[g][n] + 20]) + ' ' + g + '.' + n;

  // which sprite shows which Pokémon (from the game's own legendaries)
  function knownSprites() {
    const m = new Map(), r = R();
    for (const x of scan()) { const o = objOff(x); if (o >= 0) { const gfx = r.u8[o + 1]; if (gfx >= 107 && !m.has(species(x))) m.set(species(x), gfx); } }
    return m;
  }

  // ---------- a sprite made from the Pokémon's own picture ----------
  function paletteTags() {
    const r = R(), t = r.ptr(PAL_REF()), out = [];
    for (let i = 0; t >= 0 && i < 64; i++) { const p = r.ptr(t + i * 8); if (p < 0) break; out.push({ tag: r.r16(t + i * 8 + 4), pal: Gfx.readPal(r.u8, p) }); }
    return out;
  }
  // the 32x32 picture from the battle picture, in the existing palette that fits it best
  function spriteFromPicture(sp) {
    const m = Graphics.monInfo(sp, 'front'); if (!m) throw new Error(T('This Pokémon has no picture'));
    const src = h('canvas', { width: 64, height: 64 }); src.getContext('2d').putImageData(Gfx.toImageData(m.px.subarray(0, 64 * 64), 64, 64, m.pal, true), 0, 0);
    const cv = ImgTools.fit(src, 32, 32), id = ImgTools.data(cv);
    let best = null;
    for (const p of paletteTags()) {
      if (p.tag < 0x1100 || p.tag > 0x11FF) continue;
      const px = ImgTools.quantize(id, p.pal, 1), rgb = p.pal.map(Gfx.toRGB); let err = 0;
      for (let i = 0; i < px.length; i++) if (px[i]) { const c = rgb[px[i]]; err += (c[0] - id.data[i * 4]) ** 2 + (c[1] - id.data[i * 4 + 1]) ** 2 + (c[2] - id.data[i * 4 + 2]) ** 2; }
      if (!best || err < best.err) best = { err, tag: p.tag, pal: p.pal, px };
    }
    return best;
  }
  // sprite numbers no person on any map uses (not the player's own), to put a new sprite in
  function freeSprites() {
    const r = R(), used = new Set();
    G().mapGroups.forEach(maps => maps.forEach(hp => { const ev = r.ptr(hp + 4); if (ev < 0) return; const no = r.u8[ev], po = r.ptr(ev + 4); for (let i = 0; i < no && po >= 0; i++) used.add(r.u8[po + i * 24 + 1]); }));
    const out = []; for (let g = 16; Objects.spriteInfo(g); g++) if (!used.has(g)) out.push(g);
    return out;
  }
  // a still 32x32 sprite (the frame layout of Articuno's) with its own picture, in palette `tag`
  function writeSprite(gfx, px, tag) {
    const r = R(), tpl = Objects.spriteInfo(138);
    if (!tpl || tpl.w !== 32) throw new Error(T('The sprite template (Articuno) was not found'));
    const tiles = Gfx.pixelsToTiles(px, 32, 32), frames = r.writeNew(tiles);
    const img = new Uint8Array(8), dv = new DataView(img.buffer); dv.setUint32(0, (0x08000000 + frames) >>> 0, true); dv.setUint16(4, tiles.length, true);
    const imgs = r.writeNew(img), data = r.u8.slice(tpl.info, tpl.info + 36), dd = new DataView(data.buffer);
    dd.setUint16(2, tag, true); dd.setUint32(28, (0x08000000 + imgs) >>> 0, true);
    r.wptr(Objects.GFX_TABLE + gfx * 4, r.writeNew(data));
    Objects.refresh();
  }

  // ---------- a new legendary on a map ----------
  function create(sp, lv, g, n, x, y) {
    const r = R(), known = knownSprites().get(sp);
    let gfx = known;
    if (gfx == null) {
      const free = freeSprites(); if (!free.length) throw new Error(T('No free sprite number is left for a new sprite'));
      const s = spriteFromPicture(sp); gfx = free[0]; writeSprite(gfx, s.px, s.tag);
    }
    const e = MapsTab.api.addEvent(g, n, 'obj', x, y), o = e.off, flag = Objects._freeFlag();
    r.w8(o + 1, gfx); r.w8(o + 9, 8); r.w8(o + 10, 0); r.w16(o + 20, flag);
    const code = [0x6A, 0x5A, 0xB6, sp & 255, sp >> 8, lv, 0, 0, 0xA1, sp & 255, sp >> 8, 2, 0, 0xC5, 0xB7, 0x29, flag & 255, flag >> 8, 0x53, 0x0F, 0x80, 0x6C, 0x02];
    r.wptr(o + 16, r.writeNew(Uint8Array.from(code)));
    cache = null;
    return { g, n, obj: e.i, gfx, made: known == null };
  }

  // ---------- UI ----------
  let sel = 0, showNew = false;
  function panel(root, back) {
    const list = scan().filter(x => x.obj >= 0 || x.how === 'special'), r = R(), Lst = L();
    if (sel >= list.length) sel = 0;
    const left = h('div', { class: 'leg-list' }, ...list.map((x, k) => h('div', { class: 'monrow' + (k === sel && !showNew ? ' sel' : ''), onclick: () => { sel = k; showNew = false; back(); } },
      PokemonTab.iconCanvas(species(x), 32), h('span', {}, Lst.species[species(x)] || species(x)), h('span', { class: 'muted' }, mapName(x.g, x.n) + ' · ' + T('lv') + ' ' + level(x)))));
    const right = showNew ? newForm(back) : list.length ? card(list[sel], back) : h('p', {}, T('None found.'));
    return h('div', { class: 'panel', style: { flex: 1 } }, h('h3', {}, '🐉 ' + T('Legendaries in the world')),
      h('p', { class: 'muted' }, T('Pokémon that stand on a map and are battled once. Change who it is, how it looks on the map and where it stands, or put a new one on any map.')),
      h('button', { class: showNew ? 'sel' : 'primary', onclick: () => { showNew = true; back(); } }, '➕ ' + T('New legendary')),
      h('div', { class: 'cols', style: { gap: '12px', alignItems: 'flex-start', marginTop: '8px' } }, h('div', { style: { minWidth: '230px', maxHeight: '70vh', overflow: 'auto' } }, left), h('div', { style: { flex: 1 } }, right)));
  }
  function card(x, back) {
    const r = R(), Lst = L(), sp = species(x), o = objOff(x), gfx = o >= 0 ? r.u8[o + 1] : -1;
    const pic = Graphics.monSprite(sp, 'front') || h('span');
    const spSel = makeSelect(Lst.species, sp, v => { const old = { at: x.at, species: sp }; Gifts.setSpecies(old, v); if (x.how === 'special') r.w16(x.at + 3, v); cache = null; back(); });
    const lvIn = h('input', { type: 'number', min: 1, max: 100, value: level(x), style: { width: '60px' }, onchange: e => { r.w8(x.at + LEVEL[x.how], Math.max(1, Math.min(100, +e.target.value))); back(); } });
    const itSel = makeSelect([T('nothing'), ...Lst.items.slice(1)], item(x), v => { r.w16(x.at + ITEM[x.how], v); back(); });
    const box = h('div', { class: 'tr-card' },
      h('div', { class: 'tr-head' }, h('div', { class: 'tr-pic' }, pic), h('div', { class: 'tr-fields' },
        h('div', { class: 'card-chip' }, '🐉 ' + T('Legendary') + ' · ' + mapName(x.g, x.n)),
        h('div', { class: 'tr-title' }, Lst.species[sp] || sp),
        h('label', { class: 'field' }, T('Which Pokémon'), spSel), h('label', { class: 'field' }, T('Level'), lvIn), h('label', { class: 'field' }, T('Holds'), itSel))));
    // how it looks on the map
    const look = h('div', { class: 'tr-sec' }, h('h4', {}, '👁 ' + T('How it looks on the map')));
    if (o < 0) look.append(h('p', { class: 'muted' }, T('No person on the map belongs to this battle (it starts from a script).')));
    else {
      const spr = Objects.sprite(gfx, 'down'), sc = spr ? (() => { const c = h('canvas', { width: spr.width, height: spr.height, class: 'pixel' }); c.getContext('2d').drawImage(spr, 0, 0); c.style.width = spr.width * 3 + 'px'; return c; })() : h('span');
      const known = knownSprites().get(sp);
      const mismatch = known != null ? known !== gfx : !(gfx >= 107) || [...knownSprites().values()].includes(gfx);
      look.append(h('div', { class: 'row wrap' }, sc, h('span', { class: 'muted' }, Objects.gfxName ? Objects.gfxName(gfx) + ' (' + gfx + ')' : '#' + gfx)),
        h('div', { class: 'row wrap' },
          h('button', { onclick: () => Objects.gallery(gfx, v => { r.w8(o + 1, v); back(); }) }, '🖼 ' + T('Choose a sprite…')),
          known != null && known !== gfx ? h('button', { onclick: () => { r.w8(o + 1, known); back(); } }, '↩ ' + Tf('Use {name}\'s own sprite', { name: Lst.species[sp] })) : '',
          h('button', { onclick: () => makeSprite(x, sp, o, back) }, '✨ ' + T('Make it from the Pokémon\'s picture'))),
        mismatch && known == null ? h('p', { class: 'warn' }, Tf('{name} has no sprite of its own: make one from its picture (✨), or choose one.', { name: Lst.species[sp] })) : '');
    }
    // where it stands
    const where = h('div', { class: 'tr-sec' }, h('h4', {}, '📍 ' + T('Where it stands')));
    if (o >= 0) {
      const xIn = h('input', { type: 'number', value: r.s16(o + 4), style: { width: '60px' }, onchange: e => { r.w16(o + 4, +e.target.value); back(); } });
      const yIn = h('input', { type: 'number', value: r.s16(o + 6), style: { width: '60px' }, onchange: e => { r.w16(o + 6, +e.target.value); back(); } });
      where.append(h('div', { class: 'row wrap' }, h('span', {}, mapName(x.g, x.n)), h('label', {}, 'x ', xIn), h('label', {}, 'y ', yIn),
        h('button', { onclick: () => MapsTab.api.open(x.g, x.n, { kind: 'obj', i: x.obj }) }, '🗺 ' + T('Open in the map editor'))),
        h('p', { class: 'muted' }, T('In the map editor you can also drag it to another spot.')));
    } else where.append(h('div', {}, mapName(x.g, x.n)));
    box.append(look, where);
    return box;
  }
  // the picture → a 32x32 sprite in a free sprite number (or in its own one, if it already has one that only it uses)
  function makeSprite(x, sp, o, back) {
    const r = R(); let s;
    try { s = spriteFromPicture(sp); } catch (e) { toast(e.message, 'err'); return; }
    const ed = PixelEditor({ w: 32, h: 32, px: s.px, pal: s.pal, zoom: 10, transparent: true, name: 'legendary_' + sp });
    const dlg = h('div', { class: 'modal-back' }), win = h('div', { class: 'modal panel', style: { maxWidth: '640px' } },
      h('h3', {}, '✨ ' + T('A sprite from the Pokémon\'s picture')),
      h('p', { class: 'muted' }, T('The battle picture, made smaller and drawn in the closest palette of the game. Touch up the pixels, then save.')), ed.el,
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => {
        try {
          const free = freeSprites(), cur = r.u8[o + 1];
          const gfx = free.includes(cur) ? cur : free[0]; if (gfx == null) throw new Error(T('No free sprite number is left for a new sprite'));
          writeSprite(gfx, ed.px, s.tag); r.w8(o + 1, gfx); dlg.remove(); toast(Tf('New sprite #{n} saved', { n: gfx })); back();
        } catch (e) { toast(e.message, 'err'); }
      } }, '💾 ' + T('Save the sprite')), h('button', { onclick: () => dlg.remove() }, T('Cancel'))));
    dlg.append(win); document.body.append(dlg);
  }
  function newForm(back) {
    const Lst = L(), maps = [];
    G().mapGroups.forEach((ms, g) => ms.forEach((hp, n) => maps.push([g, n])));
    const st = { sp: 144, lv: 50, map: 0, x: 5, y: 5 };
    const mapSel = h('select', { onchange: e => { st.map = +e.target.value; } }, ...maps.map(([g, n], k) => h('option', { value: k }, mapName(g, n))));
    return h('div', { class: 'tr-card' }, h('h4', {}, '➕ ' + T('New legendary')),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, T('Which Pokémon'), makeSelect(Lst.species, st.sp, v => { st.sp = v; })),
        h('label', { class: 'field' }, T('Level'), h('input', { type: 'number', min: 1, max: 100, value: st.lv, style: { width: '60px' }, onchange: e => { st.lv = +e.target.value; } })),
        h('label', { class: 'field' }, T('Map'), mapSel),
        h('label', { class: 'field' }, 'x', h('input', { type: 'number', value: st.x, style: { width: '60px' }, onchange: e => { st.x = +e.target.value; } })),
        h('label', { class: 'field' }, 'y', h('input', { type: 'number', value: st.y, style: { width: '60px' }, onchange: e => { st.y = +e.target.value; } }))),
      h('p', { class: 'muted' }, T('The player talks to it, hears its cry and battles it. Afterwards it is gone (caught or not). If it has no sprite of its own, one is made from its picture.')),
      h('button', { class: 'primary', onclick: () => {
        try {
          const [g, n] = maps[st.map], res = create(st.sp, Math.max(1, Math.min(100, st.lv)), g, n, st.x, st.y);
          toast(Tf('{name} now stands on {map}', { name: Lst.species[st.sp], map: mapName(g, n) }) + (res.made ? ' · ' + T('a sprite was made from its picture') : ''));
          showNew = false; const k = scan().filter(x => x.obj >= 0 || x.how === 'special').findIndex(x => x.g === g && x.n === n && x.obj === res.obj); if (k >= 0) sel = k; back();
        } catch (e) { toast(e.message, 'err'); }
      } }, '✔ ' + T('Put it on the map')));
  }
  return { select: k => { sel = k; showNew = false; }, visible: () => scan().filter(x => x.obj >= 0 || x.how === 'special'), scan, panel, create, species, level, item, spriteFromPicture, freeSprites, writeSprite, knownSprites };
})();
