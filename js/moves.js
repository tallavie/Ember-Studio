// Moves tab: every move (name, type, power, accuracy, PP, priority, what it does, description) with who learns it,
// plus the TM / HM list and the move tutors.
'use strict';

const MovesTab = (() => {
  const R = () => App.rom, G = () => App.game, O = () => App.game.offsets, L = () => App.getLists();
  const TM_COUNT = 58;
  // Gen 3 battle effects, in order
  const EFFECTS = ('hit|sleep|poison hit|absorb|burn hit|freeze hit|paralyze hit|explosion|dream eater|mirror move|attack up|defense up|speed up|sp. atk up|sp. def up|accuracy up|evasion up|' +
    'always hits|attack down|defense down|speed down|sp. atk down|sp. def down|accuracy down|evasion down|haze|bide|rampage|roar|multi-hit|conversion|flinch hit|restore HP|toxic|pay day|' +
    'light screen|tri attack|rest|one-hit KO|razor wind|super fang|dragon rage|trap|high critical|double hit|recoil if miss|mist|focus energy|recoil|confuse|attack up 2|defense up 2|' +
    'speed up 2|sp. atk up 2|sp. def up 2|accuracy up 2|evasion up 2|transform|attack down 2|defense down 2|speed down 2|sp. atk down 2|sp. def down 2|accuracy down 2|evasion down 2|' +
    'reflect|poison|paralyze|attack down hit|defense down hit|speed down hit|sp. atk down hit|sp. def down hit|accuracy down hit|evasion down hit|sky attack|confuse hit|twineedle|' +
    'vital throw|substitute|recharge|rage|mimic|metronome|leech seed|splash|disable|level damage|psywave|counter|encore|pain split|snore|conversion 2|lock-on|sketch|unused|sleep talk|' +
    'destiny bond|flail|spite|false swipe|heal bell|quick attack|triple kick|thief|mean look|nightmare|minimize|curse|unused|protect|spikes|foresight|perish song|sandstorm|endure|' +
    'rollout|swagger|fury cutter|attract|return|present|frustration|safeguard|thaw hit|magnitude|baton pass|pursuit|rapid spin|sonic boom|unused|morning sun|synthesis|moonlight|' +
    'hidden power|rain dance|sunny day|defense up hit|attack up hit|all stats up hit|unused|belly drum|psych up|mirror coat|skull bash|twister|earthquake|future sight|gust|' +
    'flinch + minimize hit|solar beam|thunder|teleport|beat up|semi-invulnerable|defense curl|soft-boiled|fake out|uproar|stockpile|spit up|swallow|unused|hail|torment|flatter|' +
    'will-o-wisp|memento|facade|focus punch|smelling salts|follow me|nature power|charge|taunt|helping hand|trick|role play|wish|assist|ingrain|superpower|magic coat|recycle|' +
    'revenge|brick break|yawn|knock off|endeavor|eruption|skill swap|imprison|refresh|grudge|snatch|low kick|secret power|double-edge|teeter dance|blaze kick|mud sport|' +
    'poison fang|weather ball|overheat|tickle|cosmic power|sky uppercut|bulk up|poison tail|water sport|calm mind|dragon dance|camouflage').split('|');
  const TARGETS = [[0, 'One foe (you choose)'], [1, 'Depends on the move'], [4, 'A random foe'], [8, 'Both foes'], [16, 'Itself'], [32, 'Everyone else'], [64, "The foes' side of the field"]];
  const FLAGS = ['Makes contact', 'Blocked by Protect', 'Reflected by Magic Coat', 'Stolen by Snatch', 'Copied by Mirror Move', "King's Rock can flinch"];
  const SPECIAL_TYPES = new Set([10, 11, 12, 13, 14, 15, 16, 17]);      // Gen 3: physical / special is decided by the type
  let sel = 33, query = '', view = 'moves', root = null;

  const md = m => O().moveData + m * 12;
  function info(m) {
    const r = R(), b = md(m);
    return { m, b, name: Charmap.decode(r.u8, O().moveNames + m * 13, 13).text, effect: r.u8[b], power: r.u8[b + 1], type: r.u8[b + 2], acc: r.u8[b + 3], pp: r.u8[b + 4], chance: r.u8[b + 5],
      target: r.u8[b + 6], prio: (r.u8[b + 7] << 24) >> 24, flags: r.u8[b + 8], desc: m > 0 && O().moveDescs >= 0 ? r.ptr(O().moveDescs + (m - 1) * 4) : -1 };
  }
  const tmMove = k => R().r16(O().tmMoves + k * 2);
  const tmName = k => k < 50 ? 'TM' + String(k + 1).padStart(2, '0') : 'HM' + String(k - 49).padStart(2, '0');
  // who learns the move: by level, by TM / HM, by tutor
  function learners(m) {
    const r = R(), g = G(), o = O(), out = { level: [], tm: [], tutor: [] };
    const tm = []; for (let k = 0; k < TM_COUNT; k++) if (tmMove(k) === m) tm.push(k);
    const tutor = []; if (O().tutors >= 0) for (let k = 0; k < App.game.tutorCount; k++) if (r.r16(O().tutors + k * 2) === m) tutor.push(k);
    for (let sp = 1; sp < g.speciesCount; sp++) {
      const p = r.ptr(o.learnsets + sp * 4);
      for (let i = 0; p >= 0 && i < 64; i++) { const v = r.r16(p + i * 2); if (v === 0xFFFF) break; if ((v & 0x1FF) === m) { out.level.push([sp, v >> 9]); break; } }
      if (o.tmCompat >= 0) for (const k of tm) if (r.u8[o.tmCompat + sp * 8 + (k >> 3)] & (1 << (k & 7))) { out.tm.push([sp, tmName(k)]); break; }
    }
    out.tmSlots = tm.map(tmName); out.tutorSlots = tutor;
    return out;
  }

  function render(el) {
    root = el; el.innerHTML = '';
    if (O().moveData < 0) { el.append(h('div', { class: 'panel err' }, T('The move table was not found in this ROM.'))); return; }
    el.append(h('div', { class: 'tabs' }, h('button', { class: view === 'moves' ? 'sel' : '', onclick: () => { view = 'moves'; render(root); } }, '⚔ ' + T('Moves')),
      h('button', { class: view === 'tm' ? 'sel' : '', onclick: () => { view = 'tm'; render(root); } }, '💿 ' + T('TMs, HMs & tutors'))));
    if (view === 'tm') { el.append(tmPanel()); return; }
    const listEl = h('div', { class: 'tr-list' }), types = L().types;
    const fill = () => {
      listEl.innerHTML = ''; const q = query.trim().toLowerCase();
      for (let m = 1; m < G().movesCount; m++) {
        const it = info(m); if (q && !it.name.toLowerCase().includes(q) && String(m) !== q && !(types[it.type] || '').toLowerCase().includes(q)) continue;
        listEl.append(h('button', { class: 'tr-item' + (m === sel ? ' sel' : ''), onclick: () => { sel = m; render(root); } }, h('span', { class: 'tr-id' }, '#' + m), h('span', { class: 'tr-name', dir: 'auto' }, it.name),
          h('span', { class: 'muted' }, (types[it.type] || '') + (it.power > 1 ? ' · ' + it.power : ''))));
      }
    };
    fill();
    el.append(h('div', { class: 'cols it-cols' }, h('div', { class: 'panel tr-left' }, h('input', { type: 'search', placeholder: 'Search name, type or #…', value: query, oninput: e => { query = e.target.value; fill(); } }), listEl), card(sel)));
  }
  function card(m) {
    const r = R(), it = info(m), rer = () => render(root), types = L().types;
    const num = (label, off, v, min, max, help) => h('label', { class: 'field' }, label, h('input', { type: 'number', value: v, min, max, style: { width: '80px' }, onchange: e => { r.w8(off, Math.max(min, Math.min(max, +e.target.value)) & 255); rer(); } }), help ? h('small', { class: 'muted' }, help) : '');
    const nameIn = h('input', { value: it.name, dir: 'auto', style: { width: '160px' }, onchange: e => {
      const b = Charmap.encode(e.target.value, { rtl: App.settings.rtl }); if (b.length > 13) { toast(T('The name is too long (up to 12 letters)'), 'err'); return; }
      const a = new Uint8Array(13).fill(0); a.set(b); r.write(O().moveNames + m * 13, a); App.lists = null; rer(); } });
    const lr = learners(m), sp = L().species;
    const effectSel = h('select', { onchange: e => { r.w8(it.b, +e.target.value); rer(); } }, ...EFFECTS.map((n, k) => h('option', { value: k, selected: k === it.effect }, k + ': ' + T(n))));
    return h('div', { class: 'panel tr-card' },
      h('div', { class: 'tr-title', dir: 'auto' }, it.name, h('span', { class: 'muted' }, ' #' + m + ' · ' + (types[it.type] || '') + ' · ' + (it.power > 1 ? (SPECIAL_TYPES.has(it.type) ? T('special') : T('physical')) : T('status')))),
      h('div', { class: 'fields' },
        h('label', { class: 'field' }, T('Name'), nameIn),
        h('label', { class: 'field' }, T('Type'), makeSelect(types, it.type, v => { r.w8(it.b + 2, v); rer(); }), h('small', { class: 'muted' }, T('In this generation the type decides physical or special.'))),
        num(T('Power'), it.b + 1, it.power, 0, 255, T('0 = no damage, 1 = special formula')),
        num(T('Accuracy %'), it.b + 3, it.acc, 0, 100, T('0 = never misses')),
        num(T('PP (uses)'), it.b + 4, it.pp, 1, 64),
        h('label', { class: 'field' }, T('Goes first?'), h('select', { onchange: e => { r.w8(it.b + 7, +e.target.value & 255); rer(); } },
          ...[[-6, 'Last (−6)'], [-5, '−5'], [-4, '−4'], [-3, '−3'], [-2, '−2'], [-1, '−1'], [0, 'Normal'], [1, 'First (+1)'], [2, '+2'], [3, '+3'], [4, 'Always first (+4)'], [5, '+5']].map(([v, l]) => h('option', { value: v, selected: v === it.prio }, T(l))))),
        h('label', { class: 'field' }, T('What it does'), effectSel),
        num(T('Chance of the extra effect %'), it.b + 5, it.chance, 0, 100),
        h('label', { class: 'field' }, T('Who it hits'), h('select', { onchange: e => { r.w8(it.b + 6, +e.target.value); rer(); } }, ...TARGETS.map(([v, l]) => h('option', { value: v, selected: v === it.target }, T(l)))))),
      h('details', { class: 'hdr' }, h('summary', {}, T('Advanced')), h('div', { class: 'tr-ai' }, ...FLAGS.map((l, k) => h('label', {}, h('input', { type: 'checkbox', checked: !!(it.flags & (1 << k)), onchange: e => { r.w8(it.b + 8, (it.flags & ~(1 << k)) | (e.target.checked ? 1 << k : 0)); rer(); } }), ' ' + T(l))))),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Description')), it.desc >= 0 ? Objects.textBubble(it.desc, { commit: (l, fn) => { try { fn(); return true; } catch (x) { toast(x.message, 'err'); return false; } }, refresh: rer }) : h('p', { class: 'muted' }, '—')),
      h('div', { class: 'tr-sec' }, h('h4', {}, T('Who learns it')),
        h('div', { class: 'muted' }, T('By level') + ' (' + lr.level.length + '):'), h('div', { class: 'mv-who' }, ...lr.level.map(([s, lv]) => h('button', { class: 'chip', onclick: () => { PokemonTab.select(s); App.show('pokemon'); } }, sp[s] + ' ' + T('lv') + ' ' + lv))),
        lr.tmSlots.length ? h('div', { class: 'muted' }, lr.tmSlots.join(', ') + ' (' + lr.tm.length + '):') : '',
        lr.tmSlots.length ? h('div', { class: 'mv-who' }, ...lr.tm.map(([s]) => h('button', { class: 'chip', onclick: () => { PokemonTab.select(s); App.show('pokemon'); } }, sp[s]))) : '',
        lr.tutorSlots.length ? h('div', { class: 'muted' }, T('Taught by a move tutor')) : ''));
  }
  function tmPanel() {
    const r = R(), mv = L().moves, rer = () => render(root);
    const tms = h('div', { class: 'mv-tms' });
    for (let k = 0; k < TM_COUNT; k++) tms.append(h('label', { class: 'field' }, tmName(k), makeSelect(mv, tmMove(k), v => { r.w16(O().tmMoves + k * 2, v); if (O().tmMovesCopy >= 0) r.w16(O().tmMovesCopy + k * 2, v); App.lists = null; rer(); })));
    const tut = h('div', { class: 'mv-tms' });
    if (O().tutors >= 0) for (let k = 0; k < App.game.tutorCount; k++) tut.append(h('label', { class: 'field' }, T('Tutor') + ' ' + (k + 1), makeSelect(mv, r.r16(O().tutors + k * 2), v => { r.w16(O().tutors + k * 2, v); rer(); })));
    return h('div', { class: 'panel' }, h('h3', {}, '💿 ' + T('TMs and HMs')),
      h('p', { class: 'muted' }, T('Which move each TM / HM teaches. Which Pokémon can use it is set on each Pokémon (Pokémon tab → Moves). HMs also open paths on the map (Cut, Surf, Strength…), so change them carefully.')), tms,
      h('h3', {}, '🎓 ' + T('Move tutors')), h('p', { class: 'muted' }, T('The moves the tutors around the region teach.')), tut);
  }
  return { render, info, select: m => { sel = m; } };
})();
