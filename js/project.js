// Ember Studio projects (see ember/project.py): open = build the game from the base ROM + the project's changes,
// save = write the editor's changes back into the project folder, build = make out/game.gba.
'use strict';

const Project = (() => {
  const FORMAT = 'ember-project-1';
  const FR_US_11 = '84EE4776';                               // Pokémon FireRed (US) v1.1
  let cur = null;                                            // { dir, pj, stageCrc, fileOps }
  // project data files (data/<name>.json): story, block scripts… kept in memory, written on save.
  // Without a project they live in the browser (localStorage), per ROM name.
  const data = new Map(), dirtyData = new Set();
  const DATA_FILES = ['story', 'scripts', 'playtest', 'townmap'];
  function getData(name, def) {
    if (!data.has(name)) {
      let v = null;
      if (!cur) { try { v = JSON.parse(localStorage.getItem('ember-data-' + (App.rom ? App.rom.name : '') + '-' + name) || 'null'); } catch (e) { v = null; } }
      data.set(name, v || (typeof def === 'function' ? def() : def));
    }
    return data.get(name);
  }
  function setData(name, v) {
    data.set(name, v); dirtyData.add(name);
    if (!cur) { try { localStorage.setItem('ember-data-' + (App.rom ? App.rom.name : '') + '-' + name, JSON.stringify(v)); } catch (e) { /* full */ } }
    if (App.rom) { App.rom.dirty = true; App.dirtyUI(); }
  }

  let crcTable = null;
  function crc32(u8) {
    if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }
  // patch.bin (see ember/project.py): the bytes of `now` that differ from `base`, joined when the gap is small
  function makePatch(base, now, stageCrc) {
    const recs = []; let total = 16;
    for (let i = 0; i < now.length;) {
      if (i < base.length && now[i] === base[i]) { i++; continue; }
      let j = i + 1, gap = 0;
      while (j < now.length && gap < 8) { if (j < base.length && now[j] === base[j]) gap++; else gap = 0; j++; }
      const end = j - gap; recs.push([i, end]); total += 8 + end - i; i = end;
    }
    const out = new Uint8Array(total), dv = new DataView(out.buffer);
    out.set([0x45, 0x4D, 0x42, 0x50]); dv.setUint32(4, 1, true); dv.setUint32(8, parseInt(stageCrc, 16) >>> 0, true); dv.setUint32(12, now.length, true);
    let p = 16;
    for (const [a, b] of recs) { dv.setUint32(p, a, true); dv.setUint32(p + 4, b - a, true); out.set(now.subarray(a, b), p + 8); p += 8 + b - a; }
    return { bin: out, count: recs.length };
  }

  // ---------- open ----------
  async function locateBase(pj) {
    toast(T('Locate the base ROM of this project') + ': ' + (pj.base.file || pj.base.crc32), 'ok');
    const p = await Host.dialog('open', T('Locate the base ROM') + ' (' + (pj.base.file || 'CRC ' + pj.base.crc32) + ')', { filters: [['GBA ROM', ['*.gba']]] });
    if (!p) return false;
    const r = await Host.registerRom(p);
    if (r.crc !== pj.base.crc32) { toast(T('That is not the right ROM') + ' (CRC ' + r.crc + ', ' + T('expected') + ' ' + pj.base.crc32 + ')', 'err'); return false; }
    return true;
  }
  async function open(dir) {
    if (App.rom && App.rom.dirty && !(await ask(T('Discard unsaved changes to the current game?'), { danger: true }))) return false;
    const pj = await Host.readJSON(joinPath(dir, 'project.json'));
    if (pj.format !== FORMAT) throw new Error(T('Not an Ember Studio project') + ': ' + dir);
    App.busy(T('Building the game') + ' — ' + (pj.name || dir) + '…');
    try {
      let r = await Host.build(dir);
      if (r.error === 'base_missing') { App.busy(); if (!(await locateBase(pj))) return false; App.busy(T('Building the game') + '…'); r = await Host.build(dir); }
      if (r.error) { showLog(T('The build failed'), (r.message || r.error) + '\n\n' + (r.log || '')); return false; }
      const [stage, game] = await Promise.all([Host.readFile(r.stage), Host.readFile(r.out)]);
      let fileOps = [];
      try { const j = await Host.readJSON(joinPath(dir, 'data', 'world_ops.json')); fileOps = j.ops || []; } catch (e) { fileOps = []; }
      cur = null;
      await App.load(game.buffer, (pj.name || 'game') + '.gba', stage.buffer, { project: true });
      data.clear(); dirtyData.clear();
      for (const f of DATA_FILES) { try { data.set(f, await Host.readJSON(joinPath(dir, 'data', f + '.json'))); } catch (e) { /* not there yet */ } }
      cur = { dir, pj, stageCrc: r.stage_crc, fileOps };
      if (r.patch === 'skipped' && fileOps.length) {                   // the custom build changed: redo the world edits on it
        const errors = WorldTab.replayOps(fileOps);
        toast(T('The custom build changed: the map edits were replayed') + (errors ? ' (' + errors + ' ' + T('failed') + ')' : ''), errors ? 'err' : 'ok');
      }
      Host.addRecent(dir).catch(() => {});
      App.projectUI();
      toast(T('Opened project') + ' ' + (pj.name || dir));
      return true;
    } finally { App.busy(); }
  }

  // ---------- save / build ----------
  async function save(quiet) {
    if (!cur) return;
    const rom = App.rom, d = cur.dir;
    App.busy(T('Saving') + '…');
    try {
      const p = makePatch(rom.original, rom.u8, cur.stageCrc);
      await Host.writeFile(joinPath(d, 'rom', 'patch.bin'), p.bin);
      try {
        const pk = PokeExport.collect();
        if (Object.keys(pk.species).length || Object.keys(pk.wild).length || pk.gifts.length) await Host.writeJSON(joinPath(d, 'data', 'pokemon_edits.json'), pk);
      } catch (e) { console.warn('pokemon layer', e); }
      for (const f of dirtyData) await Host.writeJSON(joinPath(d, 'data', f + '.json'), data.get(f));
      dirtyData.clear();
      const ops = cur.fileOps.concat(WorldTab.ops());
      if (ops.length) await Host.writeJSON(joinPath(d, 'data', 'world_ops.json'), { format: 'ember-world-ops-1', ops });
      cur.pj.modified = new Date().toISOString();
      await Host.writeJSON(joinPath(d, 'project.json'), cur.pj);
      rom.dirty = false; $('#dirty').textContent = '';
      if (!quiet) toast(T('Saved') + ' (' + p.count + ' ' + T('changed areas') + ')');
    } catch (e) { toast(T('Could not save') + ': ' + e.message, 'err'); throw e; }
    finally { App.busy(); }
  }
  async function build(play) {
    if (!cur) return;
    await save(true);
    App.busy(T('Building the game') + '…');
    try {
      const r = await Host.build(cur.dir);
      if (r.error) { showLog(T('The build failed'), (r.message || r.error) + '\n\n' + (r.log || '')); return; }
      toast(T('Game built') + ': ' + r.out);
      if (play) {
        const data = await Host.readFile(r.out);
        await Host.call('POST', '/api/mgba', data, true);
      }
      return r;
    } finally { App.busy(); }
  }

  // ---------- new project ----------
  // spec: { dir, name, language, baseRom (path), steps?, romBytes? (start from this ROM instead of the base) }
  async function create(spec) {
    const reg = await Host.registerRom(spec.baseRom);
    const ex = await Host.exists(joinPath(spec.dir, 'project.json'));
    if (ex.file) throw new Error(T('There is already a project in this folder'));
    const pj = { format: FORMAT, name: spec.name, language: spec.language || 'en', created: new Date().toISOString(), editor: 'Ember Studio ' + (Host.info ? Host.info.version : ''),
      base: { crc32: reg.crc, file: spec.baseRom.split(/[\\/]/).pop(), code: reg.code, title: reg.title }, steps: spec.steps || [] };
    await Host.writeJSON(joinPath(spec.dir, 'project.json'), pj);
    await Host.writeFile(joinPath(spec.dir, '.gitignore'), 'out/\n*.sav\n');
    await Host.writeFile(joinPath(spec.dir, 'README.md'), '# ' + spec.name + '\n\n' + T('A game made with Ember Studio. Open this folder in Ember Studio; you need your own copy of the base ROM') + ' (' + pj.base.file + ', CRC ' + pj.base.crc32 + ').\n');
    if (spec.romBytes) {                                               // import: the changes of an existing ROM become the project's patch
      const r = await Host.build(spec.dir, false);
      if (r.error) throw new Error(r.error);
      const stage = await Host.readFile(r.stage);
      await Host.writeFile(joinPath(spec.dir, 'rom', 'patch.bin'), makePatch(stage, spec.romBytes, r.stage_crc).bin);
    }
    return pj;
  }
  // existing ROM -> project (its changes against the original become the patch)
  async function importRom() {
    const romPath = await Host.dialog('open', T('Choose the ROM to turn into a project'), { filters: [['GBA ROM', ['*.gba']]] });
    if (!romPath) return;
    const romBytes = await Host.readFile(romPath);
    let base = await Host.findRom(FR_US_11);
    if (!base) {
      toast(T('Now choose your original Pokémon FireRed (US) v1.1 ROM: the project stores only the changes against it'));
      base = await Host.dialog('open', T('The original FireRed (US) v1.1 ROM'), { filters: [['GBA ROM', ['*.gba']]] });
      if (!base) return;
    }
    const dir = await Host.dialog('folder', T('Choose an empty folder for the new project'));
    if (!dir) return;
    const name = romPath.split(/[\\/]/).pop().replace(/\.gba$/i, '');
    await create({ dir, name, language: 'he', baseRom: base, romBytes });
    await open(dir);
  }
  async function openDialog() {
    const dir = await Host.dialog('folder', T('Open a project folder'));
    if (dir) await open(dir);
  }

  function showLog(title, text) {
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) back.remove(); } });
    back.append(h('div', { class: 'panel modal', style: { maxWidth: '820px' } }, h('h3', {}, title),
      h('pre', { style: { maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' } }, text),
      h('button', { onclick: () => back.remove() }, T('Close'))));
    document.body.append(back);
  }

  return { get cur() { return cur; }, close() { cur = null; data.clear(); dirtyData.clear(); }, getData, setData, resetData: () => { if (!cur) { data.clear(); dirtyData.clear(); } }, open, openDialog, save, build, create, importRom, crc32, makePatch, FR_US_11 };
})();
