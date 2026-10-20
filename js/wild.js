// Wild Pokémon, the simple way: an area's encounters as "Pokémon + percent + level range" instead of the game's slots.
// FireRed has fixed odds per slot (grass: 20 20 10 10 10 10 5 5 4 4 1 1, surfing: 60 30 5 4 1); the editor spreads each
// Pokémon over slots so its share comes as close as possible to the percent you ask for, and shows the real result.
'use strict';

const Wild = (() => {
  const KINDS = { grass: { off: 4, n: 12, rates: [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1], name: 'Grass / cave' },
    water: { off: 8, n: 5, rates: [60, 30, 5, 4, 1], name: 'Surfing' } };
  // encounter-rate presets: chance per step ≈ rate / 180 (FireRed: Random() % 2880 < rate * 16)
  const RATES = [[0, 'None'], [7, 'Rare'], [14, 'Uncommon'], [21, 'Normal'], [30, 'Frequent'], [45, 'Very frequent']];
  const steps = r => r ? Math.round(180 / r) : Infinity;
  const rom = () => App.rom, table = () => App.game.offsets.wild;
  const locks = new Set();                                            // 'g.n.kind.species' kept fixed by the user

  function headers() {
    const r = rom(), t = table(), out = [];
    if (t < 0) return out;
    for (let p = t; p < t + 20 * 600; p += 20) {
      if (r.u8[p] === 0xFF && r.u8[p + 1] === 0xFF) break;
      out.push({ g: r.u8[p], n: r.u8[p + 1], off: p });
    }
    return out;
  }
  const headerFor = (g, n) => headers().find(x => x.g === g && x.n === n) || null;
  // {rate, slots: [{min, max, sp}]} or null
  function read(g, n, kind) {
    const r = rom(), hd = headerFor(g, n); if (!hd) return null;
    const info = r.ptr(hd.off + KINDS[kind].off); if (info < 0) return null;
    const mons = r.ptr(info + 4); if (mons < 0) return null;
    const slots = [];
    for (let i = 0; i < KINDS[kind].n; i++) slots.push({ min: r.u8[mons + i * 4], max: r.u8[mons + i * 4 + 1], sp: r.r16(mons + i * 4 + 2) });
    return { rate: r.u8[info], slots, info, mons };
  }
  // slots -> [{sp, pct, min, max}] (by share, largest first)
  function toSimple(slots, kind) {
    const rates = KINDS[kind].rates, by = new Map();
    slots.forEach((s, i) => {
      const e = by.get(s.sp) || { sp: s.sp, pct: 0, min: 100, max: 1 };
      e.pct += rates[i]; e.min = Math.min(e.min, s.min); e.max = Math.max(e.max, s.max); by.set(s.sp, e);
    });
    return [...by.values()].sort((a, b) => b.pct - a.pct);
  }
  // [{sp, pct, min, max}] -> slots: each slot (biggest odds first) goes to the Pokémon furthest below its target
  function fromSimple(list, kind) {
    const rates = KINDS[kind].rates, want = list.filter(e => e.pct > 0), got = new Map(want.map(e => [e, 0]));
    if (!want.length) return null;
    const order = rates.map((r, i) => i).sort((a, b) => rates[b] - rates[a]);
    const assign = new Array(rates.length);
    // every Pokémon gets at least one slot: the smallest ones first take the smallest slots
    const small = [...want].sort((a, b) => a.pct - b.pct), rev = [...order].reverse();
    small.slice(0, rates.length).forEach((e, k) => { if (want.length > 1 || k === 0) { const i = rev[k]; assign[i] = e; got.set(e, got.get(e) + rates[i]); } });
    for (const i of order) {
      if (assign[i]) continue;
      let best = want[0], bd = -Infinity;
      for (const e of want) { const d = e.pct - got.get(e); if (d > bd) { bd = d; best = e; } }
      assign[i] = best; got.set(best, got.get(best) + rates[i]);
    }
    // improve: move single slots between Pokémon while the total distance to the targets shrinks
    const err = () => want.reduce((s, e) => s + Math.abs(e.pct - got.get(e)), 0);
    for (let pass = 0, better = true; better && pass < 50; pass++) {
      better = false;
      for (let i = 0; i < rates.length; i++) for (const e of want) {
        const from = assign[i]; if (from === e) continue;
        if (assign.filter(x => x === from).length < 2) continue;              // everyone keeps at least one slot
        const before = err(); got.set(from, got.get(from) - rates[i]); got.set(e, got.get(e) + rates[i]); assign[i] = e;
        if (err() < before) { better = true; break; }
        got.set(e, got.get(e) - rates[i]); got.set(from, got.get(from) + rates[i]); assign[i] = from;
      }
    }
    return assign.map(e => ({ min: Math.max(1, Math.min(100, e.min)), max: Math.max(1, Math.min(100, Math.max(e.min, e.max))), sp: e.sp }));
  }
  // change one Pokémon's percent: the others (not locked) grow / shrink in proportion so the total stays 100
  function setPct(list, idx, pct) {
    const e = list[idx]; pct = Math.max(0, Math.min(100, Math.round(pct)));
    const lockedSum = list.reduce((s, x, i) => s + (i !== idx && x.locked ? x.pct : 0), 0);
    pct = Math.min(pct, 100 - lockedSum);
    const free = list.filter((x, i) => i !== idx && !x.locked), freeSum = free.reduce((s, x) => s + x.pct, 0), left = 100 - lockedSum - pct;
    e.pct = pct;
    if (!free.length) return;
    let acc = 0;
    free.forEach((x, k) => {
      if (k === free.length - 1) x.pct = left - acc;
      else { x.pct = Math.round(freeSum ? x.pct * left / freeSum : left / free.length); acc += x.pct; }
      x.pct = Math.max(0, x.pct);
    });
  }
  // write an area's encounters (creates the table entry for a map that had none)
  function write(g, n, kind, rate, slots) {
    const r = rom(), K = KINDS[kind];
    let hd = headerFor(g, n);
    if (!hd) {                                                        // a new entry in the wild table (moved to free space)
      const hs = headers(), t = table(), arr = new Uint8Array((hs.length + 2) * 20);
      arr.set(r.u8.subarray(t, t + hs.length * 20)); arr.set([g, n], hs.length * 20); arr.fill(0, hs.length * 20 + 2, hs.length * 20 + 20);
      arr.set(r.u8.subarray(t + hs.length * 20, t + hs.length * 20 + 20), (hs.length + 1) * 20);     // the 0xFF end entry
      const nt = r.writeNew(arr); for (const p of r.findPointers(t, true)) r.wptr(p, nt);
      App.game.offsets.wild = nt; hd = headerFor(g, n);
    }
    const mons = new Uint8Array(K.n * 4), dv = new DataView(mons.buffer);
    slots.forEach((s, i) => { mons[i * 4] = s.min; mons[i * 4 + 1] = s.max; dv.setUint16(i * 4 + 2, s.sp, true); });
    const cur = read(g, n, kind);
    if (cur) { r.write(cur.mons, mons); r.w8(cur.info, rate); return; }   // same size: in place
    const info = new Uint8Array(8); info[0] = rate; new DataView(info.buffer).setUint32(4, 0x08000000 + r.writeNew(mons), true);
    r.wptr(hd.off + K.off, r.writeNew(info));
  }
  function remove(g, n, kind) { const hd = headerFor(g, n); if (hd) rom().w32(hd.off + KINDS[kind].off, 0); }
  // every area where a Pokémon appears: [{g, n, kind, pct, min, max}]
  function whereFound(sp) {
    const out = [];
    for (const hd of headers()) for (const kind of Object.keys(KINDS)) {
      const w = read(hd.g, hd.n, kind); if (!w) continue;
      const e = toSimple(w.slots, kind).find(x => x.sp === sp);
      if (e) out.push({ g: hd.g, n: hd.n, kind, pct: e.pct, min: e.min, max: e.max, rate: w.rate });
    }
    return out;
  }

  // ---------- the simple editor for one area (used by the world view and the Pokémon card) ----------
  function panel(g, n, onChange) {
    const L = App.getLists(), box = h('div');
    const draw = () => {
      box.innerHTML = '';
      for (const kind of Object.keys(KINDS)) {
        const w = read(g, n, kind);
        const list = w ? toSimple(w.slots, kind) : [];
        const lk = e => g + '.' + n + '.' + kind + '.' + e.sp;
        list.forEach(e => e.locked = locks.has(lk(e)));
        const sec = h('div', { class: 'wild-sec' });
        const save = (rate) => {
          const total = list.reduce((s, e) => s + e.pct, 0);
          if (!list.length) { remove(g, n, kind); onChange && onChange(); draw(); return; }
          if (total !== 100) { toast('The percentages add up to ' + total + '%, not 100%', 'err'); return; }
          write(g, n, kind, rate ?? (w ? w.rate : 21), fromSimple(list, kind)); onChange && onChange(); draw();
        };
        const rateSel = h('select', { onchange: e => save(+e.target.value) }, ...RATES.map(([v, l]) => h('option', { value: v }, l + (v ? ' (~1 in ' + steps(v) + ' steps)' : ''))));
        if (w && !RATES.some(([v]) => v === w.rate)) rateSel.append(h('option', { value: w.rate }, 'custom ' + w.rate + ' (~1 in ' + steps(w.rate) + ' steps)'));
        rateSel.value = w ? w.rate : 21;
        sec.append(h('div', { class: 'row wrap' }, h('b', {}, KINDS[kind].name), w ? h('label', {}, 'Encounters ', rateSel) : h('span', { class: 'muted' }, 'none here')));
        const real = w ? new Map(toSimple(fromSimple(list, kind) || [], kind).map(e => [e.sp, e.pct])) : new Map();
        list.forEach((e, i) => {
          const sp = makeSelect(L.species, e.sp, v => { e.sp = v; save(); });
          sp.style.maxWidth = '140px';
          sec.append(h('div', { class: 'wild-row' },
            sp,
            h('input', { type: 'number', min: 0, max: 100, value: e.pct, title: 'percent', style: { width: '52px' }, onchange: ev => { setPct(list, i, +ev.target.value); save(); } }), '%',
            h('button', { class: 'mu-ms' + (e.locked ? ' on' : ''), title: 'lock: keeps its percent when you change another', onclick: () => { locks.has(lk(e)) ? locks.delete(lk(e)) : locks.add(lk(e)); draw(); } }, e.locked ? '🔒' : '🔓'),
            h('span', { class: 'muted' }, 'lv'),
            h('input', { type: 'number', min: 1, max: 100, value: e.min, style: { width: '46px' }, onchange: ev => { e.min = +ev.target.value; e.max = Math.max(e.max, e.min); save(); } }), '–',
            h('input', { type: 'number', min: 1, max: 100, value: e.max, style: { width: '46px' }, onchange: ev => { e.max = Math.max(+ev.target.value, e.min); save(); } }),
            real.get(e.sp) !== e.pct && real.has(e.sp) ? h('span', { class: 'warn', title: 'the game\'s fixed slot odds allow this share' }, '≈' + real.get(e.sp) + '%') : '',
            h('button', { class: 'mu-x', title: 'remove', onclick: () => { const p = e.pct; list.splice(i, 1); if (list.length) { list[0].pct += p; } save(); } }, '✕')));
        });
        const add = makeSelect(L.species, 0, v => {
          if (!v) return;
          if (!w && !list.length) { list.push({ sp: v, pct: 100, min: 5, max: 7 }); save(21); return; }
          list.push({ sp: v, pct: 0, min: list[0] ? list[0].min : 5, max: list[0] ? list[0].max : 7 }); setPct(list, list.length - 1, 10); save();
        });
        add.style.maxWidth = '160px'; add.firstChild.textContent = '+ add a Pokémon…';
        sec.append(h('div', { class: 'row' }, add));
        box.append(sec);
      }
      box.append(h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Percentages always add up to 100: changing one adjusts the others (🔒 keeps one fixed). The game has fixed odds per slot, so a share can only be approximate (≈ shows what the game will really do).'));
    };
    draw();
    return box;
  }

  return { KINDS, RATES, steps, headers, read, write, remove, toSimple, fromSimple, setPct, whereFound, panel };
})();
