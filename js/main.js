// App shell: ROM loading, tabs, autosave (IndexedDB), download ROM / IPS patch.
'use strict';

const App = {
  rom: null, game: null, lists: null, tab: 'home',
  settings: Object.assign({ rtl: 'none', align: true, boxWidth: 0 }, JSON.parse(localStorage.getItem('gba-he-settings') || '{}')),
  saveSettings() { localStorage.setItem('gba-he-settings', JSON.stringify(this.settings)); },
  getLists() { return this.lists || (this.lists = Game.lists(this.rom, this.game)); },
  tabs: {
    home: ['Home', root => App.renderHome(root)],
    text: ['Text / Translation', root => TextTab.render(root)],
    hebrew: ['Hebrew & Fonts', root => Font.render(root)],
    pokemon: ['Pokémon', root => PokemonTab.render(root)],
    trainers: ['Trainers', root => TrainersTab.render(root)],
    items: ['Items & shops', root => ItemsTab.render(root)],
    moves: ['Moves', root => MovesTab.render(root)],
    maps: ['Maps & Wild', root => MapsTab.render(root)],
    story: ['📖 Story', root => StoryTab.render(root)],
    graphics: ['Graphics', root => Graphics.render(root)],
    music: ['Music', root => MusicTab.render(root)],
    doctor: ['🩺 Game check', root => Doctor.render(root)],
  },
  show(tab) {
    this.tab = tab;
    $$('#nav button').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab));
    const root = $('#main');
    if (!this.rom && tab !== 'home') tab = 'home';
    try { this.tabs[tab][1](root); }
    catch (e) { console.error(e); root.innerHTML = ''; root.append(h('div', { class: 'panel err' }, 'Error: ' + e.message)); }
  },

  romVersion: 0,
  isBuildOutput() { return this.rom && /kachollavan/i.test(this.rom.name); },
  async load(buffer, name, original, opts = {}) {
    const rom = new Rom(buffer, name);
    if (original) rom.original = new Uint8Array(original);
    if (!/^BP[EGR]/.test(rom.code) && !(await ask(Tf('Header code "{code}" is not a Gen 3 Pokémon game. Load anyway?', { code: rom.code })))) return;
    if (!opts.project && typeof Project !== 'undefined' && Project.cur) { Project.close(); this.projectUI(); }
    this.rom = rom;
    this.game = Game.detect(rom);
    this.lists = null;
    if (this.game.rtl && Font.rtlStatus() === 'on') { this.settings.rtl = 'engine'; this.saveSettings(); }
    TextTab.reset(); MapsTab.reset(!!opts.fromDisk); Graphics.reset(); MusicTab.reset(); if (typeof Project !== 'undefined') Project.resetData();
    this.romVersion++;
    rom.onChange(() => { this.romVersion++; this.dirtyUI(); this.scheduleAutosave(); });
    $('#romname').textContent = (opts.project ? '' : name + ' — ') + this.game.name;
    $$('.needrom').forEach(b => b.disabled = false);
    this.show(this.tab === 'home' ? 'home' : this.tab);
  },
  dirtyUI() { $('#dirty').textContent = '● unsaved changes (autosaved in browser)'; },
  scheduleAutosave() {
    clearTimeout(this._as);
    this._as = setTimeout(() => DB.put('last', { name: this.rom.name, data: this.rom.u8.buffer.slice(0), original: this.rom.original.buffer.slice(0), time: Date.now(), stamp: FileLink.stamp }).catch(e => console.warn(e)), 2000);
  },
  download() {
    const name = this.rom.name.replace(/\.gba$/i, '') + (/_he$/i.test(this.rom.name.replace(/\.gba$/i, '')) ? '' : '_he') + '.gba';
    download(this.rom.u8, name); this.rom.dirty = false; $('#dirty').textContent = '';
  },
  // One click: add Hebrew fonts + RTL engine + keyboard, then save as a NEW .gba (the original file is never touched).
  async patchToNewFile() {
    if (!this.rom) return;
    if (!this.game.rtl) { toast('Hebrew patch supports Emerald (US) and FireRed (US) v1.1 only — this ROM is ' + this.game.name, 'err'); return; }
    try { Font.patchAll(); } catch (e) { toast(e.message, 'err'); return; }
    if (window.HEBREW_NAMES) TextTab.applyNamePack();
    const pack = (window.TRANSLATIONS || {})[this.game.patchKey];
    if (pack) {
      toast('Applying Hebrew translation (' + Object.keys(pack).length + ' strings)…');
      await new Promise(r => setTimeout(r, 50));
      const rep = await TextTab.applyTranslation(pack);
      toast('Translated ' + rep.applied + ' strings' + (rep.errors.length ? ', ' + rep.errors.length + ' errors (see console)' : ''));
      if (rep.errors.length) console.warn(rep.errors);
    }
    const base = this.rom.name.replace(/\.gba$/i, '').replace(/_(he|hebrew)$/i, '');
    download(this.rom.u8, base + '_hebrew.gba');
    this.rom.dirty = false; $('#dirty').textContent = '';
    toast('Created ' + base + '_hebrew.gba — your original file was not changed');
    this.show(this.tab);
  },
  downloadIPS() {
    try { download(this.rom.makeIPS(), this.rom.name.replace(/\.gba$/i, '') + '_he.ips'); }
    catch (e) { toast(e.message, 'err'); }
  },

  // busy overlay: App.busy('Building…') shows it, App.busy() hides it
  busy(msg) {
    let el = $('#busy');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = h('div', { id: 'busy', class: 'busy' }, h('div', { class: 'panel' }, h('div', { class: 'spinner' }), h('span'))); document.body.append(el); }
    el.querySelector('span').textContent = msg;
  },
  projectUI() {
    const p = Project.cur;
    $('#projname').textContent = p ? (p.pj.name || '') : '';
    $$('.needproj').forEach(b => b.hidden = !p);
    $$('.romonly').forEach(b => b.hidden = !!p);
    document.title = (p ? p.pj.name + ' — ' : '') + 'Ember Studio';
  },

  renderHome(root) {
    root.innerHTML = '';
    const card = (icon, title, text, onclick, primary) => h('button', { class: 'homecard' + (primary ? ' primary' : ''), onclick }, h('span', { class: 'hc-icon' }, icon), h('b', {}, title), h('span', { class: 'muted' }, text));
    const guard = fn => async () => { try { await fn(); } catch (e) { console.error(e); App.busy(); toast(e.message, 'err'); } };
    const hero = h('div', { class: 'panel home-hero' }, h('h2', {}, '🔥 Ember Studio'),
      h('p', { class: 'muted' }, 'Build your own Pokémon FireRed game: maps, story, Pokémon, trainers, music and text — in Hebrew or English.'));
    const cards = h('div', { class: 'homecards' });
    if (Host.ok) cards.append(
      card('✨', 'New game', 'A wizard asks a few questions and creates a project', guard(() => Wizard.open()), true),
      card('📂', 'Open project', 'Continue a game you are making', guard(() => Project.openDialog())),
      card('📥', 'Turn a ROM into a project', 'An existing hack or translation becomes a project you can keep building', guard(() => Project.importRom())));
    cards.append(card('🎮', 'Open a ROM file', 'Edit a .gba file directly (advanced: no project, no rebuilds)', () => FileLink.supported ? FileLink.pick() : $('#romfile').click()));
    const fileIn = h('input', { id: 'romfile', type: 'file', accept: '.gba,.bin', hidden: true, onchange: e => e.target.files[0] && App.openFile(e.target.files[0]) });
    root.append(hero, cards, fileIn);
    if (!Host.ok) root.append(h('div', { class: 'panel warn' }, 'Projects, building and the emulator need Ember Studio itself (EmberStudio.exe, or python ember/server.py). Right now only ROM files can be edited.'));
    if (Host.ok) {
      const rec = h('div');
      Host.settings().then(st => {
        const list = (st.recent || []);
        if (!list.length) return;
        rec.append(h('div', { class: 'panel' }, h('h3', {}, 'Recent projects'),
          h('div', { class: 'recent' }, ...list.map(d => h('button', { class: 'recentp', title: d, onclick: guard(() => Project.open(d)) }, '📁 ' + d.split(/[\\/]/).pop(), h('span', { class: 'muted' }, d))))));
      }).catch(() => {});
      root.append(rec);
    }
    const last = h('div');
    DB.get('last').then(r => { if (r) last.append(h('div', { class: 'panel' }, h('b', {}, 'Continue where you left off (browser autosave): '), r.name + ' (' + new Date(r.time).toLocaleString() + ') ',
      h('button', { class: 'primary', onclick: async () => {
        await App.load(r.data, r.name, r.original);
        const a = new Uint8Array(r.data), b = new Uint8Array(r.original); let diff = a.length !== b.length;
        for (let i = 0; !diff && i < a.length; i += 4096) if (a[i] !== b[i]) diff = true;
        if (diff) { App.rom.dirty = true; App.dirtyUI(); }
        const hd = await DB.get('handle').catch(() => null);
        if (hd && hd.name === r.name && (await hd.requestPermission({ mode: 'read' })) === 'granted') { await FileLink.attach(hd, null, r.stamp); FileLink.check(); }
      } }, 'Restore'),
      h('button', { onclick: () => DB.del('last').then(() => last.innerHTML = '') }, 'Forget'))); }).catch(() => {});
    root.append(last);
    if (this.rom) {
      const g = this.game, o = g.offsets;
      root.append(h('details', { class: 'panel' }, h('summary', {}, 'Technical details of the loaded ROM'), h('p', {}, g.name + ' · "' + this.rom.title + '" · ' + this.rom.code + ' · ' + (this.rom.size >> 20) + ' MB'),
        h('p', {}, `Maps: ${g.mapGroups.length} groups, ${g.mapGroups.reduce((a, b) => a + b.length, 0)} maps. Free space: ${hex(g.freeStart)}–${hex(g.freeEnd)} (${((g.freeEnd - g.freeStart) / 1024).toFixed(0)} KB).`),
        h('table', { class: 'grid' }, ...Object.entries(o).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { class: v < 0 ? 'err' : '' }, v < 0 ? 'not found' : hex(v)))))));
    }
    root.ondragover = e => { e.preventDefault(); };
    root.ondrop = e => { e.preventDefault(); e.stopPropagation(); App.dropFile(e); };
  },
  async openFile(file, handle) {
    if (this.rom && this.rom.dirty && !(await ask(T('Discard unsaved changes to the current ROM?'), { danger: true }))) return;
    await this.load(await file.arrayBuffer(), file.name);
    if (handle) await FileLink.attach(handle, file); else FileLink.detach();
    toast('Loaded ' + file.name);
  },
};

