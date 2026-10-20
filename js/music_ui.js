// Music tab UI: song picker, layers (tracks) with mute / solo, piano roll, event table, instrument (voicegroup) table,
// playback in the browser, MIDI / WAV / .song.json import and writing back to the ROM. Core logic is in music.js.
'use strict';

const MusicTab = {
  song: null, songs: null, sel: 0, selNote: null, mute: new Set(), solo: new Set(), grid: 12, zoom: 0.6, page: 0,
  cache: new Map(), musicOnly: true, filter: '', loopPlay: true,
  reset() { this.stop(); this.song = null; this.songs = null; this.cache.clear(); this.dirty = false; },

  render(root) {
    const rom = App.rom;
    if (M4A.songTable(rom) < 0) { root.innerHTML = ''; root.append(h('div', { class: 'panel err' }, 'Song table not found in this ROM.')); return; }
    if (!this.songs) this.songs = M4A.songList(rom, App.game);
    if (!this.song) this.load((this.songs.find(s => s.index === 300) || this.songs.find(s => s.player === 0) || this.songs[0]).index);
    root.innerHTML = '';
    this.root = root; this._fill = null;
    root.append(this.songPanel(), h('div', { id: 'mu-import' }), this.structurePanel(), this.layerPanel(), h('div', { class: 'cols mu-cols' }, this.rollPanel(), this.tablePanel()), this.instrumentPanel());
    this.drawRoll(); this.fillTable();
  },
  load(index) {
    this.stop(); this.song = M4A.readSong(App.rom, index); this.sel = 0; this.selNote = null; this.mute.clear(); this.solo.clear(); this.cache.clear(); this.page = 0; this._fill = null;
    this.song.tracks.forEach((t, i) => t.name = t.name || this.trackName(t, i));
  },
  rerender() { if (this.root) this.render(this.root); },
  songName(s) {
    const maps = s.maps.slice(0, 3).map(([g, m, sec]) => Game.mapName(App.rom, App.game, sec) + ' ' + g + '.' + m).join(', ');
    return '#' + s.index + (s.player === 0 ? ' ♪' : ' sfx') + ' · ' + s.tracks + ' layers' + (maps ? ' · ' + maps + (s.maps.length > 3 ? '…' : '') : '');
  },
  trackName(t) {
    const v = t.events.find(e => e.type === 'cmd' && e.op === 0xBD);
    const slot = v ? v.args[0] : 0, e = this.song.vg[slot];
    if (e.sampleId != null) return 'Recording';
    return e[0] === 0x80 ? 'Drums' : M4A.GM[slot];
  },
  length() { return M4A.songLength(this.song); },
  loopTick() { const t = this.song.tracks.find(t => t.loopTick != null); return t ? t.loopTick : null; },
  tempo() { for (const t of this.song.tracks) for (const e of t.events) if (e.type === 'cmd' && e.op === 0xBB) return e; return null; },
  changed(track) {
    if (track == null) this.cache.clear(); else this.cache.delete(track);
    this.stop(); this.dirty = true;
    const b = $('#mu-save'); if (b) b.classList.add('primary');
  },

  // ---------- song panel ----------
  songPanel() {
    const s = this.song, list = this.songs.filter(x => x.index === s.index || ((!this.musicOnly || x.player === 0) && (!this.filter || this.songName(x).toLowerCase().includes(this.filter.toLowerCase()))));
    const sel = h('select', { class: 'mu-songsel', onchange: () => go(+sel.value) },
      ...list.map(x => h('option', { value: x.index }, this.songName(x))));
    sel.value = s.index;
    const go = async idx => {
      if (idx == null || isNaN(idx)) return;
      if (this.dirty && !(await ask(Tf('The current song has unsaved changes. Discard them and load song #{n}?', { n: idx }), { danger: true }))) { sel.value = s.index; return; }
      this.dirty = false; this.load(idx); this.rerender(); toast('Loaded song #' + idx + ' (' + this.song.tracks.length + ' layers)');
    };
    const step = d => { const i = list.findIndex(x => x.index === +sel.value); const n = list[i + d]; if (n) go(n.index); };
    const tm = Synth.tempoMap(s), len = this.length(), lt = this.loopTick(), tp = this.tempo(), poly = this.polyphony();
    const num = (v, f, attrs = {}) => h('input', Object.assign({ type: 'number', value: v, style: { width: '70px' }, onchange: e => f(e.target.value === '' ? NaN : +e.target.value) }, attrs));
    return h('div', { class: 'panel' },
      h('div', { class: 'row wrap' }, h('b', {}, 'Song'),
        h('button', { title: 'previous song in the list', onclick: () => step(-1) }, '‹'), sel,
        h('button', { title: 'next song in the list', onclick: () => step(1) }, '›'),
        h('button', { class: 'primary', title: 'Load the song chosen in the list and refresh the tables', onclick: () => go(+sel.value) }, '🔄 Load song'),
        h('input', { placeholder: 'filter (map name, #)', value: this.filter, style: { width: '150px' }, oninput: e => { this.filter = e.target.value; clearTimeout(this._ft); this._ft = setTimeout(() => { this.rerender(); const f = $('.mu-filter'); }, 400); } }),
        h('label', {}, h('input', { type: 'checkbox', checked: this.musicOnly, onchange: e => { this.musicOnly = e.target.checked; this.rerender(); } }), ' music only')),
      h('div', { class: 'row wrap', style: { marginTop: '8px' } },
        h('button', { class: 'primary', onclick: () => this.play() }, '▶ Play'), h('button', { onclick: () => this.stop() }, '■ Stop'),
        h('label', {}, h('input', { type: 'checkbox', checked: this.loopPlay, onchange: e => this.loopPlay = e.target.checked }), ' loop'),
        h('span', { id: 'mu-time', class: 'muted', style: { minWidth: '110px' } }, ''),
        h('button', { id: 'mu-save', class: this.dirty ? 'primary' : '', onclick: () => this.save() }, '💾 Write song to ROM'),
        h('button', { onclick: async () => { if (!this.dirty || await ask(T('Discard changes?'), { danger: true })) { this.dirty = false; this.load(s.index); this.rerender(); } } }, 'Revert'),
        h('label', { class: 'btn' }, '🎹 Import MIDI…', h('input', { type: 'file', accept: '.mid,.midi', hidden: true, onchange: e => e.target.files[0] && this.importMidi(e.target.files[0]) })),
        h('label', { class: 'btn' }, '🎵 Import WAV/MP3 as song…', h('input', { type: 'file', accept: 'audio/*,.wav,.mp3,.ogg', hidden: true, onchange: e => e.target.files[0] && this.importAudio(e.target.files[0]) })),
        h('button', { onclick: () => this.exportJson() }, 'Export .song.json'),
        h('label', { class: 'btn' }, 'Import .song.json', h('input', { type: 'file', accept: '.json', hidden: true, onchange: e => e.target.files[0] && this.importJson(e.target.files[0]) }))),
      h('div', { class: 'row wrap mu-info', style: { marginTop: '8px' } },
        h('span', {}, 'Header ' + (s.header >= 0 ? hex(s.header) : 'new')),
        h('span', {}, 'Voicegroup ' + (s.vgOffset >= 0 ? hex(s.vgOffset) + ' (shared by ' + this.songs.filter(x => x.vg === s.vgOffset).length + ' songs)' : 'new')),
        h('label', {}, 'Tempo (bpm) ', num(tp ? tp.args[0] * 2 : 150, v => {
          if (isNaN(v)) return; const t = this.tempo();
          if (t) t.args[0] = Math.max(1, Math.min(255, Math.round(v / 2))); else this.song.tracks[0].events.unshift({ t: 0, type: 'cmd', op: 0xBB, args: [Math.round(v / 2)] });
          this.changed(); this.rerender(); })),
        h('label', {}, 'Length (bars) ', num(+(len / 96).toFixed(2), v => { if (isNaN(v)) return; const n = Math.max(1, Math.round(v * 96)); this.song.tracks.forEach(t => t.endTick = n); this.changed(); this.rerender(); })),
        h('label', {}, 'Loop from bar ', num(lt == null ? '' : +(lt / 96 + 1).toFixed(2), v => { const n = isNaN(v) || v <= 0 ? null : Math.round((v - 1) * 96); this.song.tracks.forEach(t => t.loopTick = n); this.changed(); this.rerender(); }, { placeholder: 'none' })),
        h('label', {}, 'Priority ', num(s.priority, v => { s.priority = v & 255; this.changed(null); })),
        h('label', {}, 'Reverb ', num(s.reverb, v => { s.reverb = v & 255; this.changed(null); })),
        h('span', {}, tm.sec(len).toFixed(1) + ' s'),
        h('span', { class: poly > M4A.MAX_DIRECT ? 'warn' : 'muted', title: 'The game mixes at most ' + M4A.MAX_DIRECT + ' sampled notes at a time (square / wave / noise layers are extra). Beyond that, notes get cut.' },
          'up to ' + poly + ' sampled notes at once (game limit ' + M4A.MAX_DIRECT + ')'),
        s.tracks.length > M4A.MAX_TRACKS ? h('span', { class: 'err' }, 'more than ' + M4A.MAX_TRACKS + ' layers: the game ignores the rest') : null));
  },
  polyphony() {
    const s = this.song, iv = [];
    s.tracks.forEach(tr => {
      let voice = 0;
      [...tr.events].sort((a, b) => a.t - b.t).forEach(e => {
        if (e.type === 'cmd' && e.op === 0xBD) voice = e.args[0];
        if (e.type !== 'note') return;
        let t = s.vg[voice][0];
        if (t === 0x80 || t === 0x40) t = 0;
        if (M4A.isDirect(t)) iv.push([e.t, 1], [e.t + Math.min(e.dur, 96 * 8), -1]);
      });
    });
    iv.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let n = 0, m = 0; for (const [, d] of iv) { n += d; m = Math.max(m, n); }
    return m;
  },

  // ---------- song structure: one row per layer, with where in the song it plays ----------
  structurePanel() {
    const s = this.song, len = Math.max(this.length(), 96), bars = Math.ceil(len / 96), lt = this.loopTick();
    const rows = s.tracks.map((tr, i) => {
      let voice = 0, vol = 100, pan = 64, keysh = 0, lo = 127, hi = 0, notes = 0;
      const per = new Array(bars).fill(0), voices = new Set();
      [...tr.events].sort((a, b) => a.t - b.t).forEach(e => {
        if (e.type === 'cmd') {
          if (e.op === 0xBD) { voice = e.args[0]; voices.add(voice); }
          if (e.t === 0 && e.op === 0xBE) vol = e.args[0]; if (e.t === 0 && e.op === 0xBF) pan = e.args[0];
          if (e.t === 0 && e.op === 0xBC) keysh = (e.args[0] << 24) >> 24;
          return;
        }
        notes++; lo = Math.min(lo, e.key); hi = Math.max(hi, e.key);
        const b = Math.floor(e.t / 96); if (b < bars) per[b]++;
      });
      const first = [...voices][0] ?? 0, ent = s.vg[first];
      const kind = ent.sampleId != null ? 'recording' : ent[0] === 0x80 ? 'drums' : ent[0] === 0x40 ? 'sample (split)' : M4A.typeName(ent[0]);
      // activity strip: one cell per bar, darker = more notes; green tick = loop start
      const cv = h('canvas', { width: Math.min(bars * 6, 600), height: 14, class: 'mu-strip' });
      const c = cv.getContext('2d'), w = cv.width / bars, max = Math.max(1, ...per);
      per.forEach((n, b) => { if (n) { c.fillStyle = this.color(i); c.globalAlpha = 0.25 + 0.75 * n / max; c.fillRect(b * w, 1, Math.max(1, w - 1), 12); } });
      c.globalAlpha = 1; if (lt != null) { c.fillStyle = '#2f9e44'; c.fillRect(lt / 96 * w, 0, 2, 14); }
      return h('tr', { class: i === this.sel ? 'sel' : '', style: { cursor: 'pointer' }, onclick: () => { this.sel = i; this.selNote = null; this.page = 0; this.rerender(); } },
        h('td', {}, h('input', { type: 'checkbox', checked: !this.mute.has(i), title: 'play this layer',
          onclick: ev => ev.stopPropagation(), onchange: ev => this.setPlays(i, ev.target.checked) })),
        h('td', {}, h('span', { class: 'mu-dot', style: { background: this.color(i) } }), ' ' + (i + 1)),
        h('td', {}, tr.name + (voices.size > 1 ? ' (+' + (voices.size - 1) + ')' : '')), h('td', { class: 'muted' }, first + ' · ' + kind),
        h('td', {}, notes), h('td', {}, notes ? (ent[0] === 0x80 ? 'drums' : M4A.noteName(lo) + '–' + M4A.noteName(hi)) : '—'),
        h('td', {}, vol), h('td', {}, pan === 64 ? 'C' : pan < 64 ? 'L' + (64 - pan) : 'R' + (pan - 64)), h('td', {}, keysh || ''),
        h('td', {}, cv));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'row wrap' }, h('b', {}, 'Song structure'),
        h('span', { class: 'muted' }, s.tracks.length + ' layers · ' + bars + ' bars' + (lt != null ? ' · loops back to bar ' + (lt / 96 + 1) : ' · no loop') + ' · tick ▶ for the layers to hear · click a row to edit that layer')),
      h('table', { class: 'grid compact mu-struct' },
        h('thead', {}, h('tr', {}, h('th', { title: 'layers to play' }, h('input', { type: 'checkbox', checked: this.mute.size === 0, title: 'all / none',
          onchange: ev => { s.tracks.forEach((t, i) => ev.target.checked ? this.mute.delete(i) : this.mute.add(i)); this.solo.clear(); this.rerender(); this.restartIfPlaying(); } }), ' ▶'),
          ...['#', 'Layer', 'Slot · type', 'Notes', 'Range', 'Vol', 'Pan', 'Transp.', 'Where it plays (one cell per bar)'].map(x => h('th', {}, x)))),
        h('tbody', {}, ...rows)));
  },

  // the ▶ checkboxes in Song structure: unchecked = muted (solo is cleared so the ticks are what you hear)
  setPlays(i, on) {
    if (on) this.mute.delete(i); else this.mute.add(i);
    this.solo.clear(); this.rerender(); this.restartIfPlaying();
  },

  // ---------- layers ----------
  layerPanel() {
    const s = this.song;
    const tabs = s.tracks.map((t, i) => {
      const n = t.events.filter(e => e.type === 'note').length;
      return h('div', { class: 'mu-layer' + (i === this.sel ? ' sel' : ''), onclick: () => { this.sel = i; this.selNote = null; this.page = 0; this.rerender(); } },
        h('span', { class: 'mu-dot', style: { background: this.color(i) } }), (i + 1) + '. ' + t.name, h('span', { class: 'muted' }, ' ' + n),
        h('button', { class: 'mu-ms' + (this.mute.has(i) ? ' on' : ''), title: 'mute', onclick: ev => { ev.stopPropagation(); this.mute.has(i) ? this.mute.delete(i) : this.mute.add(i); this.rerender(); this.restartIfPlaying(); } }, 'M'),
        h('button', { class: 'mu-ms' + (this.solo.has(i) ? ' on' : ''), title: 'solo', onclick: ev => { ev.stopPropagation(); this.solo.has(i) ? this.solo.delete(i) : this.solo.add(i); this.rerender(); this.restartIfPlaying(); } }, 'S'));
    });
    const tr = s.tracks[this.sel];
    const first = op => tr && tr.events.find(e => e.type === 'cmd' && e.op === op && e.t === 0);
    const setFirst = (op, v) => { let e = first(op); if (!e) { e = { t: 0, type: 'cmd', op, args: [0] }; tr.events.unshift(e); } e.args[0] = v & 255; this.changed(this.sel); };
    const vs = first(0xBD) ? first(0xBD).args[0] : 0;
    const voiceSel = h('select', { onchange: e => { setFirst(0xBD, +e.target.value); tr.name = this.trackName(tr); this.rerender(); } },
      ...s.vg.map((e, slot) => h('option', { value: slot }, slot + ': ' + this.slotLabel(slot))));
    voiceSel.value = vs;
    const num = (op, def, lo, hi) => h('input', { type: 'number', min: lo, max: hi, value: first(op) ? (op === 0xBC ? (first(op).args[0] << 24) >> 24 : first(op).args[0]) : def, style: { width: '60px' }, onchange: e => setFirst(op, +e.target.value) });
    return h('div', { class: 'panel' },
      h('div', { class: 'row wrap' }, h('b', {}, 'Layers'), ...tabs,
        h('button', { onclick: () => this.addLayer(), disabled: s.tracks.length >= 16 }, '+ layer')),
      tr ? h('div', { class: 'row wrap', style: { marginTop: '8px' } },
        h('label', {}, 'Instrument ', voiceSel), h('label', {}, 'Volume ', num(0xBE, 100, 0, 127)), h('label', {}, 'Pan ', num(0xBF, 64, 0, 127)),
        h('label', {}, 'Transpose ', num(0xBC, 0, -64, 63)),
        h('button', { onclick: async () => { if (await ask(Tf('Delete layer {n}?', { n: this.sel + 1 }), { danger: true })) { s.tracks.splice(this.sel, 1); this.sel = Math.max(0, this.sel - 1); this.changed(); this.rerender(); } } }, 'Delete layer'),
        h('span', { class: 'muted' }, 'Piano roll: click empty space to add a note, drag to move, drag the right edge to resize, right-click or Delete to remove.')) : null);
  },
  addLayer() {
    const s = this.song, len = this.length();
    s.tracks.push({ events: [{ t: 0, type: 'cmd', op: 0xBD, args: [0] }, { t: 0, type: 'cmd', op: 0xBE, args: [100] }, { t: 0, type: 'cmd', op: 0xBF, args: [64] }], loopTick: this.loopTick(), endTick: len || 96 * 4, offset: -1 });
    this.sel = s.tracks.length - 1; s.tracks[this.sel].name = this.trackName(s.tracks[this.sel]); this.changed(); this.rerender();
  },
  color(i) { return 'hsl(' + ((i * 47 + 200) % 360) + ',70%,55%)'; },
  filler() {
    if (this._fill) return this._fill;
    const m = new Map(); this.song.vg.forEach(x => { const k = M4A.hexOf(x); m.set(k, (m.get(k) || 0) + 1); });
    return this._fill = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  },
  slotLabel(slot) {
    const e = this.song.vg[slot];
    if (e.sampleId != null) return 'imported recording';
    if (M4A.hexOf(e) === this.filler()) return '—';
    return M4A.entryLabel(e, slot);
  },

  // ---------- piano roll ----------
  rollPanel() {
    return h('div', { class: 'panel mu-rollp' },
      h('div', { class: 'row wrap' }, h('b', {}, 'Piano roll'), h('span', { class: 'muted' }, 'layer ' + (this.sel + 1) + ' in colour, other layers in grey · green line = loop start, red = end'),
        h('label', {}, 'Grid ', makeSelect2([['1/32', 3], ['1/16', 6], ['1/8', 12], ['1/4', 24], ['1/2', 48], ['bar', 96]], this.grid, v => this.grid = v)),
        h('label', {}, 'Zoom ', h('input', { type: 'range', min: 0.1, max: 3, step: 0.05, value: this.zoom, oninput: e => { this.zoom = +e.target.value; this.drawRoll(); } }))),
      h('div', { class: 'mu-rollwrap' }, h('div', { class: 'mu-keys' }, h('canvas', { id: 'mu-keys' })),
        h('div', { class: 'mu-scroll', id: 'mu-scroll', onscroll: e => { $('.mu-keys').scrollTop = e.target.scrollTop; } },
          h('div', { class: 'mu-canvasbox' }, h('canvas', { id: 'mu-roll', tabindex: 0, oncontextmenu: e => e.preventDefault() }), h('div', { id: 'mu-head', class: 'mu-head' })))));
  },
  range() {
    let lo = 127, hi = 0;
    for (const t of this.song.tracks) for (const e of t.events) if (e.type === 'note') { lo = Math.min(lo, e.key); hi = Math.max(hi, e.key); }
    if (lo > hi) { lo = 48; hi = 84; }
    lo = Math.max(0, lo - 5); hi = Math.min(127, hi + 5);
    while (hi - lo < 36) { if (lo > 0) lo--; if (hi < 127) hi++; if (lo === 0 && hi === 127) break; }
    return [lo, hi];
  },
  drawRoll() {
    const cv = $('#mu-roll'); if (!cv) return;
    const s = this.song, len = Math.max(this.length(), 96);
    let PX = this.zoom; if (len * PX > 30000) PX = 30000 / len;
    this.PX = PX;
    const [lo, hi] = this.range(), box = $('#mu-scroll');
    const RH = Math.max(8, Math.min(16, Math.floor(((box && box.clientHeight) || 400) - 16) / (hi - lo + 1) | 0));
    this.lo = lo; this.hi = hi; this.RH = RH;
    const W = Math.ceil(len * PX) + 40, H = (hi - lo + 1) * RH;
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), dark = matchMedia('(prefers-color-scheme: dark)').matches;
    c.fillStyle = dark ? '#16181f' : '#fbfbfd'; c.fillRect(0, 0, W, H);
    for (let k = lo; k <= hi; k++) if ([1, 3, 6, 8, 10].includes(k % 12)) { c.fillStyle = dark ? '#1d2029' : '#eef0f5'; c.fillRect(0, (hi - k) * RH, W, RH); }
    for (let k = lo; k <= hi; k++) if (k % 12 === 0) { c.fillStyle = dark ? '#3a4050' : '#c9cedb'; c.fillRect(0, (hi - k) * RH + RH - 1, W, 1); }
    for (let t = 0; t <= len; t += 24) { c.fillStyle = t % 96 ? (dark ? '#252a36' : '#e3e6ee') : (dark ? '#47506a' : '#b5bccd'); c.fillRect(Math.round(t * PX), 0, 1, H); }
    if (PX * 96 > 28) { c.fillStyle = dark ? '#8a93a8' : '#7a8296'; c.font = '9px sans-serif'; for (let t = 0; t < len; t += 96) c.fillText(String(t / 96 + 1), Math.round(t * PX) + 2, 9); }
    const lt = this.loopTick();
    if (lt != null) { c.fillStyle = '#2f9e44'; c.fillRect(Math.round(lt * PX), 0, 2, H); }
    c.fillStyle = '#c92a2a'; c.fillRect(Math.round(len * PX), 0, 2, H);
    s.tracks.forEach((tr, i) => {
      if (i === this.sel) return;
      c.fillStyle = dark ? 'rgba(160,170,190,.25)' : 'rgba(80,90,110,.18)';
      for (const e of tr.events) if (e.type === 'note') c.fillRect(e.t * PX, (hi - e.key) * RH + 1, Math.max(2, Math.min(e.dur, len - e.t) * PX), RH - 2);
    });
    const tr = s.tracks[this.sel];
    if (tr) for (const e of tr.events) if (e.type === 'note') {
      const x = e.t * PX, w = Math.max(3, Math.min(e.dur, len - e.t) * PX), y = (hi - e.key) * RH;
      c.fillStyle = e === this.selNote ? '#f59f00' : this.color(this.sel); c.globalAlpha = 0.45 + 0.55 * e.vel / 127;
      c.fillRect(x, y + 1, w, RH - 2); c.globalAlpha = 1;
      c.strokeStyle = dark ? '#000' : '#334'; c.lineWidth = 0.6; c.strokeRect(x + .5, y + 1.5, w - 1, RH - 3);
    }
    const kc = $('#mu-keys'); kc.width = 38; kc.height = H; const k2 = kc.getContext('2d');
    const drums = tr && (() => { const v = tr.events.find(e => e.type === 'cmd' && e.op === 0xBD); return v && s.vg[v.args[0]][0] === 0x80; })();
    for (let k = lo; k <= hi; k++) {
      const black = [1, 3, 6, 8, 10].includes(k % 12), y = (hi - k) * RH;
      k2.fillStyle = black ? (dark ? '#333' : '#555') : (dark ? '#ddd' : '#fff'); k2.fillRect(0, y, 38, RH);
      k2.fillStyle = '#888'; k2.fillRect(0, y + RH - 1, 38, 1);
      const label = drums ? M4A.DRUM_NAMES[k] : (k % 12 === 0 ? M4A.noteName(k) : null);
      if (label) { k2.fillStyle = black ? '#fff' : '#333'; k2.font = '7px sans-serif'; k2.fillText(label.slice(0, 9), 1, y + RH - 1); }
    }
    this.bindRoll(cv);
  },
  hit(x, y) {
    const tr = this.song.tracks[this.sel]; if (!tr) return null;
    const key = this.hi - Math.floor(y / this.RH), t = x / this.PX, len = this.length();
    for (let i = tr.events.length - 1; i >= 0; i--) {
      const e = tr.events[i];
      if (e.type !== 'note' || e.key !== key) continue;
      const right = (e.t + Math.min(e.dur, len - e.t)) * this.PX;
      if (x >= e.t * this.PX && x <= Math.max(right, e.t * this.PX + 3)) return { e, edge: right - x < 5 };
    }
    return null;
  },
  bindRoll(cv) {
    if (cv._bound) return; cv._bound = true;
    const snap = t => Math.max(0, Math.round(t / this.grid) * this.grid);
    cv.addEventListener('mousedown', ev => {
      cv.focus();
      const tr = this.song.tracks[this.sel]; if (!tr) return;
      const x = ev.offsetX, y = ev.offsetY, hit = this.hit(x, y);
      if (ev.button === 2) { if (hit) { tr.events.splice(tr.events.indexOf(hit.e), 1); if (this.selNote === hit.e) this.selNote = null; this.changed(this.sel); this.drawRoll(); this.fillTable(); } return; }
      let drag;
      if (hit) { this.selNote = hit.e; drag = { e: hit.e, mode: hit.edge ? 'size' : 'move', x, y, t: hit.e.t, k: hit.e.key, d: hit.e.dur }; this.preview(hit.e.key); }
      else {
        const key = this.hi - Math.floor(y / this.RH), t = Math.floor(x / this.PX / this.grid) * this.grid;
        const e = { t, type: 'note', key, vel: 100, dur: this.grid };
        tr.events.push(e); this.selNote = e; drag = { e, mode: 'size', x, y, t, k: key, d: this.grid };
        this.changed(this.sel); this.preview(key);
      }
      this.drawRoll();
      const move = m => {
        const dx = (m.offsetX - drag.x) / this.PX, dy = Math.round((m.offsetY - drag.y) / this.RH);
        if (drag.mode === 'move') { drag.e.t = snap(drag.t + dx); drag.e.key = Math.max(0, Math.min(127, drag.k - dy)); }
        else drag.e.dur = Math.max(1, snap(drag.t + drag.d + dx) - drag.e.t || this.grid);
        drag.moved = true; this.drawRoll();
      };
      const up = () => { cv.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); if (drag.moved) this.changed(this.sel); this.fillTable(); };
      cv.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    cv.addEventListener('keydown', ev => {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && this.selNote) {
        const tr = this.song.tracks[this.sel], i = tr.events.indexOf(this.selNote);
        if (i >= 0) tr.events.splice(i, 1); this.selNote = null; this.changed(this.sel); this.drawRoll(); this.fillTable(); ev.preventDefault();
      }
    });
    cv.addEventListener('mousemove', ev => { if (ev.buttons) return; const hit = this.hit(ev.offsetX, ev.offsetY); cv.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'move') : 'crosshair'; });
  },

  // ---------- event table ----------
  tablePanel() {
    const opSel = h('select', {}, ...M4A.EDITABLE_OPS.map(op => h('option', { value: op }, M4A.OPS[op][0])));
    return h('div', { class: 'panel mu-tablep' },
      h('div', { class: 'row wrap' }, h('b', {}, 'Events · layer ' + (this.sel + 1)),
        h('button', { onclick: () => this.addEvent('note') }, '+ note'), opSel, h('button', { onclick: () => this.addEvent('cmd', +opSel.value) }, '+ command'),
        h('span', { id: 'mu-pager', class: 'row' })),
      h('div', { class: 'mu-tablebox' }, h('table', { class: 'grid compact mu-table' },
        h('thead', {}, h('tr', {}, ...['Tick', 'Bar:beat', 'Type', 'Note / value', 'Length', 'Vel', ''].map(x => h('th', {}, x)))),
        h('tbody', { id: 'mu-tbody' }))));
  },
  addEvent(type, op) {
    const tr = this.song.tracks[this.sel]; if (!tr) return;
    const t = this.selNote ? this.selNote.t + Math.min(this.selNote.dur, 96 * 64) : 0;
    const e = type === 'note' ? { t, type, key: this.selNote ? this.selNote.key : 60, vel: 100, dur: this.grid }
      : { t, type, op, args: [op === 0xBB ? 60 : op === 0xBF || op === 0xC0 ? 64 : op === 0xBE ? 100 : 0] };
    tr.events.push(e); if (type === 'note') this.selNote = e;
    this.changed(this.sel); this.drawRoll(); this.fillTable();
  },
  fillTable() {
    const tb = $('#mu-tbody'); if (!tb) return;
    const tr = this.song.tracks[this.sel]; tb.innerHTML = ''; if (!tr) return;
    const evs = [...tr.events].sort((a, b) => a.t - b.t || (b.type === 'cmd') - (a.type === 'cmd'));
    const PAGE = 150, pages = Math.max(1, Math.ceil(evs.length / PAGE));
    if (this.selNote) { const i = evs.indexOf(this.selNote); if (i >= 0) this.page = Math.floor(i / PAGE); }
    this.page = Math.min(this.page, pages - 1);
    const pg = $('#mu-pager'); pg.innerHTML = '';
    pg.append(h('button', { disabled: this.page === 0, onclick: () => { this.selNote = null; this.page--; this.fillTable(); } }, '‹'),
      h('span', { class: 'muted' }, ' ' + (this.page + 1) + '/' + pages + ' (' + evs.length + ') '),
      h('button', { disabled: this.page >= pages - 1, onclick: () => { this.selNote = null; this.page++; this.fillTable(); } }, '›'));
    const inp = (v, f, w = 52) => h('input', { value: v, style: { width: w + 'px' }, onchange: e => { f(e.target.value); this.changed(this.sel); this.drawRoll(); this.fillTable(); } });
    for (const e of evs.slice(this.page * PAGE, this.page * PAGE + PAGE)) {
      const bar = Math.floor(e.t / 96) + 1, beat = (e.t % 96) / 24 + 1;
      const isNote = e.type === 'note', name = isNote ? 'note' : (M4A.OPS[e.op] || ['?'])[0];
      const valueCell = isNote ? inp(M4A.noteName(e.key), v => { const k = M4A.parseNote(v); if (k != null) e.key = k; }, 48)
        : (e.op === 0xB9 || e.op === 0xCD) ? h('span', { class: 'muted' }, e.args.join(' '))
        : inp(e.op === 0xBC || e.op === 0xC8 ? (e.args[0] << 24) >> 24 : e.op === 0xBB ? e.args[0] * 2 : e.args[0], v => { let n = parseInt(v) || 0; if (e.op === 0xBB) n = Math.round(n / 2); e.args[0] = n & 255; }, 48);
      const note2 = !isNote && e.op === 0xBB ? ' bpm' : !isNote && e.op === 0xBD ? ' ' + this.slotLabel(e.args[0]).slice(0, 22) : '';
      tb.append(h('tr', { class: e === this.selNote ? 'sel' : '', onclick: ev => { if (/INPUT|BUTTON/.test(ev.target.tagName)) return; if (isNote) { this.selNote = e; this.drawRoll(); this.scrollTo(e); this.fillTable(); } } },
        h('td', {}, inp(e.t, v => e.t = Math.max(0, parseInt(v) || 0), 56)),
        h('td', { class: 'muted' }, bar + ':' + (+beat.toFixed(2))),
        h('td', {}, name),
        h('td', {}, valueCell, note2 ? h('span', { class: 'muted' }, note2) : null),
        h('td', {}, isNote ? (e.dur >= M4A.HELD ? 'held' : inp(e.dur, v => e.dur = Math.max(1, parseInt(v) || 1), 44)) : ''),
        h('td', {}, isNote ? inp(e.vel, v => e.vel = Math.max(1, Math.min(127, parseInt(v) || 1)), 38) : ''),
        h('td', {}, h('button', { class: 'mu-x', title: 'delete', onclick: () => { tr.events.splice(tr.events.indexOf(e), 1); if (this.selNote === e) this.selNote = null; this.changed(this.sel); this.drawRoll(); this.fillTable(); } }, '✕'))));
    }
  },
  scrollTo(e) { const sc = $('#mu-scroll'); if (!sc) return; sc.scrollLeft = Math.max(0, e.t * this.PX - sc.clientWidth / 3); sc.scrollTop = Math.max(0, (this.hi - e.key) * this.RH - sc.clientHeight / 2); },

  // ---------- instruments (voicegroup) ----------
  instrumentPanel() {
    const s = this.song, used = new Map();
    s.tracks.forEach((t, i) => t.events.forEach(e => { if (e.type === 'cmd' && e.op === 0xBD) { if (!used.has(e.args[0])) used.set(e.args[0], new Set()); used.get(e.args[0]).add(i + 1); } }));
    const slots = this.showAll ? [...Array(128).keys()].filter(sl => used.has(sl) || this.slotLabel(sl) !== '—') : [...used.keys()].sort((a, b) => a - b);
    const cat = M4A.catalog(App.rom);
    const options = () => {
      const groups = new Map();
      cat.items.forEach((it, i) => { const g = M4A.GM[it.slot]; if (!groups.has(g)) groups.set(g, []); groups.get(g).push([i, it]); });
      return h('select', {}, h('option', { value: '' }, 'replace with…'),
        h('optgroup', { label: 'Drum kits' }, ...cat.kits.map((k, i) => h('option', { value: 'k' + i }, 'Drum kit ' + (i + 1) + ' (' + k.songs.length + ' songs)'))),
        ...[...groups.entries()].map(([g, list]) => h('optgroup', { label: g }, ...list.map(([i, it]) => h('option', { value: 'i' + i }, g + ' · ' + M4A.typeName(it.entry[0]) + ' · songs ' + it.songs.slice(0, 4).join(',') + (it.songs.length > 4 ? '…' : ''))))));
    };
    const rows = slots.map(sl => {
      const e = s.vg[sl], t = e[0], sample = (t & 0xC7) === 0, cgb = (t & 7) && !(t & 0xC0);
      let info = '';
      if (sample && e.sampleId == null) {
        const p = new DataView(e.buffer, e.byteOffset).getUint32(4, true) & 0x1FFFFFF, dv = new DataView(App.rom.u8.buffer);
        if (p + 16 < App.rom.size) info = (dv.getUint32(p + 12, true) / 1024).toFixed(1) + ' KB, ' + Math.round(dv.getUint32(p + 4, true) / 1024) + ' Hz' + (dv.getUint32(p, true) & 0x40000000 ? ', loops' : '');
      }
      if (e.sampleId != null) { const sm = s.samples[e.sampleId]; info = sm ? (sm.pcm.length / 1024).toFixed(0) + ' KB, ' + sm.rate + ' Hz (not written yet)' : 'recording'; }
      const adsr = [8, 9, 10, 11].map((b, j) => h('input', { type: 'number', min: 0, max: cgb ? (j === 2 ? 15 : 7) : 255, value: e[b], title: ['attack', 'decay', 'sustain', 'release'][j], style: { width: '52px' }, onchange: ev => { e[b] = +ev.target.value & 255; this.changed(); } }));
      const rep = options();
      rep.onchange = () => {
        const v = rep.value; if (!v) return;
        const src = v[0] === 'k' ? cat.kits[+v.slice(1)].entry : cat.items[+v.slice(1)].entry;
        s.vg[sl] = new Uint8Array(src); this._fill = null;
        s.tracks.forEach(t2 => t2.name = this.trackName(t2));
        this.changed(); this.rerender();
      };
      return h('tr', {}, h('td', {}, sl), h('td', {}, this.slotLabel(sl)), h('td', { class: 'muted' }, used.has(sl) ? 'layers ' + [...used.get(sl)].join(', ') : ''),
        h('td', { class: 'muted' }, info), h('td', {}, t === 0x40 || t === 0x80 ? h('span', { class: 'muted' }, 'per key') : adsr),
        h('td', {}, h('button', { title: 'listen', onclick: () => this.preview(t === 0x80 ? 38 : 60, sl) }, '▶')), h('td', {}, rep));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'row wrap' }, h('b', {}, 'Instruments (voicegroup)'),
        h('label', {}, h('input', { type: 'checkbox', checked: !!this.showAll, onchange: e => { this.showAll = e.target.checked; this.rerender(); } }), ' show all slots'),
        h('span', { class: 'muted' }, 'A changed voicegroup is written as a new copy for this song only. ADSR: samples 0-255, square/wave 0-7 (sustain 0-15).')),
      h('table', { class: 'grid compact' }, h('thead', {}, h('tr', {}, ...['Slot', 'Instrument', 'Used by', 'Sample', 'Attack / decay / sustain / release', '', ''].map(x => h('th', {}, x)))), h('tbody', {}, ...rows)));
  },

  // ---------- audio ----------
  ctx() { return this._ctx || (this._ctx = new (window.AudioContext || window.webkitAudioContext)()); },
  preview(key, slot) {
    const s = this.song;
    if (slot == null) { const tr = s.tracks[this.sel]; const v = tr && tr.events.find(e => e.type === 'cmd' && e.op === 0xBD); slot = v ? v.args[0] : 0; }
    const sig = Synth.noteSignal(App.rom, s, slot, key, 0.5, 110); if (!sig) return;
    const ctx = this.ctx(), b = ctx.createBuffer(1, sig.length, Synth.SR); b.copyToChannel(sig.map(v => v * 0.4), 0);
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); ctx.resume(); src.start();
  },
  mix() {
    const s = this.song, tm = Synth.tempoMap(s), len = this.length(), endSec = tm.sec(len);
    const n = Math.ceil(endSec * Synth.SR) + 1, L = new Float32Array(n), R = new Float32Array(n);
    s.tracks.forEach((tr, i) => {
      if (this.solo.size ? !this.solo.has(i) : this.mute.has(i)) return;
      if (!this.cache.has(i)) this.cache.set(i, Synth.renderTrack(App.rom, s, tr, tm, endSec));
      const r = this.cache.get(i), m = Math.min(n, r.L.length); for (let j = 0; j < m; j++) { L[j] += r.L[j]; R[j] += r.R[j]; }
    });
    let peak = 0; for (let j = 0; j < n; j++) { const a = Math.abs(L[j]), b = Math.abs(R[j]); if (a > peak) peak = a; if (b > peak) peak = b; }
    const g = peak > 0 ? Math.min(0.35, 0.95 / peak) : 0;
    for (let j = 0; j < n; j++) { L[j] *= g; R[j] *= g; }
    return { L, R, tm, endSec };
  },
  play() {
    this.stop();
    const tt = $('#mu-time'); if (tt) tt.textContent = 'rendering…';
    setTimeout(() => {
      const { L, R, tm, endSec } = this.mix(), ctx = this.ctx();
      const b = ctx.createBuffer(2, L.length, Synth.SR); b.copyToChannel(L, 0); b.copyToChannel(R, 1);
      const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination);
      const lt = this.loopTick(), held = this.heldSample();
      if (this.loopPlay && held && held.looped) { src.loop = true; src.loopStart = held.loop / held.rate; src.loopEnd = Math.min(endSec, (held.pcm.length - 1) / held.rate); }
      else if (this.loopPlay && !held && lt != null && lt < this.length()) { src.loop = true; src.loopStart = tm.sec(lt); src.loopEnd = endSec; }
      ctx.resume(); src.start(); this.src = src; this.t0 = ctx.currentTime;
      const loopS = src.loop ? [src.loopStart, endSec] : null;
      src.onended = () => { if (this.src === src) this.stop(); };
      const tick = () => {
        if (this.src !== src) return;
        let sec = ctx.currentTime - this.t0;
        if (loopS && sec > loopS[1]) sec = loopS[0] + (sec - loopS[0]) % (loopS[1] - loopS[0]);
        const t = tm.tick(sec), hd = $('#mu-head');
        if (hd) { hd.style.left = (t * this.PX) + 'px'; hd.style.display = 'block'; }
        const el = $('#mu-time'); if (el) el.textContent = sec.toFixed(1) + ' s · bar ' + (Math.floor(t / 96) + 1);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 20);
  },
  // a song that is one held recording (imported WAV): the sample's own loop decides how it repeats
  heldSample() {
    for (const tr of this.song.tracks) {
      const n = tr.events.find(e => e.type === 'note' && e.dur >= M4A.HELD && e.t === 0); if (!n) continue;
      const v = tr.events.find(e => e.type === 'cmd' && e.op === 0xBD);
      return Synth.sampleInfo(App.rom, this.song, v ? v.args[0] : 0);
    }
    return null;
  },
  stop() {
    if (this.src) { const s = this.src; this.src = null; try { s.stop(); } catch (e) { } }
    const hd = $('#mu-head'); if (hd) hd.style.display = 'none';
  },
  restartIfPlaying() { if (this.src) this.play(); },

  // ---------- write / import / export ----------
  save() {
    try {
      const s = this.song;
      M4A.writeSong(App.rom, s);
      App.rom._catalog = null;
      this.songs = M4A.songList(App.rom, App.game); this.dirty = false;
      toast('Song #' + s.index + ' written to the ROM (' + s.tracks.length + ' layers). Download the ROM to keep it.');
      this.load(s.index); this.rerender();
    } catch (e) { console.error(e); toast(e.message, 'err'); }
  },
  async importMidi(file) {
    try {
      const midi = MusicImport.parseMidi(await file.arrayBuffer());
      const { song, warnings } = MusicImport.midiToSong(App.rom, this.song, midi);
      this.song = song; this.sel = 0; this.selNote = null; this.mute.clear(); this.solo.clear(); this.cache.clear(); this.dirty = true; this._fill = null;
      toast('Imported ' + file.name + ': ' + song.tracks.length + ' layers. Listen, adjust, then "Write song to ROM".');
      warnings.forEach(w => toast(w, 'err'));
      this.rerender();
    } catch (e) { console.error(e); toast('MIDI import failed: ' + e.message, 'err'); }
  },
  async importAudio(file) {
    let buf;
    try { buf = await this.ctx().decodeAudioData(await file.arrayBuffer()); }
    catch (e) { toast('Could not decode ' + file.name + ' (' + (e && e.message) + ')', 'err'); return; }
    this.audioDialog(buf, file.name);
  },
  largestFree() {
    const rom = App.rom; let n = 0, best = 0;
    for (let i = rom.freeStart; i < rom.freeEnd; i++) { if (rom.u8[i] === 0xFF) { if (++n > best) best = n; } else n = 0; }
    return best;
  },
  audioDialog(buf, name) {
    const box = $('#mu-import'); box.innerHTML = '';
    const dur = buf.duration, rom = App.rom;
    const f = { start: 0, end: +dur.toFixed(2), rate: M4A.MIXER_RATE, loop: true, loopAt: 0, gain: 1 };
    let free = this.largestFree();
    const info = h('span', { class: 'muted' });
    const upd = () => {
      const bytes = Math.round((f.end - f.start) * f.rate) + 64;
      info.textContent = 'Size ' + (bytes / 1048576).toFixed(2) + ' MB · largest free block ' + (free / 1048576).toFixed(2) + ' MB' + (bytes > free ? ' · not enough space: expand the ROM' : '');
      info.className = bytes > free ? 'err' : 'muted';
    };
    const num = (k, step, w = 70) => h('input', { type: 'number', step, value: f[k], style: { width: w + 'px' }, oninput: e => { f[k] = +e.target.value; upd(); } });
    const rateSel = h('select', { onchange: e => { f.rate = +e.target.value; upd(); } }, ...[[13379, '13379 Hz (the game\'s mixer rate, best)'], [10512, '10512 Hz'], [8000, '8000 Hz (smallest)']].map(([v, l]) => h('option', { value: v }, l)));
    box.append(h('div', { class: 'panel warn' },
      h('h3', {}, 'Recording → song #' + this.song.index + ': ' + name),
      h('p', { class: 'muted' }, 'The recording becomes 8-bit mono at the chosen rate (the format of the game\'s own samples) and plays as one long note, so in the game it sounds like the recording at lower quality. ' +
        'Duration ' + dur.toFixed(1) + ' s, ' + buf.sampleRate + ' Hz, ' + buf.numberOfChannels + ' channel(s).'),
      h('div', { class: 'row wrap' }, h('label', {}, 'Start (s) ', num('start', 0.1)), h('label', {}, 'End (s) ', num('end', 0.1)), h('label', {}, 'Rate ', rateSel),
        h('label', {}, h('input', { type: 'checkbox', checked: f.loop, onchange: e => f.loop = e.target.checked }), ' loop, from (s) '), num('loopAt', 0.1),
        h('label', {}, 'Volume ', num('gain', 0.05, 60))),
      h('div', { class: 'row wrap', style: { marginTop: '8px' } }, info,
        rom.size < 0x2000000 ? h('button', { onclick: ev => { this.expandRom(); free = this.largestFree(); upd(); ev.target.remove(); } }, 'Expand ROM to 32 MB') : null,
        h('button', { class: 'primary', onclick: () => {
          if (f.end <= f.start) { toast('End must be after start', 'err'); return; }
          const bytes = Math.round((f.end - f.start) * f.rate) + 64;
          if (bytes > free) { toast('Not enough free space: expand the ROM first', 'err'); return; }
          const pcm = this.toPcm(buf, f.start, f.end, f.rate);
          const loopStart = Math.max(0, Math.min(pcm.length - 2, Math.round((f.loopAt - f.start) * f.rate)));
          this.song = MusicImport.audioToSong(this.song, pcm, f.rate, loopStart, f.loop, Math.max(0, Math.min(1, f.gain)));
          this.song.tracks[0].name = 'Recording';
          this.sel = 0; this.selNote = null; this.mute.clear(); this.solo.clear(); this.cache.clear(); this.dirty = true; this._fill = null; box.innerHTML = '';
          toast('Converted. Press Play to hear the 8-bit version, then "Write song to ROM".');
          this.rerender();
        } }, 'Convert'),
        h('button', { onclick: () => box.innerHTML = '' }, 'Cancel'))));
    upd();
  },
  // mono mix, box-filter resample to `rate`, normalize, TPDF dither -> signed 8-bit
  toPcm(buf, start, end, rate) {
    const sr = buf.sampleRate, a = Math.floor(start * sr), b = Math.min(buf.length, Math.floor(end * sr));
    const ch = [...Array(buf.numberOfChannels).keys()].map(i => buf.getChannelData(i));
    const n = Math.max(2, Math.floor((b - a) / sr * rate)), out = new Int8Array(n), mono = new Float32Array(n), step = sr / rate;
    let peak = 1e-6;
    for (let i = 0; i < n; i++) {
      const s0 = a + Math.floor(i * step), s1 = Math.max(s0 + 1, a + Math.floor((i + 1) * step));
      let acc = 0, cnt = 0; for (let j = s0; j < s1 && j < b; j++) { for (const c of ch) acc += c[j]; cnt += ch.length; }
      mono[i] = cnt ? acc / cnt : 0; if (Math.abs(mono[i]) > peak) peak = Math.abs(mono[i]);
    }
    const g = 0.98 / peak;
    for (let i = 0; i < n; i++) out[i] = Math.max(-128, Math.min(127, Math.round(mono[i] * g * 127 + (Math.random() - Math.random()) * 0.5)));
    return out;
  },
  expandRom() {
    const rom = App.rom; if (rom.size >= 0x2000000) return;
    const n = new Uint8Array(0x2000000).fill(0xFF); n.set(rom.u8);
    rom.u8 = n; rom.freeStart = 0x1000010; rom.freeEnd = 0x2000000; rom._hint = 0; rom.changed();
    toast('ROM expanded to 32 MB. IPS patches only cover 16 MB, so share the full ROM.');
  },
  exportJson() {
    const s = this.song;
    const b64 = a => { let str = ''; const u = new Uint8Array(a.buffer, a.byteOffset, a.length); for (let i = 0; i < u.length; i += 0x8000) str += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(str); };
    const out = { format: 'kl-song-1', index: s.index, priority: s.priority, reverb: s.reverb,
      voicegroup: s.vg.map(e => e.sampleId != null ? { sample: e.sampleId, entry: M4A.hexOf(e) } : M4A.hexOf(e)),
      samples: Object.fromEntries(Object.entries(s.samples).map(([k, v]) => [k, { rate: v.rate, loopStart: v.loopStart, looped: v.looped, pcm: b64(v.pcm) }])),
      tracks: s.tracks.map(t => ({ name: t.name, loopTick: t.loopTick, endTick: t.endTick, events: t.events.map(e => e.type === 'note' ? [e.t, e.key, e.vel, e.dur] : [e.t, 'cmd', e.op, ...e.args]) })) };
    download(JSON.stringify(out), 'song_' + s.index + '.song.json', 'application/json');
  },
  async importJson(file) {
    try {
      const j = JSON.parse(await file.text()); if (j.format !== 'kl-song-1') throw new Error('not a .song.json file');
      const s = this.song;
      s.priority = j.priority; s.reverb = j.reverb;
      s.samples = Object.fromEntries(Object.entries(j.samples || {}).map(([k, v]) => [k, { rate: v.rate, loopStart: v.loopStart, looped: v.looped, pcm: new Int8Array(Uint8Array.from(atob(v.pcm), c => c.charCodeAt(0)).buffer) }]));
      s.vg = j.voicegroup.map(x => { const hx = typeof x === 'string' ? x : x.entry; const e = Uint8Array.from(hx.match(/../g).map(v => parseInt(v, 16))); if (typeof x !== 'string') e.sampleId = x.sample; return e; });
      s.vgOffset = -1;
      s.tracks = j.tracks.map(t => ({ name: t.name, loopTick: t.loopTick, endTick: t.endTick, offset: -1,
        events: t.events.map(e => e[1] === 'cmd' ? { t: e[0], type: 'cmd', op: e[2], args: e.slice(3) } : { t: e[0], type: 'note', key: e[1], vel: e[2], dur: e[3] }) }));
      this.sel = 0; this.selNote = null; this.cache.clear(); this.dirty = true; this._fill = null;
      toast('Loaded ' + file.name + ' into song #' + s.index + '. "Write song to ROM" to keep it.'); this.rerender();
    } catch (e) { toast(e.message, 'err'); }
  },
};
function makeSelect2(pairs, value, onchange) {
  const s = h('select', { onchange: () => onchange(+s.value) }, ...pairs.map(([l, v]) => h('option', { value: v }, l)));
  s.value = value; return s;
}
