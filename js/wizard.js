// "New game" wizard: a few questions -> a new Ember Studio project with the answers already in the game
// (language, professor, starters + the rival's team, town names, gym leaders + a story skeleton of 8 badges).
'use strict';

const Wizard = (() => {
  const FR_TOWNS = [[0x58, 'PALLET TOWN'], [0x59, 'VIRIDIAN CITY'], [0x5A, 'PEWTER CITY'], [0x5B, 'CERULEAN CITY'], [0x5C, 'LAVENDER TOWN'], [0x5D, 'VERMILION CITY'],
    [0x5E, 'CELADON CITY'], [0x5F, 'FUCHSIA CITY'], [0x60, 'CINNABAR ISLAND'], [0x61, 'INDIGO PLATEAU'], [0x62, 'SAFFRON CITY']];
  // gym order: leader trainer id + the town of the gym
  const GYMS = [[414, 0x5A], [415, 0x5B], [416, 0x5D], [417, 0x5E], [418, 0x5F], [420, 0x62], [419, 0x60], [350, 0x59]];
  const RIVAL_CLASSES = [0x51, 0x59, 0x5A];
  const STARTERS = [1, 4, 7];
  const TYPES_EN = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', '???', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
  let st = null, back = null, base = null;                     // wizard state, modal, base ROM (Rom) for names

  function defaults() {
    const he = I18N.lang === 'he';
    return { step: 0, name: he ? 'המשחק שלי' : 'My Game', language: he ? 'he' : 'en', dir: '', baseRom: '', baseOk: false,
      prof: '', profReplace: true, starters: STARTERS.slice(), towns: {}, townReplace: true,
      gyms: GYMS.map(([id, town]) => ({ id, town, name: '', type: -1, rebuild: true })) };
  }
  const STEPS = ['The basics', 'The professor', 'Starter Pokémon', 'Town names', 'Gym leaders & story', 'Create'];

  async function open() {
    if (!Host.ok) { toast(T('The wizard needs Ember Studio (the EXE or ember/server.py)'), 'err'); return; }
    st = defaults();
    try {
      const s = await Host.settings();
      const docs = (s.projectsDir || (Host.info && Host.info.projects) || '').trim();
      if (docs) st.dir = joinPath(docs, safeName(st.name));
      const p = await Host.findRom(Project.FR_US_11);
      if (p) await useBase(p);
    } catch (e) { console.warn(e); }
    back = h('div', { class: 'modal-back' });
    document.body.append(back);
    render();
  }
  const safeName = s => s.replace(/[<>:"/\\|?*]/g, '').trim() || 'game';
  async function useBase(p) {
    const r = await Host.registerRom(p);
    st.baseRom = p; st.baseOk = r.crc === Project.FR_US_11; st.baseInfo = r;
    if (st.baseOk) { const data = await Host.readFile(p); base = new Rom(data.buffer, 'base.gba'); base.game = Game.detect(base); }
  }
  // names from the base ROM (English) for placeholders
  function baseName(kind, id) {
    if (!base) return '';
    try {
      const g = base.game, o = g.offsets;
      if (kind === 'species') return Charmap.decode(base.u8, o.speciesNames + id * 11, 11).text;
      if (kind === 'town') return FR_TOWNS.find(t => t[0] === id)[1];
      if (kind === 'trainer') return Charmap.decode(base.u8, o.trainers + id * 40 + 4, 12).text;
    } catch (e) { return ''; }
    return '';
  }
  function leaderType(id) {                                     // the most common type in the leader's team
    if (!base) return -1;
    const r = base, o = base.game.offsets, b = o.trainers + id * 40, size = r.u8[b] & 1 ? 16 : 8, pp = r.ptr(b + 36), cnt = new Map();
    for (let i = 0; i < r.u8[b + 32]; i++) { const sp = r.r16(pp + i * size + 4), t1 = r.u8[o.baseStats + sp * 28 + 6]; cnt.set(t1, (cnt.get(t1) || 0) + 1); }
    return [...cnt.entries()].sort((a, c) => c[1] - a[1])[0][0];
  }

  // ---------- UI ----------
  function render() {
    back.innerHTML = '';
    const body = h('div', { class: 'wiz-body' });
    const steps = h('div', { class: 'wiz-steps' }, ...STEPS.map((s, i) => h('span', { class: 'wiz-step' + (i === st.step ? ' sel' : i < st.step ? ' done' : '') }, (i + 1) + '. ' + T(s))));
    [stepBasics, stepProf, stepStarters, stepTowns, stepGyms, stepCreate][st.step](body);
    const nav = h('div', { class: 'row wiz-nav' },
      h('button', { onclick: async () => { if (st.step === 0 || await ask(T('Close the wizard? Nothing was created yet.'))) back.remove(); } }, 'Cancel'),
      h('span', { style: { flex: 1 } }),
      st.step > 0 && st.step < 5 ? h('button', { onclick: () => { st.step--; render(); } }, '← Back') : '',
      st.step < 5 ? h('button', { class: 'primary', onclick: next }, 'Next →') : '');
    back.append(h('div', { class: 'panel modal wiz' }, h('h2', {}, '✨ ' + T('New game')), steps, body, nav));
  }
  function next() {
    if (st.step === 0) {
      if (!st.name.trim()) return toast(T('Give the game a name'), 'err');
      if (!st.dir) return toast(T('Choose a folder for the project'), 'err');
      if (!st.baseOk) return toast(T('Choose your Pokémon FireRed (US) v1.1 ROM'), 'err');
    }
    st.step++; render();
  }
  const field = (label, input, help) => h('label', { class: 'wiz-field' }, h('span', {}, label), input, help ? h('small', { class: 'muted' }, help) : '');
  const text = (key, ph, obj = st) => h('input', { value: obj[key] || '', placeholder: ph || '', dir: 'auto', oninput: e => { obj[key] = e.target.value; } });

  function stepBasics(el) {
    const dirIn = h('input', { value: st.dir, style: { flex: 1 }, dir: 'ltr', oninput: e => st.dir = e.target.value });
    el.append(
      field(T('Name of the game'), h('input', { value: st.name, dir: 'auto', oninput: e => { const old = safeName(st.name); st.name = e.target.value; if (st.dir.endsWith(old)) { st.dir = st.dir.slice(0, -old.length) + safeName(st.name); dirIn.value = st.dir; } } })),
      field(T('Language of the game'), h('div', { class: 'row' },
        ...[['he', 'עברית (Hebrew)'], ['en', 'English']].map(([v, l]) => h('label', {}, h('input', { type: 'radio', name: 'wlang', checked: st.language === v, onchange: () => st.language = v }), ' ' + l))),
        T('Hebrew adds Hebrew letters, right-to-left text and a full Hebrew translation of the game')),
      field(T('Project folder'), h('div', { class: 'row' }, dirIn, h('button', { onclick: async () => {
        const d = await Host.dialog('folder', T('Choose an empty folder for the new project')); if (d) { st.dir = d; dirIn.value = d; Host.saveSettings({ projectsDir: d.replace(/[\\/][^\\/]*$/, '') }).catch(() => {}); }
      } }, '📁 ' + T('Choose…'))), T('Everything you make is saved in this folder. It is small and can go into Git.')),
      field(T('Pokémon FireRed (US) v1.1 ROM'), h('div', { class: 'row' },
        h('span', { class: st.baseOk ? 'ok' : st.baseRom ? 'err' : 'muted', style: { flex: 1, direction: 'ltr', overflowWrap: 'anywhere' } },
          st.baseOk ? '✓ ' + st.baseRom : st.baseRom ? '✗ ' + T('not FireRed (US) v1.1') + ' (CRC ' + st.baseInfo.crc + ')' : T('not chosen yet')),
        h('button', { onclick: async () => { const p = await Host.dialog('open', T('Your Pokémon FireRed (US) v1.1 ROM'), { filters: [['GBA ROM', ['*.gba']]] }); if (p) { await useBase(p); render(); } } }, '📁 ' + T('Choose…'))),
        T('Your own copy. It is never changed and never copied into the project.')));
  }
  function stepProf(el) {
    const old = st.language === 'he' ? 'אוק' : 'OAK';
    el.append(h('p', { class: 'muted' }, T('The professor gives you your first Pokémon and appears all through the story.')),
      field(T('Professor\'s name'), text('prof', old), T('Leave empty to keep') + ' ' + old),
      h('label', {}, h('input', { type: 'checkbox', checked: st.profReplace, onchange: e => st.profReplace = e.target.checked }), ' ' + T('Change the name in every dialogue of the game')),
      h('p', { class: 'muted' }, '🎨 ' + T('Drawing the hero and the professor (from a picture) comes in the Graphics tab.')));
  }
  function stepStarters(el) {
    const L = (App.rom ? App.getLists() : null) || { species: Array.from({ length: 412 }, (_, i) => baseName('species', i)) };
    const row = i => {
      const ic = h('span', { class: 'wiz-ic' }); const draw = () => { ic.innerHTML = ''; try { if (App.rom) ic.append(PokemonTab.iconCanvas(st.starters[i], 32)); } catch (e) { /* no icon */ } };
      const sel = h('select', { onchange: e => { st.starters[i] = +e.target.value; draw(); } }, ...L.species.map((n, k) => k && n && !/^\?+$/.test(n) ? h('option', { value: k, selected: k === st.starters[i] }, k + ' ' + n) : null));
      draw(); return h('div', { class: 'row' }, ic, h('b', {}, (i + 1) + '.'), sel);
    };
    el.append(h('p', { class: 'muted' }, T('The three Pokémon you can choose from at the start. The rival takes the one strong against yours, and his team grows with it through the game.')),
      row(0), row(1), row(2),
      h('p', { class: 'muted' }, T('The names in the professor\'s lines change with them. You can also choose four starters later.')));
  }
  function stepTowns(el) {
    el.append(h('p', { class: 'muted' }, T('Rename the towns of the region (leave a box empty to keep the name).')),
      h('div', { class: 'wiz-grid' }, ...FR_TOWNS.map(([sec, en]) => field(en, h('input', { value: st.towns[sec] || '', dir: 'auto', placeholder: en, oninput: e => st.towns[sec] = e.target.value })))),
      h('label', {}, h('input', { type: 'checkbox', checked: st.townReplace, onchange: e => st.townReplace = e.target.checked }), ' ' + T('Change the names in every dialogue and sign too')));
  }
  function stepGyms(el) {
    const townName = sec => st.towns[sec] || FR_TOWNS.find(t => t[0] === sec)[1];
    const types = [T('keep their team')].concat(TYPES_EN.map(t => T(t)));
    el.append(h('p', { class: 'muted' }, T('The story skeleton: 8 badges, one gym leader each. The Story tab builds on it later.')),
      h('table', { class: 'grid wiz-gyms' }, h('tr', {}, h('th', {}, '#'), h('th', {}, T('Town')), h('th', {}, T('Leader\'s name')), h('th', {}, T('Pokémon type'))),
        ...st.gyms.map((gy, i) => h('tr', {}, h('td', {}, String(i + 1)), h('td', {}, townName(gy.town)),
          h('td', {}, text('name', baseName('trainer', gy.id), gy)),
          h('td', {}, h('select', { onchange: e => gy.type = +e.target.value }, ...types.map((t, k) => h('option', { value: k - 1, selected: k - 1 === gy.type }, k === 0 ? t + ' (' + T(TYPES_EN[leaderType(gy.id)] || '') + ')' : t))))))),
      h('p', { class: 'muted' }, T('Choosing a type gives the leader a new team of that type, at the same levels.')));
  }
  function stepCreate(el) {
    const log = h('div', { class: 'wiz-log' });
    const sum = [
      [T('Name of the game'), st.name], [T('Language of the game'), st.language === 'he' ? 'עברית' : 'English'], [T('Project folder'), st.dir],
      [T('Professor\'s name'), st.prof || T('unchanged')], [T('Starter Pokémon'), st.starters.map(s => baseName('species', s)).join(', ')],
      [T('Town names'), Object.values(st.towns).filter(Boolean).join(', ') || T('unchanged')],
      [T('Gym leaders & story'), st.gyms.map(g => g.name || baseName('trainer', g.id)).join(', ')]];
    const go = h('button', { class: 'primary big' }, '✨ ' + T('Create the game'));
    go.onclick = async () => {
      go.disabled = true;
      try { await create(m => log.append(h('div', {}, m))); log.append(h('div', { class: 'ok' }, '✓ ' + T('Done!'))); setTimeout(() => back.remove(), 900); }
      catch (e) { console.error(e); App.busy(); log.append(h('div', { class: 'err' }, '✗ ' + e.message)); go.disabled = false; }
    };
    el.append(h('table', { class: 'grid' }, ...sum.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', { dir: 'auto' }, b)))), go, log);
  }

  // ---------- making the game ----------
  async function create(say) {
    const tick = () => new Promise(r => setTimeout(r, 30));
    say(T('Creating the project folder…')); await tick();
    await Project.create({ dir: st.dir, name: st.name.trim(), language: st.language, baseRom: st.baseRom });
    say(T('Opening it…'));
    if (!(await Project.open(st.dir))) throw new Error(T('Could not open the new project'));
    const rom = App.rom, g = App.game, o = g.offsets;
    if (st.language === 'he') {
      say(T('Hebrew: letters, right-to-left and the translation (this takes a moment)…')); await tick();
      Font.patchAll();
      if (window.HEBREW_NAMES) TextTab.applyNamePack();
      const pack = (window.TRANSLATIONS || {})[g.patchKey];
      if (pack) await TextTab.applyTranslation(pack);
      App.lists = null;
    }
    const rtl = App.settings.rtl === 'none' && st.language === 'he' ? 'engine' : App.settings.rtl;
    const enc = s => Charmap.encode(s, { rtl });
    const pairs = [];
    // professor
    if (st.prof.trim()) pairs.push([st.language === 'he' ? 'אוק' : 'OAK', st.prof.trim()]);
    // towns: the map-section name itself + (optionally) every text that mentions it
    const townPairs = [];
    for (const [sec] of FR_TOWNS) {
      const nw = (st.towns[sec] || '').trim(); if (!nw) continue;
      const idx = sec - g.mapsecBase, at = o.regionMapEntries + idx * g.mapsecStride + g.mapsecNameOff, p = rom.ptr(at), old = Game.mapName(rom, g, sec);
      if (p >= 0) TextTab.saveAt(p, nw);
      if (st.townReplace && old) townPairs.push([old, nw]);
    }
    // starters
    say(T('Starter Pokémon and the rival\'s teams…')); await tick();
    const L = App.getLists(), changes = [];
    STARTERS.forEach((old, i) => { if (st.starters[i] !== old) changes.push([old, st.starters[i]]); });
    if (changes.length) {
      const swap = new Map(changes);
      const balls = starterBalls();
      if (!balls.length) say('⚠ ' + T('The starter Poké Balls were not found: change them on the map (Objects)'));
      for (const at of balls) { const v = rom.r16(at); if (swap.has(v)) rom.w16(at, swap.get(v)); }
      for (const [old, nw] of changes) pairs.push([L.species[old], L.species[nw]]);
      const fam = s => { const f = [s]; for (let k = 0; k < 2; k++) { const nx = firstEvo(f[f.length - 1]); if (!nx) break; f.push(nx); } return f; };
      const map = new Map();
      for (const [old, nw] of changes) { const a = fam(old), b = fam(nw); a.forEach((s, k) => map.set(s, b[Math.min(k, b.length - 1)])); }
      for (let id = 1; id < 743; id++) if (RIVAL_CLASSES.includes(rom.u8[o.trainers + id * 40 + 1])) remapParty(id, sp => map.get(sp));
    }
    // gym leaders
    say(T('Gym leaders…')); await tick();
    const story = { format: 'ember-story-1', chapters: [] };
    st.gyms.forEach((gy, i) => {
      const b = o.trainers + gy.id * 40;
      if (gy.name.trim()) { const bytes = enc(gy.name.trim()); if (bytes.length > 12) throw new Error(T('Leader\'s name is too long') + ': ' + gy.name); const a = new Uint8Array(12); a.set(bytes); rom.write(b + 4, a); }
      if (gy.type >= 0) retype(gy.id, gy.type);
      story.chapters.push({ id: 'badge' + (i + 1), title: T('Badge') + ' ' + (i + 1), town: gy.town,
        steps: [{ id: 'beat' + gy.id, type: 'beat', trainer: gy.id, title: Tf('Beat the gym leader {name}', { name: gy.name.trim() || baseName('trainer', gy.id) }) }] });
    });
    // all texts at once
    const all = pairs.concat(townPairs);
    if (all.length) { say(T('Updating the dialogue…')); await tick(); const r = await TextTab.replaceAll(all); if (r.errors.length) console.warn(r.errors); say('  ' + r.changed + ' ' + T('texts changed')); }
    Project.setData('story', story);
    say(T('Saving…'));
    await Project.save(true);
    App.show('home');
  }
  // FireRed's starter balls: "setvar 0x4002 <your Pokémon>; setvar 0x4003 <the rival's>" at the start of each ball's
  // script -> the offsets of those species values
  function starterBalls() {
    const r = App.rom, out = [];
    App.game.mapGroups.forEach((maps, gi) => maps.forEach((hp, mi) => {
      const ev = r.ptr(hp + 4); if (ev < 0) return;
      const po = r.ptr(ev + 4);
      for (let i = 0; i < r.u8[ev] && po >= 0; i++) {
        const sp = r.ptr(po + i * 24 + 16); if (sp < 0) continue;
        const found = [];
        for (let p = sp; p < sp + 40; p++) if (r.u8[p] === 0x16 && r.u8[p + 2] === 0x40 && (r.u8[p + 1] === 2 || r.u8[p + 1] === 3) && STARTERS.includes(r.r16(p + 3))) found.push(p + 3);
        if (found.length === 2) out.push(...found);
      }
    }));
    return out;
  }
  function firstEvo(sp) {
    const r = App.rom, o = App.game.offsets;
    for (let k = 0; k < 5; k++) { const e = o.evolutions + sp * 40 + k * 8; if (r.r16(e)) return r.r16(e + 4); }
    return 0;
  }
  // rewrite a trainer's team; fn(species) -> new species or undefined. Custom moves are dropped (the game then uses
  // the level-up moves), held items are kept.
  function remapParty(id, fn) {
    const r = App.rom, o = App.game.offsets, b = o.trainers + id * 40, flags = r.u8[b], size = flags & 1 ? 16 : 8, pp = r.ptr(b + 36), n = r.u8[b + 32];
    if (pp < 0) return false;
    const mons = []; let changed = false;
    for (let i = 0; i < n; i++) {
      const e = pp + i * size, sp = r.r16(e + 4), nw = fn(sp, i);
      if (nw && nw !== sp) changed = true;
      mons.push({ iv: r.r16(e), lvl: r.r16(e + 2), sp: nw || sp, item: flags & 2 ? r.r16(e + 6) : 0 });
    }
    if (!changed) return false;
    const arr = new Uint8Array(n * 8), dv = new DataView(arr.buffer);
    mons.forEach((m, i) => { dv.setUint16(i * 8, m.iv, true); dv.setUint16(i * 8 + 2, m.lvl, true); dv.setUint16(i * 8 + 4, m.sp, true); dv.setUint16(i * 8 + 6, m.item, true); });
    r.w8(b, flags & 2); r.wptr(b + 36, r.writeNew(arr));
    return true;
  }
  // a new team of one type for a leader: for each member the Pokémon of that type with the closest base-stat total
  function retype(id, type) {
    const r = App.rom, g = App.game, o = g.offsets, bst = sp => { let s = 0; for (let k = 0; k < 6; k++) s += r.u8[o.baseStats + sp * 28 + k]; return s; };
    const ok = sp => { const nat = o.dexNums >= 0 ? r.r16(o.dexNums + (sp - 1) * 2) : sp; return nat > 0 && nat <= 386 && !LEGENDS.has(nat); };
    const cands = []; for (let sp = 1; sp < g.speciesCount; sp++) if (ok(sp) && (r.u8[o.baseStats + sp * 28 + 6] === type || r.u8[o.baseStats + sp * 28 + 7] === type)) cands.push(sp);
    if (!cands.length) return;
    const used = new Set();
    remapParty(id, sp => {
      const want = bst(sp); let best = 0, bd = 1e9;
      for (const c of cands) { const d = Math.abs(bst(c) - want) + (used.has(c) ? 60 : 0); if (d < bd) { bd = d; best = c; } }
      used.add(best); return best;
    });
  }
  const LEGENDS = new Set([144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386]);

  return { open, _test: { remapParty, retype, firstEvo, show: async step => { await open(); st.step = step; if (!st.dir) st.dir = 'C:\\Users\\you\\Documents\\Ember Studio\\' + st.name; render(); }, run: async (spec, say) => { st = Object.assign(defaults(), spec); await useBase(spec.baseRom); await create(say || (m => console.log(m))); } } };
})();
