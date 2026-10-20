// Fonts: read/write 2bpp glyphs, Hebrew glyph set, glyph editor, naming-screen keyboard, RTL patch.
'use strict';

const Font = (() => {
  // ---------- glyph codec (64 bytes: 4 sub-tiles TL,TR,BL,BR; row = 2 bytes, byte1 = px0-3, byte0 = px4-7) ----------
  // size 32 = 8x16 glyphs (FireRed small font): 2 sub-tiles, top then bottom
  function readGlyph(u8, base, code, size = 64) {
    const px = new Uint8Array(256), g = base + code * size, cols = size / 32;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8 * cols; x++) {
      const o = g + ((y >> 3) * cols + (x >> 3)) * 16 + (y & 7) * 2;
      const b = (x & 7) < 4 ? u8[o + 1] : u8[o];
      px[y * 16 + x] = (b >> (6 - 2 * (x & 3))) & 3;
    }
    return px;
  }
  function glyphBytes(px, size = 64) {
    const out = new Uint8Array(size), cols = size / 32;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8 * cols; x++) {
      const o = ((y >> 3) * cols + (x >> 3)) * 16 + (y & 7) * 2 + ((x & 7) < 4 ? 1 : 0);
      out[o] |= (px[y * 16 + x] & 3) << (6 - 2 * (x & 3));
    }
    return out;
  }
  const COLORS = ['#ffffff', '#404048', '#c8c8c0', '#f8f8f8'];
  const COLORS_EDIT = ['#e8e0ff', '#303038', '#b0b0a8', '#ffffff'];

  // ---------- fonts of the loaded game ----------
  function fonts() { return App.game.fonts.map(([name, id, glyphs, widths, size = 64]) => ({ name, id, glyphs, widths, size })); }
  function fontById(id) { return fonts().find(f => f.id === id) || fonts()[0]; }
  function width(f, code) { return f ? App.rom.u8[f.widths + code] : 6; }

  // Glyph image cache for previews (invalidated when a glyph is written)
  let cache = new Map();
  function glyphCanvas(f, code) {
    const key = f.glyphs + ':' + code;
    if (cache.has(key)) return cache.get(key);
    const px = readGlyph(App.rom.u8, f.glyphs, code, f.size), c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const img = new ImageData(16, 16);
    for (let i = 0; i < 256; i++) {
      const v = px[i]; if (v === 0 || v === 3) continue; // transparent: bg drawn by the caller
      const col = v === 1 ? [64, 64, 72] : [200, 200, 192];
      img.data.set([...col, 255], i * 4);
    }
    c.getContext('2d').putImageData(img, 0, 0);
    cache.set(key, c);
    return c;
  }

  // ---------- Hebrew glyph designs (body is 7 rows, sitting on the baseline) ----------
  const HEB = {
    'א': ['#...#', '##..#', '.#.#.', '..#..', '.#.#.', '#..##', '#...#'],
    'ב': ['####.', '....#', '....#', '....#', '....#', '...#.', '######'],
    'ג': ['###.', '...#', '...#', '...#', '..##', '.#.#', '#..#'],
    'ד': ['#####', '...#.', '...#.', '...#.', '...#.', '...#.', '...#.'],
    'ה': ['#####', '....#', '....#', '#...#', '#...#', '#...#', '#...#'],
    'ו': ['##', '.#', '.#', '.#', '.#', '.#', '.#'],
    'ז': ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.'],
    'ח': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#...#'],
    'ט': ['#..#.', '#.#.#', '##..#', '#...#', '#...#', '#...#', '.###.'],
    'י': ['###', '..#', '.#.'],
    'ך': { r: ['####', '...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'] },
    'כ': ['####.', '....#', '....#', '....#', '....#', '....#', '####.'],
    'ל': { asc: 2, r: ['#....', '#....', '#####', '....#', '....#', '...#.', '..#..', '.#...', '.#...'] },
    'ם': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'],
    'מ': ['#.##.', '##..#', '#...#', '#...#', '#...#', '#...#', '#.###'],
    'ן': { r: ['##', '.#', '.#', '.#', '.#', '.#', '.#', '.#', '.#'] },
    'נ': ['##.', '..#', '..#', '..#', '..#', '..#', '###'],
    'ס': ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'ע': ['#...#', '#...#', '.#..#', '..#.#', '...#.', '..#..', '##...'],
    'ף': { r: ['####', '#..#', '##.#', '...#', '...#', '...#', '...#', '...#', '...#'] },
    'פ': ['#####', '#...#', '##..#', '....#', '....#', '....#', '#####'],
    'ץ': { r: ['#...#', '.#..#', '..##.', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'] },
    'צ': ['#...#', '.#..#', '..##.', '...#.', '....#', '....#', '#####'],
    'ק': { r: ['#####', '....#', '#...#', '#...#', '#..#.', '#....', '#....', '#....', '#....'] },
    'ר': ['####.', '....#', '....#', '....#', '....#', '....#', '....#'],
    'ש': ['#.#.#', '#.#.#', '#.#.#', '#.#.#', '#.#.#', '#..#.', '####.'],
    'ת': ['####.', '.#..#', '.#..#', '.#..#', '.#..#', '.#..#', '##..#'],
  };

  // Measure a font from its "A" glyph: baseline row, cap height, background value and cell height.
  function metrics(f) {
    const A = readGlyph(App.rom.u8, f.glyphs, 0xBB, f.size);
    let top = 16, bottom = -1, cellBottom = -1;
    const count = [0, 0, 0, 0];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = A[y * 16 + x]; count[v]++;
      if (v === 1) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      if (v !== 0) cellBottom = Math.max(cellBottom, y);
    }
    return { baseline: bottom, capH: bottom - top + 1, bg: count[3] > 0 ? 3 : 0, cellH: cellBottom + 1 };
  }

  function buildHebrewGlyph(f, ch) {
    const d = HEB[ch], rows = Array.isArray(d) ? d : d.r, asc = Array.isArray(d) ? 0 : (d.asc || 0);
    const m = metrics(f);
    const bodyH = Math.max(4, Math.min(7, m.capH - 1));
    // squash body rows if the font is small
    const body = rows.slice(asc, asc + 7), extra = rows.slice(asc + 7);
    const pick = bodyH === 7 ? body : Array.from({ length: bodyH }, (_, i) => body[Math.round(i * (body.length - 1) / (bodyH - 1))] || '');
    const all = [...rows.slice(0, asc), ...pick, ...extra];
    const top = m.baseline - bodyH + 1 - asc;
    const w = Math.max(...rows.map(r => r.length));
    const px = new Uint8Array(256);
    const fg = (x, y) => x >= 0 && y >= 0 && y < all.length && all[y][x] === '#';
    const width = w + 1;
    if (m.bg) for (let y = 0; y < Math.min(16, m.cellH); y++) for (let x = 0; x < width; x++) px[y * 16 + x] = m.bg;
    for (let y = 0; y < all.length; y++) for (let x = 0; x < w; x++) {
      const Y = top + y; if (Y < 0 || Y > 15) continue;
      if (fg(x, y)) px[Y * 16 + x] = 1;
    }
    for (let y = 0; y <= all.length; y++) for (let x = 0; x <= w; x++) {
      const Y = top + y; if (Y < 0 || Y > 15 || fg(x, y)) continue;
      if (fg(x - 1, y) || fg(x, y - 1) || fg(x - 1, y - 1)) px[Y * 16 + x] = 2;
    }
    return { px, width };
  }

  function installHebrew(fontList) {
    const rom = App.rom;
    for (const f of fontList) {
      Charmap.HEBREW.split('').forEach((ch, i) => {
        const code = Charmap.HEB_CODES[i], g = buildHebrewGlyph(f, ch);
        rom.write(f.glyphs + code * f.size, glyphBytes(g.px, f.size));
        rom.u8[f.widths + code] = g.width;
      });
    }
    rom.changed(); cache = new Map();
  }
  function hebrewInstalled(f) {
    return Charmap.HEB_CODES.every(c => readGlyph(App.rom.u8, f.glyphs, c, f.size).some(v => v === 1));
  }

  // ---------- RTL engine patch (Emerald US / FireRed US v1.1) ----------
  // Hooks CopyGlyphToWindow to mirror each glyph inside a Hebrew text segment; LTR runs (digits/Latin) keep
  // their order. Also disables the minLetterSpacing ClearTextSpan call. Code: js/rtl_patch.js (tools/rtl_patch.py).
  const HOOK_ORIG = 'f0b557464e464546', CLEAR_NEW = 'c046c046';
  const toHex = a => [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = s => Uint8Array.from(s.match(/../g).map(x => parseInt(x, 16)));
  function P() { return App.game.rtl; }
  function rtlStatus() {
    const rom = App.rom, p = P();
    if (!p) return 'unsupported';
    const site = toHex(rom.bytes(p.hookSite, 8));
    if (site === HOOK_ORIG) return 'off';
    if (site !== hookBytesHex()) return 'unknown';
    return toHex(rom.bytes(p.at, p.hex.length / 2)) === p.hex ? 'on' : 'outdated';
  }
  function hookBytesHex() {
    const lit = (0x08000000 + P().at + 1) >>> 0;
    return '004b1847' + [0, 8, 16, 24].map(s => ((lit >>> s) & 255).toString(16).padStart(2, '0')).join('');
  }
  function installRTL() {
    const rom = App.rom, st = rtlStatus(), p = P(), code = fromHex(p.hex);
    if (st === 'outdated') { rom.write(p.at, new Uint8Array(0x1000).fill(0xFF)); rom.write(p.at, code); return; }
    if (st !== 'off') throw new Error('Hook site does not contain the original game code (status: ' + st + ')');
    for (let i = 0; i < code.length + 4; i++) if (rom.u8[p.at + i] !== 0xFF) throw new Error('Patch area ' + hex(p.at) + ' is not free');
    const clearOrig = toHex(rom.bytes(p.clearSite, 4));
    rom.write(p.at, code);
    rom.write(p.hookSite, fromHex(hookBytesHex()));
    // remember the original ClearTextSpan call right after the patch code so uninstall can restore it
    rom.write(p.at + code.length, fromHex(clearOrig));
    rom.write(p.clearSite, fromHex(CLEAR_NEW));
  }
  function uninstallRTL() {
    const rom = App.rom, p = P();
    if (!['on', 'outdated'].includes(rtlStatus())) throw new Error('RTL patch is not installed');
    const saved = rom.bytes(p.at + p.hex.length / 2, 4);
    rom.write(p.hookSite, fromHex(HOOK_ORIG));
    const known = { BPEE: 'fff745fb', BPRE1: 'fdf780ff' }[App.game.patchKey];
    if (toHex(rom.bytes(p.clearSite, 4)) === CLEAR_NEW) rom.write(p.clearSite, saved[1] >= 0xF0 ? saved.slice() : fromHex(known));
    rom.write(p.at, new Uint8Array(0x1000).fill(0xFF));
  }
  // Everything needed for Hebrew in one go (fonts, RTL engine, keyboard).
  function patchAll() {
    installHebrew(fonts());
    if (rtlStatus() !== 'on') installRTL();
    setKeyboardPage(0, HEB_KB);
    App.settings.rtl = 'engine'; App.saveSettings();
  }

  // ---------- Keyboard (naming screen) ----------
  const HEB_KB = ['אבגדהוזח', 'טיכלמנסע', 'פצקרשת .', 'ךםןףץ  ,'];

  // ---------- UI ----------
  let selFont = null, selCode = 0xBB, editPx = null, editW = 6, paint = 1;

  function render(root) {
    root.innerHTML = '';
    const g = App.game;
    if (!g.rtl) {
      root.append(h('div', { class: 'panel warn' }, 'The Hebrew font installer and RTL patch support Pokémon Emerald (US) and FireRed (US) v1.1. ' +
        'This ROM is ' + g.name + (g.isFRLG ? ' revision ' + App.rom.u8[0xBC] : '') + '. The other tabs still work.'));
      return;
    }
    const fl = fonts();
    selFont = selFont && fl.find(f => f.glyphs === selFont.glyphs) || fl[0];

    // --- Setup checklist
    const st = rtlStatus();
    const setup = h('div', { class: 'panel' },
      h('h3', {}, 'Hebrew setup'),
      h('p', { class: 'muted' }, 'Hebrew letters use 27 character codes that are blank in the original fonts (0x37–0x4F, 0x5E, 0x5F), so no English letters are lost.'),
      h('table', { class: 'grid' },
        h('tr', {}, h('th', {}, 'Step'), h('th', {}, 'Status'), h('th', {}, '')),
        ...fl.map(f => h('tr', {}, h('td', {}, 'Hebrew glyphs in font: ' + f.name),
          h('td', {}, hebrewInstalled(f) ? h('span', { class: 'ok' }, 'installed') : h('span', { class: 'muted' }, 'not installed')),
          h('td', {}, h('button', { onclick: () => { installHebrew([f]); toast('Hebrew glyphs written to ' + f.name); render(root); } }, hebrewInstalled(f) ? 'Reinstall' : 'Install')))),
        h('tr', {}, h('td', {}, 'Right-to-left text engine patch (ASM)'),
          h('td', {}, st === 'on' ? h('span', { class: 'ok' }, 'installed') : st === 'off' ? h('span', { class: 'muted' }, 'not installed') : st === 'outdated' ? h('span', { class: 'warn' }, 'older version') : h('span', { class: 'err' }, st)),
          h('td', {}, st === 'on' ? h('button', { onclick: () => { try { uninstallRTL(); toast('RTL patch removed'); } catch (e) { toast(e.message, 'err'); } render(root); } }, 'Uninstall')
            : h('button', { onclick: () => { try { installRTL(); App.settings.rtl = 'engine'; App.saveSettings(); toast('RTL patch installed. Text mode set to "engine".'); } catch (e) { toast(e.message, 'err'); } render(root); } }, st === 'outdated' ? 'Update' : 'Install'))),
        h('tr', {}, h('td', {}, 'Naming-screen keyboard: lowercase page → Hebrew'),
          h('td', {}, keyboardIsHebrew() ? h('span', { class: 'ok' }, 'Hebrew') : h('span', { class: 'muted' }, 'English')),
          h('td', {}, h('button', { onclick: () => { setKeyboardPage(0, HEB_KB); toast('Keyboard page set to Hebrew'); render(root); } }, 'Apply')))),
      h('p', {}, h('button', { class: 'primary', onclick: () => {
        try { patchAll(); toast('Hebrew fonts, RTL patch and keyboard installed'); } catch (e) { toast(e.message, 'err'); }
        render(root);
      } }, 'Do all steps'), ' ',
        h('button', { class: 'primary', onclick: () => App.patchToNewFile() }, '⬇ Patch game → new .gba file')),
      h('details', {}, h('summary', {}, 'How the RTL patch works'),
        h('p', {}, 'The patch hooks the game\'s glyph drawing routine (CopyGlyphToWindow at 0x08004DA0). A "segment" is a run of text between line breaks or position codes. ' +
          'If a segment contains Hebrew, each glyph is drawn at its mirrored position inside that segment, so Hebrew is printed from right to left — including the letter-by-letter typing animation — ' +
          'while numbers and English words inside it keep left-to-right order. Segments without Hebrew are drawn exactly like the original game, so untranslated text still looks right. ' +
          'Menus, cursors and window layouts do not move. The editor can right-align Hebrew dialogue lines (Text tab setting). ' +
          'The code (' + g.rtl.hex.length / 2 + ' bytes) is written at ' + hex(g.rtl.at) + '. Uninstall restores the original bytes. The Text tab preview uses the exact same algorithm.'))
    );

    // --- Glyph browser / editor
    const fontSel = h('select', { onchange: () => { selFont = fl[+fontSel.value]; render(root); } },
      ...fl.map((f, i) => h('option', { value: i, selected: f === selFont }, f.name + '  (glyphs ' + hex(f.glyphs) + ')')));
    const sheet = h('canvas', { class: 'pixel', width: 16 * 18, height: 16 * 18 });
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    for (let c = 0; c < 256; c++) {
      const x = (c & 15) * 18, y = (c >> 4) * 18;
      ctx.fillStyle = Charmap.HEB_CODES.includes(c) ? '#fff4d6' : '#ffffff'; ctx.fillRect(x, y, 18, 18);
      ctx.drawImage(glyphCanvas(selFont, c), x + 1, y + 1);
      if (c === selCode) { ctx.strokeStyle = '#e04040'; ctx.strokeRect(x + 0.5, y + 0.5, 17, 17); }
    }
    sheet.style.width = (16 * 18 * 2) + 'px';
    sheet.onclick = e => {
      const r = sheet.getBoundingClientRect(), s = sheet.width / r.width;
      selCode = (Math.floor((e.clientY - r.top) * s / 18) << 4) | Math.floor((e.clientX - r.left) * s / 18);
      editPx = null; render(root);
    };
    if (!editPx) { editPx = readGlyph(App.rom.u8, selFont.glyphs, selCode, selFont.size); editW = width(selFont, selCode); }
    const ed = h('canvas', { class: 'pixel', width: 16, height: 16, style: { width: '320px', height: '320px' } });
    const drawEd = () => {
      const c = ed.getContext('2d'), img = new ImageData(16, 16);
      for (let i = 0; i < 256; i++) {
        const col = COLORS_EDIT[editPx[i]], n = parseInt(col.slice(1), 16);
        img.data.set([n >> 16, (n >> 8) & 255, n & 255, 255], i * 4);
        if ((i & 15) >= editW) { img.data[i * 4] *= 0.85; img.data[i * 4 + 1] *= 0.85; }
      }
      c.putImageData(img, 0, 0);
    };
    let down = false;
    const put = e => {
      const r = ed.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 16), y = Math.floor((e.clientY - r.top) / r.height * 16);
      if (x >= 0 && y >= 0 && x < 16 && y < 16) { editPx[y * 16 + x] = e.buttons === 2 ? 0 : paint; drawEd(); }
    };
    ed.onmousedown = e => { down = true; put(e); }; ed.onmousemove = e => down && put(e);
    window.addEventListener('mouseup', () => down = false); ed.oncontextmenu = e => e.preventDefault();
    drawEd();
    const ch = Charmap.T[selCode];
    const editor = h('div', { class: 'panel' },
      h('h3', {}, 'Glyph ', hex(selCode, 2), ch ? ' “' + ch + '”' : ' (unused)'),
      h('div', { class: 'row' }, ...['transparent', 'text', 'shadow', 'background'].map((n, i) =>
        h('button', { class: paint === i ? 'sel' : '', style: { borderLeft: '14px solid ' + COLORS_EDIT[i] }, onclick: () => { paint = i; render(root); } }, n))),
      ed,
      h('div', { class: 'row' }, h('label', {}, 'Width (px) ', h('input', { type: 'number', min: 0, max: 16, value: editW, style: { width: '60px' },
        oninput: e => { editW = +e.target.value; drawEd(); } })),
        h('button', { class: 'primary', onclick: () => {
          App.rom.write(selFont.glyphs + selCode * selFont.size, glyphBytes(editPx, selFont.size)); App.rom.u8[selFont.widths + selCode] = editW; App.rom.changed();
          cache = new Map(); toast('Glyph saved'); render(root);
        } }, 'Save glyph'),
        h('button', { onclick: () => { editPx = null; render(root); } }, 'Revert'),
        h('button', { title: 'Copy this glyph and width into the same code of every other font', onclick: () => {
          for (const f of fl) if (f !== selFont) { App.rom.write(f.glyphs + selCode * f.size, glyphBytes(editPx, f.size)); App.rom.u8[f.widths + selCode] = editW; }
          App.rom.changed(); cache = new Map(); toast('Copied to all fonts');
        } }, 'Copy to all fonts')),
      h('p', { class: 'muted' }, 'Left click paints, right click erases. Highlighted cells in the sheet are the Hebrew slots.'));

    // --- keyboard
    const kb = keyboardEditor(root);

    root.append(setup, h('div', { class: 'cols' },
      h('div', { class: 'panel' }, h('h3', {}, 'Font sheet'), fontSel, h('div', { style: { marginTop: '8px' } }, sheet)), editor), kb);
  }

  function keyboardIsHebrew() {
    const o = App.game.offsets.keyboard; return o >= 0 && Charmap.dirClass(App.rom.u8[o]) === 2;
  }
  function setKeyboardPage(page, rows) {
    const o = App.game.offsets.keyboard; if (o < 0) throw new Error('Keyboard table not found');
    const bytes = rows.join('').padEnd(32, ' ').slice(0, 32).split('').map(c => Charmap.ENC.get(c) ?? 0);
    App.rom.write(o + page * 32, Uint8Array.from(bytes));
    redrawKeyboardRows(page);
  }
  // Rebuild the visible key labels of a page from the key table. Slot positions come from the uppercase
  // page (page 1, never changed); each label is centered in its slot with {CLEAR_TO x} so it lines up with the cursor.
  function redrawKeyboardRows(page) {
    const rom = App.rom, rt = App.game.offsets.keyboardRows, kb = App.game.offsets.keyboard;
    if (rt < 0 || page === 1) return;
    const f = fontById(App.game.dialogueFont), w = c => rom.u8[f.widths + c];
    for (let r = 0; r < 4; r++) {
      const ref = rt + (4 + r) * 4, up = rom.ptr(ref), slots = [];
      let x = 0;
      for (let i = up; rom.u8[i] !== 0xFF && i < up + 80;) {
        if (rom.u8[i] === 0xFC && rom.u8[i + 1] === 0x11) { x += rom.u8[i + 2]; i += 3; continue; }
        slots.push({ x, w: w(rom.u8[i]) }); x += w(rom.u8[i]); i++;
      }
      const out = [];
      for (let c = 0; c < Math.min(8, slots.length); c++) {
        const ch = rom.u8[kb + page * 32 + r * 8 + c];
        const nx = Math.max(0, Math.round(slots[c].x + (slots[c].w - w(ch)) / 2));
        out.push(0xFC, 0x13, nx, ch);
      }
      out.push(0xFF);
      const myRef = rt + (page * 4 + r) * 4, cur = rom.ptr(myRef);
      const curLen = rom.u8.indexOf(0xFF, cur) - cur + 1;
      rom.replaceData(cur, curLen, Uint8Array.from(out), [myRef]);
    }
  }
  function keyboardEditor(root) {
    const o = App.game.offsets.keyboard;
    if (o < 0) return h('div', { class: 'panel' }, 'Naming-screen keyboard table not found.');
    const pages = ['Page 1 (lowercase)', 'Page 2 (uppercase)', 'Page 3 (symbols)'];
    return h('div', { class: 'panel' }, h('h3', {}, 'Naming-screen keyboard (' + hex(o) + ')'),
      h('p', { class: 'muted' }, 'Each page is 4 rows × 8 keys. Type one character per key.'),
      h('div', { class: 'cols' }, ...pages.map((name, p) => h('div', {}, h('b', {}, name),
        ...[0, 1, 2, 3].map(r => h('div', { class: 'kbrow' }, ...[0, 1, 2, 3, 4, 5, 6, 7].map(c => {
          const off = o + p * 32 + r * 8 + c, cur = Charmap.T[App.rom.u8[off]] ?? '?';
          return h('input', { class: 'kbkey', value: cur, maxlength: 2, dir: 'auto', onchange: e => {
            const b = Charmap.ENC.get(e.target.value || ' ');
            if (b == null) { toast('Not in font: ' + e.target.value, 'err'); e.target.value = cur; return; }
            App.rom.w8(off, b);
          } });
        })))))));
  }

  return { readGlyph, glyphBytes, fonts, fontById, width, glyphCanvas, render, installHebrew, rtlStatus, installRTL, uninstallRTL, patchAll, metrics, buildHebrewGlyph };
})();
