// Story → "The journey": the whole game on one line, from the first town to the league. Every stop (a chapter of
// the story) shows its place, the badge won there with the leader and the level of their team, the HMs and the
// Pokémon you get, the legendaries waiting there, and the main moments (click one to open it in the story).
'use strict';

const Journey = (() => {
  const R = () => App.rom, G = () => App.game, L = () => App.getLists();
  const HM_FIRST = 339, HM_LAST = 346;
  const HM_ICON = ['✂', '🕊', '🌊', '💪', '🔦', '🪨', '🌀', '🤿'];

  function stops(m) {
    const byMap = new Map();
    m.beats.forEach(b => { const k = b.g + '.' + b.n; if (!byMap.has(k)) byMap.set(k, b.chapter); });
    const legends = typeof Legends !== 'undefined' ? Legends.visible() : [];
    const out = m.chapters.map((c, ci) => ({ ci, title: c.title, beats: [], main: [], badge: 0, leader: null, hms: new Set(), gifts: new Set(), legends: [], places: new Map() }));
    for (const b of m.beats) {
      const s = out[b.chapter]; if (!s) continue;
      s.beats.push(b); if (b.main) s.main.push(b);
      const mk = b.g + '.' + b.n; s.places.set(mk, (s.places.get(mk) || 0) + 1);
      for (const e of b.events) {
        for (const x of e.eff) if (x.k === 'flag' && x.set && App.game.isBadge(x.f)) {
          s.badge = x.f - App.game.badgeFlag + 1;
          const tb = e.battles.find(bt => bt.k === 'trainer'); if (tb && !s.leader) s.leader = tb.id;
        }
        for (const gv of e.gives) { if (gv.item >= HM_FIRST && gv.item <= HM_LAST) s.hms.add(gv.item); if (gv.sp) s.gifts.add(gv.sp); }
      }
    }
    legends.forEach((x, k) => { const c = byMap.get(x.g + '.' + x.n); if (c != null && out[c]) out[c].legends.push({ x, k }); });
    return out.filter(s => s.beats.length && s.ci < m.chapters.length - 1 || s.legends.length);
  }
  const mapName = k => { const [g, n] = k.split('.').map(Number), hp = (G().mapGroups[g] || [])[n]; return hp == null ? k : Game.mapName(R(), G(), R().u8[hp + 20]); };
  function teamLevel(id) { try { const t = TrainersTab.info(id); return Math.max(...t.team.map(p => p.lvl)); } catch (e) { return 0; } }

  function view(m, o) {
    const list = stops(m), wrap = h('div', { class: 'panel jr' });
    const badges = list.filter(s => s.badge).length, hms = new Set(list.flatMap(s => [...s.hms])).size, legs = list.reduce((a, s) => a + s.legends.length, 0);
    wrap.append(h('div', { class: 'jr-sum' },
      h('span', {}, '🏅 ' + Tf('{n} badges', { n: badges })), h('span', {}, '💿 ' + Tf('{n} HMs', { n: hms })), h('span', {}, '🐉 ' + Tf('{n} legendaries', { n: legs })),
      h('span', { class: 'muted' }, T('From the first town to the league, left to right. Click a moment to open it in the story.'))));
    // the leaders' levels as a small line: is the game getting harder step by step?
    const lv = list.filter(s => s.leader).map(s => teamLevel(s.leader));
    if (lv.length > 1) {
      const W = 240, H = 46, mx = Math.max(...lv, 10), cv = h('canvas', { width: W, height: H, class: 'jr-curve' }), c = cv.getContext('2d');
      c.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent') || '#6d8bff'; c.lineWidth = 2; c.beginPath();
      lv.forEach((v, i) => { const x = 8 + i * (W - 16) / (lv.length - 1), y = H - 6 - (v / mx) * (H - 12); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      lv.forEach((v, i) => { const x = 8 + i * (W - 16) / (lv.length - 1), y = H - 6 - (v / mx) * (H - 12); c.fillStyle = i && v < lv[i - 1] ? '#fa5252' : '#ffd43b'; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); });
      wrap.firstChild.append(h('span', { class: 'jr-curvebox', title: T('The level of each gym leader\'s strongest Pokémon, in order. A red dot is weaker than the one before.') }, T('Leaders') + ' ', cv));
    }
    const line = h('div', { class: 'jr-line' });
    list.forEach((s, i) => {
      const place = [...s.places.entries()].sort((a, b) => b[1] - a[1])[0];
      const head = h('div', { class: 'jr-dot' + (s.badge ? ' jr-badge' : '') }, s.badge ? String(s.badge) : String(i + 1));
      const card = h('div', { class: 'jr-card' },
        h('div', { class: 'jr-place', dir: 'auto' }, place ? mapName(place[0]) : s.title), h('div', { class: 'muted jr-sub', dir: 'auto' }, s.title));
      if (s.leader) {
        const t = Objects.trainer(s.leader), pic = TrainersTab.picCanvas(R().u8[G().offsets.trainers + s.leader * 40 + 3]);
        const pc = pic ? (() => { const c = h('canvas', { width: 64, height: 64, class: 'pixel' }); c.getContext('2d').drawImage(pic, 0, 0); return c; })() : '';
        card.append(h('div', { class: 'jr-leader', title: T('Open the trainer'), onclick: () => { TrainersTab.select(s.leader); App.show('trainers'); } }, pc,
          h('div', {}, h('b', { dir: 'auto' }, t ? (Objects.classNames()[t.cls] || '') + ' ' + t.name : '#' + s.leader), h('div', { class: 'muted' }, '🏅 ' + Tf('Badge {n}', { n: s.badge }) + ' · ' + T('lv') + ' ' + teamLevel(s.leader)))));
      }
      const chips = h('div', { class: 'jr-chips' });
      [...s.hms].sort().forEach(it => chips.append(h('span', { class: 'jr-chip', title: L().items[it] }, (HM_ICON[it - HM_FIRST] || '💿') + ' ' + (L().items[it] || 'HM'))));
      [...s.gifts].forEach(sp => chips.append(h('span', { class: 'jr-chip jr-mon', title: T('You get this Pokémon here') + ': ' + L().species[sp], onclick: () => { PokemonTab.select(sp); App.show('pokemon'); } }, PokemonTab.iconCanvas(sp, 24))));
      s.legends.forEach(({ x, k }) => chips.append(h('span', { class: 'jr-chip jr-leg', title: T('Legendary') + ': ' + L().species[Legends.species(x)], onclick: () => { PokemonTab.legends(); Legends.select(k); App.show('pokemon'); } }, PokemonTab.iconCanvas(Legends.species(x), 24), '🐉')));
      if (chips.children.length) card.append(chips);
      const mains = s.main.slice(0, 6);
      if (mains.length) card.append(h('div', { class: 'jr-beats' }, ...mains.map(b => h('div', { class: 'jr-beat', dir: 'auto', onclick: () => { StoryView.setView('timeline'); o.pick(b.id); } }, StoryView.icon(b) + ' ' + b.title)),
        s.main.length > 6 ? h('div', { class: 'muted', style: { fontSize: '12px' } }, Tf('and {n} more', { n: s.main.length - 6 })) : ''));
      line.append(h('div', { class: 'jr-stop' }, head, card));
    });
    wrap.append(line);
    return wrap;
  }
  return { view, stops };
})();
