// Text tab: finds every pointed-to string in the ROM, lets you translate it with a live in-game preview,
// writes it back (in place or relocated + repointed). Also fixed-length name tables.
'use strict';

const TextTab = (() => {
  let entries = null, filtered = [], page = 0, scanning = false;
  const PER_PAGE = 60;
  const state = { q: '', only: 'all', sub: 'strings', table: 'species' };
  const SAMPLE = { 1: 'ASH', 2: 'POTION', 3: '10', 4: 'SAMPLE', 6: 'MAY', 7: 'EMERALD' };

  // ---------- scanning ----------
  function scan(done, progress) {
    const rom = App.rom, u8 = rom.u8, N = u8.length;
    const valid = new Map(), refs = new Map();
    let i = 0;
    const step = () => {
      const stop = Math.min(N - 4, i + 0x80000);
      for (; i < stop; i++) {
        const hi = u8[i + 3];
        if (hi !== 8 && hi !== 9) continue;
        const t = u8[i] | (u8[i + 1] << 8) | (u8[i + 2] << 16) | ((hi & 1) << 24);
        if (t >= N || t < 0x200) continue;
        const prev = u8[t - 1];
        if (prev !== 0xFF && prev !== 0 && (t & 3)) continue;
        let v = valid.get(t);
        if (v === undefined) { v = Charmap.scanString(u8, t); valid.set(t, v); }
        if (v > 0) { let r = refs.get(t); if (!r) refs.set(t, r = []); r.push(i); }
      }
      progress(i / N);
      if (i < N - 4) setTimeout(step, 0);
      else {
        const list = [...refs.entries()].sort((a, b) => a[0] - b[0]).map(([off, r]) => {
          const len = valid.get(off), d = Charmap.decodeEditable(u8, off, App.settings.rtl);
          // a "fragment" starts in the middle of another string (prev byte is text) — almost always a false pointer
          const prev = u8[off - 1], frag = prev !== 0xFF && prev !== 0 && Charmap.T[prev] != null;
          return { id: off, off, cap: len, refs: r, orig: d.text, cur: d.text, saved: d.text, frag };
        });
        const real = list.filter(e => !e.frag);
        for (let k = 0; k + 1 < real.length; k++)
          if (real[k + 1].off < real[k].off + real[k].cap) real[k].overlap = real[k + 1].overlap = true;
        done(list);
      }
    };
    step();
  }

  // ---------- width / preview ----------
  function widthTable(fontId) {
    const f = App.game.fonts.length ? Font.fontById(fontId) : null;
    return code => f ? App.rom.u8[f.widths + code] : 6;
  }
  function expand(bytes) {
    // like StringExpandPlaceholders: replace {PLAYER} etc. with sample text
    const out = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0xFD) { const s = SAMPLE[bytes[++i]] || 'VAR'; for (const c of s) out.push(Charmap.ENC.get(c)); }
      else out.push(bytes[i]);
    }
    return out;
  }
  function tokenWidth(t, wOf) {
    if (t.kind === 'char') return t.bytes.length === 1 ? wOf(t.bytes[0]) : (t.bytes[0] === 0xF9 ? wOf(0x100 + t.bytes[1]) : t.bytes[0] === 0xFC ? wOf(t.bytes[2]) : 8);
    if (t.kind === 'ph') return (SAMPLE[t.bytes[1]] || 'VAR').length * 6;
    if (t.bytes[0] === 0xFD) return 48; // battle buffers (names) — average width
    return 0;
  }
  const FC_ARGS = c => (Charmap.FC[c] || [0, 0])[1];

  // Simulates RenderText (+ the RTL hook when engine mode) and returns draw ops [{code,x,y}].
  function layout(bytes, fontId, rtlEngine) {
    const b = expand(bytes), wOf = widthTable(fontId), ops = [];
    const cls = Charmap.dirClass;
    let x = 0, y = 0, box = 0, E = 0, S = 0, runStart = 0, prevLTR = 0, segRTL = false;
    // does the segment starting at byte j contain a Hebrew glyph? (same as the ASM "seghasrtl")
    const segHasRTL = j => {
      for (;;) {
        const c = b[j];
        if (c === 0xFD) { j += 2; continue; }
        if (c === 0xFC) {
          const k = b[j + 1];
          if (k === 0x0C) { j += 2; continue; }
          if (k > 0x18 || k === 0x0D || k === 0x0E || (k >= 0x11 && k <= 0x13)) return false;
          j += 2 + FC_ARGS(k); continue;
        }
        if (c >= 0xFA || c === undefined) return false;
        if (c >= 0xF7) { j += 2; continue; }
        j++;
        if (cls(c) === 2) return true;
      }
    };
    // class of the next glyph, skipping zero-width control codes (same as the ASM "peek")
    const peek = i => {
      for (;;) {
        const c = b[i];
        if (c === 0xFD) { i += 2; continue; }
        if (c !== 0xFC) return cls(c);
        const k = b[i + 1];
        if (k === 0x0C) return cls(b[i + 2]);
        if (k > 0x18 || k === 0x0D || k === 0x0E || (k >= 0x11 && k <= 0x13)) return 0;
        i += 2 + FC_ARGS(k);
      }
    };
    const scanW = (i, skip) => {
      let sum = 0;
      while (i < b.length) {
        let c = b[i], code;
        if (c >= 0xFA && c !== 0xFC && c !== 0xFD) break;
        if (c === 0xFD || c === 0xF7) { i += 2; continue; }
        if (c === 0xFC) {
          const k = b[i + 1];
          if (k === 0x0C) { code = b[i + 2]; c = code; i += 3; }
          else if ([0x0D, 0x0E, 0x11, 0x12, 0x13].includes(k)) break;
          else { i += 2 + FC_ARGS(k); continue; }
        }
        else if (c === 0xF9) { code = 0x100 + b[i + 1]; c = 0; i += 2; }
        else if (c === 0xF8) { code = 0; c = 0; i += 2; }
        else { code = c; i++; }
        if (skip) {
          const k = cls(c);
          if (k === 1 || (k === 0 && peek(i) === 1)) continue;
          skip = false;
        }
        sum += wOf(code);
      }
      return sum;
    };
    for (let i = 0; i < b.length;) {
      const c = b[i++];
      if (c === 0xFF) break;
      if (c === 0xFE || c === 0xFA) { x = 0; y += 16; continue; }
      if (c === 0xFB) { x = 0; y += 16; box++; ops.push({ sep: true, y }); continue; }
      if (c === 0xFD || c === 0xF7 || c === 0xF8) { i++; continue; }
      let code = c;
      if (c === 0xFC) {
        const k = b[i++];
        if (k === 0x12 || k === 0x13 || k === 0x0D) { x = b[i++]; continue; }
        if (k === 0x11) { x += b[i++]; continue; }
        if (k === 0x0C) code = b[i++];
        else { i += FC_ARGS(k); continue; }
      }
      if (c === 0xF9) code = 0x100 + b[i++];
      const w = wOf(code);
      let drawX = x;
      if (rtlEngine) {
        if (((x + 1) & 255) !== E) { S = x; prevLTR = 0; segRTL = segHasRTL(i - 1); }
        E = (x + w + 1) & 255;
      }
      if (rtlEngine && segRTL) {
        let k = cls(code > 255 ? 0 : code);
        if (k === 0) k = prevLTR && peek(i) === 1 ? 1 : 0;
        if (k === 1) {
          if (!prevLTR) runStart = x;
          prevLTR = 1;
          drawX = S + scanW(i, true) + (x - runStart);
        } else { prevLTR = 0; drawX = S + scanW(i, false); }
      }
      ops.push({ code, x: drawX, y, w });
      x += w;
    }
    return { ops, height: y + 16 };
  }

  function preview(bytes, fontId = App.game.dialogueFont, scale = 2) {
    const g = App.game, rtl = App.settings.rtl === 'engine';
    const { ops, height } = layout(bytes, fontId, rtl);
    const W = g.msgBoxWidth, c = h('canvas', { class: 'pixel preview', width: W + 8, height: height + 6 });
    c.style.width = (W + 8) * scale + 'px';
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8f8f8'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#6890c0'; ctx.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
    const f = g.fonts.length ? Font.fontById(fontId) : null;
    let overflow = false;
    for (const op of ops) {
      if (op.sep) { ctx.fillStyle = '#c0d0e8'; ctx.fillRect(1, op.y + 2, c.width - 2, 1); continue; }
      if (f) ctx.drawImage(Font.glyphCanvas(f, op.code), op.x + 4, op.y + 3);
      if (op.x + op.w > W) overflow = true;
    }
    if (overflow) { ctx.fillStyle = 'rgba(255,0,0,.25)'; ctx.fillRect(W + 4, 0, 4, c.height); }
    c.title = overflow ? 'A line is wider than the message box!' : '';
    return c;
  }

  function encodeOpts(text, noAlign) {
    const s = App.settings, wOf = widthTable(App.game.dialogueFont);
    const dialogue = /\\[nlp]|\n/.test(text) || text.length > 30;
    return { rtl: s.rtl, align: s.align && dialogue && !noAlign, boxWidth: s.boxWidth || App.game.msgBoxWidth, widthOf: t => tokenWidth(t, wOf) };
  }

  // a new dialogue text as the game stores it: paragraphs (blank line or a line break) -> \p, wrapped to the
  // message box, right-aligned if Hebrew (used by the story / block compilers)
  function encodeDialogue(text) {
    const par = String(text).replace(/\r/g, '').split(/\n+/).map(x => x.trim()).filter(Boolean).join('\\p');
    const wrapped = wrapText(par || ' ', '\\p');
    return Charmap.encode(wrapped, encodeOpts(wrapped));
  }

  // Is this pointer location a real reference? Aligned words (C tables) or script commands that take a text pointer.
  // Unaligned matches elsewhere are usually random bytes, and rewriting them would corrupt the game.
  function realRef(p) {
    const u = App.rom.u8;
    return p % 4 === 0 || (u[p - 2] === 0x0F && u[p - 1] < 4) || u[p - 1] === 0x67 || u[p - 2] === 0x85 || u[p - 1] === 0x78 ||
      u[p - 6] === 0x5C || u[p - 10] === 0x5C || u[p - 14] === 0x5C;
  }

  // ---------- saving ----------
  function saveEntry(e) {
    let bytes = Charmap.encode(e.cur, encodeOpts(e.cur, e.noAlign));
    const rom = App.rom;
    if (!e.overlap && bytes.length > e.cap) {           // try to fit in place without the alignment padding
      const plain = Charmap.encode(e.cur, encodeOpts(e.cur, true));
      if (plain.length <= e.cap) bytes = plain;
    }
    if (e.overlap || bytes.length > e.cap) {
      const refs = e.refs.filter(realRef);
      if (!refs.length) throw new Error('Too long to fit (' + bytes.length + '/' + e.cap + ' bytes) and no safe pointer to relocate it');
      const n = rom.writeNew(bytes);
      for (const p of refs) rom.wptr(p, n);
      e.refs = refs;
      e.off = n; e.cap = bytes.length; e.overlap = false;
    } else {
      rom.write(e.off, bytes);
      for (let i = bytes.length; i < e.cap; i++) rom.u8[e.off + i] = 0xFF;
      rom.changed();
    }
    e.saved = e.cur;
    return bytes;
  }
  // Used by the map editor: save arbitrary text at a pointer target
  function saveAt(off, text) {
    if (entries) { const e = entries.find(x => x.off === off); if (e) { e.cur = text; saveEntry(e); return e.off; } }
    const rom = App.rom, len = Charmap.scanString(rom.u8, off, 0) || Charmap.decode(rom.u8, off).len;
    const bytes = Charmap.encode(text, encodeOpts(text));
    const refs = rom.findPointers(off);
    return rom.replaceData(off, len, bytes, refs);
  }

  // ---------- automatic line wrapping for translations ----------
  // A translation without \n or \l is wrapped to fit: dialogue (the English has \p or \l, or wide lines)
  // uses the message box (line 1 \n line 2 \l line 3…); multi-line descriptions keep the English line width.
  // message box (2 visible lines, extra lines scroll with \l) vs. a fixed window (menus, descriptions, pages)
  function isDialogue(en) {
    const wOf = widthTable(App.game.dialogueFont);
    const lines = en.replace(/\n/g, '').split(/\\[nlp]/).filter(Boolean);
    const w = l => { try { return Charmap.tokenize(l).reduce((a, t) => a + tokenWidth(t, wOf), 0); } catch (e) { return l.length * 6; } };
    return /\\[pl]/.test(en) || /\{FD /.test(en) || (lines.length <= 2 && Math.max(0, ...lines.map(w)) > 150);
  }
  function wrapText(he, en) {
    if (/\\[nl]/.test(he)) return he;
    const wOf = widthTable(App.game.dialogueFont);
    const PH = { 1: 42, 2: 60, 3: 60, 4: 60, 6: 42 };
    const width = s => { try { return Charmap.tokenize(s).reduce((a, t) => a + (t.kind === 'ph' ? (PH[t.bytes[1]] || 48) : tokenWidth(t, wOf)), 0); } catch (e) { return s.length * 6; } };
    const enLines = en.replace(/\n/g, '').split(/\\[nlp]/).filter(Boolean);
    if (enLines.length <= 1 && !/\\p/.test(en) && width(he) <= (App.settings.boxWidth || App.game.msgBoxWidth) - 6) return he;
    const enMax = Math.max(...enLines.map(width));
    const dialogue = /\\[pl]/.test(en) || enLines.length <= 2;
    const maxW = dialogue ? (App.settings.boxWidth || App.game.msgBoxWidth) - 6 : Math.max(enMax, 60) + 4;
    const out = he.split('\\p').map(par => {
      const words = par.trim().match(/(?:\{[^}]*\}|[^ ])+/g) || [], lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && width(t) > maxW) { lines.push(cur); cur = w; } else cur = t;
      }
      if (cur) lines.push(cur);
      return lines.map((l, i) => i === 0 ? l : (dialogue && i >= 2 ? '\\l' : '\\n') + l).join('');
    });
    return out.join('\\p');
  }

  // Apply a translation pack {OFFSET_HEX: [english, hebrew]} to every string that is still in English.
  async function applyTranslation(pack, progress = () => {}) {
    // a pack entry is [English, Hebrew] or [FNV-1a hash of the English line, Hebrew] (the published pack carries no
    // English text: the English comes from the ROM that is open)
    const fnv = t => { let x = 0x811c9dc5; for (const ch of t) x = Math.imul(x ^ ch.codePointAt(0), 0x01000193) >>> 0; return x.toString(16).padStart(8, '0'); };
    const isHash = v => /^[0-9a-f]{8}$/.test(v);
    const list = await scanRom(), rom = App.rom, byEn = new Map();
    for (const [, [en, he]] of Object.entries(pack)) byEn.set(en, he);
    const report = { applied: 0, skipped: 0, errors: [] };
    list.forEach((e, i) => {
      if (e.frag || /[א-ת]/.test(e.orig)) { report.skipped++; return; }
      const key = e.id.toString(16).toUpperCase(), en = e.orig.replace(/\n/g, '');
      const hen = fnv(en), match = v => v === en || (isHash(v) && v === hen);
      let he = pack[key] && match(pack[key][0]) ? pack[key][1] : byEn.has(en) ? byEn.get(en) : byEn.get(hen);
      if (he == null) return;
      try {
        e.cur = wrapText(he, en);
        // hand-placed line breaks = a fixed layout (menus, small windows): only align real paragraph dialogue
        e.noAlign = /\\[nl]/.test(he) ? !/\\p/.test(en) : !isDialogue(en);
        if (/\\p$/.test(en) && !/\\p$/.test(e.cur)) e.cur += '\\p';
        saveEntry(e); report.applied++;
      } catch (x) { report.errors.push(key + ': ' + x.message); }
      if (i % 500 === 0) progress(i / list.length);
    });
    entries = null;
    return report;
  }
  const scanRom = () => new Promise(r => scan(r, () => {}));
  // replace whole words in every text of the game: pairs = [[old, new], …]. A Hebrew prefix (ו ב כ ל מ ש ה) stays
  // in front of the word: "מעיירת פאלט" -> "מראש העין". Returns { changed, errors }.
  async function replaceAll(pairs) {
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const res = pairs.filter(([a, b]) => a && a !== b).map(([a, b]) => [new RegExp('(?<!\\p{L})([ובכלמשה]{0,2})' + esc(a) + '(?!\\p{L})', 'gu'), b]);
    const out = { changed: 0, errors: [] };
    if (!res.length) return out;
    const list = await scanRom();
    for (const e of list) {
      if (e.frag) continue;
      let t = e.cur; for (const [re, b] of res) t = t.replace(re, (m, pre) => pre + b);
      if (t === e.cur) continue;
      e.cur = t;
      try { saveEntry(e); out.changed++; } catch (x) { out.errors.push(x.message); }
    }
    entries = null;
    return out;
  }

  // ---------- UI ----------
  function render(root) {
    root.innerHTML = '';
    const s = App.settings;
    const bar = h('div', { class: 'panel row wrap' },
      h('div', { class: 'tabs small' }, ...[['strings', 'All text'], ['tables', 'Name tables']].map(([k, n]) =>
        h('button', { class: state.sub === k ? 'sel' : '', onclick: () => { state.sub = k; render(root); } }, n))),
      h('label', {}, 'RTL mode ', h('select', { onchange: e => { s.rtl = e.target.value; App.saveSettings(); if (entries) refreshFromRom(); render(root); } },
        ...[['none', 'None (LTR)'], ['engine', 'Engine patch (logical order)'], ['visual', 'No patch (store reversed)']].map(([v, n]) => h('option', { value: v, selected: s.rtl === v }, n)))),
      h('label', { title: 'Adds a {SKIP} at the start of Hebrew dialogue lines so they hug the right edge' },
        h('input', { type: 'checkbox', checked: s.align, onchange: e => { s.align = e.target.checked; App.saveSettings(); } }), ' Right-align dialogue'),
      h('label', {}, 'Box width ', h('input', { type: 'number', value: s.boxWidth || App.game.msgBoxWidth, style: { width: '60px' }, onchange: e => { s.boxWidth = +e.target.value; App.saveSettings(); } })),
      s.rtl === 'engine' && App.game.rtl && Font.rtlStatus() !== 'on'
        ? h('span', { class: 'err' }, 'RTL patch not installed (Hebrew tab)') : null);
    root.append(bar);
    if (state.sub === 'tables') return renderTables(root);

    if (!entries) {
      const prog = h('progress', { max: 1, value: 0 });
      root.append(h('div', { class: 'panel' },
        h('p', {}, 'Scan the ROM for every string referenced by a pointer (dialogue, menus, descriptions, signs…).'),
        h('button', { class: 'primary', disabled: scanning, onclick: () => {
          scanning = true; render(root);
        } }, scanning ? 'Scanning…' : 'Scan ROM for text'), ' ', scanning ? prog : null));
      if (scanning) scan(list => { entries = list; scanning = false; applyFilter(); render(root); }, p => prog.value = p);
      return;
    }

    const search = h('input', { type: 'search', placeholder: 'Search English / Hebrew / offset…', value: state.q, style: { width: '280px' },
      oninput: e => { state.q = e.target.value; page = 0; applyFilter(); drawList(); } });
    const only = h('select', { onchange: e => { state.only = e.target.value; page = 0; applyFilter(); drawList(); } },
      ...[['all', 'All'], ['dialogue', 'Dialogue (multi-line)'], ['untranslated', 'Not translated yet'], ['translated', 'Contains Hebrew'], ['modified', 'Unsaved changes']]
        .map(([v, n]) => h('option', { value: v, selected: state.only === v }, n)));
    const tools = h('div', { class: 'panel row wrap' }, search, only,
      h('span', { class: 'muted', id: 'textCount' }),
      h('button', { onclick: () => { const n = entries.filter(e => e.cur !== e.saved).map(e => { try { saveEntry(e); return 1; } catch (x) { toast(hex(e.id) + ': ' + x.message, 'err'); return 0; } }).reduce((a, b) => a + b, 0); toast('Saved ' + n + ' strings'); drawList(); } }, 'Save all changes'),
      h('button', { onclick: exportJSON }, 'Export translations'),
      h('label', { class: 'btn' }, 'Import translations', h('input', { type: 'file', accept: '.json', hidden: true, onchange: e => importJSON(e.target.files[0]) })),
      h('button', { onclick: () => { entries = null; render(root); } }, 'Rescan'));
    const list = h('div', { id: 'textList' }), pager = h('div', { class: 'row pager' });
    root.append(tools, pager, list);
    function drawList() {
      $('#textCount').textContent = filtered.length + ' / ' + entries.length + ' ' + T('strings');
      list.innerHTML = '';
      for (const e of filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)) list.append(row(e));
      const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      pager.innerHTML = '';
      pager.append(h('button', { disabled: page === 0, onclick: () => { page--; drawList(); } }, '◀'),
        ' page ', h('input', { type: 'number', min: 1, max: pages, value: page + 1, style: { width: '60px' }, onchange: e => { page = Math.min(pages - 1, Math.max(0, e.target.value - 1)); drawList(); } }),
        ' ' + T('of') + ' ' + pages + ' ', h('button', { disabled: page >= pages - 1, onclick: () => { page++; drawList(); } }, '▶'));
    }
    drawList();
  }

  function row(e) {
    const status = h('span', { class: 'status' });
    const prevBox = h('div', { class: 'prev' });
    const ta = h('textarea', { dir: 'auto', rows: Math.min(8, e.cur.split('\n').length + 1), spellcheck: false });
    ta.value = e.cur;
    const upd = () => {
      e.cur = ta.value; prevBox.innerHTML = '';
      try {
        const bytes = Charmap.encode(e.cur, encodeOpts(e.cur));
        prevBox.append(preview(bytes));
        const fits = bytes.length <= e.cap && !e.overlap;
        status.className = 'status ' + (e.cur === e.saved ? 'muted' : fits ? 'ok' : 'warn');
        status.textContent = (e.cur === e.saved ? 'saved' : 'unsaved') + ' · ' + bytes.length + '/' + e.cap + ' bytes' + (fits ? '' : ' → will relocate');
      } catch (x) { status.className = 'status err'; status.textContent = x.message; }
    };
    ta.oninput = upd;
    ta.onkeydown = ev => { if (ev.key === 'Enter' && ev.ctrlKey) { save(); ev.preventDefault(); } };
    const save = () => { try { saveEntry(e); upd(); toast('Saved ' + hex(e.id)); } catch (x) { toast(x.message, 'err'); } };
    upd();
    return h('div', { class: 'trow' },
      h('div', { class: 'meta' }, h('b', {}, hex(e.off)), h('div', { class: 'muted' }, e.refs.length + ' ref' + (e.refs.length > 1 ? 's' : '')),
        e.overlap ? h('div', { class: 'warn', title: 'Another string points inside this one; it will always be relocated' }, 'shared') : null),
      h('div', { class: 'orig', dir: 'ltr' }, e.orig),
      h('div', { class: 'edit' }, ta, h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, 'Save'),
        h('button', { onclick: () => { ta.value = e.saved; upd(); } }, 'Undo'),
        h('button', { onclick: () => { ta.value = e.orig; upd(); } }, 'Original'), status)),
      prevBox);
  }

  function applyFilter() {
    const q = state.q.toLowerCase();
    filtered = entries.filter(e => {
      if (q && !(e.orig.toLowerCase().includes(q) || e.cur.toLowerCase().includes(q) || hex(e.off).toLowerCase().includes(q) || hex(e.id).toLowerCase().includes(q))) return false;
      const heb = /[א-ת]/.test(e.cur);
      if (state.only === 'dialogue') return /\\[nlp]/.test(e.orig);
      if (state.only === 'untranslated') return !heb;
      if (state.only === 'translated') return heb;
      if (state.only === 'modified') return e.cur !== e.saved;
      return true;
    });
  }
  function refreshFromRom() {
    for (const e of entries) { const d = Charmap.decodeEditable(App.rom.u8, e.off, App.settings.rtl); if (e.cur === e.saved) e.cur = d.text; e.saved = d.text; }
    applyFilter();
  }
  function exportJSON() {
    const out = { game: App.rom.code, note: 'Keys are the original string offsets', strings: {} };
    for (const e of entries) if (e.cur !== e.orig) out.strings[hex(e.id)] = { en: e.orig, he: e.cur };
    download(JSON.stringify(out, null, 1), App.rom.name.replace(/\.gba$/i, '') + '_translation.json', 'application/json');
  }
  async function importJSON(file) {
    if (!file) return;
    const data = JSON.parse(await file.text());
    let n = 0;
    for (const [k, v] of Object.entries(data.strings || {})) {
      const e = entries.find(x => x.id === parseInt(k, 16));
      if (e) { e.cur = typeof v === 'string' ? v : v.he; n++; }
    }
    toast('Imported ' + n + ' strings (not saved to ROM yet — use "Save all changes")');
    state.only = 'modified'; applyFilter(); App.show('text');
  }

  // ---------- fixed-length name tables ----------
  function tables() {
    const o = App.game.offsets, g = App.game, t = [];
    if (o.speciesNames >= 0) t.push(['species', 'Pokémon names', o.speciesNames, 11, 11, g.speciesCount]);
    if (o.moveNames >= 0) t.push(['moves', 'Move names', o.moveNames, 13, 13, g.movesCount]);
    if (o.abilityNames >= 0) t.push(['abilities', 'Ability names', o.abilityNames, 13, 13, g.abilitiesCount]);
    if (o.typeNames >= 0) t.push(['types', 'Type names', o.typeNames, 7, 7, g.typesCount]);
    if (o.items >= 0) t.push(['items', 'Item names', o.items, 44, 14, g.itemsCount]);
    if (o.trainers >= 0) t.push(['trainers', 'Trainer names', o.trainers + 4, 40, 12, g.trainerCount]);
    return t;
  }
  // Write Hebrew names from data/hebrew_names.js into every name table, matching the current English name.
  function applyNamePack(which) {
    const pack = window.HEBREW_NAMES, rom = App.rom, report = { applied: 0, already: 0, tooLong: [], noTranslation: [] };
    for (const [key, , base, stride, maxLen, count] of tables()) {
      if (!pack[key] || (which && !which.includes(key))) continue;
      for (let i = 0; i < count; i++) {
        const off = base + i * stride, en = Charmap.decode(rom.u8, off, maxLen).text;
        const he = pack[key][en];
        if (he == null) {
          if (/[א-ת]/.test(en)) report.already++;
          else if (!/^[?\-\s]*$/.test(en)) report.noTranslation.push(key + ' #' + i + ' ' + en);
          continue;
        }
        const bytes = Charmap.encode(he, { rtl: App.settings.rtl === 'none' ? 'engine' : App.settings.rtl });
        if (bytes.length > maxLen) { report.tooLong.push(`${key}: ${en} → ${he} (${bytes.length - 1}/${maxLen - 1})`); continue; }
        const pad = new Uint8Array(maxLen).fill(0xFF); pad.set(bytes); rom.write(off, pad);
        report.applied++;
      }
    }
    App.lists = null;
    return report;
  }

  function renderTables(root) {
    const ts = tables(), cur = ts.find(t => t[0] === state.table) || ts[0];
    if (!cur) { root.append(h('div', { class: 'panel' }, 'No name tables found.')); return; }
    if (window.HEBREW_NAMES) {
      const out = h('div', { class: 'muted' });
      root.append(h('div', { class: 'panel row wrap' },
        h('b', {}, 'Hebrew name pack'),
        h('span', { class: 'muted' }, 'Pokémon (transliterated), moves, abilities, types, items (translated). Only names that are still in English are replaced.'),
        h('button', { class: 'primary', onclick: () => {
          const r = applyNamePack();
          toast(`Hebrew names applied: ${r.applied}`);
          out.textContent = `Applied ${r.applied}. ${r.already} were already Hebrew.` +
            (r.tooLong.length ? ' Too long (skipped): ' + r.tooLong.join('; ') + '.' : '') +
            (r.noTranslation.length ? ' No translation for: ' + r.noTranslation.slice(0, 30).join(', ') + (r.noTranslation.length > 30 ? '…' : '') : '');
          render(root.parentNode ? root : root);
          $('#main').prepend(out);
        } }, 'Apply Hebrew name pack'), out));
    }
    const [, label, base, stride, maxLen, count] = cur;
    const panel = h('div', { class: 'panel' },
      h('div', { class: 'tabs small' }, ...ts.map(t => h('button', { class: t === cur ? 'sel' : '', onclick: () => { state.table = t[0]; render(root.parentNode ? root : root); } }, t[1]))),
      h('p', { class: 'muted' }, label + ' at ' + hex(base) + ' — max ' + (maxLen - 1) + ' bytes each (fixed size, cannot be relocated).'));
    const grid = h('div', { class: 'namegrid' });
    for (let i = 0; i < count; i++) {
      const off = base + i * stride, d = Charmap.decodeEditable(App.rom.u8, off, App.settings.rtl);
      const inp = h('input', { value: d.text, dir: 'auto' });
      const st = h('span', { class: 'muted' });
      inp.onchange = () => {
        try {
          const bytes = Charmap.encode(inp.value, { rtl: App.settings.rtl });
          if (bytes.length > maxLen) throw new Error('Too long: ' + (bytes.length - 1) + '/' + (maxLen - 1));
          const pad = new Uint8Array(maxLen).fill(0xFF); pad.set(bytes);
          App.rom.write(off, pad); st.className = 'ok'; st.textContent = '✓';
          App.lists = null;
        } catch (x) { st.className = 'err'; st.textContent = x.message; }
      };
      grid.append(h('div', { class: 'nameitem' }, h('span', { class: 'muted' }, i), inp, st));
    }
    panel.append(grid);
    root.append(panel);
  }

  return { search: q => { state.q = q; state.sub = 'strings'; }, render, preview, saveAt, layout, applyNamePack, applyTranslation, wrapText, scanRom, replaceAll, encodeDialogue, encodeOpts, reset: () => { entries = null; } };
})();
