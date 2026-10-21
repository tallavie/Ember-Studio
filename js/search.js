// Search everything (Ctrl+K): maps, Pokémon, legendaries, trainers, items, moves, the editor's own screens, and the
// game's text. Type, move with the arrows, Enter opens the place.
'use strict';

const Search = (() => {
  let back = null, idx = null, idxVer = -1;
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  function build() {
    if (idx && idxVer === App.romVersion) return idx;
    const out = [], L = App.getLists(), G = App.game, r = App.rom;
    const add = (kind, icon, title, sub, go, extra = '') => out.push({ kind, icon, title, sub, go, key: norm(title + ' ' + sub + ' ' + extra) });
    for (const [k, [label]] of Object.entries(App.tabs)) add('screen', App.navIcons[k] || '•', T(label.replace(/^\p{Extended_Pictographic}\s*/u, '')), T('Screen'), () => App.show(k), label);
    add('screen', '🐉', T('Legendaries in the world'), T('Screen'), () => { PokemonTab.legends(); App.show('pokemon'); });
    add('screen', '🌍', T('World view (all connected maps)'), T('Screen'), () => { App.show('maps'); MapsTab.api.openWorld(); });
    G.mapGroups.forEach((maps, g) => maps.forEach((hp, n) => add('map', '🗺', Game.mapName(r, G, r.u8[hp + 20]) + ' ' + g + '.' + n, T('Map'), () => { App.show('maps'); MapsTab.api.open(g, n); }, g + '.' + n)));
    for (let s = 1; s < G.speciesCount; s++) if (L.species[s] && !/^\?+$/.test(L.species[s])) add('pokemon', '🐾', L.species[s], T('A Pokémon') + ' #' + s, () => { PokemonTab.select(s); App.show('pokemon'); }, String(s));
    if (typeof Legends !== 'undefined') Legends.visible().forEach((x, k) => add('legend', '🐉', L.species[Legends.species(x)] + ' · ' + T('lv') + ' ' + Legends.level(x), T('Legendary') + ' · ' + Game.mapName(r, G, r.u8[G.mapGroups[x.g][x.n] + 20]), () => { PokemonTab.legends(); Legends.select(k); App.show('pokemon'); }));
    for (let id = 1; id < (TrainersTab.COUNT || 743); id++) { const t = Objects.trainer(id); if (!t || !t.name) continue; add('trainer', '🧢', (Objects.classNames()[t.cls] || '') + ' ' + t.name, T('Trainer') + ' #' + id, () => { TrainersTab.select(id); App.show('trainers'); }, String(id)); }
    for (let i = 1; i < G.itemsCount; i++) if (L.items[i] && !/^\?+$/.test(L.items[i])) add('item', '🎒', L.items[i], T('Item') + ' #' + i, () => { ItemsTab.select(i); App.show('items'); }, String(i));
    for (let m = 1; m < (L.moves || []).length; m++) if (L.moves[m]) add('move', '⚔', L.moves[m], T('Move') + ' #' + m, () => { MovesTab.select(m); App.show('moves'); }, String(m));
    idx = out; idxVer = App.romVersion; return idx;
  }
  function find(q) {
    const words = norm(q).split(/\s+/).filter(Boolean); if (!words.length) return [];
    const res = [];
    for (const e of build()) {
      if (!words.every(w => e.key.includes(w))) continue;
      const t = norm(e.title), score = (t === words.join(' ') ? 0 : t.startsWith(words[0]) ? 1 : 2) + (e.kind === 'screen' ? -0.5 : 0);
      res.push([score, e]);
    }
    res.sort((a, b) => a[0] - b[0] || a[1].title.length - b[1].title.length);
    return res.slice(0, 60).map(x => x[1]);
  }
  function open() {
    if (back) { back.querySelector('input').focus(); return; }
    let list = [], cur = 0;
    const inp = h('input', { type: 'search', class: 'sr-input', placeholder: T('Search maps, Pokémon, trainers, items, moves, screens…') });
    const box = h('div', { class: 'sr-list' }), foot = h('div', { class: 'sr-foot muted' });
    const close = () => { if (back) { back.remove(); back = null; } };
    const go = e => { close(); try { e.go(); } catch (x) { toast(x.message, 'err'); } };
    const draw = () => {
      box.innerHTML = '';
      list.forEach((e, k) => box.append(h('div', { class: 'sr-row' + (k === cur ? ' sel' : ''), onmouseenter: () => { cur = k; draw(); }, onclick: () => go(e) },
        h('span', { class: 'sr-ic' }, e.icon), h('span', { class: 'sr-title', dir: 'auto' }, e.title), h('span', { class: 'sr-sub muted', dir: 'auto' }, e.sub))));
      const q = inp.value.trim();
      if (q && !list.length) box.append(h('div', { class: 'muted', style: { padding: '14px' } }, T('Nothing found.')));
      foot.innerHTML = '';
      if (q) foot.append(h('button', { onclick: () => { close(); TextTab.search(q); App.show('text'); } }, '💬 ' + Tf('Search "{q}" in the game\'s text', { q })));
      foot.append(h('span', {}, '↑↓ ' + T('choose') + ' · Enter ' + T('open') + ' · Esc ' + T('close')));
      const s = box.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    };
    inp.oninput = () => { list = find(inp.value); cur = 0; draw(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { cur = Math.min(list.length - 1, cur + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (list[cur]) go(list[cur]); else if (inp.value.trim()) { const q = inp.value.trim(); close(); TextTab.search(q); App.show('text'); } }
      else if (e.key === 'Escape') close();
    };
    back = h('div', { class: 'modal-back sr-back', onclick: e => { if (e.target === back) close(); } }, h('div', { class: 'sr-box' }, inp, box, foot));
    document.body.append(back); inp.focus(); draw();
  }
  return { open, find, reset: () => { idx = null; } };
})();
