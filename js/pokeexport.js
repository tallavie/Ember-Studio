// Export the Pokémon tab's changes for build.py (data/kachol_lavan/pokemon_edits.json): only what differs from the ROM
// as it was loaded - Pokémon data, names, moves, TM/HM, evolutions, Pokédex, pictures, icons, wild encounters and
// starters / gifts. tools/kl/pokeedits.py writes the same things into every build.
'use strict';

const PokeExport = (() => {
  const hx = a => Array.from(a, v => v.toString(16).padStart(2, '0')).join('');
  // run fn with App.rom swapped for a read-only view of the ROM as it was loaded
  function withOriginal(fn) {
    const cur = App.rom, wild = App.game.offsets.wild, orig = new Rom(cur.original.slice().buffer, 'original');
    App.rom = orig; App.game.offsets.wild = App.game.offsets.wildOriginal;
    try { return fn(); } finally { App.rom = cur; App.game.offsets.wild = wild; }
  }
  function speciesState(sp) {
    const r = App.rom, o = App.game.offsets, s = {};
    s.base = hx(r.u8.subarray(o.baseStats + sp * 28, o.baseStats + sp * 28 + 28));
    s.name = hx(r.u8.subarray(o.speciesNames + sp * 11, o.speciesNames + sp * 11 + 11));
    if (o.tmCompat >= 0) s.tm = hx(r.u8.subarray(o.tmCompat + sp * 8, o.tmCompat + sp * 8 + 8));
    s.evo = hx(r.u8.subarray(o.evolutions + sp * 40, o.evolutions + sp * 40 + 40));
    const lp = r.ptr(o.learnsets + sp * 4); let n = 0; while (lp >= 0 && r.r16(lp + n * 2) !== 0xFFFF && n < 64) n++;
    s.learnset = lp >= 0 ? hx(r.u8.subarray(lp, lp + n * 2 + 2)) : '';
    const nat = o.dexNums >= 0 && sp > 0 ? r.r16(o.dexNums + (sp - 1) * 2) : 0;
    if (nat && o.dexEntries >= 0) {
      const e = o.dexEntries + nat * 36, d = r.ptr(e + 16); let len = 0; while (d >= 0 && r.u8[d + len] !== 0xFF && len < 500) len++;
      s.dex = { nat, head: hx(r.u8.subarray(e, e + 16)), desc: d >= 0 ? hx(r.u8.subarray(d, d + len + 1)) : '' };
    }
    const lz = (t) => { const p = r.ptr(t + sp * 8); const d = p >= 0 ? LZ.decompress(r.u8, p) : null; return d ? hx(r.u8.subarray(p, p + d.srcLen)) : ''; };
    s.front = lz(o.frontPics); s.back = lz(o.backPics); s.pal = lz(o.pals); s.shiny = lz(o.shinyPals);
    if (o.iconTable >= 0) { const p = r.ptr(o.iconTable + sp * 4); s.icon = p >= 0 ? hx(r.u8.subarray(p, p + 0x400)) : ''; s.iconPal = r.u8[o.iconPalIdx + sp]; }
    return s;
  }
  function wildState() {
    const out = {};
    for (const hd of Wild.headers()) {
      const e = {};
      for (const kind of Object.keys(Wild.KINDS)) { const w = Wild.read(hd.g, hd.n, kind); e[kind] = w ? { rate: w.rate, slots: w.slots.map(s => [s.min, s.max, s.sp]) } : null; }
      out[hd.g + '.' + hd.n] = e;
    }
    return out;
  }
  const giftState = () => Gifts.scan().map(x => ({ g: x.g, n: x.n, idx: x.idx, kind: x.kind, species: x.species, level: x.level }));

  function collect() {
    const N = App.game.speciesCount, out = { format: 'kl-pokemon-1', species: {}, wild: {}, gifts: [] };
    const before = withOriginal(() => ({ sp: Array.from({ length: N }, (_, i) => i ? speciesState(i) : null), wild: wildState(), gifts: (() => { const v = App.romVersion; App.romVersion = -2; const g = giftState(); App.romVersion = v; return g; })() }));
    for (let sp = 1; sp < N; sp++) {
      const now = speciesState(sp), was = before.sp[sp], diff = {};
      for (const k of Object.keys(now)) if (JSON.stringify(now[k]) !== JSON.stringify(was[k])) diff[k] = now[k];
      if (Object.keys(diff).length) out.species[sp] = diff;
    }
    const wildNow = wildState();
    for (const k of Object.keys(wildNow)) if (JSON.stringify(wildNow[k]) !== JSON.stringify(before.wild[k])) out.wild[k] = wildNow[k];
    const giftsNow = giftState();
    for (const x of giftsNow) {
      const b = before.gifts.find(y => y.g === x.g && y.n === x.n && y.idx === x.idx);
      if (!b || b.species !== x.species || b.level !== x.level) out.gifts.push(Object.assign({ old: b ? b.species : 0 }, x));
    }
    return out;
  }
  function exportFile() {
    const d = collect(), n = Object.keys(d.species).length, w = Object.keys(d.wild).length;
    if (!n && !w && !d.gifts.length) { toast('No Pokémon changes to export'); return; }
    download(JSON.stringify(d), 'pokemon_edits.json', 'application/json');
    toast('Exported ' + n + ' Pokémon, ' + w + ' wild area(s), ' + d.gifts.length + ' gift(s). Put pokemon_edits.json in data/kachol_lavan/ and build.py applies it.');
  }
  return { collect, exportFile };
})();
