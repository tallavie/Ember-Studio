// Keeps the editor in step with the .gba file on disk (Chrome / Edge File System Access API):
// the file opened with "choose a file" or dropped on the page is watched; when it changes (e.g. build.py rebuilt it)
// the editor reloads it - or, if you have unsaved changes, asks first (save your version / export map changes /
// load the new file / keep yours). "Save to file" writes your version back into the same file.
'use strict';

const FileLink = {
  handle: null, stamp: null, timer: null, prompting: false,
  supported: typeof window.showOpenFilePicker === 'function',

  async pick() {
    let hd;
    try { [hd] = await window.showOpenFilePicker({ types: [{ description: 'GBA ROM', accept: { 'application/octet-stream': ['.gba', '.bin'] } }] }); }
    catch (e) { return; }                                          // cancelled
    const f = await hd.getFile();
    await App.openFile(f, hd);
  },
  async attach(handle, file, stamp) {
    this.handle = handle;
    this.stamp = stamp || (file ? { t: file.lastModified, s: file.size } : null);
    DB.put('handle', handle).catch(() => {});
    clearInterval(this.timer);
    this.timer = setInterval(() => this.check(), 2000);
    this.ui();
  },
  detach() { this.handle = null; this.stamp = null; clearInterval(this.timer); this.ui(); },
  ui() {
    const b = $('#btnSaveFile'); if (b) { b.hidden = !this.handle; b.title = this.handle ? 'Write your changes into ' + this.handle.name + ' (Ctrl+S)' : ''; }
    const w = $('#watching'); if (w) w.textContent = this.handle ? '👁 watching ' + this.handle.name : '';
  },
  async check() {
    if (!this.handle || this.prompting || document.hidden) return;
    let f;
    try { if ((await this.handle.queryPermission({ mode: 'read' })) !== 'granted') return; f = await this.handle.getFile(); }
    catch (e) { return; }
    if (!this.stamp) { this.stamp = { t: f.lastModified, s: f.size }; return; }
    if (f.lastModified === this.stamp.t && f.size === this.stamp.s) return;
    this.stamp = { t: f.lastModified, s: f.size };
    if (!App.rom || !App.rom.dirty) { await this.reload(f); toast(f.name + ' changed on disk: reloaded'); return; }
    this.dialog(f);
  },
  async reload(f) {
    const tab = App.tab;
    await App.load(await f.arrayBuffer(), f.name, null, { fromDisk: true });
    App.show(tab);
  },
  async save() {
    if (!this.handle || !App.rom) return;
    try {
      if ((await this.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') { toast('No permission to write the file', 'err'); return; }
      const w = await this.handle.createWritable(); await w.write(App.rom.u8); await w.close();
      const f = await this.handle.getFile(); this.stamp = { t: f.lastModified, s: f.size };
      App.rom.original = new Uint8Array(App.rom.u8); App.rom.dirty = false; $('#dirty').textContent = '';
      toast('Saved into ' + this.handle.name + (App.isBuildOutput() ? '. Note: build.py rebuilds this file; use Export (map changes / songs) to keep your edits across builds.' : ''));
    } catch (e) { console.error(e); toast('Could not save: ' + e.message, 'err'); }
  },
  dialog(f) {
    this.prompting = true;
    const worldEdits = typeof WorldTab !== 'undefined' && WorldTab._test ? WorldTab._test.S.log.length : 0;
    const close = () => { back.remove(); this.prompting = false; };
    const done = h('div', { class: 'ok', style: { minHeight: '18px' } });
    const back = h('div', { class: 'modal-back' }, h('div', { class: 'panel modal' },
      h('h3', {}, f.name + ' changed on disk'),
      h('p', {}, 'The file was changed outside the editor (for example build.py rebuilt it), and you have unsaved changes here. What do you want to do with your changes?'),
      h('div', { class: 'col' },
        worldEdits ? h('button', { onclick: () => { WorldTab.exportEdits(); done.textContent = '✓ map changes exported (world_edits.json). After loading the new file: World view → Import edits re-applies them.'; } },
          '📤 Export my map changes (' + worldEdits + ' edits) for build.py') : '',
        h('button', { onclick: () => { App.download(); App.rom.dirty = true; done.textContent = '✓ your version was downloaded as a copy'; } }, '💾 Save my version as a copy (.gba download)'),
        h('button', { onclick: async () => { close(); await this.save(); } }, '✍ Overwrite the file with my version (discard the new file)'),
        h('button', { class: 'primary', onclick: async () => { close(); await this.reload(f); toast('Loaded the new ' + f.name); } }, '🔄 Load the new file (my unsaved changes are dropped)'),
        h('button', { onclick: () => { close(); toast('Kept your version. The editor will ask again on the next change of the file.'); } }, 'Keep working on my version')),
      done));
    document.body.append(back);
  },
};

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && App.rom) { e.preventDefault(); if (typeof Project !== 'undefined' && Project.cur) Project.save(); else if (FileLink.handle) FileLink.save(); else App.download(); }
});
