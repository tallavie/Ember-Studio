// Music tab: browse / edit the game's songs (M4A "Sappy" engine), play them in the browser with the game's own
// samples, import MIDI files and WAV/MP3 recordings, and write the result back into the ROM.
'use strict';

// ======================================================================================================
// M4A core: song table, decoding track bytes into events, encoding events back into track bytes
// ======================================================================================================
const M4A = (() => {
  const LEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    28, 30, 32, 36, 40, 42, 44, 48, 52, 54, 56, 60, 64, 66, 68, 72, 76, 78, 80, 84, 88, 90, 92, 96];
  const LEN_IDX = new Map(LEN.map((v, i) => [v, i]));
  const OPS = { 0xB9: ['MEMACC', 3], 0xBA: ['PRIO', 1], 0xBB: ['TEMPO', 1], 0xBC: ['KEYSH', 1], 0xBD: ['VOICE', 1], 0xBE: ['VOL', 1],
    0xBF: ['PAN', 1], 0xC0: ['BEND', 1], 0xC1: ['BENDR', 1], 0xC2: ['LFOS', 1], 0xC3: ['LFODL', 1], 0xC4: ['MOD', 1], 0xC5: ['MODT', 1],
    0xC8: ['TUNE', 1], 0xCD: ['XCMD', 2] };
  const EDITABLE_OPS = [0xBB, 0xBD, 0xBE, 0xBF, 0xBC, 0xC0, 0xC1, 0xC2, 0xC3, 0xC4, 0xC5, 0xC8, 0xBA];
  const MIXER_RATE = 13379, MAX_DIRECT = 5, MAX_TRACKS = 10, HELD = 1 << 29;
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = k => NOTE_NAMES[k % 12] + (Math.floor(k / 12) - 1);
  const parseNote = s => {
    s = String(s).trim(); if (/^\d+$/.test(s)) return Math.max(0, Math.min(127, +s));
    const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s); if (!m) return null;
    let k = NOTE_NAMES.indexOf(m[1].toUpperCase()); if (m[2] === '#') k++; if (m[2] === 'b') k--;
    return Math.max(0, Math.min(127, k + 12 * (+m[3] + 1)));
  };
  const GM = ['Piano', 'Bright piano', 'E.grand', 'Honky-tonk', 'E.piano 1', 'E.piano 2', 'Harpsichord', 'Clavinet', 'Celesta', 'Glockenspiel',
    'Music box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular bells', 'Dulcimer', 'Drawbar organ', 'Perc. organ', 'Rock organ', 'Church organ',
    'Reed organ', 'Accordion', 'Harmonica', 'Tango accordion', 'Nylon guitar', 'Steel guitar', 'Jazz guitar', 'Clean guitar', 'Muted guitar',
    'Overdrive gtr', 'Distortion gtr', 'Harmonics', 'Acoustic bass', 'Finger bass', 'Pick bass', 'Fretless bass', 'Slap bass 1', 'Slap bass 2',
    'Synth bass 1', 'Synth bass 2', 'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo str', 'Pizzicato', 'Harp', 'Timpani', 'Strings',
    'Slow strings', 'Synth str 1', 'Synth str 2', 'Choir aahs', 'Voice oohs', 'Synth voice', 'Orch. hit', 'Trumpet', 'Trombone', 'Tuba',
    'Muted trumpet', 'French horn', 'Brass section', 'Synth brass 1', 'Synth brass 2', 'Soprano sax', 'Alto sax', 'Tenor sax', 'Baritone sax',
    'Oboe', 'English horn', 'Bassoon', 'Clarinet', 'Piccolo', 'Flute', 'Recorder', 'Pan flute', 'Blown bottle', 'Shakuhachi', 'Whistle',
    'Ocarina', 'Square lead', 'Saw lead', 'Calliope', 'Chiff lead', 'Charang', 'Voice lead', 'Fifths lead', 'Bass+lead', 'New age pad',
    'Warm pad', 'Polysynth', 'Choir pad', 'Bowed pad', 'Metallic pad', 'Halo pad', 'Sweep pad', 'Rain', 'Soundtrack', 'Crystal',
    'Atmosphere', 'Brightness', 'Goblins', 'Echoes', 'Sci-fi', 'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle',
    'Shanai', 'Tinkle bell', 'Agogo', 'Steel drums', 'Woodblock', 'Taiko', 'Melodic tom', 'Synth drum', 'Reverse cymbal', 'Fret noise',
    'Breath noise', 'Seashore', 'Bird tweet', 'Telephone', 'Helicopter', 'Applause', 'Gunshot'];
  const DRUM_NAMES = { 35: 'Kick 2', 36: 'Kick', 37: 'Side stick', 38: 'Snare', 39: 'Clap', 40: 'Snare 2', 41: 'Low tom', 42: 'Closed HH',
    43: 'Tom', 44: 'Pedal HH', 45: 'Tom', 46: 'Open HH', 47: 'Tom', 48: 'Tom', 49: 'Crash', 50: 'High tom', 51: 'Ride', 54: 'Tambourine',
    56: 'Cowbell', 60: 'Hi bongo', 61: 'Low bongo', 62: 'Mute conga', 63: 'Hi conga', 64: 'Low conga', 69: 'Cabasa', 70: 'Maracas',
    75: 'Claves', 76: 'Hi woodblock', 77: 'Low woodblock', 80: 'Mute triangle', 81: 'Triangle' };

  function typeName(t) {
    if (t === 0x80) return 'drum kit'; if (t === 0x40) return 'key split';
    const c = t & 7;
    if (c === 0) return (t & 0x08 ? 'sample (fixed)' : 'sample') + (t & 0x10 ? ' reversed' : '');
    return ['', 'square 1', 'square 2', 'wave', 'noise', '', '', ''][c] || 'type ' + t;
  }
  const isDirect = t => (t & 0xC7) === 0;

  // ---- song table ----
  function songTable(rom) {
    if (rom._songTable !== undefined) return rom._songTable;
    const ok = o => {
      if (o < 0 || o + 8 > rom.size) return false;
      const h = rom.ptr(o); if (h < 0) return false;
      const n = rom.u8[h]; if (n > 16 || rom.ptr(h + 4) < 0) return false;
      for (let i = 0; i < n; i++) if (rom.ptr(h + 8 + 4 * i) < 0) return false;
      return rom.r16(o + 4) < 16;
    };
    const run = o => { for (let k = 0; k < 24; k++) if (!ok(o + k * 8)) return false; return true; };
    let t = -1;
    for (const hint of [0x4A332C, 0x6DBDC0 - 0x2AE80, 0x4A32CC]) if (hint + 200 < rom.size && run(hint) && !ok(hint - 8)) { t = hint; break; }
    if (t < 0) for (let x = 0x100000; x < rom.size - 200; x += 4) if (run(x)) { t = x; while (ok(t - 8)) t -= 8; break; }
    let count = 0;
    if (t >= 0) while (count < 1024 && ok(t + count * 8)) count++;
    rom._songTable = t;
    rom._songCount = count;
    return t;
  }
  function songList(rom, game) {
    const table = songTable(rom); if (table < 0) return [];
    const usedBy = {};
    (game.mapGroups || []).forEach((maps, g) => maps.forEach((hp, m) => {
      const mus = rom.r16(hp + 16); (usedBy[mus] = usedBy[mus] || []).push([g, m, rom.u8[hp + 20]]);
    }));
    const out = [];
    for (let i = 0; i < rom._songCount; i++) {
      const h = rom.ptr(table + i * 8);
      out.push({ index: i, header: h, tracks: rom.u8[h], player: rom.r16(table + i * 8 + 4), vg: rom.ptr(h + 4), maps: usedBy[i] || [] });
    }
    return out;
  }

  // ---- decode ----
  function decodeTrack(rom, start) {
    const u = rom.u8, ev = [], seen = new Map(), ties = new Map(), stack = [], repeats = new Map();
    let o = start, t = 0, run = 0, key = 60, vel = 127, loopTick = null, endTick = 0;
    for (let guard = 0; guard < 400000; guard++) {
      if (!stack.length && !seen.has(o)) seen.set(o, t);
      let c = u[o];
      if (c < 0x80) { c = run; if (!c) break; } else { o++; if (c >= 0xBD) run = c; }
      if (c >= 0x80 && c <= 0xB0) { t += LEN[c - 0x80]; continue; }
      if (c === 0xB1) { endTick = t; break; }
      if (c === 0xB2) {
        const target = rom.ptr(o); o += 4;
        if (seen.has(target)) { loopTick = seen.get(target); endTick = t; break; }
        if (target < 0) { endTick = t; break; }
        o = target; continue;
      }
      if (c === 0xB3) { const target = rom.ptr(o); stack.push(o + 4); o = target; continue; }
      if (c === 0xB4) { if (stack.length) o = stack.pop(); continue; }
      if (c === 0xB5) {
        const n = u[o], target = rom.ptr(o + 1), site = o;
        const left = repeats.has(site) ? repeats.get(site) : n;
        if (left > 1 || n === 0) { repeats.set(site, n === 0 ? 0 : left - 1); if (n === 0 && seen.has(target)) { loopTick = seen.get(target); endTick = t; break; } o = target; }
        else { repeats.delete(site); o += 5; }
        continue;
      }
      if (OPS[c]) { const n = OPS[c][1]; ev.push({ t, type: 'cmd', op: c, args: [...u.subarray(o, o + n)] }); o += n; continue; }
      if (c === 0xCE) {
        let k = key; if (u[o] < 0x80) k = u[o++];
        const n = ties.get(k); if (n) { n.dur = Math.max(1, t - n.t); ties.delete(k); }
        continue;
      }
      if (c >= 0xCF) {
        let gate = 0;
        if (u[o] < 0x80) { key = u[o++]; if (u[o] < 0x80) { vel = u[o++]; if (c > 0xCF && u[o] < 0x80 && u[o] <= 3) gate = u[o++]; } }
        const n = { t, type: 'note', key, vel, dur: c === 0xCF ? 0 : LEN[c - 0xCF] + gate };
        ev.push(n);
        if (c === 0xCF) ties.set(key, n);
        continue;
      }
      break; // unknown byte
    }
    if (!endTick) endTick = t;
    for (const n of ties.values()) n.dur = HELD;          // TIE without EOT: the note sounds until something else stops it
    return { events: ev, loopTick, endTick, offset: start };
  }
  function readSong(rom, index) {
    const table = songTable(rom), h = rom.ptr(table + index * 8);
    const n = rom.u8[h];
    const song = { index, header: h, priority: rom.u8[h + 2], reverb: rom.u8[h + 3], vgOffset: rom.ptr(h + 4), tracks: [] };
    for (let i = 0; i < n; i++) song.tracks.push(decodeTrack(rom, rom.ptr(h + 8 + 4 * i)));
    song.vg = readVoicegroup(rom, song.vgOffset);
    song.samples = {};          // pending (not yet written) samples: id -> {pcm Int8Array, rate, loopStart, looped}
    return song;
  }
  function readVoicegroup(rom, off) {
    const e = [];
    for (let s = 0; s < 128; s++) e.push(off >= 0 && off + s * 12 + 12 <= rom.size ? new Uint8Array(rom.u8.subarray(off + s * 12, off + s * 12 + 12)) : new Uint8Array(12));
    return e;
  }

  // ---- encode ----
  function encodeTrack(tr, length) {
    const items = [];
    for (const e of tr.events) {
      if (e.t > length || (e.type === 'note' && e.t >= length)) continue;
      if (e.type === 'cmd') { items.push([e.t, 1, [e.op, ...e.args]]); continue; }
      const k = e.key & 127, v = Math.max(1, Math.min(127, e.vel | 0)), d = Math.max(1, e.dur | 0);
      if (d >= HELD) { items.push([e.t, 2, [0xCF, k, v]]); continue; }       // held forever (streamed recordings)
      if (LEN_IDX.has(d)) { items.push([e.t, 2, [0xCF + LEN_IDX.get(d), k, v]]); continue; }
      const L = d < 96 ? LEN.filter(x => x > 0 && d - x >= 1 && d - x <= 3).pop() : undefined;
      if (L) { items.push([e.t, 2, [0xCF + LEN_IDX.get(L), k, v, d - L]]); continue; }
      items.push([e.t, 2, [0xCF, k, v]]);
      items.push([Math.min(e.t + d, length), 0, [0xCE, k]]);
    }
    const loop = tr.loopTick != null && tr.loopTick < length;
    if (loop) items.push([tr.loopTick, -1, null]);
    items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = []; let now = 0, loopAt = 0;
    const wait = d => { while (d > 0) { const s = LEN.filter(x => x <= d).pop(); out.push(0x80 + LEN_IDX.get(s)); d -= s; } };
    for (const [t, ord, b] of items) {
      wait(t - now); now = t;
      if (ord === -1) { loopAt = out.length; continue; }
      out.push(...b);
    }
    wait(length - now);
    let gotoAt = -1;
    if (loop) { gotoAt = out.length + 1; out.push(0xB2, 0, 0, 0, 0); }
    out.push(0xB1);
    return { bytes: Uint8Array.from(out), loopAt, gotoAt };
  }
  function songLength(song) { return Math.max(0, ...song.tracks.map(t => t.endTick)); }

  // Writes the song into free space and repoints its song table entry. New voicegroup / samples if they changed.
  function writeSong(rom, song) {
    const table = songTable(rom);
    // samples first (pending imports)
    const sampleAt = {};
    for (const [id, s] of Object.entries(song.samples)) {
      const n = s.pcm.length, buf = new Uint8Array(16 + n + 1);
      const dv = new DataView(buf.buffer);
      dv.setUint32(0, s.looped ? 0x40000000 : 0, true); dv.setUint32(4, Math.round(s.rate * 1024), true);
      dv.setUint32(8, s.loopStart || 0, true); dv.setUint32(12, n, true);
      buf.set(new Uint8Array(s.pcm.buffer, s.pcm.byteOffset, n), 16); buf[16 + n] = s.looped ? s.pcm[s.loopStart || 0] & 0xFF : 0;
      sampleAt[id] = rom.writeNew(buf);
    }
    let vgOff = song.vgOffset;
    const vgBytes = new Uint8Array(128 * 12);
    song.vg.forEach((e, s) => {
      const b = new Uint8Array(e);
      if (e.sampleId != null) new DataView(b.buffer).setUint32(4, 0x08000000 + sampleAt[e.sampleId], true);
      vgBytes.set(b, s * 12);
    });
    const same = vgOff >= 0 && vgBytes.every((v, i) => rom.u8[vgOff + i] === v);
    if (!same) vgOff = rom.writeNew(vgBytes);
    const ptrs = [], length = songLength(song);
    for (const tr of song.tracks) {
      const enc = encodeTrack(tr, tr.endTick || length);
      const o = rom.alloc(enc.bytes.length);
      if (enc.gotoAt >= 0) new DataView(enc.bytes.buffer).setUint32(enc.gotoAt, 0x08000000 + o + enc.loopAt, true);
      rom.write(o, enc.bytes); rom._hint = o + enc.bytes.length + 1;
      ptrs.push(o);
    }
    const hdr = new Uint8Array(8 + 4 * ptrs.length), dv = new DataView(hdr.buffer);
    hdr[0] = ptrs.length; hdr[1] = 0; hdr[2] = song.priority; hdr[3] = song.reverb;
    dv.setUint32(4, 0x08000000 + vgOff, true);
    ptrs.forEach((p, i) => dv.setUint32(8 + 4 * i, 0x08000000 + p, true));
    const h = rom.writeNew(hdr);
    rom.wptr(table + song.index * 8, h);
    song.header = h; song.vgOffset = vgOff; song.samples = {};
    song.vg = readVoicegroup(rom, vgOff);
    return h;
  }

  // ---- instrument catalog: every distinct instrument in every song's voicegroup ----
  function catalog(rom) {
    if (rom._catalog) return rom._catalog;
    const table = songTable(rom), items = new Map(), kits = new Map();
    for (let i = 0; i < rom._songCount; i++) {
      const vg = rom.ptr(rom.ptr(table + i * 8) + 4); if (vg < 0) continue;
      const counts = new Map();
      for (let s = 0; s < 128; s++) { const k = hexOf(rom.u8.subarray(vg + s * 12, vg + s * 12 + 12)); counts.set(k, (counts.get(k) || 0) + 1); }
      const filler = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (let s = 0; s < 128; s++) {
        const e = rom.u8.subarray(vg + s * 12, vg + s * 12 + 12), k = hexOf(e);
        if (k === filler) continue;
        const map = e[0] === 0x80 ? kits : items;
        const id = s + ':' + k;
        if (!map.has(id)) map.set(id, { slot: s, entry: new Uint8Array(e), songs: [] });
        const it = map.get(id); if (!it.songs.includes(i)) { it.songs.push(i); if (rom.r16(table + i * 8 + 4) === 0) it.music = (it.music || 0) + 1; }
      }
    }
    // most-used-in-music first; reversed samples (sound effects) last
    const rank = (a, b) => ((a.entry[0] & 0x10) - (b.entry[0] & 0x10)) || (b.music || 0) - (a.music || 0) || b.songs.length - a.songs.length;
    rom._catalog = { items: [...items.values()].sort((a, b) => a.slot - b.slot || rank(a, b)), kits: [...kits.values()].sort(rank) };
    return rom._catalog;
  }
  const hexOf = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  function entryLabel(e, slot) {
    const t = e[0];
    if (t === 0x80) return 'Drum kit';
    return (slot != null ? GM[slot] + ' · ' : '') + typeName(t);
  }

  return { HELD, LEN, OPS, EDITABLE_OPS, GM, DRUM_NAMES, MIXER_RATE, MAX_DIRECT, MAX_TRACKS, noteName, parseNote, typeName, isDirect,
    songTable, songList, readSong, readVoicegroup, decodeTrack, encodeTrack, writeSong, songLength, catalog, entryLabel, hexOf };
})();