App.dropFile = async function (e) {
  const it = e.dataTransfer.items && e.dataTransfer.items[0], file = e.dataTransfer.files[0];
  if (!file) return;
  let handle = null;
  try { if (it && it.getAsFileSystemHandle) handle = await it.getAsFileSystemHandle(); } catch (x) { handle = null; }
  App.openFile(file, handle && handle.kind === 'file' ? handle : null);
};

// ---------- tiny IndexedDB wrapper ----------
const DB = {
  open() { return this._db || (this._db = new Promise((res, rej) => { const r = indexedDB.open('gba-hebrew-editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), s = t.objectStore('kv'), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
  get(k) { return this.tx('readonly', s => s.get(k)); },
  put(k, v) { return this.tx('readwrite', s => s.put(v, k)); },
  del(k) { return this.tx('readwrite', s => s.delete(k)); },
};

window.addEventListener('DOMContentLoaded', async () => {
  { const ql = new URLSearchParams(location.search).get('lang'); if (ql) I18N.lang = ql; }   // screenshots for the guide: language without saving it
  I18N.apply();
  I18N.translateDom($('header'));
  const nav = $('#nav');
  for (const [k, [label]] of Object.entries(App.tabs)) nav.append(h('button', { 'data-tab': k, class: k === 'home' ? 'sel' : 'needrom', disabled: k !== 'home', onclick: () => App.show(k) }, label));
  $('#btnHelp').onclick = async () => {                // the PDF guide: the system viewer through the backend, or a new tab in a plain browser
    if (Host.ok) { try { await Host.json('POST', '/api/guide', { lang: I18N.lang }); } catch (e) { toast(e.message, 'err'); } }
    else window.open('docs/Ember-Studio-Guide-' + (I18N.lang === 'he' ? 'he' : 'en') + '.pdf', '_blank');
  };
  $('#btnLang').textContent = I18N.lang === 'he' ? 'English' : 'עברית';
  $('#btnLang').onclick = async () => { if (App.rom && App.rom.dirty && !(await ask(T('Switching the language reloads the editor. Your work is autosaved in the browser — continue?')))) return; I18N.set(I18N.lang === 'he' ? 'en' : 'he'); location.reload(); };
  $('#btnProjSave').onclick = () => Project.save();
  $('#btnPlay').onclick = () => Emu.playNow();
  $('#btnProjBuild').onclick = () => Project.build(false);
  $('#btnProjPlay').onclick = () => Project.build(true);
  await Host.init();
  $('#btnDownload').onclick = () => App.download();
  $('#btnIPS').onclick = () => App.downloadIPS();
  $('#btnPatch').onclick = () => App.patchToNewFile();
  window.addEventListener('beforeunload', e => { if (App.rom && App.rom.dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => { e.preventDefault(); App.dropFile(e); });
  $('#btnSaveFile').onclick = () => FileLink.save();
  App.projectUI();
  App.show('home');
  const q = new URLSearchParams(location.search);
  if (q.get('selftest')) selfTest(q.get('selftest'), q.get('rom'));
  if (q.get('docshot')) DocShot.run(q);
  if (q.get('testsuite')) { const t = document.createElement('script'); t.src = 'tests/suite.js'; t.onload = () => TestSuite.run(q); document.body.append(t); }   // tests/run_all.py
});

// EmberStudio.exe --selftest out.json [--rom x.gba]: what works inside the program window (WebView2)
async function selfTest(out, romPath) {
  const r = { time: new Date().toISOString(), ua: navigator.userAgent, host: Host.ok, info: Host.info, isolated: window.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined', lang: I18N.lang };
  try {
    if (romPath) {
      const bytes = await Host.readFile(romPath);
      await App.load(bytes.slice().buffer, 'selftest.gba');
      r.romLoaded = App.game ? App.game.name : null;
      await Emu.run(bytes, { name: 'selftest' });
      await new Promise(res => setTimeout(res, 6000));
      const m = Emu._mod(), p = m.filePaths();
      r.emuScreenshot = !!m.screenshot('selftest.png');                 // the emulator's own screenshot (a WebGL canvas cannot be read back)
      const png = m.FS.readFile(p.screenshotsPath + '/selftest.png');
      r.screenshot = 'data:image/png;base64,' + btoa(Array.from(png, c => String.fromCharCode(c)).join(''));
    }
  } catch (e) { r.error = e.message; }
  await Host.writeJSON(out, r);
}
