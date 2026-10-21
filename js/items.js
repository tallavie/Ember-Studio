// Items & shops tab: every item (icon, name, price, description, where it is found and sold) and every shop of the
// game (the Poké Marts and other sellers found in the maps' scripts) with its list of items.
'use strict';

const ItemsTab = (() => {
  const R = () => App.rom, G = () => App.game, O = () => App.game.offsets, L = () => App.getLists();
  const ICONS = 0x3D4304;                                        // FireRed 1.1: {gfx, palette} per item, LZ77
  const POCKETS = ['', 'Items', 'Key items', 'Poké Balls', 'TMs & HMs', 'Berries'];
  let view = 'items', sel = 13, selShop = 0, query = '', pocket = 0, root = null, openIcon = false;

  const base = i => O().items + i * 44;
  function info(i) {
    const r = R(), b = base(i);
    return { i, b, name: Charmap.decode(r.u8, b, 14).text, price: r.r16(b + 16), hold: r.u8[b + 18], holdParam: r.u8[b + 19], desc: r.ptr(b + 20), pocket: r.u8[b + 26], type: r.u8[b + 27] };
  }
  let iconCache = new Map(), iconVer = -1;
  function icon(i, scale = 1) {
    if (iconVer !== App.romVersion) { iconCache.clear(); iconVer = App.romVersion; }
    let cv = iconCache.get(i);
    if (cv === undefined) {
      cv = null;
      try {
        const r = R(), g = LZ.decompress(r.u8, r.ptr(ICONS + i * 8)), p = LZ.decompress(r.u8, r.ptr(ICONS + i * 8 + 4));
        if (g && p) { cv = h('canvas', { width: 24, height: 24, class: 'pixel' }); cv.getContext('2d').putImageData(Gfx.toImageData(Gfx.tilesToPixels(g.data, 24, 24), 24, 24, Gfx.readPal(p.data, 0), true), 0, 0); }
      } catch (e) { cv = null; }
      iconCache.set(i, cv);
    }
    if (!cv) return h('span', { class: 'it-ic' });
    const c = h('canvas', { width: 24, height: 24, class: 'pixel it-ic' }); c.getContext('2d').drawImage(cv, 0, 0); c.style.width = 24 * scale + 'px'; return c;
  }

  // ---------- shops: "pokemart <list>" (0x86) in the scripts of every person on every map ----------
  let shopCache = null, shopVer = -1;
  function shops() {
    if (shopCache && shopVer === App.romVersion) return shopCache;
    const r = R(), byList = new Map();
    G().mapGroups.forEach((maps, g) => maps.forEach((hp, n) => {
      const ev = r.ptr(hp + 4); if (ev < 0) return;
      const po = r.ptr(ev + 4);
      for (let i = 0; i < r.u8[ev] && po >= 0; i++) Objects.forEach(r.ptr(po + i * 24 + 16), (op, p) => {
        if (op !== 0x86) return;
        const list = r.ptr(p + 1); if (list < 0) return;
        if (!byList.has(list)) byList.set(list, { list, at: [], where: [] });
        const s = byList.get(list); if (!s.at.includes(p + 1)) s.at.push(p + 1);
        if (!s.where.some(w => w.g === g && w.n === n)) s.where.push({ g, n, i });
      });
    }));
    shopCache = [...byList.values()].map(s => { s.items = []; for (let k = 0; k < 64; k++) { const v = r.r16(s.list + k * 2); if (!v) break; s.items.push(v); } return s; });
    shopVer = App.romVersion; return shopCache;
  }
  function writeShop(s, items) {
    const r = R(), arr = new Uint8Array(items.length * 2 + 2), dv = new DataView(arr.buffer);
    items.forEach((v, k) => dv.setUint16(k * 2, v, true));
    let dest = s.list;
    if (items.length > s.items.length) dest = r.writeNew(arr); else r.write(s.list, arr);
    if (dest !== s.list) for (const a of s.at) r.wptr(a, dest);
  }
  // item balls and hidden items with this item
  function foundAt(item) {
    const r = R(), out = [];
    G().mapGroups.forEach((maps, g) => maps.forEach((hp, n) => {
      const ev = r.ptr(hp + 4); if (ev < 0) return;
      const po = r.ptr(ev + 4), pb = r.ptr(ev + 16);
      for (let i = 0; i < r.u8[ev] && po >= 0; i++) { const sp = r.ptr(po + i * 24 + 16); if (sp >= 0 && r.u8[sp] === 0x1A && r.r16(sp + 1) === 0x8000 && r.r16(sp + 3) === item && r.u8[sp + 10] === 9) out.push({ g, n, kind: 'obj', i, hidden: false }); }
      for (let i = 0; i < r.u8[ev + 3] && pb >= 0; i++) { const e = pb + i * 12; if (r.u8[e + 5] === 7 && r.r16(e + 8) === item) out.push({ g, n, kind: 'bg', i, hidden: true }); }
    }));
    return out;
  }
  const mapLabel = (g, n) => Game.mapName(R(), G(), R().u8[G().mapGroups[g][n] + 20]) + ' ' + g + '.' + n;

  // ---------- UI ----------
  function render(el) {
    root = el; el.innerHTML = '';
    if (O().items < 0) { el.append(h('div', { class: 'panel err' }, T('The item table was not found in this ROM.'))); return; }
    el.append(h('div', { class: 'tabs' }, h('button', { class: view === 'items' ? 'sel' : '', onclick: () => { view = 'items'; render(root); } }, '🎒 ' + T('Items')),
      h('button', { class: view === 'shops' ? 'sel' : '', onclick: () => { view = 'shops'; render(root); } }, '🛒 ' + T('Shops'))));
    if (view === 'items') renderItems(el); else renderShops(el);
  }
  function renderItems(el) {
    const n = G().itemsCount, listEl = h('div', { class: 'tr-list' });
    const fill = () => {
      listEl.innerHTML = ''; const q = query.trim().toLowerCase();
      for (let i = 1; i < n; i++) {
        const it = info(i);
        if (pocket && it.pocket !== pocket) continue;
        if (q && !it.name.toLowerCase().includes(q) && String(i) !== q) continue;
        if (/^\?+$/.test(it.name)) continue;
        listEl.append(h('button', { class: 'tr-item' + (i === sel ? ' sel' : ''), onclick: () => { sel = i; render(root); } }, icon(i), h('span', { class: 'tr-name', dir: 'auto' }, it.name), h('span', { class: 'muted' }, it.price ? '💰' + it.price : '')));
      }
    };
    fill();
    const left = h('div', { class: 'panel tr-left' },
      h('select', { onchange: e => { pocket = +e.target.value; fill(); } }, ...POCKETS.map((p, k) => h('option', { value: k, selected: k === pocket }, k ? T(p) : T('All pockets')))),
      h('input', { type: 'search', placeholder: 'Search items…', value: query, oninput: e => { query = e.target.value; fill(); } }),
      ItemFx.FR11() ? h('select', { class: 'it-new', onchange: e => { const t = +e.target.value; e.target.value = ''; if (t) newItem(t); } },
        h('option', { value: '' }, '➕ ' + T('New item…')), ...TEMPLATES.map(([t, l]) => h('option', { value: t }, T(l)))) : '', listEl);
    el.append(h('div', { class: 'cols it-cols' }, left, itemCard(sel)));
  }
  // ---------- the item's icon: 24x24, 16 colours of its own (both LZ77) ----------
  function iconData(i) {
    const r = R(), g = LZ.decompress(r.u8, r.ptr(ICONS + i * 8)), p = LZ.decompress(r.u8, r.ptr(ICONS + i * 8 + 4));
    if (!g || !p) return null;
    return { px: Gfx.tilesToPixels(g.data, 24, 24), pal: Gfx.readPal(p.data, 0) };
  }
  // new copies (icons and palettes are shared between items: the others keep theirs)
  function saveIcon(i, px, pal) {
    const r = R();
    r.wptr(ICONS + i * 8, r.writeNew(LZ.compress(Gfx.pixelsToTiles(px, 24, 24))));
    r.wptr(ICONS + i * 8 + 4, r.writeNew(LZ.compress(Gfx.palBytes(pal))));
    iconCache.delete(i);
  }
  function iconSection(i) {
    const d = iconData(i); if (!d) return h('p', { class: 'muted' }, T('This item has no icon.'));
    const ed = PixelEditor({ w: 24, h: 24, px: d.px, pal: d.pal, zoom: 12, transparent: true, name: 'item_' + i });
    const others = h('select', {}, h('option', { value: '' }, T('Copy the icon of another item…')),
      ...Array.from({ length: G().itemsCount - 1 }, (_, k) => k + 1).filter(k => k !== i && !/^\?+$/.test(info(k).name)).map(k => h('option', { value: k }, k + ' · ' + info(k).name)));
    others.onchange = () => { const k = +others.value; if (!k) return; const o = iconData(k); if (o) { ed.px.set(o.px); ed.setPal(o.pal); } others.value = ''; };
    const importPic = async () => {
      const f = await ImgTools.pick(); if (!f) return;
      try {
        const cv = ImgTools.fit(ImgTools.removeBackground(await ImgTools.load(f)), 24, 24), id = ImgTools.data(cv);
        const pal = [d.pal[0], ...ImgTools.medianCut(id, 15)]; while (pal.length < 16) pal.push(0);
        ed.px.set(ImgTools.quantize(id, pal, 1)); ed.setPal(pal);
        toast(T('Picture imported: check it, then press Save icon'));
      } catch (x) { toast(x.message, 'err'); }
    };
    return h('div', {},
      h('div', { class: 'row wrap', style: { margin: '4px 0' } },
        h('button', { class: 'primary', onclick: () => { saveIcon(i, ed.px, ed.pal); App.lists = null; toast(T('Icon saved')); render(root); } }, '💾 ' + T('Save icon')),
        h('button', { onclick: () => { const o = iconData(i); ed.px.set(o.px); ed.setPal(o.pal); } }, '↶ ' + T('Back to the saved icon')),
        h('button', { onclick: importPic }, '🖼 ' + T('Import a picture…')), others),
      ed.el,
      h('p', { class: 'muted' }, T('Colour 0 is transparent. Double-click a colour to change it: the whole icon changes with it. A picture is fitted into 24×24 and gets 15 colours of its own.')));
  }

  // ---------- what the item does ----------
  const FIELD_NUM = (label, val, min, max, set, after) => h('label', { class: 'field' }, label, h('input', { type: 'number', min, max, value: val, style: { width: '80px' }, onchange: e => set(Math.max(min, Math.min(max, +e.target.value || 0))) }), after ? h('span', { class: 'muted' }, ' ' + after) : '');
  function effectSection(i, it, rer) {
    const r = R(), box = h('div'), says = [];
    const e = ItemFx.readEffect(i);
    // Poké Balls
    if (it.pocket === 3 && i >= 1 && i <= 12) {
      const bonus = ItemFx.ballBonus(i);
      if (bonus != null) {
        says.push(Tf('Catch chance ×{x} (a Poké Ball is ×1).', { x: bonus }));
        box.append(h('label', { class: 'field' }, T('Catch bonus'), h('span', {}, '×'), h('input', { type: 'number', step: 0.1, min: 0.1, max: 25, value: bonus, style: { width: '70px' }, onchange: ev => { ItemFx.setBallBonus(i, +ev.target.value || 1); rer(); } })),
          h('p', { class: 'muted' }, T('How much easier the ball catches than a plain Poké Ball. ×2 = twice as easy. The real chance also depends on the Pokémon, its HP and its status.')));
      } else {
        if (ItemFx.BALLS[i]) says.push(T(ItemFx.BALLS[i]));
        box.append(h('p', { class: 'muted' }, T('This ball\'s rule is part of the game\'s code and is shown here as it is.')));
      }
    }
    // medicine / battle items / stones
    if (e) {
      says.push(...ItemFx.describeEffect(e));
      const save = () => { ItemFx.writeEffect(i, e); if (e.par.heal != null && (it.hold === 1 || it.hold === 0) && e.par.heal < 0xFD) r.w8(it.b + 19, e.par.heal); rer(); };
      if (ItemFx.isMedicine(e)) {
        const f = e.f, p = e.par;
        const healOn = !!(f[4] & 0x04), mode = !healOn ? 'none' : p.heal === 0xFF ? 'all' : p.heal === 0xFE ? 'half' : p.heal === 0xFD ? 'level' : 'n';
        const modes = ['none', 'n', 'all', 'half'];
        const cur = modes.indexOf(mode === 'level' ? 'n' : mode);
        const modeSel = h('select', { onchange: ev => {
          const m = modes[+ev.target.value];
          if (m === 'none') { f[4] &= ~0x04; delete p.heal; } else { f[4] |= 0x04; p.heal = m === 'all' ? 0xFF : m === 'half' ? 0xFE : (p.heal && p.heal < 0xFD ? p.heal : 20); }
          save(); } }, ...[T('does not heal HP'), T('heals an amount of HP'), T('heals all HP'), T('heals half the HP')].map((l, k) => h('option', { value: k, selected: k === cur }, l)));
        box.append(h('div', { class: 'fields' }, h('label', { class: 'field' }, T('HP'), modeSel),
          mode === 'n' ? FIELD_NUM(T('How much HP'), p.heal, 1, 252, v => { p.heal = v; save(); }, T('(a Potion heals 20, a Super Potion 50)')) : ''));
        box.append(h('div', { class: 'row wrap' }, h('b', {}, T('Cures') + ':'), ...ItemFx.STATUS.map(([m, n]) => h('label', {}, h('input', { type: 'checkbox', checked: !!(f[3] & m), onchange: ev => { if (ev.target.checked) f[3] |= m; else f[3] &= ~m; save(); } }), ' ' + T(n)))));
        box.append(h('div', { class: 'row wrap' },
          h('label', {}, h('input', { type: 'checkbox', checked: !!(f[4] & 0x40), onchange: ev => { if (ev.target.checked) { f[4] |= 0x44; if (p.heal == null) p.heal = 0xFE; } else f[4] &= ~0x40; save(); } }), ' ' + T('Revives a fainted Pokémon')),
          h('label', {}, h('input', { type: 'checkbox', checked: !!(f[0] & 0x40), onchange: ev => { if (ev.target.checked) f[0] |= 0x40; else f[0] &= ~0x40; save(); } }), ' ' + T('Works on the whole party'))));
        if (f[4] & 0x08) box.append(h('div', { class: 'fields' },
          FIELD_NUM(T('PP restored'), p.pp === 0x7F ? 0 : p.pp, 0, 99, v => { p.pp = v || 0x7F; save(); }, T('(0 = all)')),
          h('label', {}, h('input', { type: 'checkbox', checked: !!(f[4] & 0x10), onchange: ev => { if (ev.target.checked) f[4] |= 0x10; else f[4] &= ~0x10; save(); } }), ' ' + T('only one move (the player chooses)'))));
        for (const [k, n] of ItemFx.EVS) if (p[k] != null) box.append(FIELD_NUM(Tf('Effort points: {stat}', { stat: T(n) }), p[k], 1, 255, v => { p[k] = v; save(); }));
      } else if (ItemFx.isBattleBoost(e)) {
        const f = e.f, stat = [['Attack', 0, 0x0F, 0], ['Defense', 1, 0xF0, 4], ['Speed', 1, 0x0F, 0], ['Accuracy', 2, 0xF0, 4], ['Sp. Atk', 2, 0x0F, 0]];
        box.append(h('div', { class: 'fields' }, ...stat.map(([n, b, m, sh]) => FIELD_NUM(Tf('Raises {stat} by', { stat: T(n) }), (f[b] & m) >> sh, 0, 6, v => { f[b] = (f[b] & ~m) | ((v << sh) & m); save(); }))));
      }
    }
    // evolution stone: who evolves with it
    if (ItemFx.isStone(e)) box.append(stoneSection(i));
    // repel
    if (ItemFx.isRepel(i)) {
      says.push(Tf('Keeps weak wild Pokémon away for {n} steps.', { n: it.holdParam }));
      box.append(FIELD_NUM(T('Steps'), it.holdParam, 1, 255, v => { r.w8(it.b + 19, v); rer(); }, T('(Repel 100, Super Repel 200, Max Repel 250)')));
    }
    // held by a Pokémon
    const H = ItemFx.hold(it.hold);
    if (it.hold) says.push(T('When a Pokémon holds it:') + ' ' + T(H[3]) + (H[2] ? ' (' + T(H[2]) + ': ' + it.holdParam + ')' : ''));
    const holdSel = h('select', { onchange: ev => { r.w8(it.b + 18, +ev.target.value); rer(); } }, ...ItemFx.HOLD.map(([id, n]) => h('option', { value: id, selected: id === it.hold }, T(n))));
    box.append(h('h4', {}, T('When a Pokémon holds it')), h('div', { class: 'fields' }, h('label', { class: 'field' }, T('Effect'), holdSel),
      it.hold && H[2] && !ItemFx.isRepel(i) ? FIELD_NUM(T(H[2]), it.holdParam, 0, 255, v => { r.w8(it.b + 19, v); rer(); }) : ''),
      it.hold ? h('p', { class: 'muted' }, T(H[3])) : '');
    if (!says.length) says.push(T('This item has no effect of its own when used (for example a key item or something to sell).'));
    return h('div', {}, h('div', { class: 'it-says' }, ...says.map(t => h('div', {}, '• ' + t))), box);
  }
  // Pokémon that evolve with this item (evolution method 7 = "with the item")
  function stoneSection(i) {
    const r = R(), L0 = L(), ev = O().evolutions, N = G().speciesCount, rows = [];
    for (let s = 1; s < N; s++) for (let k = 0; k < 5; k++) { const e = ev + s * 40 + k * 8; if (r.r16(e) === 7 && r.r16(e + 2) === i) rows.push({ s, k, t: r.r16(e + 4), e }); }
    const spSel = () => h('select', {}, ...Array.from({ length: N - 1 }, (_, k) => k + 1).map(k => h('option', { value: k }, L0.species[k] || k)));
    const from = spSel(), to = spSel();
    const remove = x => { const b = new Uint8Array(40); for (let k = 0, j = 0; k < 5; k++) if (k !== x.k) { b.set(r.u8.slice(ev + x.s * 40 + k * 8, ev + x.s * 40 + k * 8 + 8), j * 8); j++; } r.write(ev + x.s * 40, b); render(root); };
    const add = () => {
      const s = +from.value, t = +to.value; let k = 0; while (k < 5 && r.r16(ev + s * 40 + k * 8)) k++;
      if (k >= 5) { toast(T('That Pokémon already has five ways to evolve'), 'err'); return; }
      const b = new Uint8Array(8), dv = new DataView(b.buffer); dv.setUint16(0, 7, true); dv.setUint16(2, i, true); dv.setUint16(4, t, true); r.write(ev + s * 40 + k * 8, b); render(root);
    };
    return h('div', {}, h('h4', {}, T('Pokémon that evolve with it')),
      rows.length ? h('div', {}, ...rows.map(x => h('div', { class: 'row' }, h('span', { dir: 'auto' }, (L0.species[x.s] || x.s) + ' → ' + (L0.species[x.t] || x.t)),
        h('button', { class: 'mu-x', title: T('Remove'), onclick: () => remove(x) }, '✕')))) : h('p', { class: 'muted' }, T('No Pokémon evolves with it yet.')),
      h('div', { class: 'row wrap' }, from, '→', to, h('button', { onclick: add }, '+ ' + T('Add'))));
  }

  // ---------- a new item: an unused slot ("????????") made from an existing item ----------
  const TEMPLATES = [[13, 'Heals HP (like Potion)'], [23, 'Cures status (like Full Heal)'], [24, 'Revives (like Revive)'], [34, 'Restores PP (like Ether)'],
    [64, 'Raises a stat for good (like Protein)'], [75, 'Raises a stat in battle (like X Attack)'], [95, 'Evolution stone (like Fire Stone)'],
    [215, 'Held item (like Charcoal)'], [86, 'Repel (like Repel)'], [110, 'Something to sell (like Nugget)']];
  function freeSlot(needEffect) {
    for (let k = 1; k < G().itemsCount; k++) {
      if (!/^\?+$/.test(info(k).name)) continue;
      if (needEffect && (k < ItemFx.FIRST || k > ItemFx.LAST)) continue;
      return k;
    }
    return -1;
  }
  function newItem(tpl) {
    const r = R(), te = ItemFx.readEffect(tpl), id = freeSlot(!!te);
    if (id < 0) { toast(T('There is no free item slot left for this kind of item'), 'err'); return; }
    const src = r.u8.slice(base(tpl), base(tpl) + 44);
    const nm = new Uint8Array(14); nm.set(Charmap.encode(T('New item'), { rtl: App.settings.rtl }).slice(0, 13)); src.set(nm, 0);
    new DataView(src.buffer).setUint16(14, id, true);
    r.write(base(id), src);
    const desc = Charmap.encode(T('A new item.'), { rtl: App.settings.rtl }), d = new Uint8Array(desc.length + 1); d.set(desc); d[desc.length] = 0xFF;
    r.wptr(base(id) + 20, r.writeNew(d));
    if (te) ItemFx.writeEffect(id, te);
    r.write(ICONS + id * 8, r.u8.slice(ICONS + tpl * 8, ICONS + tpl * 8 + 8)); iconCache.delete(id);
    App.lists = null; sel = id; query = ''; pocket = 0;
    toast(Tf('New item #{id} made like {tpl}: give it a name, an icon and a description', { id, tpl: info(tpl).name }));
    render(root);
  }

  function itemCard(i) {
    const r = R(), it = info(i), rer = () => render(root);
    const nameIn = h('input', { value: it.name, dir: 'auto', style: { width: '160px' }, onchange: e => {
      const b = Charmap.encode(e.target.value, { rtl: App.settings.rtl }); if (b.length > 14) { toast(T('The name is too long (up to 13 letters)'), 'err'); return; }
      const a = new Uint8Array(14).fill(0); a.set(b); r.write(it.b, a); App.lists = null; rer(); } });
    const sold = shops().filter(s => s.items.includes(i)), found = foundAt(i), eff = ItemFx.readEffect(i);
    const card = h('div', { class: 'panel tr-card' },
      h('div', { class: 'tr-head' }, h('div', { class: 'tr-pic' }, icon(i, 3)),
        h('div', { class: 'tr-fields' }, h('div', { class: 'card-chip' }, '🎒 ' + T('Item') + ' · #' + i + (POCKETS[it.pocket] ? ' · ' + T(POCKETS[it.pocket]) : '')), h('div', { class: 'tr-title', dir: 'auto' }, it.name),
          h('label', { class: 'field' }, T('Name'), nameIn),
          h('label', { class: 'field' }, T('Price in shops'), h('input', { type: 'number', min: 0, max: 65535, value: it.price, style: { width: '90px' }, onchange: e => { r.w16(it.b + 16, Math.max(0, Math.min(65535, +e.target.value))); rer(); } })),
          h('div', { class: 'muted' }, T('Players sell it back for half the price.')))),
      h('div', { class: 'tr-sec' }, h('h4', {}, '✨ ' + T('What it does')), effectSection(i, it, rer)),
      h('details', { class: 'hdr tr-sec', open: openIcon, ontoggle: e => { openIcon = e.target.open; } }, h('summary', {}, '🎨 ' + T('How it looks (icon)')), iconSection(i)),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Description (in the bag)')), it.desc >= 0 ? Objects.textBubble(it.desc, { commit: (l, fn) => { try { fn(); return true; } catch (x) { toast(x.message, 'err'); return false; } }, refresh: rer }) : h('p', { class: 'muted' }, '—')),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Sold in')), sold.length ? h('div', {}, ...sold.map(s => h('div', { class: 'row' }, h('span', { dir: 'auto' }, s.where.map(w => mapLabel(w.g, w.n)).join(', ')),
        h('button', { onclick: () => { view = 'shops'; selShop = shops().indexOf(s); render(root); } }, T('Open shop'))))) : h('p', { class: 'muted' }, T('Not sold in any shop.'))),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Found on the maps')), found.length ? h('div', {}, ...found.map(f => h('div', { class: 'row' }, h('span', { dir: 'auto' }, (f.hidden ? '✨ ' + T('hidden') + ' · ' : '● ') + mapLabel(f.g, f.n)),
        h('button', { onclick: () => MapsTab.api.open(f.g, f.n, { kind: f.kind, i: f.i }) }, T('Show on the map'))))) : h('p', { class: 'muted' }, T('Not lying around on any map.'))),
      h('details', { class: 'hdr' }, h('summary', {}, T('Advanced')), h('div', { class: 'fields' },
        h('label', { class: 'field' }, T('Pocket'), makeSelect(POCKETS.map(p => p || '—'), it.pocket, v => { r.w8(it.b + 26, v); rer(); })),
        h('label', { class: 'field' }, T('Hold effect') + ' (#)', h('input', { type: 'number', value: it.hold, style: { width: '70px' }, onchange: e => { r.w8(it.b + 18, +e.target.value); rer(); } })),
        h('label', { class: 'field' }, T('Hold effect strength') + ' (#)', h('input', { type: 'number', value: it.holdParam, style: { width: '70px' }, onchange: e => { r.w8(it.b + 19, +e.target.value); rer(); } }))),
        eff ? h('div', { class: 'muted', style: { fontFamily: 'monospace', fontSize: '12px' } }, T('Effect data') + ': ' + Array.from(ItemFx.encode(eff)).map(v => v.toString(16).padStart(2, '0')).join(' ')) : ''));
    return card;
  }
  function renderShops(el) {
    const list = shops();
    if (!list.length) { el.append(h('div', { class: 'panel' }, T('No shops were found in the scripts.'))); return; }
    if (selShop >= list.length) selShop = 0;
    const left = h('div', { class: 'panel tr-left' }, h('div', { class: 'tr-list' }, ...list.map((s, k) => h('button', { class: 'tr-item' + (k === selShop ? ' sel' : ''), onclick: () => { selShop = k; render(root); } },
      h('span', { class: 'tr-name', dir: 'auto' }, '🛒 ' + s.where.map(w => mapLabel(w.g, w.n)).join(', ')), h('span', { class: 'muted' }, String(s.items.length))))));
    const s = list[selShop], items = s.items.slice(), rer = () => render(root);
    const save = () => { writeShop(s, items); rer(); };
    const rows = items.map((v, k) => { const it = info(v); return h('div', { class: 'tr-mon' }, icon(v), h('span', { dir: 'auto', style: { minWidth: '140px' } }, it.name), h('span', { class: 'muted' }, '💰' + it.price),
      h('span', { class: 'tr-btns' }, k > 0 ? h('button', { class: 'mu-x', title: T('Move up'), onclick: () => { items.splice(k - 1, 0, items.splice(k, 1)[0]); save(); } }, '↑') : '',
        h('button', { class: 'mu-x', title: T('Item details'), onclick: () => { view = 'items'; sel = v; render(root); } }, '✎'),
        items.length > 1 ? h('button', { class: 'mu-x', title: T('Remove'), onclick: () => { items.splice(k, 1); save(); } }, '✕') : '')); });
    const card = h('div', { class: 'panel tr-card' }, h('h3', { dir: 'auto' }, '🛒 ' + s.where.map(w => mapLabel(w.g, w.n)).join(', ')),
      h('div', { class: 'row wrap' }, ...s.where.map(w => h('button', { onclick: () => MapsTab.api.open(w.g, w.n, { kind: 'obj', i: w.i }) }, T('Show the seller') + ' · ' + mapLabel(w.g, w.n)))),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('What it sells')), ...rows,
        items.length < 60 ? h('div', { class: 'row', style: { marginTop: '6px' } }, T('Add:'), Objects.itemPicker(0, v => { if (v && !items.includes(v)) { items.push(v); save(); } })) : ''),
      h('p', { class: 'muted' }, T('Prices are set per item (Items tab) and are the same in every shop.')));
    el.append(h('div', { class: 'cols it-cols' }, left, card));
  }
  return { render, info, shops, icon, select: i => { sel = i; view = 'items'; query = ''; pocket = 0; } };
})();
