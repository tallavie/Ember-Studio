// Objects on maps (people, item balls, trainers, signs, hidden items, doors, triggers), shared by the map editor and
// the world view: real overworld sprites and icons on the map, a plain-language description ("who is it"), the
// conversation of a script with its branches (editable lines), trainer / item / door editing, a sprite gallery and
// templates for new objects.
'use strict';

const Objects = (() => {
  const R = () => App.rom, G = () => App.game, O = () => App.game.offsets, L = () => App.getLists();
  const ITEM_BALL_GFX = 92;
  const KIND_NAME = { obj: 'person', warp: 'door / warp', coord: 'trigger', bg: 'sign' };

  // ---------- overworld sprites ----------
  let ver = -1, sprCache = new Map(), palCache = null, gfxCount = -1;
  function fresh() { if (ver !== App.romVersion) { ver = App.romVersion; sprCache.clear(); palCache = null; gfxCount = -1; scanCache = null; } }
  function isInfo(p) {
    const r = R(); if (p < 0 || p + 36 > r.size) return false;
    const w = r.s16(p + 8), hh = r.s16(p + 10);
    return r.r16(p) === 0xFFFF && (r.r16(p + 2) & 0xFF00) === 0x1100 && [16, 32, 64, 128].includes(w) && [16, 32, 64].includes(hh);
  }
  function count() {
    fresh();
    if (gfxCount >= 0) return gfxCount;
    const r = R(); let n = 0;
    if (O().owGfx < 0) return gfxCount = 0;
    while (n < 256 && isInfo(r.ptr(O().owGfx + n * 4))) n++;
    return gfxCount = n;
  }
  function palette(tag) {
    fresh();
    if (!palCache) {
      palCache = new Map(); const r = R(), t = r.ptr(O().owPalRef);
      for (let i = 0; t >= 0 && i < 64; i++) { const p = r.ptr(t + i * 8); if (p < 0) break; palCache.set(r.r16(t + i * 8 + 4), Gfx.readPal(r.u8, p)); }
    }
    return palCache.get(tag);
  }
  const FACING = { 7: 'up', 9: 'left', 10: 'right', 15: 'up', 16: 'up', 21: 'up' };
  // canvas of a sprite's first frame (facing: down / up / left / right), or null
  function sprite(gfx, facing = 'down') {
    if (gfx >= count()) return null;
    const key = gfx + facing; if (sprCache.has(key)) return sprCache.get(key);
    const r = R(), info = r.ptr(O().owGfx + gfx * 4), w = r.s16(info + 8), hh = r.s16(info + 10);
    const still = (r.u8[info + 12] & 0x40) || w > 32, images = r.ptr(info + 28);
    const frame = still ? 0 : facing === 'up' ? 1 : facing === 'left' || facing === 'right' ? 2 : 0;
    let data = images >= 0 ? r.ptr(images + frame * 8) : -1;
    if (data < 0 && images >= 0) data = r.ptr(images);
    const pal = palette(r.r16(info + 2));
    if (data < 0 || !pal) { sprCache.set(key, null); return null; }
    const img = new ImageData(w, hh), tw = w / 8, flip = facing === 'right' && !still;
    for (let t = 0; t < tw * (hh / 8); t++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const b = r.u8[data + t * 32 + y * 4 + (x >> 1)], c = x & 1 ? b >> 4 : b & 15;
      if (!c) continue;
      let px = (t % tw) * 8 + x; const py = Math.floor(t / tw) * 8 + y; if (flip) px = w - 1 - px;
      const col = pal[c], o = (py * w + px) * 4;
      img.data[o] = (col & 31) << 3; img.data[o + 1] = ((col >> 5) & 31) << 3; img.data[o + 2] = ((col >> 10) & 31) << 3; img.data[o + 3] = 255;
    }
    const cv = h('canvas', { width: w, height: hh }); cv.getContext('2d').putImageData(img, 0, 0);
    sprCache.set(key, cv); return cv;
  }

  // ---------- names of sprites (FireRed) + the hack's own characters (data/kachol_lavan/game.json) ----------
  const GFX_NAMES = { 0: 'Player (boy)', 1: 'Player (boy) on bike', 2: 'Player (boy) surfing', 3: 'Player (boy) field move', 4: 'Player (boy) fishing', 5: 'Player (boy) VS Seeker', 6: 'Player (boy) VS Seeker, bike',
    7: 'Player (girl)', 8: 'Player (girl) on bike', 9: 'Player (girl) surfing', 10: 'Player (girl) field move', 11: 'Player (girl) fishing', 12: 'Player (girl) VS Seeker', 13: 'Player (girl) VS Seeker, bike',
    14: 'Brendan', 15: 'May', 34: 'Old man lying down', 92: 'Item ball', 93: 'Book / town map', 94: 'Box', 95: 'Cut tree', 96: 'Rock Smash rock', 97: 'Strength boulder', 98: 'Fossil',
    99: 'Ruby', 100: 'Sapphire', 101: 'Old Amber', 102: 'Gym sign', 103: 'Sign', 104: 'Wooden sign', 105: 'Clipboard', 106: 'Cone', 107: 'Lapras', 108: 'S.S. Anne', 109: 'Snorlax',
    136: 'Zapdos', 137: 'Moltres', 138: 'Articuno', 144: 'Lugia', 145: 'Ho-Oh', 148: 'Deoxys', 149: 'Deoxys', 150: 'Deoxys', 151: 'Seagallop ferry' };
  const OBJECT_GFX = new Set([92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 108, 151]);
  const group = gfx => OBJECT_GFX.has(gfx) ? 'objects' : gfx >= 107 ? 'pokemon' : 'people';
  let chars = {};
  fetch('data/kachol_lavan/game.json', { cache: 'reload' }).then(r => r.ok ? r.json() : null).then(j => {
    if (!j || !j.characters) return;
    for (const [k, c] of Object.entries(j.characters)) if (c.gfx != null) chars[c.gfx] = (c.name || k[0].toUpperCase() + k.slice(1)).replace(/\s*[–(].*$/, '');
  }).catch(() => {});
  const gfxName = gfx => chars[gfx] || GFX_NAMES[gfx] || (gfx >= count() ? Tf('Sprite {n}', { n: gfx }) : Tf(group(gfx) === 'pokemon' ? 'Pokémon sprite #{n}' : 'Person #{n}', { n: gfx }));

  // custom names, kept in the editor only (browser storage)
  const NAMES_KEY = 'kl-object-names';
  const nameKey = (g, n, e) => g + '.' + n + ':' + e.kind + ':' + (e.kind === 'obj' ? 'id' + R().u8[e.off] : e.i);
  function customName(g, n, e) { try { return (JSON.parse(localStorage.getItem(NAMES_KEY) || '{}'))[nameKey(g, n, e)] || ''; } catch (x) { return ''; } }
  function setCustomName(g, n, e, v) {
    try { const m = JSON.parse(localStorage.getItem(NAMES_KEY) || '{}'); if (v) m[nameKey(g, n, e)] = v; else delete m[nameKey(g, n, e)]; localStorage.setItem(NAMES_KEY, JSON.stringify(m)); } catch (x) { toast('Could not save the name in this browser', 'err'); }
  }

  // ---------- text helpers ----------
  const rtl = () => App.settings.rtl;
  function textOf(p) { try { return Charmap.decodeEditable(R().u8, p, rtl()).text; } catch (x) { return ''; } }
  function firstLine(p, max = 42) {
    const t = textOf(p).split(/\\[nlp]|\n/).map(s => s.replace(/\{([A-Z_]+)\}/g, '$1').replace(/\{[^}]*\}/g, '').trim()).find(Boolean) || '';
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }
  const enc = s => Charmap.encode(s, { rtl: rtl() });
  const itemName = i => L().items[i] || 'item ' + i;
  const spName = s => L().species[s] || '#' + s;
  const mapLabel = (g, n) => { const hp = (G().mapGroups[g] || [])[n]; return hp == null ? 'map ' + g + '.' + n + ' (missing)' : Game.mapName(R(), G(), R().u8[hp + 20]) + ' ' + g + '.' + n; };
  const flagHex = f => '0x' + f.toString(16).toUpperCase();
  function flagMeaning(f) {
    if (f >= 0x500 && f < 0x800) return 'beat trainer #' + (f - 0x500);
    if (G().isBadge(f)) return 'badge ' + (f - G().badgeFlag + 1);
    if (f >= 0x800) return 'game system flag';
    if (f < 0x20) return 'temporary flag (reset on every map)';
    return 'story flag';
  }

  // ---------- trainers ----------
  let classCache = null, classVer = -1;
  function classNames() {
    if (classCache && classVer === App.romVersion) return classCache;
    const r = R(), p = r.ptr(O().classRef), out = [];
    classCache = out; classVer = App.romVersion;
    if (p < 0) return out;
    for (let i = 0; i < G().classCount; i++) out.push(Charmap.decode(r.u8, p + i * 13, 13).text);
    return out;
  }
  function trainer(id) {
    const r = R(), o = G().offsets.trainers; if (o < 0) return null;
    const b = o + id * 40, flags = r.u8[b], size = flags & 1 ? 16 : 8, pp = r.ptr(b + 36), n = r.u8[b + 32];
    const team = [];
    for (let i = 0; i < n && pp >= 0 && i < 6; i++) team.push({ off: pp + i * size, lvl: r.r16(pp + i * size + 2), sp: r.r16(pp + i * size + 4) });
    return { id, b, flags, size, cls: r.u8[b + 1], name: Charmap.decode(r.u8, b + 4, 12).text, team, party: pp };
  }
  // replace the team (keeps IVs, held items and moves of the members that stay)
  function setTeam(id, list) {
    const r = R(), t = trainer(id), arr = new Uint8Array(list.length * t.size), dv = new DataView(arr.buffer);
    list.forEach((m, i) => {
      const old = t.team[i]; if (old) arr.set(r.u8.subarray(old.off, old.off + t.size), i * t.size);
      dv.setUint16(i * t.size + 2, m.lvl, true); dv.setUint16(i * t.size + 4, m.sp, true);
    });
    if (list.length <= t.team.length && t.party >= 0) r.write(t.party, arr); else r.wptr(t.b + 36, r.writeNew(arr));
    r.w8(t.b + 32, list.length);
  }
  // class + its picture, music and AI from the first trainer of that class
  function setClass(id, cls) {
    const r = R(), o = G().offsets.trainers, b = o + id * 40;
    r.w8(b + 1, cls);
    for (let k = 1; k < 743; k++) if (k !== id && r.u8[o + k * 40 + 1] === cls) { r.w8(b + 2, r.u8[o + k * 40 + 2]); r.w8(b + 3, r.u8[o + k * 40 + 3]); r.w32(b + 28, r.r32(o + k * 40 + 28)); break; }
  }
  function setTrainerName(id, s) {
    const b = enc(s); if (b.length > 12) throw new Error('The name is too long (up to 11 letters)');
    const a = new Uint8Array(12); a.set(b); R().write(G().offsets.trainers + id * 40 + 4, a);
  }

  // ---------- scripts: every command, used flags / trainers, and the conversation tree ----------
  function forEach(start, fn, seen = new Set(), depth = 0) {
    const r = R(), LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN;
    if (start < 0 || seen.has(start) || depth > 8) return; seen.add(start);
    for (let p = start, end = start + 900; p < end && p < r.size - 24;) {
      const op = r.u8[p]; fn(op, p);
      if (op === 0x02 || op === 0x03) return;
      if (op === 0x04 || op === 0x05) { forEach(r.ptr(p + 1), fn, seen, depth + 1); if (op === 0x05) return; }
      if (op === 0x06 || op === 0x07) forEach(r.ptr(p + 2), fn, seen, depth + 1);
      const n = op === 0x5C ? (TL[r.u8[p + 1]] || 0) : LEN[op]; if (!n) return; p += n;
    }
  }
  let scanCache = null;
  // flags and trainers used anywhere on the maps
  function usage() {
    fresh(); if (scanCache) return scanCache;
    const r = R(), flags = new Map(), hidden = new Map(), trainers = new Set(), trainerAt = new Map(), seen = new Set();
    let here = null;                                            // the object whose script is being walked
    const addFlag = (f, what) => { if (!flags.has(f)) flags.set(f, []); flags.get(f).push(what); };
    const visit = (op, p) => {
      if (op === 0x29 || op === 0x2A || op === 0x2B) addFlag(r.r16(p + 1), 'script');
      else if (op === 0x5C) { const id = r.r16(p + 2); trainers.add(id); if (here) { if (!trainerAt.has(id)) trainerAt.set(id, []); if (!trainerAt.get(id).some(x => x.g === here.g && x.n === here.n && x.i === here.i)) trainerAt.get(id).push(here); } }
      else if (op >= 0x60 && op <= 0x62) trainers.add(r.r16(p + 1));
    };
    G().mapGroups.forEach((maps, g) => maps.forEach((hp, n) => {
      const ev = r.ptr(hp + 4);
      if (ev >= 0) {
        const po = r.ptr(ev + 4), pc = r.ptr(ev + 12), pb = r.ptr(ev + 16);
        for (let i = 0; i < r.u8[ev] && po >= 0; i++) { const f = r.r16(po + i * 24 + 20); if (f) addFlag(f, { g, n, i }); here = { g, n, i, kind: 'obj' }; forEach(r.ptr(po + i * 24 + 16), visit, seen); here = null; }
        for (let i = 0; i < r.u8[ev + 2] && pc >= 0; i++) forEach(r.ptr(pc + i * 16 + 12), visit, seen);
        for (let i = 0; i < r.u8[ev + 3] && pb >= 0; i++) {
          const e = pb + i * 12;
          if (r.u8[e + 5] === 7) hidden.set(r.u8[e + 10], (hidden.get(r.u8[e + 10]) || 0) + 1); else if (r.u8[e + 5] < 5) forEach(r.ptr(e + 8), visit, seen);
        }
      }
      const ms = r.ptr(hp + 8);
      if (ms >= 0) for (let i = 0; i < 10 && r.u8[ms + i * 5]; i++) {
        const t = r.u8[ms + i * 5], p = r.ptr(ms + i * 5 + 1);
        if ([1, 3, 5, 7].includes(t)) forEach(p, visit, seen);
        else for (let q = p, k = 0; q >= 0 && r.r16(q) && k < 20; q += 8, k++) forEach(r.ptr(q + 4), visit, seen);
      }
    }));
    return scanCache = { flags, hidden, trainers, trainerAt };
  }
  const reserved = { flags: new Set(), trainers: new Set() };          // handed out in this session, maybe not written yet
  // a flag no script uses: FireRed 0x371-0x3E7; Emerald's unused flags 0x020-0x04F (FLAG_UNUSED_0x020…)
  function freeFlag() {
    const u = usage(), [hi, lo] = G().isEmerald ? [0x04F, 0x020] : [0x3E7, 0x371];
    for (let f = hi; f >= lo; f--) if (!u.flags.has(f) && !reserved.flags.has(f)) { reserved.flags.add(f); return f; }
    throw new Error('No free flag left');
  }
  function freeHidden() { const u = usage(); for (let k = 0; k < 256; k++) if (!u.hidden.has(k)) return k; throw new Error('No free hidden-item flag left'); }
  function freeTrainer() { const u = usage(); for (let id = 1; id < 743; id++) if (!u.trainers.has(id) && !reserved.trainers.has(id)) { reserved.trainers.add(id); return id; } throw new Error('No unused trainer left'); }

  // item ball: setorcopyvar 0x8000 item; setorcopyvar 0x8001 qty; callstd 1 (finditem)
  function itemBall(sp) {
    const r = R();
    if (sp < 0 || r.u8[sp] !== 0x1A || r.r16(sp + 1) !== 0x8000 || r.u8[sp + 5] !== 0x1A || r.r16(sp + 6) !== 0x8001 || r.u8[sp + 10] !== 0x09 || r.u8[sp + 11] !== 0x01) return null;
    return { item: r.r16(sp + 3), qty: r.r16(sp + 8), itemOff: sp + 3, qtyOff: sp + 8 };
  }
  const COND = ['<', '=', '>', '≤', '≥', '≠'];
  // the conversation: [{t:'text', p, yesno}, {t:'act', icon, text}, {t:'branch', label, kids}, {t:'trainer', ...}]
  function analyze(sp) {
    const r = R(), seen = new Set(), LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN;
    function cond(st, c) {
      const m = st.cmp; if (!m) return 'If (condition ' + c + '):';
      if (m.var === 0x800D && st.yesno && (c === 1 || c === 5)) return 'If you answer ' + ((m.val === 1) === (c === 1) ? 'YES' : 'NO') + ':';
      if (m.flag != null) return c === 1 ? Tf('If flag {f} is set ({what} already happened):', { f: flagHex(m.flag), what: T(flagMeaning(m.flag)) }) : Tf('If flag {f} is not set yet:', { f: flagHex(m.flag) });
      if (m.trainer != null) return c === 1 ? 'If you already beat this trainer:' : 'If you did not beat this trainer yet:';
      if (m.item != null) return c === 1 ? Tf('If you have {item}:', { item: itemName(m.item) }) : Tf("If you don't have {item}:", { item: itemName(m.item) });
      return 'If var ' + flagHex(m.var) + ' ' + (COND[c] || '?') + ' ' + m.val + ':';
    }
    function seq(start, depth) {
      const out = [];
      if (start < 0 || depth > 7) return out;
      if (seen.has(start)) { out.push({ t: 'act', icon: '↩', text: 'continues as shown above' }); return out; }
      seen.add(start);
      const st = { v8000: 0, v8001: 1, cmp: null, yesno: false, text: -1 };
      const act = (icon, text) => out.push({ t: 'act', icon, text });
      for (let p = start, guard = 0; guard < 300 && p < r.size - 24; guard++) {
        const op = r.u8[p];
        switch (op) {
          case 0x02: case 0x03: return out;
          case 0x04: out.push(...seq(r.ptr(p + 1), depth + 1)); break;
          case 0x05: out.push(...seq(r.ptr(p + 1), depth + 1)); return out;
          case 0x06: case 0x07: {
            const label = cond(st, r.u8[p + 1]), kids = seq(r.ptr(p + 2), depth + 1);
            out.push({ t: 'branch', label, kids });
            if (op === 0x06) { const rest = seq(p + 6, depth + 1); if (rest.length) out.push({ t: 'branch', label: 'Otherwise:', kids: rest }); return out; }
            break;
          }
          case 0x0F: if (r.u8[p + 1] === 0) st.text = r.ptr(p + 2); break;
          case 0x09: {
            const n = r.u8[p + 1];
            if (n >= 2 && n <= 6 && st.text >= 0) { out.push({ t: 'text', p: st.text, yesno: n === 5, sign: n === 3 }); st.yesno = n === 5; st.text = -1; }
            else if (n === 0 || n === 9) act('🎁', Tf('gives {item}', { item: itemName(st.v8000) + (st.v8001 > 1 ? ' ×' + st.v8001 : '') }));
            else if (n === 1) act('🎁', Tf('you find {item}', { item: itemName(st.v8000) + (st.v8001 > 1 ? ' ×' + st.v8001 : '') }));
            break;
          }
          case 0x67: { const t = r.ptr(p + 1); if (t >= 0) out.push({ t: 'text', p: t }); break; }
          case 0x6E: st.yesno = true; break;
          case 0x16: case 0x1A: { const v = r.r16(p + 1); if (v === 0x8000) st.v8000 = r.r16(p + 3); else if (v === 0x8001) st.v8001 = r.r16(p + 3); break; }
          case 0x21: st.cmp = { var: r.r16(p + 1), val: r.r16(p + 3) }; break;
          case 0x2B: st.cmp = { flag: r.r16(p + 1) }; break;
          case 0x60: st.cmp = { trainer: r.r16(p + 1) }; break;
          case 0x47: st.cmp = { item: r.r16(p + 1) }; break;
          case 0x29: act('🚩', Tf('sets flag {f} ({what})', { f: flagHex(r.r16(p + 1)), what: T(flagMeaning(r.r16(p + 1))) })); break;
          case 0x2A: act('🏳', Tf('clears flag {f}', { f: flagHex(r.r16(p + 1)) })); break;
          case 0x44: act('🎁', Tf('gives {item} (silently)', { item: itemName(r.r16(p + 1)) + (r.r16(p + 3) > 1 ? ' ×' + r.r16(p + 3) : '') })); break;
          case 0x45: act('➖', Tf('takes {item}', { item: itemName(r.r16(p + 1)) + (r.r16(p + 3) > 1 ? ' ×' + r.r16(p + 3) : '') })); break;
          case 0x79: act('🎁', Tf('gives the Pokémon {sp} (level {lv})', { sp: spName(r.r16(p + 1)), lv: r.u8[p + 3] })); break;
          case 0x7A: act('🥚', Tf('gives an egg of {sp}', { sp: spName(r.r16(p + 1)) })); break;
          case 0xB6: act('⚔', Tf('starts a battle against a wild {sp} (level {lv})', { sp: spName(r.r16(p + 1)), lv: r.u8[p + 3] })); break;
          case 0x86: act('🛒', 'opens a shop'); break;
          case 0x39: case 0x3A: case 0x3B: case 0x3C: case 0x3D: act('🚪', Tf('warps you to {map}', { map: mapLabel(r.u8[p + 1], r.u8[p + 2]) })); break;
          case 0x4F: act('🚶', r.r16(p + 1) === 0xFF ? T('moves the player') : Tf('moves person #{n}', { n: r.r16(p + 1) })); break;
          case 0x53: act('👻', Tf('person #{n} disappears', { n: r.r16(p + 1) })); break;
          case 0x55: act('✨', Tf('person #{n} appears', { n: r.r16(p + 1) })); break;
          case 0x25: act('⚙', r.r16(p + 1) === 0 ? T('heals your Pokémon') : Tf('runs special {n}', { n: flagHex(r.r16(p + 1)) })); break;
          case 0x33: act('🎵', Tf('plays song {n}', { n: r.r16(p + 1) })); break;
          case 0x9F: act('🏥', 'sets where you return after losing'); break;
          case 0xD0: act('🗺', 'unlocks Fly to a place'); break;
          case 0x6F: case 0x70: act('📋', 'shows a menu'); break;
          case 0x5C: {
            const type = r.u8[p + 1], id = r.r16(p + 2), at = k => r.ptr(p + k), node = { t: 'trainer', id, type, texts: [] };
            if (type === 3) node.texts.push(['Defeat line', at(6)]);
            else if (type === 9) node.texts.push(['Line when you win', at(6)], ['Line when you lose', at(10)]);
            else node.texts.push(['Before the battle', at(6)], ['When you beat them', at(10)]);
            if ([4, 6, 7, 8].includes(type)) node.texts.push(['If you have only one Pokémon', at(14)]);
            out.push(node);
            const after = [1, 2].includes(type) ? at(14) : [6, 8].includes(type) ? at(18) : -1;
            if (after >= 0) out.push({ t: 'branch', label: 'Right after the battle:', kids: seq(after, depth + 1) });
            const rest = seq(p + (TL[type] || 14), depth + 1);
            if (rest.length) out.push({ t: 'branch', label: 'After you beat them, when you talk again:', kids: rest });
            return out;
          }
          default: break;
        }
        const n = op === 0x5C ? 0 : LEN[op];
        if (!n) { act('…', Tf('more commands the editor does not show (command {n})', { n: flagHex(op) })); return out; }
        p += n;
      }
      return out;
    }
    return seq(sp, 0);
  }
  const findNode = (tree, t) => { for (const x of tree) { if (x.t === t) return x; if (x.kids) { const y = findNode(x.kids, t); if (y) return y; } } return null; };
  const allTexts = tree => tree.flatMap(x => x.t === 'text' ? [x.p] : x.t === 'trainer' ? x.texts.map(t => t[1]) : x.kids ? allTexts(x.kids) : []);

  // ---------- describing an event ----------
  function scriptOf(e) { const r = R(); return e.kind === 'obj' ? r.ptr(e.off + 16) : e.kind === 'coord' ? r.ptr(e.off + 12) : e.kind === 'bg' && r.u8[e.off + 5] < 5 ? r.ptr(e.off + 8) : -1; }
  function info(g, n, e) {
    const r = R(), o = e.off, own = customName(g, n, e), d = { kind: e.kind, icon: '', type: KIND_NAME[e.kind], who: '', says: '' };
    const sp = scriptOf(e);
    if (e.kind === 'obj') {
      const ball = itemBall(sp);
      d.gfx = r.u8[o + 1];
      if (ball) { d.type = 'item ball'; d.icon = '●'; d.who = itemName(ball.item) + (ball.qty > 1 ? ' ×' + ball.qty : ''); d.ball = ball; }
      else {
        const tree = sp >= 0 ? analyze(sp) : [], tr = findNode(tree, 'trainer');
        d.tree = tree;
        if (tr) { const t = trainer(tr.id); d.type = 'trainer'; d.trainer = tr; d.who = t ? ((classNames()[t.cls] || '') + ' ' + t.name).trim() : 'trainer #' + tr.id; const p = tr.texts[0] && tr.texts[0][1]; if (p >= 0) { d.says = firstLine(p); d.textPtr = p; } }
        else { d.type = 'person'; d.who = gfxName(d.gfx); const t = allTexts(tree)[0]; if (t >= 0) { d.says = firstLine(t); d.textPtr = t; } }
      }
    } else if (e.kind === 'warp') { d.icon = '🚪'; d.who = '→ ' + mapLabel(r.u8[o + 7], r.u8[o + 6]); }
    else if (e.kind === 'coord') { d.icon = '⚡'; d.who = 'runs when var ' + flagHex(r.r16(o + 6)) + ' = ' + r.r16(o + 8); const t = sp >= 0 ? allTexts(analyze(sp))[0] : -1; if (t >= 0) d.says = firstLine(t); }
    else if (r.u8[o + 5] === 7) { d.type = 'hidden item'; d.icon = '✨'; d.who = itemName(r.r16(o + 8)) + (((r.u8[o + 11] & 0x7F) > 1) ? ' ×' + (r.u8[o + 11] & 0x7F) : ''); }
    else { d.type = 'sign'; d.icon = '📋'; const t = sp >= 0 ? allTexts(analyze(sp))[0] : -1; if (t >= 0) { d.says = firstLine(t); d.textPtr = t; } }
    if (own) d.who = own + (d.who && e.kind === 'obj' && d.type === 'person' ? '' : ' · ' + d.who);
    const tt = T(d.type); d.title = (I18N.lang === 'en' ? tt[0].toUpperCase() + tt.slice(1) : tt) + (d.who ? ': ' + d.who : '') + (d.says ? ' — “' + d.says + '”' : '');
    return d;
  }
  const tooltip = (g, n, e) => { try { return info(g, n, e).title; } catch (x) { return KIND_NAME[e.kind]; } };

  // ---------- drawing on the map ----------
  const BG = { warp: 'rgba(42,208,74,.55)', coord: 'rgba(255,176,0,.5)', bg: 'rgba(138,92,255,.5)', obj: 'rgba(255,60,140,.6)' };
  // e at screen (sx, sy), one block = s pixels
  function draw(ctx, e, sx, sy, s, opts = {}) {
    const r = R(), o = e.off;
    ctx.save();
    if (e.kind === 'obj') {
      const gfx = r.u8[o + 1], cv = s >= 6 ? sprite(gfx, FACING[r.u8[o + 9]] || 'down') : null;
      if (cv) {
        const z = s / 16, w = cv.width * z, hh = cv.height * z;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cv, sx + s / 2 - w / 2, sy + s - hh, w, hh);
      } else { ctx.fillStyle = BG.obj; ctx.fillRect(sx + s * .15, sy + s * .15, s * .7, s * .7); }
    } else {
      const hiddenItem = e.kind === 'bg' && r.u8[o + 5] === 7;
      if (hiddenItem) ctx.globalAlpha = 0.55;
      ctx.fillStyle = BG[e.kind]; ctx.fillRect(sx + 1, sy + 1, s - 2, s - 2);
      if (s >= 10) { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 1.5, sy + 1.5, s - 3, s - 3); }
      if (s >= 10) {
        const icon = e.kind === 'warp' ? '🚪' : e.kind === 'coord' ? '⚡' : hiddenItem ? '✨' : '📋';
        ctx.font = Math.round(s * 0.7) + 'px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icon, sx + s / 2, sy + s / 2 + s * 0.04);
      }
    }
    ctx.restore();
    if (opts.selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(sx - .5, sy - .5, s + 1, s + 1); }
    if (opts.blocking) { ctx.strokeStyle = '#f00'; ctx.lineWidth = 3; ctx.strokeRect(sx, sy, s, s); ctx.lineWidth = 1; }
  }
  // the area a walking person may move in (faint), for the selected person
  const WANDERS = new Set([2, 3, 4, 5, 6, 25, 26, 27, 28]);
  function drawArea(ctx, e, sx, sy, s) {
    if (e.kind !== 'obj') return;
    const r = R(), mv = r.u8[e.off + 9]; if (!WANDERS.has(mv)) return;
    let rx = r.u8[e.off + 10] & 15, ry = r.u8[e.off + 10] >> 4;
    if ([3, 4, 25, 26].includes(mv)) rx = 0; if ([5, 6, 27, 28].includes(mv)) ry = 0;
    ctx.fillStyle = 'rgba(255,255,140,.22)'; ctx.fillRect(sx - rx * s, sy - ry * s, (2 * rx + 1) * s, (2 * ry + 1) * s);
    ctx.strokeStyle = 'rgba(255,240,80,.9)'; ctx.setLineDash([4, 3]); ctx.strokeRect(sx - rx * s + .5, sy - ry * s + .5, (2 * rx + 1) * s - 1, (2 * ry + 1) * s - 1); ctx.setLineDash([]);
  }

  // ---------- sprite gallery ----------
  function gallery(cur, onPick) {
    const back = h('div', { class: 'modal-back', onclick: ev => { if (ev.target === back) back.remove(); } });
    const q = h('input', { type: 'search', placeholder: 'Search by name or number…' });
    const body = h('div', { class: 'ob-gallery' });
    const fill = () => {
      body.innerHTML = '';
      const s = q.value.trim().toLowerCase();
      for (const [gk, gl] of [['people', '👤 People'], ['pokemon', '🐾 Pokémon'], ['objects', '📦 Objects']]) {
        const cells = [];
        for (let i = 0; i < count(); i++) {
          if (group(i) !== gk) continue;
          const nm = gfxName(i); if (s && !nm.toLowerCase().includes(s) && String(i) !== s) continue;
          const cv = sprite(i); const box = h('button', { class: 'ob-cell' + (i === cur ? ' sel' : ''), title: i + ': ' + nm, onclick: () => { back.remove(); onPick(i); } });
          if (cv) { const c2 = h('canvas', { width: cv.width, height: cv.height, class: 'pixel' }); c2.getContext('2d').drawImage(cv, 0, 0); c2.style.width = Math.min(64, cv.width * 2) + 'px'; box.append(c2); }
          box.append(h('span', {}, (chars[i] ? '★ ' : '') + i + ' ' + (GFX_NAMES[i] || chars[i] ? nm : '')));
          cells.push(box);
        }
        if (cells.length) body.append(h('h4', {}, gl), h('div', { class: 'ob-grid' }, cells));
      }
    };
    q.oninput = fill; fill();
    back.append(h('div', { class: 'panel modal ob-modal' }, h('div', { class: 'row' }, h('h3', {}, 'Choose a sprite'), q, h('button', { onclick: () => back.remove() }, '✕')),
      h('p', { class: 'muted' }, '★ = the game\'s own characters (from data/kachol_lavan/game.json)'), body));
    document.body.append(back); q.focus();
  }

  // ---------- the side panel ----------
  const MOVES = [[8, 'Stands still, facing down'], [7, 'Stands still, facing up'], [9, 'Stands still, facing left'], [10, 'Stands still, facing right'],
    [1, 'Looks around'], [13, 'Looks up and down'], [14, 'Looks left and right'], [24, 'Turns around in circles'],
    [2, 'Walks around in an area'], [3, 'Walks up and down (randomly)'], [5, 'Walks left and right (randomly)'],
    [25, 'Paces up and down'], [27, 'Paces left and right'], [0, 'No movement']];
  function itemPicker(value, onPick) {
    const items = L().items, id = 'ob-items-' + Math.random().toString(36).slice(2);
    const inp = h('input', { list: id, value: value ? items[value] || '' : '', placeholder: T('none — type to search…'), style: { width: '170px' }, dir: 'auto' });
    inp.onchange = () => {
      const v = inp.value.trim(); if (!v) { onPick(0); return; }
      const i = items.findIndex(x => x.toLowerCase() === v.toLowerCase());
      if (i > 0) onPick(i); else { toast(Tf('No item named "{name}"', { name: v }), 'err'); inp.value = value ? items[value] || '' : ''; }
    };
    return h('span', {}, inp, h('datalist', { id }, items.map((x, i) => i ? h('option', { value: x }) : null)));
  }
  function textBubble(p, ctx, label) {
    const box = h('div', { class: 'ob-say' });
    const show = () => {
      box.innerHTML = '';
      let pv = null; try { pv = TextTab.preview(R().u8.slice(p, p + (Charmap.scanString(R().u8, p, 0) || 200) + 1), G().dialogueFont, 1); } catch (x) { pv = h('span', { class: 'muted' }, textOf(p)); }
      box.append(label ? h('div', { class: 'ob-label' }, label) : '', h('div', { class: 'ob-bubble', title: 'Click to edit', onclick: edit }, pv || h('i', {}, '(empty)')));
    };
    const edit = () => {
      box.innerHTML = '';
      const ta = h('textarea', { dir: 'auto', rows: 3 }); ta.value = textOf(p);
      const pv = h('div', { class: 'ob-preview' });
      const upd = () => { pv.innerHTML = ''; try { pv.append(TextTab.preview(enc(ta.value), G().dialogueFont, 1)); } catch (x) { pv.textContent = x.message; } };
      ta.oninput = upd; upd();
      box.append(label ? h('div', { class: 'ob-label' }, label) : '', ta, pv, h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => { let np = p; if (ctx.commit('edit text', () => { np = TextTab.saveAt(p, ta.value); })) { if (np !== p) toast('Text saved (moved to ' + hex(np) + ')'); else toast('Text saved'); ctx.refresh(); } } }, 'Save'),
        h('button', { onclick: show }, 'Cancel')));
      ta.focus();
    };
    show(); return box;
  }
  // edit what a person / sign says right on the map: a speech bubble at (cx, cy) on the screen
  function inlineText(g, n, e, cx, cy, commit, done) {
    const d = info(g, n, e); if (!(d.textPtr >= 0)) { toast(T('This one says nothing that can be edited here'), 'err'); return; }
    document.querySelectorAll('.ob-inline').forEach(x => x.remove());
    const p = d.textPtr, ta = h('textarea', { dir: 'auto', rows: 3 }); ta.value = textOf(p);
    const pv = h('div', { class: 'ob-preview' });
    const upd = () => { pv.innerHTML = ''; try { pv.append(TextTab.preview(enc(ta.value), G().dialogueFont, 1)); } catch (x) { pv.textContent = x.message; } };
    const close = () => { box.remove(); window.removeEventListener('keydown', key, true); };
    const save = () => { let np = p; if (commit('edit text', () => { np = TextTab.saveAt(p, ta.value); })) { toast(T('Text saved')); close(); done && done(); } };
    const key = ev => { if (ev.key === 'Escape') { close(); ev.stopPropagation(); } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { save(); ev.preventDefault(); } };
    ta.oninput = upd; upd();
    const box = h('div', { class: 'ob-inline' }, h('div', { class: 'ob-inline-who' }, (d.icon || '💬') + ' ' + (d.who || T(d.type))), ta, pv,
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: save }, T('Save')), h('button', { onclick: close }, T('Cancel')), h('span', { class: 'muted', style: { fontSize: '11px' } }, 'Ctrl+Enter · Esc')));
    document.body.append(box);
    const W = 340, left = Math.max(8, Math.min(innerWidth - W - 8, cx - W / 2)); box.style.left = left + 'px';
    box.style.width = W + 'px'; const hh = box.offsetHeight; box.style.top = Math.max(8, cy - hh - 18) + 'px';
    box.style.setProperty('--tail', (cx - left) + 'px');
    window.addEventListener('keydown', key, true); ta.focus(); ta.select();
  }
  function tree(nodes, ctx) {
    const wrap = h('div', { class: 'ob-tree' });
    for (const x of nodes) {
      if (x.t === 'text') wrap.append(textBubble(x.p, ctx, x.yesno ? 'asks (yes / no)' : ''));
      else if (x.t === 'act') wrap.append(h('div', { class: 'ob-act' }, x.icon + ' ' + x.text));
      else if (x.t === 'branch') wrap.append(h('div', { class: 'ob-branch' }, h('div', { class: 'ob-cond' }, x.label), tree(x.kids, ctx)));
      else if (x.t === 'trainer') { wrap.append(h('div', { class: 'ob-act' }, '⚔ ' + Tf('battle against trainer #{id}', { id: x.id }))); for (const [l, p] of x.texts) if (p >= 0) wrap.append(textBubble(p, ctx, l)); }
    }
    return wrap;
  }
  const sec = (title, ...kids) => h('div', { class: 'ob-sec' }, h('h4', {}, title), ...kids);
  const num = (v, on, attrs = {}) => h('input', Object.assign({ type: 'number', value: v, style: { width: '64px' }, onchange: ev => on(+ev.target.value) }, attrs));
  // ctx: { g, n, commit(label, fn, log?) -> ok, refresh(), jump(g, n, warp) }
  function panel(e, ctx) {
    const r = R(), o = e.off, { g, n } = ctx, d = info(g, n, e), wrap = h('div', { class: 'ob-panel' });
    const set8 = (label, off, v) => { if (ctx.commit(label, () => r.w8(off, v), { t: 'evbyte', k: g + '.' + n, kind: e.kind, i: e.i, at: off - o, v, size: 1 })) ctx.refresh(); };
    const set16 = (label, off, v) => { if (ctx.commit(label, () => r.w16(off, v & 0xFFFF), { t: 'evbyte', k: g + '.' + n, kind: e.kind, i: e.i, at: off - o, v: v & 0xFFFF, size: 2 })) ctx.refresh(); };
    // header: picture + who
    const pic = h('div', { class: 'ob-pic' });
    if (e.kind === 'obj') { const cv = sprite(d.gfx, FACING[r.u8[o + 9]] || 'down'); if (cv) { const c2 = h('canvas', { width: cv.width, height: cv.height, class: 'pixel' }); c2.getContext('2d').drawImage(cv, 0, 0); c2.style.width = cv.width * 2 + 'px'; pic.append(c2); } }
    else pic.append(h('span', { class: 'ob-bigicon' }, d.icon));
    const nameIn = h('input', { value: customName(g, n, e), placeholder: 'your name for it (editor only)', style: { width: '100%' },
      onchange: ev => { setCustomName(g, n, e, ev.target.value.trim()); ctx.refresh(); } });
    wrap.append(h('div', { class: 'ob-head' }, pic, h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { class: 'ob-type' }, T(d.type)), h('div', { class: 'ob-who' }, d.who || '—'), d.says ? h('div', { class: 'muted ob-says' }, '“' + d.says + '”') : '', nameIn,
      d.textPtr >= 0 ? h('button', { style: { marginTop: '6px' }, onclick: () => Dialogue.open(g, n, e, ctx) }, '💬 ' + T('Open as a conversation')) : '')));

    if (e.kind === 'obj') {
      const spr = sec('Looks like', h('div', { class: 'row' }, h('span', {}, gfxName(d.gfx) + ' (' + d.gfx + ')'),
        h('button', { onclick: () => gallery(d.gfx, v => set8('sprite', o + 1, v)) }, '🖼 Change sprite…')));
      if (d.type === 'item ball') {
        const b = d.ball, u = usage(), f = r.r16(o + 20), users = (u.flags.get(f) || []).length;
        const scriptEdit = (label, off, v) => { if (ctx.commit(label, () => { ownScript(e); const b2 = itemBall(r.ptr(o + 16)); r.w16(b2[off], v); })) ctx.refresh(); };
        wrap.append(sec('Item', h('div', { class: 'row wrap' }, itemPicker(b.item, v => scriptEdit('item', 'itemOff', v)), h('label', {}, ' × ', num(b.qty, v => scriptEdit('quantity', 'qtyOff', Math.max(1, Math.min(99, v))), { min: 1, max: 99, style: { width: '52px' } }))),
          h('div', { class: f && users <= 1 ? 'muted' : 'warn', style: { marginTop: '4px' } },
            !f ? '⚠ It has no picked-up flag: it comes back every time you enter the map. ' : 'Remembers it was picked up with flag ' + flagHex(f) + (users > 1 ? ' — ⚠ shared with ' + (users - 1) + ' other thing(s): picking one up hides the others. ' : ' (only this ball uses it ✓) '),
            !f || users > 1 ? h('button', { onclick: () => { const nf = freeFlag(); set16('picked-up flag', o + 20, nf); toast('Gave it the free flag ' + flagHex(nf)); } }, 'Give it its own flag') : '')));
      }
      if (d.type === 'trainer') wrap.append(trainerSection(d.trainer.id, ctx, o));
      wrap.append(spr);
      if (d.type !== 'item ball') {
        const mv = r.u8[o + 9], known = MOVES.some(m => m[0] === mv);
        const sel = h('select', { onchange: ev => set8('movement', o + 9, +ev.target.value) }, ...MOVES.map(([v, l]) => h('option', { value: v, selected: v === mv }, l)), known ? '' : h('option', { value: mv, selected: true }, 'Other (movement type ' + mv + ')'));
        const rb = r.u8[o + 10], area = WANDERS.has(mv) ? h('div', { class: 'row wrap muted' }, 'Area: ',
          h('label', {}, num(rb & 15, v => set8('area', o + 10, (rb & 0xF0) | (v & 15)), { min: 0, max: 15, style: { width: '46px' } }), ' steps left / right'),
          h('label', {}, num(rb >> 4, v => set8('area', o + 10, (rb & 15) | ((v & 15) << 4)), { min: 0, max: 15, style: { width: '46px' } }), ' steps up / down'), ' (drawn on the map)') : '';
        wrap.append(sec('Movement', sel, area));
      }
      if (d.tree && d.tree.length) wrap.append(sec(d.type === 'trainer' ? 'What they say' : 'Conversation', tree(d.tree, ctx)));
      else if (d.type === 'person') wrap.append(sec('Conversation', h('p', { class: 'muted' }, 'This person says nothing (no lines found in the script).')));
    } else if (e.kind === 'warp') {
      const dg = r.u8[o + 7], dn = r.u8[o + 6], dw = r.u8[o + 5];
      const maps = []; G().mapGroups.forEach((ms, gi) => ms.forEach((_, mi) => maps.push([gi, mi])));
      const msel = h('select', { style: { maxWidth: '100%' }, onchange: ev => { const [a, b] = ev.target.value.split('.').map(Number); if (ctx.commit('door destination', () => { r.w8(o + 7, a); r.w8(o + 6, b); r.w8(o + 5, 0); }, { t: 'evbyte', k: g + '.' + n, kind: e.kind, i: e.i, at: 5, v: [0, b, a], size: 'raw' })) ctx.refresh(); } },
        ...maps.map(([a, b]) => h('option', { value: a + '.' + b, selected: a === dg && b === dn }, mapLabel(a, b))));
      let dWarps = []; try { const hp = G().mapGroups[dg][dn], ev = r.ptr(hp + 4), p = r.ptr(ev + 8); for (let i = 0; i < r.u8[ev + 1] && p >= 0; i++) dWarps.push([r.s16(p + i * 8), r.s16(p + i * 8 + 2)]); } catch (x) { dWarps = []; }
      const wsel = h('select', { onchange: ev => set8('door destination', o + 5, +ev.target.value) },
        ...(dWarps.length ? dWarps : [[0, 0]]).map(([x, y], i) => h('option', { value: i, selected: i === dw }, dWarps.length ? Tf('door {n} at ({x}, {y})', { n: i + 1, x, y }) : Tf('door {n}', { n: i + 1 }))));
      wrap.append(sec('Leads to', msel, h('div', { class: 'row wrap', style: { marginTop: '4px' } }, 'arriving at ', wsel,
        h('button', { onclick: () => ctx.jump(dg, dn, dw) }, '➜ Jump to destination'))));
    } else if (e.kind === 'coord') {
      wrap.append(sec('When', h('div', { class: 'row wrap' }, 'Runs when you step here while var ', h('code', {}, flagHex(r.r16(o + 6))), ' = ', num(r.r16(o + 8), v => set16('trigger value', o + 8, v))),
        h('p', { class: 'muted' }, r.r16(o + 6) === 0x4000 && r.r16(o + 8) === 0xFFFF ? 'A new trigger never fires until its script and var are set up (Advanced).' : '')));
      const sp = scriptOf(e); if (sp >= 0) wrap.append(sec('What happens', tree(analyze(sp), ctx)));
    } else if (r.u8[o + 5] === 7) {
      const v = r.r32(o + 8), item = v & 0xFFFF, qty = (v >>> 24) & 0x7F, fo = (v >>> 16) & 0xFF, u = usage();
      const setV = (label, nv) => { if (ctx.commit(label, () => r.w32(o + 8, nv >>> 0), { t: 'evbyte', k: g + '.' + n, kind: e.kind, i: e.i, at: 8, v: nv >>> 0, size: 4 })) ctx.refresh(); };
      wrap.append(sec('Hidden item (found with the A button, invisible on the map)', h('div', { class: 'row wrap' }, itemPicker(item, it => setV('hidden item', (v & 0xFFFF0000) | it)),
        h('label', {}, ' × ', num(qty || 1, q => setV('quantity', (v & 0x80FFFFFF) | ((Math.max(1, Math.min(99, q)) & 0x7F) << 24)), { min: 1, max: 99, style: { width: '52px' } }))),
        h('div', { class: (u.hidden.get(fo) || 0) > 1 ? 'warn' : 'muted', style: { marginTop: '4px' } }, 'Remembers it was found with flag ' + flagHex(0x3E8 + fo),
          (u.hidden.get(fo) || 0) > 1 ? ' — ⚠ shared with ' + (u.hidden.get(fo) - 1) + ' other hidden item(s) ' : ' (only this item uses it ✓) ',
          (u.hidden.get(fo) || 0) > 1 ? h('button', { onclick: () => { const k = freeHidden(); setV('hidden item flag', (v & 0xFF00FFFF) | (k << 16)); } }, 'Give it its own flag') : ''),
        h('label', { class: 'muted' }, h('input', { type: 'checkbox', checked: !!(v >>> 31), onchange: ev => setV('underfoot', ev.target.checked ? (v | 0x80000000) : (v & 0x7FFFFFFF)) }), ' only found when standing on it')));
    } else {
      const sp = scriptOf(e); wrap.append(sec('Says', sp >= 0 ? tree(analyze(sp), ctx) : h('p', { class: 'muted' }, 'No text.')));
    }
    if (typeof Blocks !== 'undefined' && (e.kind !== 'obj' || d.type === 'person') && !(e.kind === 'bg' && r.u8[o + 5] >= 5)) wrap.append(blocksSection(e, ctx));
    wrap.append(advanced(e, ctx));
    return wrap;
  }
  // write this object's script with blocks (js/blocks.js); the block source is kept in the project (data/scripts.json)
  function blocksSection(e, ctx) {
    const r = R(), o = e.off, { g, n } = ctx, at = o + (e.kind === 'obj' ? 16 : e.kind === 'coord' ? 12 : 8);
    const k = g + '.' + n + ':' + e.kind + ':' + (e.kind === 'obj' ? r.u8[o] : e.i), scripts = Project.getData('scripts', {}), src = scripts[k];
    const open = () => {
      const blocks = src ? JSON.parse(JSON.stringify(src.blocks)) : Blocks.fromScript(r.ptr(at));
      if (!blocks.length) blocks.push({ op: 'say', text: '' });
      const bctx = { kind: e.kind === 'obj' ? 'object' : 'trigger', g, n, selfId: e.kind === 'obj' ? r.u8[o] : null, start: e.kind !== 'obj' ? { x: MapsTab.api.evXY(e)[0], y: MapsTab.api.evXY(e)[1] } : null };
      const back = h('div', { class: 'modal-back' }), prevBox = h('div');
      const showPrev = () => { prevBox.innerHTML = ''; if (blocks.some(b => ['move', 'face', 'emote', 'hide', 'show'].includes(b.op))) prevBox.append(Blocks.preview(blocks, bctx)); };
      const ed = Blocks.editor(blocks, Object.assign({ onChange: showPrev }, bctx)); showPrev();
      back.append(h('div', { class: 'panel modal bl-modal' }, h('h3', {}, '✏ ' + T('Script with blocks') + ' — ' + info(g, n, e).title.slice(0, 50)),
        h('p', { class: 'muted' }, T('Blocks run from top to bottom when the player talks to this person (or steps on the trigger / reads the sign).')), ed, prevBox,
        h('div', { class: 'row ask-btns' }, h('button', { class: 'primary', onclick: () => {
          if (ctx.commit('script blocks', () => {
            if (src && src.allocs) Script.free(src.allocs);
            const w = Script.compile(blocks, bctx).write();
            const cur = MapsTab.api.readEvents(r.ptr(App.game.mapGroups[g][n] + 4))[e.kind][e.i];
            const orig = src ? src.orig : r.r32(at);
            r.wptr(cur.off + (at - o), w.off);
            scripts[k] = { blocks, allocs: w.allocs, orig }; Project.setData('scripts', scripts);
          })) { back.remove(); toast(T('Script written into the game')); ctx.refresh(); }
        } }, '💾 ' + T('Write into the game')), h('button', { onclick: () => back.remove() }, T('Cancel')))));
      document.body.append(back);
    };
    return sec('🧩 ' + T('Script with blocks'), h('div', { class: 'row wrap' },
      h('button', { onclick: open }, src ? '✏ ' + T('Edit the blocks') : '✏ ' + T('Write it with blocks')),
      src ? h('button', { onclick: () => { if (ctx.commit('original script', () => { Script.free(src.allocs); r.w32(at, src.orig); delete scripts[k]; Project.setData('scripts', scripts); })) ctx.refresh(); } }, '↺ ' + T('Back to the original script')) : '',
      h('span', { class: 'muted' }, src ? T('This script is made of blocks.') : T('Say, ask, give, battle, walk… without code.'))));
  }
  function trainerSection(id, ctx, o) {
    const r = R(), t = trainer(id); if (!t) return '';
    const classes = classNames();
    const team = t.team.map(m => ({ sp: m.sp, lvl: m.lvl }));
    const saveTeam = list => { if (ctx.commit('trainer team', () => setTeam(id, list))) ctx.refresh(); };
    const rows = h('div', { class: 'ob-team' }, ...team.map((m, i) => h('div', { class: 'row' },
      makeSelect(L().species, m.sp, v => { team[i].sp = v; saveTeam(team); }),
      h('label', {}, 'lv ', num(m.lvl, v => { team[i].lvl = Math.max(1, Math.min(100, v)); saveTeam(team); }, { min: 1, max: 100, style: { width: '52px' } })),
      team.length > 1 ? h('button', { class: 'mu-x', title: 'remove', onclick: () => { team.splice(i, 1); saveTeam(team); } }, '✕') : '')));
    return sec(Tf('Trainer #{id}', { id }),
      h('div', { class: 'row wrap' }, h('label', {}, 'Class ', makeSelect(classes, t.cls, v => { if (ctx.commit('trainer class', () => setClass(id, v))) ctx.refresh(); })),
        h('label', {}, 'Name ', h('input', { value: t.name, style: { width: '110px' }, dir: 'auto', onchange: ev => { if (ctx.commit('trainer name', () => setTrainerName(id, ev.target.value))) ctx.refresh(); } }))),
      h('div', { class: 'muted', style: { margin: '4px 0' } }, 'Team:'), rows,
      team.length < 6 ? h('button', { onclick: () => { const last = team[team.length - 1] || { sp: 1, lvl: 5 }; team.push({ sp: last.sp, lvl: last.lvl }); saveTeam(team); } }, '+ Add a Pokémon') : '',
      h('div', { class: 'row', style: { marginTop: '4px' } }, h('label', {}, 'Sees you from ', num(r.r16(o + 14), v => { if (ctx.commit('sight', () => r.w16(o + 14, Math.max(0, Math.min(15, v))))) ctx.refresh(); }, { min: 0, max: 15, style: { width: '46px' } }), ' blocks away (0 = only when you talk to them)')));
  }
  function advanced(e, ctx) {
    const r = R(), o = e.off;
    const f = (label, off, size = 1, signed = false) => h('label', { class: 'field' }, label, h('input', { type: 'number', value: size === 1 ? r.u8[off] : signed ? r.s16(off) : r.r16(off),
      onchange: ev => { const v = +ev.target.value; if (ctx.commit(label, () => size === 1 ? r.w8(off, v) : r.w16(off, v & 0xFFFF), { t: 'evbyte', k: ctx.g + '.' + ctx.n, kind: e.kind, i: e.i, at: off - o, v: size === 1 ? v & 255 : v & 0xFFFF, size })) ctx.refresh(); } }));
    const fields = h('div', { class: 'fields' });
    if (e.kind === 'obj') fields.append(f('X', o + 4, 2, true), f('Y', o + 6, 2, true), f('Local ID', o), f('Sprite (graphics id)', o + 1), f('Elevation', o + 8),
      f('Movement type', o + 9), f('Move range (x | y<<4)', o + 10), f('Trainer type (0 no, 1 sees you)', o + 12, 2), f('Sight / berry', o + 14, 2), f('Hide flag', o + 20, 2));
    else if (e.kind === 'warp') fields.append(f('X', o, 2, true), f('Y', o + 2, 2, true), f('Elevation', o + 4), f('Dest warp #', o + 5), f('Dest map #', o + 6), f('Dest group', o + 7));
    else if (e.kind === 'coord') fields.append(f('X', o, 2, true), f('Y', o + 2, 2, true), f('Elevation', o + 4), f('Var', o + 6, 2), f('Var value', o + 8, 2));
    else { fields.append(f('X', o, 2, true), f('Y', o + 2, 2, true), f('Elevation', o + 4), f('Kind (0-4 sign, 7 hidden item)', o + 5)); }
    const sp = scriptOf(e);
    return h('details', { class: 'hdr ob-adv' }, h('summary', {}, 'Advanced'), fields,
      h('div', { class: 'muted' }, 'Data at ' + hex(o) + (sp >= 0 ? ' · script at ' + hex(sp) : '')));
  }
  // give the object its own copy of its script before changing bytes inside it (scripts can be shared)
  function ownScript(e) {
    const r = R(), sp = r.ptr(e.off + 16); if (sp < 0) return;
    if (r.findPointers(sp, false).length <= 1) return;
    let len = 0; forEach(sp, (op, p) => { len = Math.max(len, p - sp + (Gifts.LEN[op] || 1)); }, new Set([-1]));
    r.wptr(e.off + 16, r.writeNew(r.u8.slice(sp, sp + Math.max(len, 12))));
  }

  // ---------- templates for new objects ----------
  const TEMPLATES = [['npc', '+ Talking person'], ['item', '+ Item ball'], ['trainer', '+ Trainer'], ['sign', '+ Sign'], ['hidden', '+ Hidden item'], ['warp', '+ Door / warp'], ['coord', '+ Trigger']];
  const KIND_OF = { npc: 'obj', item: 'obj', trainer: 'obj', sign: 'bg', hidden: 'bg', warp: 'warp', coord: 'coord' };
  const p32 = v => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, (0x08000000 + v) >>> 0, true); return [...a]; };
  function add(g, n, tpl, x, y) {
    const r = R(), e = MapsTab.api.addEvent(g, n, KIND_OF[tpl], x, y), o = e.off;
    if (tpl === 'item') {
      const f = freeFlag();
      r.w8(o + 1, ITEM_BALL_GFX); r.w8(o + 9, 8); r.w16(o + 20, f);
      r.wptr(o + 16, r.writeNew(Uint8Array.from([0x1A, 0x00, 0x80, 13, 0, 0x1A, 0x01, 0x80, 1, 0, 0x09, 0x01, 0x02])));     // Potion ×1
    } else if (tpl === 'trainer') {
      const id = freeTrainer(), b = G().offsets.trainers + id * 40;
      const party = new Uint8Array(8); new DataView(party.buffer).setUint16(2, 5, true); new DataView(party.buffer).setUint16(4, 16, true);   // Pidgey lv 5
      r.w8(b, 0); r.wptr(b + 36, r.writeNew(party)); r.w8(b + 32, 1); r.w32(b + 24, 0);
      setClass(id, 57); setTrainerName(id, 'מאמן חדש');                        // youngster
      const intro = r.writeNew(enc("Let's battle!")), defeat = r.writeNew(enc('You won!')), after = r.writeNew(enc('That was a good battle.'));
      r.w8(o + 1, 18); r.w8(o + 9, 8); r.w16(o + 12, 1); r.w16(o + 14, 3);
      r.wptr(o + 16, r.writeNew(Uint8Array.from([0x5C, 0x00, id & 255, id >> 8, 0, 0, ...p32(intro), ...p32(defeat), 0x0F, 0x00, ...p32(after), 0x09, 0x06, 0x02])));
    } else if (tpl === 'hidden') {
      r.w8(o + 5, 7); r.w32(o + 8, (13 | (freeHidden() << 16) | (1 << 24)) >>> 0);
    }
    fresh(); scanCache = null;
    return e;
  }

  return { sprite, count, gfxName, info, tooltip, draw, drawArea, panel, gallery, analyze, trainer, classNames, usage, TEMPLATES, KIND_OF, add, customName,
    setClass, setTrainerName, setTeam, textBubble, inlineText, tree, itemPicker, forEach, _freeFlag: freeFlag, _freeTrainer: freeTrainer,
    spriteInfo: gfx => { if (gfx >= count()) return null; const r = R(), info = r.ptr(O().owGfx + gfx * 4); return { info, w: r.s16(info + 8), h: r.s16(info + 10), tag: r.r16(info + 2), pal: palette(r.r16(info + 2)), images: r.ptr(info + 28) }; },
    get GFX_TABLE() { return O().owGfx; }, refresh: () => { ver = -1; } };
})();
