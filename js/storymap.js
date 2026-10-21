// The story that is already in the game: every script (people, signs, triggers, scenes on arrival) is followed
// branch by branch. Each path that changes something (a flag or story variable, a Pokémon or item, a battle) is an
// event, with the conditions that lead to it. Events are then ordered by when they become possible and put into
// chapters by where they happen. FireRed's own main story gets hand-written names (js/storymap_fr.js).
'use strict';

const StoryMap = (() => {
  const R = () => App.rom, G = () => App.game;
  const TRAINER_FLAGS = 0x500;                         // FireRed: "trainer beaten" flags start here
  const COND_TABLE = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1]];   // goto_if code x compare result (<, =, >)
  const OPS = ['<', '=', '>', '≤', '≥', '≠'];
  const persistentVar = v => v >= 0x4010 && v < 0x4100;      // 0x4000-0x400F are reset on every map change
  const persistentFlag = f => f >= 0x20 && f < 0x900;
  let cache = null;

  // ---------- conditions ----------
  // { k: 'var', v, c (goto_if code), n } is "var v <c> n"; { k: 'flag', f, set } ; { k: 'any', what } (the player's answer, an item…)
  const varOk = (cond, x) => COND_TABLE[cond.c][x < cond.n ? 0 : x === cond.n ? 1 : 2] === 1;
  const neg = c => ({ 0: 4, 1: 5, 2: 3, 3: 2, 4: 0, 5: 1 })[c];
  function consistent(conds) {                          // can all the conditions on one variable / flag hold at once?
    const byVar = new Map(), flags = new Map();
    for (const c of conds) {
      if (c.k === 'var') { if (!byVar.has(c.v)) byVar.set(c.v, []); byVar.get(c.v).push(c); }
      else if (c.k === 'flag') { if (flags.has(c.f) && flags.get(c.f) !== c.set) return false; flags.set(c.f, c.set); }
    }
    for (const list of byVar.values()) { let ok = false; for (let x = 0; x < 300 && !ok; x++) ok = list.every(c => varOk(c, x)); if (!ok) return false; }
    return true;
  }

  // ---------- following one script ----------
  function follow(start, entryConds, trace, entryRef) {
    const r = R(), LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN, paths = [];
    const todo = [{ p: start, stack: [], conds: entryConds.slice(), eff: [], gives: [], battles: [], texts: [], acts: [], known: new Map(), knownAt: new Map(), kflags: new Map(),
      cmp: null, text: -1, textRef: -1, v8000: null, v8001: null, steps: 0, seen: new Set(), lastFork: start, eventStart: -1, forkRef: { type: 'entry', at: entryRef != null ? entryRef : -1 }, eventRef: null }];
    for (const c of entryConds) if (c.k === 'flag') todo[0].kflags.set(c.f, c.set);
    const clone = s => Object.assign({}, s, { stack: s.stack.slice(), conds: s.conds.slice(), eff: s.eff.slice(), gives: s.gives.slice(), battles: s.battles.slice(),
      texts: s.texts.slice(), acts: s.acts.slice(), trail: s.trail && s.trail.slice(), known: new Map(s.known), knownAt: new Map(s.knownAt), kflags: new Map(s.kflags), seen: new Set(s.seen) });
    const mark = s => { if (s.eventStart < 0) { s.eventStart = s.lastFork; s.eventRef = s.forkRef; } };   // where this moment starts, and the pointer that leads there
    const states = new Set();                           // paths that meet again in the same state go on as one
    const sig = s => s.p + '/' + s.stack.join(',') + '/' + s.conds.map(c => c.k + (c.v || c.f) + (c.c != null ? c.c + ':' + c.n : c.set)).join(',') + '/' + s.eff.map(e => e.k + (e.v || e.f) + '=' + (e.n != null ? e.n : e.set)).join(',') + '/' + s.gives.map(x => x.at).join(',') + '/' + s.battles.map(x => x.at).join(',');
    while (todo.length && paths.length < 256) {
      const s = todo.pop();
      let done = false, jumped = true;
      while (!done) {
        const p = s.p;
        if (jumped) { const k = sig(s); if (states.has(k)) { s.merged = true; break; } states.add(k); jumped = false; }
        if (p < 0 || p >= r.size - 24 || s.steps++ > 800) { s.cut = true; break; }
        const key = p + ':' + s.stack.join(',');      // the same helper called twice is not a loop
        if (s.seen.has(key)) break;                     // a loop
        s.seen.add(key);
        const op = r.u8[p];
        if (trace) (s.trail = s.trail || []).push(p.toString(16) + ':' + op.toString(16));
        // forks: the condition comes from the last compare / checkflag / checktrainerflag
        const fork = (target, isCall) => {
          const m = s.cmp, c = r.u8[p + 1];
          let t = null, f = null, decided = null;
          if (m && m.k === 'var') {
            if (s.known.has(m.v)) decided = COND_TABLE[c][s.known.get(m.v) < m.n ? 0 : s.known.get(m.v) === m.n ? 1 : 2] === 1;
            else if (persistentVar(m.v)) {
              t = { k: 'var', v: m.v, c, n: m.n }; f = { k: 'var', v: m.v, c: neg(c), n: m.n };
              const okT = consistent(s.conds.concat([t])), okF = consistent(s.conds.concat([f]));   // what we already know may decide it
              if (!okT || !okF) { decided = okT; t = f = null; }
            }
          } else if (m && m.k === 'flag') {
            const whenSet = COND_TABLE[c][1] === 1, whenClear = COND_TABLE[c][0] === 1;
            if (s.kflags.has(m.f)) decided = s.kflags.get(m.f) ? whenSet : whenClear;
            else if (whenSet !== whenClear) { t = { k: 'flag', f: m.f, set: whenSet }; f = { k: 'flag', f: m.f, set: !whenSet }; }
            else decided = whenSet;
          }
          const yes = clone(s), no = s;
          if (t) { yes.conds.push(t); no.conds.push(f); if (t.k === 'flag') { yes.kflags.set(t.f, t.set); no.kflags.set(f.f, f.set); } }
          else if (m && m.k === 'any' && decided == null) { yes.acts.push({ k: 'answer', what: m.what, yes: true }); no.acts.push({ k: 'answer', what: m.what, yes: false }); }
          if (isCall) yes.stack.push(p + 6);
          yes.p = target; yes.lastFork = target; no.p = p + 6; no.lastFork = p + 6;
          if (!isCall) { yes.forkRef = { type: 'ptr', at: p + 2, alt: p + 6 }; no.forkRef = { type: 'fall', at: p + 6, alt: target }; }
          if (decided === true) { Object.assign(s, yes); return; }
          if (decided === false) { s.p = p + 6; return; }
          if (consistent(yes.conds)) todo.push(yes);
          if (!consistent(no.conds)) done = true;
        };
        switch (op) {
          case 0x02: case 0x03:
            if (s.stack.length) { s.p = s.stack.pop(); continue; }
            done = true; continue;
          case 0x04: s.stack.push(p + 5); s.p = r.ptr(p + 1); jumped = true; continue;
          case 0x05: s.p = r.ptr(p + 1); jumped = true; continue;
          case 0x06: case 0x07: fork(r.ptr(p + 2), op === 0x07); jumped = true; continue;
          case 0x21: { const v = r.r16(p + 1), n = r.r16(p + 3); s.cmp = persistentVar(v) || s.known.has(v) ? { k: 'var', v, n } : { k: 'any', what: v === 0x800D ? (s.yesno ? 'yesno' : 'result') : 'var' }; break; }
          case 0x22: s.cmp = { k: 'any', what: 'var' }; break;
          case 0x2B: { const f = r.r16(p + 1); s.cmp = persistentFlag(f) || s.kflags.has(f) ? { k: 'flag', f } : { k: 'any', what: 'flag' }; break; }
          case 0x60: s.cmp = { k: 'flag', f: TRAINER_FLAGS + r.r16(p + 1) }; break;
          case 0x47: case 0x46: s.cmp = { k: 'any', what: 'item', item: r.r16(p + 1) }; break;
          case 0x16: { const v = r.r16(p + 1), n = r.r16(p + 3); if (v === 0x8000) s.v8000 = { n, at: p + 3 }; else if (v === 0x8001) s.v8001 = { n, at: p + 3 };
            if (persistentVar(v)) { mark(s); s.eff.push({ k: 'var', v, n, at: p }); } s.known.set(v, n); s.knownAt.set(v, p + 3); break; }
          case 0x19: { const v = r.r16(p + 1), src = r.r16(p + 3), n = s.known.has(src) ? s.known.get(src) : (src < 0x4000 ? src : -1);   // copyvar
            if (persistentVar(v)) { mark(s); s.eff.push({ k: 'var', v, n, at: p }); }
            if (n >= 0) { s.known.set(v, n); if (s.knownAt.has(src)) s.knownAt.set(v, s.knownAt.get(src)); } else { s.known.delete(v); s.knownAt.delete(v); } break; }
          case 0x17: { const v = r.r16(p + 1), n = r.r16(p + 3); if (persistentVar(v)) { mark(s); s.eff.push({ k: 'addvar', v, n, at: p }); }
            if (s.known.has(v)) s.known.set(v, s.known.get(v) + n); else s.known.delete(v); break; }
          case 0x1A: { const v = r.r16(p + 1), n = r.r16(p + 3); if (v === 0x8000) s.v8000 = { n, at: p + 3 }; else if (v === 0x8001) s.v8001 = { n, at: p + 3 }; break; }
          case 0x29: case 0x2A: { const f = r.r16(p + 1); if (persistentFlag(f)) { mark(s); s.eff.push({ k: 'flag', f, set: op === 0x29, at: p }); } s.kflags.set(f, op === 0x29); break; }
          case 0x0F: if (r.u8[p + 1] === 0) { s.text = r.ptr(p + 2); s.textRef = p + 2; } break;
          case 0x09: {
            const n = r.u8[p + 1];
            if (n >= 2 && n <= 6 && s.text >= 0) { s.texts.push({ p: s.text, ref: s.textRef }); s.yesno = n === 5; s.text = -1; }
            else if ((n === 0 || n === 1 || n === 9) && s.v8000) { mark(s); s.gives.push({ k: 'item', item: s.v8000.n, qty: s.v8001 ? s.v8001.n : 1, at: s.v8000.at, qtyAt: s.v8001 ? s.v8001.at : -1, found: n === 1 }); }
            break;
          }
          case 0x67: { const t = r.ptr(p + 1); if (t >= 0) s.texts.push({ p: t, ref: p + 1 }); break; }
          case 0x6E: s.yesno = true; break;
          case 0x44: mark(s); s.gives.push({ k: 'item', item: r.r16(p + 1), qty: r.r16(p + 3), at: p + 1, qtyAt: p + 3, silent: true }); break;
          case 0x45: s.acts.push({ k: 'take', item: r.r16(p + 1), qty: r.r16(p + 3) }); break;
          case 0x79: { let sp = r.r16(p + 1), at = p + 1;                       // the species can come from a variable (the starters)
            if (sp >= 0x4000 && s.known.has(sp)) { at = s.knownAt.get(sp) || -1; sp = s.known.get(sp); }
            mark(s); s.gives.push({ k: 'mon', sp, lvl: r.u8[p + 3], at, lvlAt: p + 3 }); break; }
          case 0x7A: mark(s); s.gives.push({ k: 'egg', sp: r.r16(p + 1), at: p + 1 }); break;
          case 0xB6: mark(s); s.battles.push({ k: 'wild', sp: r.r16(p + 1), lvl: r.u8[p + 3], at: p + 1, lvlAt: p + 3 }); break;
          case 0x39: case 0x3A: case 0x3B: case 0x3C: case 0x3D: s.acts.push({ k: 'warp', g: r.u8[p + 1], n: r.u8[p + 2] }); break;
          case 0x53: s.acts.push({ k: 'hide', id: r.r16(p + 1) }); break;
          case 0x55: s.acts.push({ k: 'show', id: r.r16(p + 1) }); break;
          case 0x5C: {
            const type = r.u8[p + 1], id = r.r16(p + 2), len = TL[type] || 14, f = TRAINER_FLAGS + id;
            const texts = [6, 10].map(k => ({ p: r.ptr(p + k), ref: p + k })).filter(t => t.p >= 0 && !(type === 3 && t.ref === p + 10));
            const checks = ![3, 9].includes(type);       // no_intro and the early rival battle do not check "already beaten"
            if (checks && !s.kflags.has(f) && !s.conds.some(c => c.k === 'flag' && c.f === f)) {   // already beaten: the script goes on after the command
              const beaten = clone(s); beaten.conds.push({ k: 'flag', f, set: true }); beaten.p = p + len; beaten.lastFork = p + len;
              if (consistent(beaten.conds)) todo.push(beaten);
              s.conds.push({ k: 'flag', f, set: false });
            }
            if (s.kflags.get(f) === true || s.conds.some(c => c.k === 'flag' && c.f === f && c.set)) { s.p = p + len; continue; }
            mark(s); s.battles.push({ k: 'trainer', id, type, at: p }); s.texts.push(...texts); s.eff.push({ k: 'flag', f, set: true, at: p, trainer: id }); s.kflags.set(f, true);
            const after = [1, 2].includes(type) ? r.ptr(p + 14) : [6, 8].includes(type) ? r.ptr(p + 18) : [3, 9].includes(type) ? p + len : -1;
            if (after < 0) { done = true; continue; }
            s.p = after; continue;
          }
          default: break;
        }
        const n = op === 0x5C ? 0 : LEN[op];
        if (!n) { s.cut = true; break; }
        s.p = p + n;
      }
      if (!s.merged) paths.push(s);
    }
    return paths;
  }

  // ---------- every script in the game ----------
  function entries() {
    const r = R(), g = G(), out = [], seenHdr = new Set();
    g.mapGroups.forEach((maps, gi) => maps.forEach((hdr, ni) => {
      if (seenHdr.has(hdr)) return; seenHdr.add(hdr);
      let E; try { E = MapsTab.api.readEvents(r.ptr(hdr + 4)); } catch (e) { return; }
      for (const e of E.obj) {
        const sp = r.ptr(e.off + 16); if (sp < 0) continue;
        const flag = r.r16(e.off + 20), id = r.u8[e.off];
        out.push({ g: gi, n: ni, kind: 'obj', i: e.i, localId: id, gfx: r.u8[e.off + 1], xy: MapsTab.api.evXY(e), sp, ref: e.off + 16, conds: flag ? [{ k: 'flag', f: flag, set: false, visible: true }] : [] });
      }
      for (const e of E.bg) { if (r.u8[e.off + 5] >= 5) continue; const sp = r.ptr(e.off + 8); if (sp >= 0) out.push({ g: gi, n: ni, kind: 'bg', i: e.i, xy: MapsTab.api.evXY(e), sp, ref: e.off + 8, conds: [] }); }
      for (const e of E.coord) {
        const sp = r.ptr(e.off + 12), v = r.r16(e.off + 6); if (sp < 0 || !v) continue;
        out.push({ g: gi, n: ni, kind: 'coord', i: e.i, xy: MapsTab.api.evXY(e), sp, ref: e.off + 12, conds: persistentVar(v) ? [{ k: 'var', v, c: 1, n: r.r16(e.off + 8) }] : [] });
      }
      const ms = r.ptr(hdr + 8);
      if (ms >= 0) for (let k = 0; k < 16 && r.u8[ms + k * 5]; k++) {
        const type = r.u8[ms + k * 5], tp = r.ptr(ms + k * 5 + 1); if (tp < 0 || (type !== 2 && type !== 4)) continue;
        for (let j = 0; j < 32 && r.r16(tp + j * 8); j++) {             // { u16 var, u16 value, u32 script } … 0
          const v = r.r16(tp + j * 8), n = r.r16(tp + j * 8 + 2), sp = r.ptr(tp + j * 8 + 4); if (sp < 0) continue;
          out.push({ g: gi, n: ni, kind: type === 2 ? 'frame' : 'warpin', i: j, sp, ref: tp + j * 8 + 4, conds: persistentVar(v) ? [{ k: 'var', v, c: 1, n }] : [] });
        }
      }
    }));
    return out;
  }

  // FireRed sets many "hide this person" flags when a new game starts: the script with a long run of setflag
  function initialFlags() {
    const r = R(), set = new Set();
    let best = -1, bestLen = 0;
    for (let p = 0, run = 0, at = -1; p < r.size - 3; ) {
      if (r.u8[p] === 0x29) { if (!run) at = p; run++; p += 3; if (run > bestLen) { bestLen = run; best = at; } }
      else { run = 0; p += run ? 3 : 1; }
    }
    if (bestLen >= 20) for (let p = best; r.u8[p] === 0x29; p += 3) set.add(r.r16(p + 1));
    return set;
  }

  // ---------- events ----------
  function scan() {
    const r = R(), list = [], byKey = new Map();
    for (const en of entries()) {
      let paths; try { paths = follow(en.sp, en.conds, false, en.ref); } catch (e) { continue; }
      for (const s of paths) {
        if (!s.eff.length && !s.gives.length && !s.battles.length) continue;
        const sig = s.eff.map(x => x.k + x.v + x.f + x.n + x.set).join(',') + '|' + s.gives.map(x => x.k + (x.item || x.sp)).join(',') + '|' + s.battles.map(x => x.k + (x.id || x.sp)).join(',');
        const key = s.eventStart + '|' + sig;
        if (byKey.has(key)) { byKey.get(key).places.push(en); continue; }
        const ev = { id: en.g + '.' + en.n + ':' + en.kind + (en.localId != null ? '#' + en.localId : en.i) + ':' + (s.eventStart >>> 0).toString(16), g: en.g, n: en.n, kind: en.kind,
          localId: en.localId, gfx: en.gfx, xy: en.xy, entry: en.sp, start: s.eventStart, ref: s.eventRef && s.eventRef.type === 'entry' ? { type: 'entry', at: en.ref } : s.eventRef, conds: s.conds, eff: s.eff, gives: s.gives, battles: s.battles, texts: s.texts,
          acts: s.acts, cut: !!s.cut, places: [en] };
        byKey.set(key, ev); list.push(ev);
      }
    }
    return list;
  }

  // when does each event become possible? Each condition needs an earlier event that sets it (unless the new game
  // already has it); an event's depth is one more than the latest of those. Then: what came right before it.
  function order(list, init) {
    const setters = new Map();                           // 'f<flag>+' / 'f<flag>-' / 'v<var>' -> events
    const add = (k, ev) => { if (!setters.has(k)) setters.set(k, []); setters.get(k).push(ev); };
    for (const ev of list) for (const e of ev.eff) e.k === 'flag' ? add('f' + e.f + (e.set ? '+' : '-'), ev) : add('v' + e.v, ev);
    const initially = c => c.k === 'flag' ? (c.set ? init.has(c.f) : !init.has(c.f)) : c.k === 'var' ? varOk(c, 0) : true;
    const providers = c => c.k === 'flag' ? (setters.get('f' + c.f + (c.set ? '+' : '-')) || [])
      : (setters.get('v' + c.v) || []).filter(x => x.eff.some(e => e.v === c.v && (e.k === 'addvar' || e.n < 0 || varOk(c, e.n))));
    // story counters: FireRed moves one variable forward through the story (0x4055: 1 Oak stops you, 2 the lab,
    // 3 the starter, 4 the rival, 5 the parcel…): setting it to n comes after setting it to the value before
    const setsTo = new Map();
    for (const ev of list) for (const e of ev.eff) if (e.k === 'var' && e.n > 0) { if (!setsTo.has(e.v)) setsTo.set(e.v, new Map()); const m = setsTo.get(e.v); if (!m.has(e.n)) m.set(e.n, []); m.get(e.n).push(ev); }
    for (const ev of list) {
      ev.need = ev.conds.filter(c => !initially(c)).map(c => ({ c, from: providers(c).filter(x => x !== ev) }));
      for (const e of ev.eff) {
        if (e.k !== 'var' || !(e.n > 0) || !setsTo.has(e.v)) continue;
        const prev = [...setsTo.get(e.v).keys()].filter(x => x < e.n).sort((a, b) => b - a)[0];
        if (prev != null) { const from = setsTo.get(e.v).get(prev).filter(x => x !== ev); if (from.length) ev.need.push({ c: { k: 'seq', v: e.v, n: prev }, from }); }
      }
      ev.depth = ev.need.some(x => !x.from.length) ? Infinity : ev.need.length ? Infinity : 0;
    }
    for (let round = 0, changed = true; changed && round < 200; round++) {
      changed = false;
      for (const ev of list) {
        if (!ev.need.length) continue;
        let d = 0;
        for (const nd of ev.need) { const m = Math.min(...nd.from.map(x => x.depth)); d = Math.max(d, m + 1); }
        if (d < ev.depth) { ev.depth = d; changed = true; }
      }
    }
    for (const ev of list) {
      ev.after = [];
      for (const nd of ev.need) { const best = nd.from.filter(x => x.depth < ev.depth).sort((a, b) => b.depth - a.depth)[0]; if (best) ev.after.push(best.id); }
      ev.after = [...new Set(ev.after)];
      delete ev.need;
    }
  }

  // ---------- beats: what the player sees as one moment of the story ----------
  // events on the same map, at the same depth, that set the same thing (not counting "this trainer is beaten") are
  // one beat with alternatives: the three starters, the rival's three teams, a yes / no answer
  function beats(list) {
    const parent = new Map(list.map(e => [e.id, e.id])), find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const join = (a, b) => parent.set(find(a), find(b));
    const groups = new Map();
    for (const ev of list) {
      for (const e of ev.eff) {
        if (e.trainer != null) continue;
        const k = ev.g + '.' + ev.n + '@' + ev.depth + ':' + (e.k === 'flag' ? 'f' + e.f + e.set : 'v' + e.v + '=' + e.n);
        if (groups.has(k)) join(ev.id, groups.get(k)); else groups.set(k, ev.id);
      }
      const pk = ev.g + '.' + ev.n + ':' + ev.kind + (ev.localId != null ? ev.localId : ev.places[0].i) + '@' + ev.start;   // the same branch of the same script
      if (groups.has(pk)) join(ev.id, groups.get(pk)); else groups.set(pk, ev.id);
    }
    const out = new Map();
    for (const ev of list) { const k = find(ev.id); if (!out.has(k)) out.set(k, { id: k, events: [] }); out.get(k).events.push(ev); ev.beat = k; }
    for (const b of out.values()) {
      const e0 = b.events.slice().sort((x, y) => x.depth - y.depth)[0];
      Object.assign(b, { g: e0.g, n: e0.n, depth: e0.depth, after: [...new Set(b.events.flatMap(e => e.after.map(a => list.find(x => x.id === a)).filter(Boolean).map(x => x.beat)))].filter(x => x !== b.id) });
    }
    return [...out.values()];
  }

  function get(force) {
    if (cache && !force && cache.rom === App.rom && cache.ver === App.romVersion) return cache;
    const t0 = performance.now();
    // the game as it is without our story (our scripts and the hooks on its moments taken out, on a copy)
    let st = null; try { st = typeof StoryTab !== 'undefined' ? StoryTab.story() : null; } catch (e) { st = null; }
    const keep = App.rom;
    if (st && st.meta) {
      const c = new Rom(keep.u8.slice().buffer, 'story-analysis.gba'); c.freeStart = keep.freeStart; c.freeEnd = keep.freeEnd; c._hint = keep._hint;
      App.rom = c;
      try { StoryTab.undoOn(Object.assign({}, st)); } catch (e) { console.warn('story analysis: undo on a copy', e); }
    }
    let init, list, bs;
    try { init = initialFlags(); list = scan(); order(list, init); bs = beats(list); } finally { App.rom = keep; }
    cache = { rom: App.rom, ver: App.romVersion, events: list, beats: bs, init, ms: Math.round(performance.now() - t0) };
    if (typeof StoryNames !== 'undefined') StoryNames.apply(cache);
    return cache;
  }

  return { get, follow, entries, initialFlags, OPS, TRAINER_FLAGS, get BADGES() { const b = App.game.badgeFlag; return [0, 1, 2, 3, 4, 5, 6, 7].map(i => b + i); }, varOk, _consistent: consistent };
})();
