// Game detection: finds every table we edit. Emerald (BPEE) offsets are verified; other
// Gen 3 English ROMs (FireRed/LeafGreen) are located by searching for known data.
'use strict';

const Game = (() => {
  const encAscii = s => Uint8Array.from([...s].map(c => Charmap.ENC.get(c)));
  const bytesOf = (...a) => Uint8Array.from(a);

  function nameTable(rom, firstName, entryLen, index, prevName) {
    const pat = Uint8Array.from([...encAscii(firstName), 0xFF]);
    for (const o of rom.findAll(pat, 20)) {
      const start = o - entryLen * index;
      if (start < 0) continue;
      if (prevName) {
        const d = Charmap.decode(rom.u8, start + entryLen * (index - 1), entryLen);
        if (d.text !== prevName) continue;
      }
      return start;
    }
    return -1;
  }

  function detect(rom) {
    const g = { code: rom.code, title: rom.title, isEmerald: rom.code === 'BPEE', isFRLG: /BPR|BPG/.test(rom.code) };
    g.name = g.isEmerald ? 'Pokémon Emerald (US)' : rom.code.startsWith('BPR') ? 'Pokémon FireRed' : rom.code.startsWith('BPG') ? 'Pokémon LeafGreen' : 'Unknown Gen 3 ROM (' + rom.code + ')';
    const o = g.offsets = {};
    g.speciesCount = 412; g.movesCount = 355; g.abilitiesCount = 78; g.typesCount = 18;
    g.itemsCount = g.isEmerald ? 377 : 375;
    g.primaryTiles = g.isEmerald ? 512 : 640; g.primaryMetatiles = g.isEmerald ? 512 : 640; g.primaryPals = g.isEmerald ? 6 : 7;
    g.msgBoxWidth = 216;

    o.speciesNames = nameTable(rom, 'BULBASAUR', 11, 1);
    o.moveNames = nameTable(rom, 'POUND', 13, 1);
    o.abilityNames = nameTable(rom, 'STENCH', 13, 1, '-------');
    o.typeNames = (() => { for (const x of rom.findAll(Uint8Array.from([...encAscii('NORMAL'), 0xFF]), 20))
      if (Charmap.decode(rom.u8, x + 7, 7).text === 'FIGHT') return x; return -1; })();
    o.items = (() => { for (const x of rom.findAll(Uint8Array.from([...encAscii('MASTER BALL'), 0xFF]), 20))
      if (rom.r16(x + 14) === 1) return x - 44; return -1; })();
    const bs = rom.find(bytesOf(45, 49, 49, 45, 65, 65, 12, 3));
    o.baseStats = bs >= 0 ? bs - 28 : -1;
    const ls = rom.find(bytesOf(0x21, 0x02, 0x2D, 0x08));
    if (ls >= 0) { const refs = rom.findPointers(ls, true); o.learnsets = refs.length ? refs[0] - (refs.length > 1 && refs[1] === refs[0] + 4 ? 0 : 4) : -1; }
    const ev = rom.find(bytesOf(4, 0, 16, 0, 2, 0, 0, 0));
    o.evolutions = ev >= 0 ? ev - 40 : -1;
    // keyboard pages: lower, upper, symbols. Find via the uppercase page (the lowercase one may already be Hebrew).
    const kbUpper = rom.find(encAscii('ABCDEF .'));
    o.keyboard = kbUpper >= 32 ? kbUpper - 32 : rom.find(encAscii('abcdef .'));
    // The keys you SEE are drawn from 12 row strings (lower/upper/symbols × 4 rows), found via the "ABC" row.
    o.keyboardRows = -1;
    for (const upRow of rom.findAll(Uint8Array.from([0xFC, 0x11, 0x0B, 0xBB, 0xFC, 0x11, 0x06, 0xBC]), 10))
      for (const ref of rom.findPointers(upRow, true)) {
        const t = ref - 16;
        if ([...Array(12).keys()].every(k => rom.ptr(t + k * 4) >= 0 && rom.u8[rom.ptr(t + k * 4)] === 0xFC)) { o.keyboardRows = t; break; }
      }
    o.trainers = g.isEmerald ? 0x310030 : findTrainers(rom, 'BROCK');
    g.trainerCount = g.isEmerald ? 855 : 743;

    // Pokémon picture tables: entries {ptr, u16 size, u16 species}
    const picTables = [], palTables = [];
    for (let x = 0; x < rom.size - 64; x += 4) {
      const v1 = rom.r32(x + 12);
      if (v1 === 0x00010800 && rom.r32(x + 20) === 0x00020800 && rom.r32(x + 28) === 0x00030800 && rom.ptr(x + 8) >= 0) picTables.push(x);
      if ((v1 === 1 && rom.r32(x + 20) === 2 && rom.r32(x + 28) === 3) || (v1 === 501 && rom.r32(x + 20) === 502)) {
        const p = rom.ptr(x + 8);
        if (p >= 0 && rom.u8[p] === 0x10 && rom.u8[p + 1] === 0x20) palTables.push([x, v1]);
      }
    }
    if (g.isEmerald) { o.frontPics = 0x30A18C; o.backPics = 0x3028B8; o.pals = 0x303678; o.shinyPals = 0x304438; }
    else {
      o.frontPics = picTables[0] ?? -1; o.backPics = picTables[1] ?? -1;
      o.pals = (palTables.find(p => p[1] === 1) || [-1])[0]; o.shinyPals = (palTables.find(p => p[1] === 501) || [-1])[0];
    }

    // Maps
    o.mapGroups = g.isEmerald ? 0x486578 : findMapGroups(rom);
    g.mapGroups = readMapGroups(rom, o.mapGroups);
    o.wild = g.isEmerald ? 0x552D48 : findWild(rom);
    o.wildOriginal = o.wild;                                      // where the wild table was when the ROM was loaded
    // Map section names
    if (g.isEmerald) { o.regionMapEntries = 0x5A147C; g.mapsecBase = 0; g.mapsecStride = 8; g.mapsecNameOff = 4; }
    else {
      // the map-section name table: pointers, entry 0 = "PALLET TOWN", entry 1 = "VIRIDIAN CITY" (another "PALLET TOWN"
      // string elsewhere is not it). A translated ROM has neither string: use the known FireRed (US) v1.1 table.
      o.regionMapEntries = -1;
      const viridian = Uint8Array.from([...encAscii('VIRIDIAN CITY'), 0xFF]);
      for (const p of rom.findAll(Uint8Array.from([...encAscii('PALLET TOWN'), 0xFF]), 10))
        for (const ref of rom.findPointers(p, true)) { const q = rom.ptr(ref + 4); if (q >= 0 && viridian.every((b, i) => rom.u8[q + i] === b)) o.regionMapEntries = ref; }
      if (o.regionMapEntries < 0 && rom.code === 'BPRE' && rom.u8[0xBC] === 1 && rom.ptr(0x3F1D1C) >= 0) o.regionMapEntries = 0x3F1D1C;
      g.mapsecBase = 0x58; g.mapsecStride = 4; g.mapsecNameOff = 0;
    }

    // Hebrew font + RTL patch support: Emerald (US) and FireRed (US) v1.1. [name, fontId, glyphs, widths]
    g.patchKey = g.isEmerald ? 'BPEE' : (rom.code === 'BPRE' && rom.u8[0xBC] === 1) ? 'BPRE1' : null;
    g.rtl = g.patchKey && window.RTL_PATCHES ? window.RTL_PATCHES[g.patchKey] : null;
    g.fonts = g.patchKey === 'BPEE' ? [
      ['Normal (dialogue)', 1, 0x64C2E4, 0x6542E4], ['Short (menus)', 2, 0x6440E4, 0x64C0E4], ['Narrow', 7, 0x63BEE4, 0x643EE4],
      ['Small', 0, 0x633CE4, 0x63BCE4], ['Small narrow', 8, 0x62BAE4, 0x633AE4]]
      : g.patchKey === 'BPRE1' ? [
      ['Normal (dialogue)', 2, 0x1FF370, 0x207370], ['Normal copy', 1, 0x1F3170, 0x1FB170], ['Male (blue)', 4, 0x20F688, 0x217688],
      ['Female (red)', 5, 0x21F9A0, 0x2279A0], ['Small', 0, 0x1EAF70, 0x1EEF70, 32]] : [];
    g.dialogueFont = g.patchKey === 'BPRE1' ? 2 : 1;
    if (g.isFRLG) g.msgBoxWidth = 208;

    // FireRed (US) v1.1: fixed addresses for tables a translated ROM no longer lets us find by their English text,
    // and the data the Pokémon editor needs (TM/HM, moves, Pokédex, icons). -1 = not available on this ROM.
    const fr11 = rom.code === 'BPRE' && rom.u8[0xBC] === 1;
    const fixed = { speciesNames: 0x245F50, moveNames: 0x247104, abilityNames: 0x24FCB0, typeNames: 0x24F210, items: 0x3DB098, trainers: 0x23EB38 };
    if (fr11) for (const [k, v] of Object.entries(fixed)) if (o[k] < 0) o[k] = v;
    const fr = (v, check) => fr11 && check(v) ? v : -1;
    o.tmCompat = fr(0x252C38, v => rom.r32(v) === 0 && rom.r32(v + 8) !== 0);              // 8 bytes (TM01-50, HM01-08 bits) per species
    o.tmMoves = fr(0x45A604, v => rom.r16(v) === 264 && rom.r16(v + 2) === 337);           // the move of each TM / HM (58 x u16)
    o.moveData = fr(0x250C74, v => rom.u8[v + 12 + 1] === 40);                              // 12 bytes per move (Pound power 40)
    o.dexNums = fr(0x25205E, v => rom.r16(v + 24 * 2) === 25 && rom.r16(v + 276 * 2) === 252);   // species -> national Pokédex number
    o.dexEntries = fr(0x44E8B0, v => rom.ptr(v + 36 + 16) >= 0);                            // 36 bytes per national number
    o.iconTable = fr(0x3D3810, v => rom.ptr(v + 4) >= 0);                                  // pointer to a 32x64 4bpp icon per species
    o.iconPalIdx = fr(0x3D3EF0, v => rom.u8[v + 1] <= 2);                                   // which of the 3 icon palettes
    o.iconPals = fr(0x3D37B0, () => true);                                                   // 3 x 16 colours
    // the same tables in Emerald (US), each checked against what it should hold
    if (g.isEmerald) {
      const em = (v, check) => check(v) ? v : -1;
      o.tmCompat = em(0x31E898, v => rom.r32(v) === 0 && rom.r32(v + 8) !== 0);
      o.tmMoves = em(0x616040, v => rom.r16(v) === 264 && rom.r16(v + 2) === 337);
      o.tmMovesCopy = em(0x615B94, v => rom.r16(v) === 264 && rom.r16(v + 2) === 337);     // a second copy the game also reads
      o.moveData = em(0x31C898, v => rom.u8[v + 12 + 1] === 40);
      o.dexNums = em(0x31DC82, v => rom.r16(v + 24 * 2) === 25 && rom.r16(v + 276 * 2) === 252);
      o.dexEntries = em(0x56B5B0, v => rom.ptr(v + 32 + 16) >= 0);
      o.iconTable = em(0x57BCA8, v => rom.ptr(v + 4) >= 0);
      o.iconPalIdx = em(0x57C388, v => rom.u8[v + 1] <= 2);
      o.iconPals = em(0xDDE1F8, v => rom.ptr(0x57C540) === v);
    }
    g.dexEntrySize = g.isEmerald ? 32 : 36;

    // the game's own rules: story flags, which badge each HM needs, the HM obstacles on the map, where the player starts
    g.badgeFlag = g.isEmerald ? 0x867 : 0x820;                       // the first of the eight badge flags
    g.gameClearFlag = g.isEmerald ? 0x864 : 0x82C;
    g.pokemonGetFlag = g.isEmerald ? 0x860 : 0x828;                  // the start menu shows POKéMON
    g.hmBadge = g.isEmerald ? { cut: 1, flash: 2, smash: 3, strength: 4, surf: 5, fly: 6, dive: 7, waterfall: 8 }
      : { cut: 2, flash: 1, smash: 6, strength: 4, surf: 5, fly: 3, waterfall: 7, dive: 8 };
    g.obstacleGfx = g.isEmerald ? { 82: 'cut', 86: 'smash', 87: 'strength' } : { 95: 'cut', 96: 'smash', 97: 'strength' };
    g.startMap = g.isEmerald ? [1, 1] : [4, 1];                      // the player's room
    g.introMap = g.isEmerald ? [25, 40] : [4, 1];                    // where a new game first gives control (Emerald: the moving truck)
    g.ram = g.isEmerald ? { sb1: 0x03005D8C, sb2: 0x03005D90, objs: 0x02037350 } : { sb1: 0x03005008, sb2: 0x0300500C, objs: 0x02036E38 };   // gSaveBlock1Ptr, gSaveBlock2Ptr, gObjectEvents
    g.isBadge = f => f >= g.badgeFlag && f < g.badgeFlag + 8;
    g.engineWarps = g.isEmerald ? [['19.0', 19, 1], ['19.1', 19, 0], ['24.5', 0, 7], ['24.26', 24, 27]] : [];   // trips the game makes in code, not script: Emerald's cable car, surfacing in Sootopolis and the Seafloor Cavern
    g.moveCount = 355;

    // tables the editors read directly. -1 = not known for this ROM (that part of the editor is switched off)
    const TABLES = {
      itemIcons: [0x3D4304, 0x614410, v => rom.ptr(v) >= 0 && rom.u8[rom.ptr(v)] === 0x10],            // {gfx, palette} per item, LZ77
      itemEffects: [0x25292C, 0x31E58C, v => rom.ptr(v) >= 0],                                        // medicine effects, items 13..176
      ballBonus: [0x250902, 0x31C48D, v => rom.u8[v] === 20 && rom.u8[v + 1] === 15],              // Ultra, Great, Poké, Safari (x10)
      moveDescs: [0x488748, 0x61C524, v => rom.ptr(v) >= 0 && rom.ptr(v + 4) >= 0],
      tutors: [0x459BC0, 0x61500C, v => rom.r16(v) === 5 && rom.r16(v + 2) === 14],                // Mega Punch, Swords Dance…
      trainerPics: [0x2395EC, 0x305654, v => rom.ptr(v) >= 0 && rom.r16(v + 4) === 0x800],
      trainerPals: [0x239A8C, 0x30593C, v => rom.ptr(v) >= 0 && rom.r16(v + 12) === 1],
      owGfx: [0x39FE20, 0x505620, v => rom.ptr(v) >= 0 && rom.r16(rom.ptr(v)) === 0xFFFF],          // overworld sprite infos
      owPalRef: [0x5F5DC, 0x8E8BC, v => rom.ptr(v) >= 0],                                            // a pointer to the overworld palettes
      classRef: [0xD80B4, 0x183B4, v => rom.ptr(v) >= 0],                                            // a pointer to the trainer class names
    };
    for (const [k, [f, e, ok]] of Object.entries(TABLES)) { const v = fr11 ? f : g.isEmerald ? e : -1; o[k] = v >= 0 && ok(v) ? v : -1; }
    // Emerald: how Pokémon move in battle (pointers in the code that uses each table)
    const viaCode = (lit, ok) => { const v = g.isEmerald ? rom.ptr(lit) : -1; return v >= 0 && ok(v) ? v : -1; };
    o.frontAnims = viaCode(0x5E7BC, v => rom.ptr(rom.ptr(v + 4)) >= 0);                // gMonFrontAnimsPtrTable: per species {stand still, the animation}
    o.frontAnimIds = viaCode(0x6EDE8, v => rom.u8[v] < 0x57);                          // sMonFrontAnimIdsTable: the motion (species - 1)
    o.animDelays = viaCode(0x6EDDC, () => true);                                       // sMonAnimationDelayTable (species - 1)
    o.backAnimSets = viaCode(0x17F488, v => rom.u8[v + 1] < 26);                       // sSpeciesToBackAnimSet
    g.tutorCount = g.isEmerald ? 30 : 15;
    g.trainerPicCount = g.isEmerald ? 93 : 148;
    g.classCount = g.isEmerald ? 66 : 107;

    // Free space: largest run of 0xFF
    let best = [0, 0], start = -1;
    for (let i = 0x100000; i <= rom.size; i++) {
      if (i < rom.size && rom.u8[i] === 0xFF) { if (start < 0) start = i; }
      else if (start >= 0) { if (i - start > best[1]) best = [start, i - start]; start = -1; }
    }
    g.freeStart = (best[0] + 0x100 + 15) & ~15;
    g.freeEnd = best[0] + best[1];
    g.rtlPatchAt = 0xFFE000;
    if (g.rtl && g.freeEnd > g.rtlPatchAt) g.freeEnd = g.rtlPatchAt; // keep the RTL patch area reserved
    rom.freeStart = g.freeStart; rom.freeEnd = g.freeEnd;
    return g;
  }

  // Trainer structs are 40 bytes: name at +4, party size at +32, party pointer at +36.
  function findTrainers(rom, name) {
    const okEntry = e => e >= 0 && rom.u8[e + 32] <= 6 && (rom.r32(e + 36) === 0 || rom.ptr(e + 36) >= 0);
    for (const o of rom.findAll(Uint8Array.from([...encAscii(name), 0xFF]), 30)) {
      let e = o - 4;
      if (!(rom.u8[e + 32] >= 1 && rom.ptr(e + 36) >= 0)) continue;
      while (okEntry(e - 40) && rom.u8[e - 40 + 1] < 0x80) e -= 40;
      return e;
    }
    return -1;
  }
  function isHeader(rom, off) {
    if (off < 0 || off + 28 > rom.size) return false;
    const lay = rom.ptr(off);
    if (lay < 0 || rom.ptr(off + 4) < 0 || rom.ptr(off + 8) < 0) return false;
    const w = rom.r32(lay), hh = rom.r32(lay + 4);
    return w > 0 && w < 512 && hh > 0 && hh < 512 && rom.ptr(lay + 12) >= 0 && rom.ptr(lay + 16) >= 0;
  }
  function isGroup(rom, off) { const p = rom.ptr(off); return p >= 0 && isHeader(rom, rom.ptr(p)); }
  function findMapGroups(rom) {
    for (let x = 0x100000; x < rom.size - 16; x += 4)
      if (isGroup(rom, x) && isGroup(rom, x + 4) && isGroup(rom, x + 8) && isGroup(rom, x + 12) && !isGroup(rom, x - 4)) return x;
    return -1;
  }
  function readMapGroups(rom, off) {
    const groups = [];
    if (off < 0) return groups;
    const starts = [];
    for (let i = 0; i < 64 && isGroup(rom, off + i * 4); i++) starts.push(rom.ptr(off + i * 4));
    starts.forEach((s, gi) => {
      const maps = [];
      const sorted = starts.filter(v => v > s).sort((a, b) => a - b);
      const limit = sorted.length ? Math.min(200, (sorted[0] - s) / 4) : 200;
      for (let i = 0; i < limit; i++) {
        const hp = rom.ptr(s + i * 4);
        if (!isHeader(rom, hp)) break;
        maps.push(hp);
      }
      groups.push(maps);
    });
    // a group array that was moved (maps added) leaves its old copy behind, right after another group's array:
    // a header that also sits in another group at a lower index belongs there, so the list stops at it
    const home = new Map();
    groups.forEach((maps, gi) => maps.forEach((hp, mi) => { const c = home.get(hp); if (!c || mi < c[1]) home.set(hp, [gi, mi]); }));
    groups.forEach((maps, gi) => { const cut = maps.findIndex((hp, mi) => home.get(hp)[0] !== gi); if (cut >= 0) maps.length = cut; });
    return groups;
  }
  function findWild(rom) {
    for (let x = 0x100000; x < rom.size - 200; x += 4) {
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) {
        const e = x + k * 20;
        if (rom.u8[e] > 60) { ok = false; break; }
        let any = false;
        for (let j = 0; j < 4; j++) {
          const v = rom.r32(e + 4 + j * 4);
          if (v === 0) continue;
          const p = rom.ptr(e + 4 + j * 4);
          if (p < 0 || rom.u8[p] > 100 || rom.ptr(p + 4) < 0) { ok = false; break; }
          any = true;
        }
        if (!any) ok = false;
      }
      if (ok) return x;
    }
    return -1;
  }

  // ---- Shared name lists ----
  function names(rom, off, len, count) {
    const r = [];
    for (let i = 0; i < count; i++) r.push(off >= 0 ? Charmap.decode(rom.u8, off + i * len, len).text : '#' + i);
    return r;
  }
  function lists(rom, g) {
    const o = g.offsets;
    return {
      species: names(rom, o.speciesNames, 11, g.speciesCount),
      moves: names(rom, o.moveNames, 13, g.movesCount),
      abilities: names(rom, o.abilityNames, 13, g.abilitiesCount),
      types: names(rom, o.typeNames, 7, g.typesCount),
      items: names(rom, o.items, 44, g.itemsCount),
    };
  }
  function mapName(rom, g, sec) {
    const o = g.offsets.regionMapEntries; if (o < 0) return 'MAPSEC ' + sec;
    const idx = sec - g.mapsecBase; if (idx < 0) return 'MAPSEC ' + sec;
    const p = rom.ptr(o + idx * g.mapsecStride + g.mapsecNameOff);
    return p >= 0 ? Charmap.decode(rom.u8, p, 40).text : 'MAPSEC ' + sec;
  }

  return { detect, lists, mapName, isHeader, readMapGroups };
})();
