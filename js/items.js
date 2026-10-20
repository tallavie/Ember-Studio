// Items & shops tab: every item (icon, name, price, description, where it is found and sold) and every shop of the
// game (the Poké Marts and other sellers found in the maps' scripts) with its list of items.
'use strict';

const ItemsTab = (() => {
  const R = () => App.rom, G = () => App.game, O = () => App.game.offsets, L = () => App.getLists();
  const ICONS = 0x3D4304;                                        // FireRed 1.1: {gfx, palette} per item, LZ77
  const POCKETS = ['', 'Items', 'Key items', 'Poké Balls', 'TMs & HMs', 'Berries'];
  let view = 'items', sel = 13, selShop = 0, query = '', pocket = 0, root = null;

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
      h('input', { type: 'search', placeholder: 'Search items…', value: query, oninput: e => { query = e.target.value; fill(); } }), listEl);
    el.append(h('div', { class: 'cols it-cols' }, left, itemCard(sel)));
  }
  function itemCard(i) {
    const r = R(), it = info(i), rer = () => render(root);
    const nameIn = h('input', { value: it.name, dir: 'auto', style: { width: '160px' }, onchange: e => {
      const b = Charmap.encode(e.target.value, { rtl: App.settings.rtl }); if (b.length > 14) { toast(T('The name is too long (up to 13 letters)'), 'err'); return; }
      const a = new Uint8Array(14).fill(0); a.set(b); r.write(it.b, a); App.lists = null; rer(); } });
    const sold = shops().filter(s => s.items.includes(i)), found = foundAt(i);
    const card = h('div', { class: 'panel tr-card' },
      h('div', { class: 'tr-head' }, h('div', { class: 'tr-pic' }, icon(i, 3)),
        h('div', { class: 'tr-fields' }, h('div', { class: 'tr-title', dir: 'auto' }, it.name, h('span', { class: 'muted' }, ' #' + i + ' · ' + T(POCKETS[it.pocket] || ''))),
          h('label', { class: 'field' }, T('Name'), nameIn),
          h('label', { class: 'field' }, T('Price in shops'), h('input', { type: 'number', min: 0, max: 65535, value: it.price, style: { width: '90px' }, onchange: e => { r.w16(it.b + 16, Math.max(0, Math.min(65535, +e.target.value))); rer(); } })),
          h('div', { class: 'muted' }, T('Players sell it back for half the price.')))),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Description (in the bag)')), it.desc >= 0 ? Objects.textBubble(it.desc, { commit: (l, fn) => { try { fn(); return true; } catch (x) { toast(x.message, 'err'); return false; } }, refresh: rer }) : h('p', { class: 'muted' }, '—')),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Sold in')), sold.length ? h('div', {}, ...sold.map(s => h('div', { class: 'row' }, h('span', { dir: 'auto' }, s.where.map(w => mapLabel(w.g, w.n)).join(', ')),
        h('button', { onclick: () => { view = 'shops'; selShop = shops().indexOf(s); render(root); } }, T('Open shop'))))) : h('p', { class: 'muted' }, T('Not sold in any shop.'))),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Found on the maps')), found.length ? h('div', {}, ...found.map(f => h('div', { class: 'row' }, h('span', { dir: 'auto' }, (f.hidden ? '✨ ' + T('hidden') + ' · ' : '● ') + mapLabel(f.g, f.n)),
        h('button', { onclick: () => MapsTab.api.open(f.g, f.n, { kind: f.kind, i: f.i }) }, T('Show on the map'))))) : h('p', { class: 'muted' }, T('Not lying around on any map.'))),
      h('details', { class: 'hdr' }, h('summary', {}, T('Advanced')), h('div', { class: 'fields' },
        h('label', { class: 'field' }, T('Hold effect'), h('input', { type: 'number', value: it.hold, onchange: e => { r.w8(it.b + 18, +e.target.value); rer(); } })),
        h('label', { class: 'field' }, T('Hold effect strength'), h('input', { type: 'number', value: it.holdParam, onchange: e => { r.w8(it.b + 19, +e.target.value); rer(); } })),
        h('label', { class: 'field' }, T('Pocket'), makeSelect(POCKETS.map(p => p || '—'), it.pocket, v => { r.w8(it.b + 26, v); rer(); })))));
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
  return { render, info, shops, icon };
})();