// ======================================================================================================
// Synth: renders a song (or one note) with the game's samples. Approximation of the M4A mixer.
// ======================================================================================================
const Synth = (() => {
  const SR = 22050;
  const cache = new WeakMap();
  function sampleOf(rom, song, entry) {
    if (entry.sampleId != null) { const s = song.samples[entry.sampleId]; return { pcm: Float32Array.from(s.pcm, v => v / 128), rate: s.rate, loop: s.loopStart || 0, looped: s.looped }; }
    const p = (new DataView(entry.buffer, entry.byteOffset).getUint32(4, true) & 0x1FFFFFF);
    let m = cache.get(rom); if (!m) cache.set(rom, m = new Map());
    if (m.has(p)) return m.get(p);
    const dv = new DataView(rom.u8.buffer, rom.u8.byteOffset);
    const flags = dv.getUint32(p, true), freq = dv.getUint32(p + 4, true), loop = dv.getUint32(p + 8, true), size = Math.min(dv.getUint32(p + 12, true), rom.size - p - 16);
    const pcm = new Float32Array(size + 1);
    for (let i = 0; i <= size; i++) pcm[i] = ((rom.u8[p + 16 + i] << 24) >> 24) / 128;
    const r = { pcm, rate: freq / 1024, loop, looped: !!(flags & 0x40000000) };
    m.set(p, r); return r;
  }
  function resolve(rom, song, voice, key) {
    const e = song.vg[voice & 127];
    if (e[0] === 0x40) {
      const dv = new DataView(e.buffer, e.byteOffset), table = dv.getUint32(4, true) & 0x1FFFFFF, kmap = dv.getUint32(8, true) & 0x1FFFFFF;
      const sub = rom.u8[kmap + key];
      return { e: new Uint8Array(rom.u8.subarray(table + sub * 12, table + sub * 12 + 12)), key };
    }
    if (e[0] === 0x80) {
      const table = new DataView(e.buffer, e.byteOffset).getUint32(4, true) & 0x1FFFFFF;
      const e2 = new Uint8Array(rom.u8.subarray(table + key * 12, table + key * 12 + 12));
      return { e: e2, key: e2[1] };
    }
    return { e, key };
  }
  function envelope(e, onN, total, cgb) {
    const fps = SR / 60, frames = Math.ceil(total / fps) + 2, lvl = new Float32Array(frames);
    let A, D, S, R;
    if (cgb) { const a = e[8] & 7, d = e[9] & 7; A = a ? 255 / (a * 2) : 255; D = d ? 1 - 0.035 * (8 - d) : 0; S = (e[10] & 15) / 15 * 255; R = (e[11] & 7) ? 0.75 : 0; }
    else { A = e[8]; D = e[9] / 256; S = e[10]; R = e[11] / 256; }
    let x = 0, stage = 0; const onF = onN / fps;
    for (let f = 0; f < frames; f++) {
      if (f < onF) { if (stage === 0) { x += A; if (x >= 255) { x = 255; stage = 1; } } else x = D ? Math.max(S, x * D) : S; }
      else x *= R;
      lvl[f] = x / 255;
    }
    return i => lvl[(i / fps) | 0];
  }
  // pitch: m4a plays a non-fixed sample at rate * 2^((key-60)/12)
  function noteSignal(rom, song, voice, key, onSec, vel) {
    const r = resolve(rom, song, voice, key), e = r.e, t = e[0];
    const tail = 0.5, total = Math.ceil((onSec + tail) * SR), on = Math.ceil(onSec * SR);
    let sig = new Float32Array(total), cgb = false;
    if ((t & 0xC0) === 0 && (t & 7) === 0) {
      const s = sampleOf(rom, song, e); if (!s.pcm.length) return null;
      const rate = (t & 0x08) ? M4A.MIXER_RATE : s.rate * Math.pow(2, (r.key - 60) / 12);
      const step = rate / SR, n = s.pcm.length - 1, L = n - s.loop;
      for (let i = 0; i < total; i++) {
        let pos = i * step;
        if (pos >= n) { if (s.looped && L > 4) pos = s.loop + (pos - s.loop) % L; else break; }
        const i0 = pos | 0, fr = pos - i0;
        const a = s.pcm[(t & 0x10) ? n - i0 : i0], b = s.pcm[(t & 0x10) ? Math.max(0, n - i0 - 1) : i0 + 1];
        sig[i] = a + (b - a) * fr;
      }
    } else {
      const c = t & 7; cgb = true;
      const f = 440 * Math.pow(2, (r.key - 69) / 12);
      if (c === 1 || c === 2) { const duty = [0.125, 0.25, 0.5, 0.75][e[4] & 3]; for (let i = 0; i < total; i++) sig[i] = ((i * f / SR) % 1) < duty ? 0.5 : -0.5; }
      else if (c === 3) {
        const wp = new DataView(e.buffer, e.byteOffset).getUint32(4, true) & 0x1FFFFFF, w = [];
        for (let i = 0; i < 16; i++) { const b = rom.u8[wp + i]; w.push(b >> 4, b & 15); }
        for (let i = 0; i < total; i++) sig[i] = (w[((i * f * 32 / SR) | 0) % 32] - 7.5) / 15;
      } else if (c === 4) { let v = 0; for (let i = 0; i < total; i++) { if (i % 4 === 0) v = Math.random() - 0.5; sig[i] = v * 0.6; } }
      else return null;
    }
    const env = envelope(e, on, total, cgb), g = (vel / 127) * (cgb ? 0.4 : 1);
    for (let i = 0; i < total; i++) sig[i] *= env(i) * g;
    return sig;
  }
  // tempo map from TEMPO commands of all tracks
  function tempoMap(song) {
    const ch = [];
    song.tracks.forEach(tr => tr.events.forEach(e => { if (e.type === 'cmd' && e.op === 0xBB) ch.push([e.t, e.args[0] * 2]); }));
    ch.sort((a, b) => a[0] - b[0]);
    if (!ch.length || ch[0][0] > 0) ch.unshift([0, ch.length ? ch[0][1] : 150]);
    const segs = []; let sec = 0;
    for (let i = 0; i < ch.length; i++) {
      const [t, bpm] = ch[i]; if (i) sec += (t - ch[i - 1][0]) / (ch[i - 1][1] * 24 / 60);
      segs.push({ t, bpm: Math.max(1, bpm), sec });
    }
    const seg = t => { let s = segs[0]; for (const x of segs) if (x.t <= t) s = x; else break; return s; };
    return {
      sec: t => { const s = seg(t); return s.sec + (t - s.t) / (s.bpm * 24 / 60); },
      tick: sec => { let s = segs[0]; for (const x of segs) if (x.sec <= sec) s = x; else break; return s.t + (sec - s.sec) * s.bpm * 24 / 60; },
      bpm: segs[0].bpm,
    };
  }
  function renderTrack(rom, song, tr, tm, endSec) {
    const n = Math.ceil((endSec + 0.6) * SR), L = new Float32Array(n), R = new Float32Array(n);
    const evs = [...tr.events].sort((a, b) => a.t - b.t || (b.type === 'cmd') - (a.type === 'cmd'));   // commands before notes; two commands keep their order (VOL 100, then the song's own VOL)
    let voice = 0, vol = 100, pan = 64, keysh = 0;
    for (const e of evs) {
      if (e.type === 'cmd') {
        if (e.op === 0xBD) voice = e.args[0]; else if (e.op === 0xBE) vol = e.args[0];
        else if (e.op === 0xBF) pan = e.args[0]; else if (e.op === 0xBC) keysh = (e.args[0] << 24) >> 24;
        continue;
      }
      const s0 = tm.sec(e.t); if (s0 >= endSec) continue;
      const sig = noteSignal(rom, song, voice, Math.max(0, Math.min(127, e.key + keysh)), Math.min(tm.sec(e.t + Math.min(e.dur, 1 << 24)), endSec) - s0, e.vel);
      if (!sig) continue;
      const g = vol / 127, a = (Math.min(127, pan) / 127) * Math.PI / 2, gl = Math.cos(a) * g, gr = Math.sin(a) * g;
      const st = Math.floor(s0 * SR), m = Math.min(sig.length, n - st);
      for (let i = 0; i < m; i++) { L[st + i] += sig[i] * gl; R[st + i] += sig[i] * gr; }
    }
    return { L, R };
  }
  // the sample behind a slot (for previewing held recordings): {pcm, rate, loop, looped}
  function sampleInfo(rom, song, slot) { const e = song.vg[slot & 127]; return (e[0] & 0xC7) === 0 ? sampleOf(rom, song, e) : null; }
  return { SR, tempoMap, renderTrack, noteSignal, sampleInfo };
})();

