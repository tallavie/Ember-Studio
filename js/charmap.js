// Gen 3 (Emerald / FireRed, English) text encoding + Hebrew extension + RTL helpers.
'use strict';

const Charmap = (() => {
  const T = new Array(256).fill(null);
  const set = (code, s) => { T[code] = s; };
  set(0x00, ' ');
  'ÀÁÂÇÈÉÊËÌ'.split('').forEach((c, i) => set(0x01 + i, c));
  'ÎÏÒÓÔŒÙÚÛÑßàá'.split('').forEach((c, i) => set(0x0B + i, c));
  'çèéêëì'.split('').forEach((c, i) => set(0x19 + i, c));
  'îïòóôœùúûñºª'.split('').forEach((c, i) => set(0x20 + i, c));
  set(0x2C, '{SUPER_ER}'); set(0x2D, '&'); set(0x2E, '+'); set(0x34, '{LV}'); set(0x35, '='); set(0x36, ';');
  set(0x51, '¿'); set(0x52, '¡'); set(0x53, '{PK}'); set(0x54, '{MN}'); set(0x55, '{PO}'); set(0x56, '{KE}');
  set(0x57, '{BL}'); set(0x58, '{OC}'); set(0x59, '{K}'); set(0x5A, 'Í'); set(0x5B, '%'); set(0x5C, '('); set(0x5D, ')');
  set(0x68, 'â'); set(0x6F, 'í');
  set(0x79, '{UP_ARROW}'); set(0x7A, '{DOWN_ARROW}'); set(0x7B, '{LEFT_ARROW}'); set(0x7C, '{RIGHT_ARROW}');
  set(0x84, '{SUPER_E}'); set(0x85, '<'); set(0x86, '>'); set(0xA0, '{SUPER_RE}');
  for (let i = 0; i < 10; i++) set(0xA1 + i, String(i));
  '!?.-·…“”‘\''.split('').forEach((c, i) => set(0xAB + i, c));
  set(0xB5, '♂'); set(0xB6, '♀'); set(0xB7, '$'); set(0xB8, ','); set(0xB9, '×'); set(0xBA, '/');
  for (let i = 0; i < 26; i++) { set(0xBB + i, String.fromCharCode(65 + i)); set(0xD5 + i, String.fromCharCode(97 + i)); }
  set(0xEF, '▶'); set(0xF0, ':'); 'ÄÖÜäöü'.split('').forEach((c, i) => set(0xF1 + i, c));

  // Hebrew: 22 letters + 5 finals, in Unicode order, placed in glyph slots that are blank in the ROM fonts.
  const HEBREW = 'אבגדהוזחטיךכלםמןנסעףפץצקרשת';
  const HEB_CODES = [];
  for (let c = 0x37; c <= 0x4F; c++) HEB_CODES.push(c);
  HEB_CODES.push(0x5E, 0x5F);
  HEBREW.split('').forEach((c, i) => set(HEB_CODES[i], c));

  const ENC = new Map();
  T.forEach((s, i) => { if (s != null && !ENC.has(s)) ENC.set(s, i); });
  ENC.set('\'', 0xB4); ENC.set('’', 0xB4); ENC.set('‘', 0xB3); ENC.set('é', 0x1B); ENC.set('…', 0xB0);
  ENC.set('"', 0xB1); // handled specially (open/close) in encode
  ENC.set('״', 0xB2); ENC.set('׳', 0xB4); ENC.set('־', 0xAE); // Hebrew gershayim, geresh, maqaf

  const PLACEHOLDERS = { 1: 'PLAYER', 2: 'STR_VAR_1', 3: 'STR_VAR_2', 4: 'STR_VAR_3', 5: 'KUN', 6: 'RIVAL', 7: 'VERSION',
    8: 'AQUA', 9: 'MAGMA', 10: 'ARCHIE', 11: 'MAXIE', 12: 'KYOGRE', 13: 'GROUDON' };
  const PH_ENC = Object.fromEntries(Object.entries(PLACEHOLDERS).map(([k, v]) => [v, +k]));
  // Extended control codes (0xFC xx ...): [name, argument byte count]
  const FC = { 1: ['COLOR', 1], 2: ['HIGHLIGHT', 1], 3: ['SHADOW', 1], 4: ['COLOR_HIGHLIGHT_SHADOW', 3], 5: ['PALETTE', 1],
    6: ['FONT', 1], 7: ['RESET_FONT', 0], 8: ['PAUSE', 1], 9: ['PAUSE_UNTIL_PRESS', 0], 10: ['WAIT_SE', 0], 11: ['PLAY_BGM', 2],
    12: ['ESCAPE', 1], 13: ['SHIFT_RIGHT', 1], 14: ['SHIFT_DOWN', 1], 15: ['FILL_WINDOW', 0], 16: ['PLAY_SE', 2], 17: ['CLEAR', 1],
    18: ['SKIP', 1], 19: ['CLEAR_TO', 1], 20: ['MIN_LETTER_SPACING', 1], 21: ['JPN', 0], 22: ['ENG', 0], 23: ['PAUSE_MUSIC', 0],
    24: ['RESUME_MUSIC', 0] };
  const FC_ENC = Object.fromEntries(Object.entries(FC).map(([k, v]) => [v[0], [+k, v[1]]]));
  const hx = b => b.toString(16).toUpperCase().padStart(2, '0');

  // Decode bytes at off. Returns {text, len (bytes incl. terminator), ok}.
  function decode(u8, off, max = 4096) {
    let s = '', i = off;
    const end = Math.min(u8.length, off + max);
    while (i < end) {
      const b = u8[i++];
      if (b === 0xFF) return { text: s, len: i - off, ok: true };
      if (b === 0xFE) s += '\\n\n';
      else if (b === 0xFA) s += '\\l\n';
      else if (b === 0xFB) s += '\\p\n';
      else if (b === 0xFD) { const a = u8[i++]; s += '{' + (PLACEHOLDERS[a] || 'FD ' + hx(a)) + '}'; }
      else if (b === 0xFC) {
        const c = u8[i++], d = FC[c];
        if (!d) { s += '{FC ' + hx(c) + '}'; continue; }
        const args = []; for (let k = 0; k < d[1]; k++) args.push(hx(u8[i++]));
        s += '{' + d[0] + (args.length ? ' ' + args.join(' ') : '') + '}';
      }
      else if (b === 0xF9) s += '{F9 ' + hx(u8[i++]) + '}';
      else if (b === 0xF8) s += '{KEY ' + hx(u8[i++]) + '}';
      else if (b === 0xF7) s += '{DYN ' + hx(u8[i++]) + '}';
      else if (T[b] != null) s += T[b];
      else s += '{' + hx(b) + '}';
    }
    return { text: s, len: i - off, ok: false };
  }

  // Tokenize editor text into byte tokens: [{bytes:[...], ch:'x'|null, kind}]
  // kind: 'char' (glyph), 'nl' (line break), 'ctrl' (zero-width code), 'ph' (placeholder)
  function tokenize(text) {
    const toks = [];
    let i = 0, quoteOpen = false;
    text = text.replace(/\r/g, '');
    while (i < text.length) {
      const c = text[i];
      if (c === '\\' && /[nlp]/.test(text[i + 1])) {
        const b = { n: 0xFE, l: 0xFA, p: 0xFB }[text[i + 1]];
        toks.push({ bytes: [b], kind: 'nl' }); i += 2;
        if (text[i] === '\n') i++; // the visual newline after an escape
        continue;
      }
      if (c === '\n') { toks.push({ bytes: [0xFE], kind: 'nl' }); i++; continue; }
      if (c === '{') {
        const j = text.indexOf('}', i);
        if (j < 0) throw new Error('Missing } after position ' + i);
        const inner = text.slice(i + 1, j).trim(), parts = inner.split(/\s+/), name = parts[0].toUpperCase();
        const args = parts.slice(1).map(a => parseInt(a, 16));
        let bytes, kind = 'ctrl';
        if (PH_ENC[name] != null) { bytes = [0xFD, PH_ENC[name]]; kind = 'ph'; }
        else if (FC_ENC[name]) {
          const [code, n] = FC_ENC[name];
          if (args.length !== n || args.some(isNaN)) throw new Error(`{${name}} needs ${n} hex argument(s)`);
          bytes = [0xFC, code, ...args];
          if (code === 12) kind = 'char';
        }
        else if (name === 'FD' || name === 'FC' || name === 'F9' || name === 'KEY' || name === 'DYN') {
          const lead = { FD: 0xFD, FC: 0xFC, F9: 0xF9, KEY: 0xF8, DYN: 0xF7 }[name];
          bytes = [lead, ...args]; kind = (name === 'F9' || name === 'KEY') ? 'char' : 'ctrl';
        }
        else if (/^[0-9A-F]{2}$/.test(name)) { bytes = [parseInt(name, 16)]; kind = 'char'; }
        else if (ENC.has('{' + name + '}')) { bytes = [ENC.get('{' + name + '}')]; kind = 'char'; }
        else throw new Error('Unknown code {' + inner + '}');
        toks.push({ bytes, kind, ch: null }); i = j + 1; continue;
      }
      let b;
      if (c === '"') { b = quoteOpen ? 0xB2 : 0xB1; quoteOpen = !quoteOpen; }
      else b = ENC.get(c);
      if (b == null) throw new Error(`Character "${c}" is not in the game's font`);
      toks.push({ bytes: [b], kind: 'char', ch: c }); i++;
    }
    return toks;
  }

  // Direction class of a glyph byte (must match the ASM patch): 0 neutral, 1 LTR, 2 RTL
  function dirClass(b) {
    if (b >= 0x37 && b <= 0x4F || b === 0x5E || b === 0x5F) return 2;
    if ((b >= 0x01 && b <= 0x2B) || (b >= 0xA1 && b <= 0xAA) || (b >= 0xBB && b <= 0xEE) || (b >= 0xF1 && b <= 0xF6)) return 1;
    return 0;
  }
  const MIRROR = { 0x5C: 0x5D, 0x5D: 0x5C, 0x85: 0x86, 0x86: 0x85 };
  const hasHebrew = toks => toks.some(t => t.kind === 'char' && t.bytes.length === 1 && dirClass(t.bytes[0]) === 2);

  // Split tokens into lines (keeping the line-break token at the end of each line)
  function lines(toks) {
    const out = [[]];
    for (const t of toks) { out[out.length - 1].push(t); if (t.kind === 'nl') out.push([]); }
    return out;
  }

  /**
   * Encode editor text to bytes (with 0xFF terminator).
   * opts.rtl: 'none' | 'engine' (ROM has RTL patch: logical order) | 'visual' (no patch: reverse each line)
   * opts.align: right-align lines that contain Hebrew to opts.boxWidth using {SKIP} (needs opts.widthOf)
   */
  function encode(text, opts = {}) {
    let toks = tokenize(text);
    const rtl = opts.rtl || 'none';
    if (rtl !== 'none' && hasHebrew(toks)) {
      toks = toks.map(t => (t.kind === 'char' && t.bytes.length === 1 && MIRROR[t.bytes[0]] != null)
        ? { ...t, bytes: [MIRROR[t.bytes[0]]] } : t);
      const ls = lines(toks).map(line => {
        const brk = line.length && line[line.length - 1].kind === 'nl' ? line.pop() : null;
        let body = line;
        const lineHasHeb = hasHebrew(body);
        if (rtl === 'visual' && lineHasHeb) body = visualOrder(body);
        const positioned = body.length && body[0].bytes[0] === 0xFC && [0x0D, 0x12, 0x13].includes(body[0].bytes[1]);
        if (opts.align && lineHasHeb && opts.widthOf && !positioned) {
          const w = body.reduce((s, t) => s + opts.widthOf(t), 0);
          const pad = Math.max(0, Math.min(255, (opts.boxWidth || 216) - w));
          if (pad > 0) body = [{ bytes: [0xFC, 0x12, pad], kind: 'ctrl' }, ...body];
        }
        return brk ? [...body, brk] : body;
      });
      toks = ls.flat();
    }
    const out = [];
    for (const t of toks) out.push(...t.bytes);
    out.push(0xFF);
    return new Uint8Array(out);
  }

  // Bidi-lite for ROMs without the patch: reverse the line, then restore LTR runs.
  function visualOrder(line) {
    const cls = line.map(t => t.kind === 'char' && t.bytes.length === 1 ? dirClass(t.bytes[0]) : (t.kind === 'ph' ? 1 : 0));
    // neutral between two LTR -> LTR
    for (let i = 0; i < cls.length; i++) if (cls[i] === 0) {
      let p = i - 1; while (p >= 0 && cls[p] === 0 && line[p].kind === 'ctrl') p--;
      let n = i + 1; while (n < cls.length && cls[n] === 0) n++;
      if (p >= 0 && cls[p] === 1 && n < cls.length && cls[n] === 1) cls[i] = 1;
    }
    const runs = []; let cur = null;
    line.forEach((t, i) => {
      const ltr = cls[i] === 1;
      if (!cur || cur.ltr !== ltr) { cur = { ltr, toks: [] }; runs.push(cur); }
      cur.toks.push(t);
    });
    const out = [];
    for (const r of runs.reverse()) out.push(...(r.ltr ? r.toks : r.toks.slice().reverse()));
    return out;
  }

  // Fast validity check used by the ROM text scanner. Returns byte length (incl FF) or 0.
  // 4 = Latin letter, 5 = Hebrew letter, 1 = common symbol/digit/space, 3 = rare glyph (accents, arrows\u2026)
  const VALID = new Uint8Array(256);
  T.forEach((s, i) => {
    if (s == null) return;
    VALID[i] = /^[A-Za-z]$/.test(s) ? 4 : /^[\u05D0-\u05EA]$/.test(s) ? 5
      : (/^[0-9 !?.,\-'\u201C\u201D\u2018\u2019\u2026:;/()&+=%$\u00D7\u2642\u2640\u00E9]$/.test(s) || /^\{(PK|MN|LV|PO|KE|BL|OC|K)\}$/.test(s)) ? 1 : 3;
  });
  function scanString(u8, off, minLetters = 3) {
    let i = off, letters = 0, glyphs = 0, odd = 0, rare = 0, mixed = 0, prev = 0;
    const end = Math.min(u8.length, off + 1500);
    while (i < end) {
      const b = u8[i++];
      if (b === 0xFF) break;
      const v = VALID[b];
      if (v) {
        glyphs++;
        if (v >= 4) { letters++; if (prev >= 4 && prev !== v) mixed++; }
        else if (v === 3) rare++;
        prev = v; continue;
      }
      prev = 0;
      if (b === 0xFE || b === 0xFA || b === 0xFB) continue;
      if (b === 0xFD) { if (u8[i++] > 0x20) return 0; continue; }
      if (b === 0xFC) { const d = FC[u8[i]]; if (!d) return 0; i += 1 + d[1]; odd++; continue; }
      if (b === 0xF9 || b === 0xF8 || b === 0xF7) { i++; odd++; continue; }
      return 0;
    }
    if (i >= end || u8[i - 1] !== 0xFF) return 0;
    if (letters < minLetters || letters * 2 < glyphs || odd > letters) return 0;
    if (rare && !(rare * 20 <= glyphs && glyphs >= 20)) return 0;   // accented glyphs only in long text
    if (mixed > 1) return 0;                                         // Hebrew and Latin glued together = garbage
    return i - off;
  }

  // Decode a string stored by encode() back to logical editor text (undo alignment / visual order / mirroring).
  function decodeEditable(u8, off, rtl = 'none') {
    const d = decode(u8, off);
    if (!d.ok || rtl === 'none') return d;
    let toks;
    try { toks = tokenize(d.text); } catch (e) { return d; }
    if (!hasHebrew(toks)) return d;
    const ls = lines(toks).map(line => {
      const brk = line.length && line[line.length - 1].kind === 'nl' ? line.pop() : null;
      let body = line;
      if (body.length && body[0].bytes[0] === 0xFC && body[0].bytes[1] === 0x12 && hasHebrew(body)) body = body.slice(1);
      if (rtl === 'visual' && hasHebrew(body)) body = visualOrder(body);
      return brk ? [...body, brk] : body;
    });
    const bytes = [];
    for (const t of ls.flat()) {
      const b = t.bytes.length === 1 && t.kind === 'char' && MIRROR[t.bytes[0]] != null ? [MIRROR[t.bytes[0]]] : t.bytes;
      bytes.push(...b);
    }
    bytes.push(0xFF);
    return { text: decode(Uint8Array.from(bytes), 0).text, len: d.len, ok: true };
  }

  return { T, ENC, HEBREW, HEB_CODES, FC, PLACEHOLDERS, decode, decodeEditable, encode, tokenize, scanString, dirClass, lines, hasHebrew };
})();