// ======================================================================================================
// Importers: MIDI file -> song, WAV/MP3 -> song that streams one long sample
// ======================================================================================================
const MusicImport = (() => {
  function parseMidi(buf) {
    const u = new Uint8Array(buf); let p = 0;
    const str = n => String.fromCharCode(...u.subarray(p, p + n));
    const u32 = () => (u[p++] << 24 | u[p++] << 16 | u[p++] << 8 | u[p++]) >>> 0, u16 = () => (u[p++] << 8) | u[p++];
    const vlq = () => { let v = 0, b; do { b = u[p++]; v = (v << 7) | (b & 127); } while (b & 128); return v; };
    if (str(4) !== 'MThd') throw new Error('Not a MIDI file'); p += 4;
    const hl = u32(); const fmt = u16(), ntr = u16(), div = u16(); p += hl - 6;
    if (div & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported');
    const events = [];
    for (let ti = 0; ti < ntr && p < u.length; ti++) {
      if (str(4) !== 'MTrk') throw new Error('Bad MIDI track'); p += 4;
      const len = u32(), end = p + len; let t = 0, run = 0;
      while (p < end) {
        t += vlq(); let st = u[p];
        if (st < 0x80) st = run; else { p++; if (st < 0xF0) run = st; }
        if (st === 0xFF) { const ty = u[p++], l = vlq(); const data = u.subarray(p, p + l); p += l;
          if (ty === 0x51) events.push({ t, kind: 'tempo', us: (data[0] << 16) | (data[1] << 8) | data[2] });
          else if (ty === 0x06) events.push({ t, kind: 'marker', text: String.fromCharCode(...data) });
          continue; }
        if (st === 0xF0 || st === 0xF7) { p += vlq(); continue; }
        const ch = st & 15, hi = st & 0xF0;
        const a = u[p++], b = (hi === 0xC0 || hi === 0xD0) ? 0 : u[p++];
        if (hi === 0x90 && b > 0) events.push({ t, kind: 'on', ch, key: a, vel: b });
        else if (hi === 0x80 || (hi === 0x90 && b === 0)) events.push({ t, kind: 'off', ch, key: a });
        else if (hi === 0xC0) events.push({ t, kind: 'prog', ch, prog: a });
        else if (hi === 0xB0) events.push({ t, kind: 'cc', ch, cc: a, val: b });
        else if (hi === 0xE0) events.push({ t, kind: 'bend', ch, val: ((b << 7) | a) - 8192 });
      }
      p = end;
    }
    events.sort((x, y) => x.t - y.t);
    return { fmt, div, events };
  }

  // MIDI -> song model. Each channel becomes one layer; instruments are taken from the game's catalog
  // (an instrument the game's composers used for that GM program, else the same family, else a square wave).
  // how cleanly a sample plays a note: of the 5 strongest frequencies of C4 (and C5), how many sit on its harmonics.
  // A real instrument scores 4-5; a noise, a hit or a sound effect in a melodic slot scores 0-2.
  function pitchScore(rom, entry) {
    const cache = rom._pitchScore || (rom._pitchScore = new Map()), k = M4A.hexOf(entry);
    if (cache.has(k)) return cache.get(k);
    const song = { vg: Array.from({ length: 128 }, () => entry), tracks: [] }, N = 4096, SR = Synth.SR;
    let total = 0;
    for (const key of [60, 72]) {
      let sig = null; try { sig = Synth.noteSignal(rom, song, 0, key, 0.6, 100); } catch (e) { sig = null; }
      if (!sig) continue;
      const re = new Float64Array(N), im = new Float64Array(N), st = Math.min(300, sig.length >> 4);
      for (let i = 0; i < N; i++) re[i] = (sig[st + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
      for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= N; len <<= 1) {
        const a = -2 * Math.PI / len;
        for (let i = 0; i < N; i += len) for (let q = 0; q < len / 2; q++) {
          const c = Math.cos(a * q), sn = Math.sin(a * q), u = i + q, v = u + len / 2;
          const xr = re[v] * c - im[v] * sn, xi = re[v] * sn + im[v] * c; re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi;
        }
      }
      const mag = []; for (let i = 2; i < N / 2; i++) mag.push([i * SR / N, Math.hypot(re[i], im[i])]);
      const peaks = mag.filter((m, i) => i > 0 && i < mag.length - 1 && m[1] > mag[i - 1][1] && m[1] >= mag[i + 1][1]).sort((x, y) => y[1] - x[1]).slice(0, 5);
      const f = 440 * Math.pow(2, (key - 69) / 12);
      total += peaks.filter(pk => { const hh = pk[0] / f; return hh > 0.9 && Math.abs(hh - Math.round(hh)) < 0.05; }).length;
    }
    const score = total / 2; cache.set(k, score); return score;
  }

  // the GBA wave channel plays its 32-sample pattern once per note period: a pattern that holds two cycles sounds an
  // octave up (FireRed's songs shift those down). Measured: 12 when C4 comes out near 523 Hz, else 0.
  function waveOctave(rom, entry) {
    const song = { vg: Array.from({ length: 128 }, () => entry), tracks: [] }, SR = Synth.SR;
    let sig = null; try { sig = Synth.noteSignal(rom, song, 0, 60, 0.4, 100); } catch (e) { return 0; }
    if (!sig) return 0;
    const st = Math.min(400, sig.length >> 3); let z = 0;
    for (let i = st + 1; i < st + 4000 && i < sig.length; i++) if ((sig[i] >= 0) !== (sig[i - 1] >= 0)) z++;
    const f = z / 2 / (Math.min(4000, sig.length - st) / SR);
    return f > 261.6 * 1.6 ? 12 : 0;
  }

  function midiToSong(rom, base, midi) {
    const q = t => Math.round(t * 24 / midi.div);
    const cat = M4A.catalog(rom);
    const chans = new Map(), open = new Map(), tempos = [], markers = [];
    for (const e of midi.events) {
      const t = q(e.t);
      if (e.kind === 'tempo') { tempos.push([t, Math.round(60000000 / e.us / 2)]); continue; }
      if (e.kind === 'marker') { markers.push([t, e.text.toLowerCase()]); continue; }
      if (!chans.has(e.ch)) chans.set(e.ch, { ch: e.ch, notes: [], prog: 0, cmds: [] });
      const c = chans.get(e.ch);
      if (e.kind === 'on') open.set(e.ch + ':' + e.key, { t, key: e.key, vel: e.vel, c });
      else if (e.kind === 'off') { const k = e.ch + ':' + e.key, n = open.get(k); if (n) { c.notes.push({ t: n.t, type: 'note', key: n.key, vel: n.vel, dur: Math.max(1, t - n.t) }); open.delete(k); } }
      else if (e.kind === 'prog') { if (!c.notes.length) c.prog = e.prog; }
      else if (e.kind === 'cc' && (e.cc === 7 || e.cc === 10)) c.cmds.push({ t, type: 'cmd', op: e.cc === 7 ? 0xBE : 0xBF, args: [e.val] });
      else if (e.kind === 'bend') c.cmds.push({ t, type: 'cmd', op: 0xC0, args: [Math.max(0, Math.min(127, Math.round(e.val / 128) + 64))] });
    }
    for (const n of open.values()) n.c.notes.push({ t: n.t, type: 'note', key: n.key, vel: n.vel, dur: 24 });
    let list = [...chans.values()].filter(c => c.notes.length);
    const warnings = [];
    if (list.length > M4A.MAX_TRACKS) {
      list.sort((a, b) => b.notes.length - a.notes.length);
      warnings.push((list.length - M4A.MAX_TRACKS) + ' MIDI channels dropped: the game plays at most ' + M4A.MAX_TRACKS + ' layers');
      list = list.slice(0, M4A.MAX_TRACKS);
    }
    list.sort((a, b) => a.ch - b.ch);
    const last = Math.max(...list.map(c => Math.max(...c.notes.map(n => n.t + n.dur))));
    const length = Math.ceil(last / 96) * 96;
    const ls = markers.find(m => /loop ?start|^\[$/.test(m[1]));
    const loopTick = ls ? ls[0] : 0;
    // voicegroup: the base song's filler everywhere, each MIDI program in its own GM slot (so names stay right), drums in 127
    const vg = base.vg.map(e => new Uint8Array(e));
    const filler = (() => { const m = new Map(); vg.forEach(e => { const k = M4A.hexOf(e); m.set(k, (m.get(k) || 0) + 1); }); const k = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; return vg.find(e => M4A.hexOf(e) === k); })();
    for (let s = 0; s < 128; s++) vg[s] = new Uint8Array(filler);
    const progs = new Set(list.filter(c => c.ch !== 9).map(c => c.prog));
    const drumSlot = [127, 126, 125, 124, 120].find(sl => !progs.has(sl)) ?? 127;
    const tracks = list.map((c, i) => {
      let pick, slot;
      if (c.ch === 9) { pick = cat.kits[0]; slot = drumSlot; }
      else {
        slot = c.prog;
        // a melody needs a pitch: never the noise channel (in FireRed's voicegroups slot 71 "clarinet" is noise), samples that follow the note first
        // and the sample really has to sound at that pitch: in a game's voicegroups a slot's name says little (in Kachol-Lavan
        // slot 0 "piano" and slot 40 "violin" have no clear pitch at all), so each candidate is measured (pitchScore)
        const pitched = it => it.entry[0] !== 0x80 && (it.entry[0] & 7) !== 4 && !(M4A.isDirect(it.entry[0]) && (it.entry[0] & 0x08));
        const good = it => !M4A.isDirect(it.entry[0]) || pitchScore(rom, it.entry) >= 4;
        const best = list => list.filter(pitched).filter(good).sort((x, y) => M4A.isDirect(y.entry[0]) - M4A.isDirect(x.entry[0]))[0];
        pick = best(cat.items.filter(it => it.slot === c.prog))
          || best(cat.items.filter(it => (it.slot >> 3) === (c.prog >> 3)))
          || best(cat.items.filter(it => [21, 46, 24, 25, 64, 73, 4, 48].includes(it.slot)))            // instruments that are usually clean
          || cat.items.find(it => (it.entry[0] & 7) === 1 || (it.entry[0] & 7) === 2);
        if (pick && pick.slot !== c.prog) warnings.push('MIDI channel ' + (c.ch + 1) + ' (' + M4A.GM[c.prog] + '): the game has no clean ' + M4A.GM[c.prog] + ', using ' + M4A.GM[pick.slot]);
      }
      if (pick) vg[slot] = new Uint8Array(pick.entry);
      const ev = [{ t: 0, type: 'cmd', op: 0xBD, args: [slot] }];
      const shift = pick && (pick.entry[0] & 7) === 3 ? waveOctave(rom, pick.entry) : 0;     // a wave whose pattern holds two cycles plays an octave up
      if (shift) ev.push({ t: 0, type: 'cmd', op: 0xBC, args: [(-shift) & 0xFF] });
      if (!c.cmds.some(x => x.t === 0 && x.op === 0xBE)) ev.push({ t: 0, type: 'cmd', op: 0xBE, args: [100] });   // only when the MIDI does not set them
      if (!c.cmds.some(x => x.t === 0 && x.op === 0xBF)) ev.push({ t: 0, type: 'cmd', op: 0xBF, args: [64] });
      if (i === 0) { const t0 = tempos.length ? tempos : [[0, 60]]; for (const [t, v] of t0) ev.push({ t: t0.length === 1 ? 0 : t, type: 'cmd', op: 0xBB, args: [Math.max(1, Math.min(255, v))] }); }
      ev.push(...c.cmds.filter(x => x.t < length), ...c.notes.filter(n => n.t < length));
      ev.sort((a, b) => a.t - b.t);
      return { events: ev, loopTick, endTick: length, offset: -1, name: c.ch === 9 ? 'Drums' : M4A.GM[c.prog] };
    });
    return { song: Object.assign({}, base, { tracks, vg, vgOffset: -1, samples: {} }), warnings };
  }

  // WAV/MP3 -> one long sample in a new song (single layer, one held note). Loops by itself if asked.
  function audioToSong(base, pcm, rate, loopStart, looped, gain) {
    const vg = base.vg.map(e => new Uint8Array(e));
    const e = new Uint8Array([0x00, 60, 0, 0, 0, 0, 0, 0, 0xFF, 0x00, 0xFF, 0x00]);
    e.sampleId = 'wav';
    vg[0] = e;
    const total = Math.ceil(pcm.length / rate * 75 * 24 / 60);   // in ticks at tempo 150 (bpm/2 = 75)
    const length = Math.ceil(total / 96) * 96 + 96;                 // + one idle bar to loop in (after the held note)
    const events = [{ t: 0, type: 'cmd', op: 0xBB, args: [75] }, { t: 0, type: 'cmd', op: 0xBD, args: [0] }, { t: 0, type: 'cmd', op: 0xBE, args: [Math.round(127 * gain)] },
      { t: 0, type: 'cmd', op: 0xBF, args: [64] }, { t: 0, type: 'note', key: 60, vel: 127, dur: M4A.HELD }];
    // the note is held for the whole song: written as TIE with no EOT, the track then idles in its last bar
    const song = Object.assign({}, base, { tracks: [{ events, loopTick: length - 96, endTick: length, offset: -1, held: true }], vg, vgOffset: -1, samples: { wav: { pcm, rate, loopStart, looped } } });
    return song;
  }
  return { parseMidi, midiToSong, audioToSong, pitchScore };
})();
