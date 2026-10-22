// Story tab: the plot as chapters and steps - talk to someone, beat a trainer, reach a place, a scene that plays
// when you arrive, a yes / no choice that splits the story, a rival battle - plus guards that block the way until a
// step is done and characters whose lines change as the story goes on. "Apply to the game" compiles it all:
// one story variable counts the steps, and the editor writes the scripts, triggers and map scenes.
'use strict';

const StoryTab = (() => {
  const R = () => App.rom, G = () => App.game;
  const TYPES = {
    talk: ['💬', 'Talk to someone'], beat: ['⚔', 'Beat a trainer'], reach: ['📍', 'Reach a place'], scene: ['🎬', 'A scene when you arrive'],
    choice: ['❓', 'A choice (yes / no)'], rival: ['🥊', 'Rival battle'], cutscene: ['🎞', 'An animated scene'],
  };
  // an animated scene is compiled like the step its trigger is like: arriving on the map, stepping on a square, talking to someone
  const kindOf = st => st.type === 'cutscene' ? ({ step: 'reach', talk: 'talk' })[st.trig] || 'scene' : st.type;
  const blocksOf = st => st.type === 'cutscene' ? Cutscene.blocks(st) : st.blocks;
  let selPath = null, root = null;                       // selPath: [chapter, step] or [chapter, step, 'yes'|'no', sub]
  const uid = () => 's' + Math.random().toString(36).slice(2, 8);

  // ---------- data ----------
  function story() {
    const s = Project.getData('story', () => ({ format: 'ember-story-1', chapters: [{ id: uid(), title: T('Chapter 1'), steps: [] }], characters: [] }));
    for (const ch of s.chapters) {                       // the wizard's skeleton: keep the leader battles, drop the rest
      ch.id = ch.id || uid();
      ch.steps = ch.steps || [];
      for (let i = ch.steps.length - 1; i >= 0; i--) if (!TYPES[ch.steps[i].type]) ch.steps.splice(i, 1);     // edit in place: the UI keeps references
      for (const st of ch.steps) { if (!st.id) st.id = uid(); if (!st.blocks) st.blocks = []; }
    }
    s.characters = s.characters || [];
    return s;
  }
  const save = s => Project.setData('story', s);
  function stepAt(s, p) {
    if (!p) return null;
    const ch = s.chapters[p[0]]; if (!ch) return null;
    let st = ch.steps[p[1]]; if (p.length > 2 && st) st = (st[p[2]] || [])[p[3]];
    return st || null;
  }
  function allSteps(s) { const out = []; for (const ch of s.chapters) for (const st of ch.steps) { out.push(st); if (st.type === 'choice') out.push(...(st.yes || []), ...(st.no || [])); } return out; }
  const mapLabel = (g, n) => g == null ? T('no map chosen') : g + '.' + n + ' ' + Game.mapName(R(), G(), R().u8[G().mapGroups[g][n] + 20]);
  function objOf(g, n, localId) { if (g == null || localId == null) return null; const evs = MapsTab.api.readEvents(R().ptr(G().mapGroups[g][n] + 4)); return evs.obj.find(e => R().u8[e.off] === localId) || null; }
  function trainerObj(st) {                                   // a 'beat' step: the trainer's object on a map
    if (st.g != null && st.localId != null) return { g: st.g, n: st.n, e: objOf(st.g, st.n, st.localId) };
    if (st.trainer) { const at = (Objects.usage().trainerAt.get(st.trainer) || [])[0]; if (at) { const e = MapsTab.api.readEvents(R().ptr(G().mapGroups[at.g][at.n] + 4)).obj[at.i]; return { g: at.g, n: at.n, e }; } }
    return null;
  }

  // ---------- checks ----------
  function blocked(g, n, x, y) {                        // a wall, a tree, water…: the collision of that square
    const r = R(), l = r.ptr(G().mapGroups[g][n]), w = r.r32(l), hh = r.r32(l + 4);
    return x < 0 || y < 0 || x >= w || y >= hh || ((r.r16(r.ptr(l + 12) + (y * w + x) * 2) >> 10) & 3) !== 0;
  }
  function problems(s) {
    const out = [];
    for (const st of allSteps(s)) {
      const name = '“' + (st.title || T(TYPES[st.type][1])) + '”';
      if (st.type === 'cutscene') {
        if (st.g == null) out.push(name + ': ' + T('choose the map'));
        else if (st.trig === 'step' && st.x == null) out.push(name + ': ' + T('choose the place on the map'));
        else if (st.trig === 'step' && blocked(st.g, st.n, st.x, st.y)) out.push(name + ': ' + T('the place is a square the player cannot walk on, so the step never happens') + ' (' + st.x + ',' + st.y + ')');
        else if (st.trig === 'talk' && st.localId == null) out.push(name + ': ' + T('choose the person on the map'));
        for (const p of Cutscene.problems(st)) out.push(name + ': ' + p);
        if (st.guard && (st.guard.g == null || st.guard.x == null)) out.push(name + ': ' + T('choose where the guard stands'));
        continue;
      }
      if (['talk', 'choice', 'rival'].includes(st.type) && (st.g == null || st.localId == null) && !(st.type === 'rival' && st.newAt)) out.push(name + ': ' + T('choose the person on the map'));
      if (st.type === 'beat' && !trainerObj(st)) out.push(name + ': ' + T('choose the trainer'));
      if (st.type === 'reach' && (st.g == null || st.x == null)) out.push(name + ': ' + T('choose the place on the map'));
      else if (st.type === 'reach' && blocked(st.g, st.n, st.x, st.y)) out.push(name + ': ' + T('the place is a square the player cannot walk on, so the step never happens') + ' (' + st.x + ',' + st.y + ')');
      if (st.type === 'scene' && st.g == null) out.push(name + ': ' + T('choose the map'));
      if (st.guard && (st.guard.g == null || st.guard.x == null)) out.push(name + ': ' + T('choose where the guard stands'));
    }
    return out;
  }

  // ---------- compile ----------
  // stages: the story variable counts finished steps; branches of a choice run in parallel on the same numbers
  function flatten(s) {
    const nodes = [];
    const run = (steps, cond, start) => {
      let k = start, last = null;
      for (const st of steps) {
        if (st.type === 'choice') {
          const node = { st, stage: k, cond }; nodes.push(node);
          const yEnd = run(st.yes || [], { flag: st.flag, set: true }, k + 1), nEnd = run(st.no || [], { flag: st.flag, set: false }, k + 1);
          const merge = Math.max(yEnd.end, nEnd.end);
          node.nextYes = (st.yes || []).length ? k + 1 : merge; node.nextNo = (st.no || []).length ? k + 1 : merge;
          if (yEnd.last) yEnd.last.next = merge; if (nEnd.last) nEnd.last.next = merge;
          k = merge; last = null;
        } else { const node = { st, stage: k, cond, next: k + 1 }; nodes.push(node); last = node; k++; }
      }
      return { end: k, last };
    };
    let k = 0; for (const ch of s.chapters) k = run(ch.steps, null, k).end;
    return nodes;
  }
  const key = (g, n, id) => g + '.' + n + '.' + id;
  function undoPrevious(s) {
    const r = R(), m = s.meta; if (!m) return;
    for (const [k, ptr] of Object.entries(m.orig || {})) { const [g, n, id] = k.split('.').map(Number); const e = objOf(g, n, id); if (e && ptr) r.w32(e.off + 16, ptr); }
    for (const c of (m.created || [])) {
      const ev = MapsTab.api.readEvents(r.ptr(G().mapGroups[c.g][c.n] + 4));
      if (c.kind === 'obj') { const e = ev.obj.find(x => r.u8[x.off] === c.localId); if (e) MapsTab.api.deleteEvent(c.g, c.n, 'obj', e.i); }
      else { const v = c.v || s.stageVar, e = ev.coord.find(x => MapsTab.api.evXY(x)[0] === c.x && MapsTab.api.evXY(x)[1] === c.y && r.r16(x.off + 6) === v); if (e) MapsTab.api.deleteEvent(c.g, c.n, 'coord', e.i); }
    }
    // map scripts: back to the map's own list (ours were new copies, freed below)
    for (const f of (m.frames || [])) { if (f.orig != null) r.w32(G().mapGroups[f.g][f.n] + 8, f.orig); else removeFrameScripts(f.g, f.n, f.v || s.stageVar); }
    for (const pt of (m.patches || []).slice().reverse()) r.write(pt.at, Uint8Array.from(pt.bytes));   // the game's own moments, as they were
    Script.free(m.allocs);
    s.meta = null;
  }
  function removeFrameScripts(g, n, v) {
    const r = R(), hdr = G().mapGroups[g][n], ms = r.ptr(hdr + 8); if (ms < 0) return;
    for (let i = 0; i < 16 && r.u8[ms + i * 5]; i++) if (r.u8[ms + i * 5] === 2) {
      const t = r.ptr(ms + i * 5 + 1), keep = [];
      for (let k = 0; k < 32 && r.r16(t + k * 8); k++) if (r.r16(t + k * 8) !== v) keep.push(r.u8.slice(t + k * 8, t + k * 8 + 8));
      const nt = new Uint8Array(keep.length * 8 + 2); keep.forEach((b, k) => nt.set(b, k * 8)); r.wptr(ms + i * 5 + 1, r.writeNew(nt));
    }
  }
  function apply() {
    const s = story(), probs = problems(s);
    if (probs.length) throw new Error(T('Fix these first:') + '\n• ' + probs.join('\n• '));
    const r = R();
    undoPrevious(s);
    s.stageVar = s.stageVar || Script.freeVar();
    const meta = { orig: {}, created: [], frames: [], allocs: [], patches: [] }, V = s.stageVar;
    const addAllocs = a => meta.allocs.push(...a);
    // the game's own story, as it is without ours
    let sm = null; try { sm = StoryMap.get(true); } catch (e) { console.error(e); }
    const beatOf = id => (id && sm && sm.beats.find(b => b.id === id)) || null;
    // story lines: your chapters that are not tied to a moment of the game (variable V), and one line with its own
    // variable for each chapter that comes right after a moment (so a chapter after the rival does not wait for one after Brock)
    s.lineVars = s.lineVars || {};
    const lines = [{ V, chapters: s.chapters.filter(ch => !beatOf(ch.anchor)) }], usedVars = [V];
    for (const ch of s.chapters) {
      const b = beatOf(ch.anchor); if (!b) continue;
      let v = s.lineVars[ch.id]; if (!v || usedVars.includes(v)) v = Script.freeVar(usedVars);
      usedVars.push(v); s.lineVars[ch.id] = v;
      lines.push({ V: v, chapters: [ch], anchor: b, holds: beatOf(ch.holds), ch });
    }
    for (const id of Object.keys(s.lineVars)) if (!lines.some(l => l.ch && l.ch.id === id)) delete s.lineVars[id];
    const flatAll = () => lines.flatMap(l => {
      const ns = flatten({ chapters: l.chapters });
      ns.forEach((nd, i) => { nd.V = l.V; if (i === 0 && l.anchor) nd.req = doneToken(l.anchor); });
      l.nodes = ns; l.end = ns.length ? Math.max(...ns.map(x => x.next != null ? x.next : Math.max(x.nextYes, x.nextNo))) : 0;
      return ns;
    });
    // flags for choices and guards, trainers for rivals (kept in the story so they stay the same)
    for (const nd of flatAll()) { if (nd.st.type === 'choice' && !nd.st.flag) nd.st.flag = Objects._freeFlag(); }
    const nodes = flatAll();                             // again: the steps after a choice check its flag, which only exists now
    for (const nd of nodes) if (nd.st.guard && !nd.st.guard.flag) nd.st.guard.flag = Objects._freeFlag();
    // the game's own moments: skipped ones, and the ones that wait for your steps. First, so that our scripts that go
    // on into the game's script (a person's old lines) go through these hooks too.
    if (sm) hookOriginal(s, sm, lines, meta);
    const ctxFor = (g, n, selfId, nd) => ({ stageVar: nd ? nd.V : V, kind: 'object', g, n, selfId });
    // what happens when a step is done: next stage, guards go away
    const done = (a, nd, next, sameMap) => {
      Script.C.setvar(a, nd.V, next);
      const gd = nd.st.guard;
      if (gd) { Script.C.setflag(a, gd.flag); if (sameMap && gd.localId != null && gd.g === sameMap.g && gd.n === sameMap.n) Script.C.removeobject(a, gd.localId); }
    };
    const condJump = (a, cond, lSkip) => { if (!cond) return; Script.C.checkflag(a, cond.flag); Script.C.gotoIf(a, cond.set ? '!=' : '=', lSkip); };
    // the first step after a moment of the game: only once that moment happened
    const reqJump = (a, req, lSkip) => { if (!req) return; if (req.k === 'flag') { Script.C.checkflag(a, req.f); Script.C.gotoIf(a, '!=', lSkip); } else { Script.C.compare(a, req.v, req.n); Script.C.gotoIf(a, '<', lSkip); } };
    // guards: a person standing in the way, hidden by their flag once the step is done
    for (const nd of nodes) {
      const gd = nd.st.guard; if (!gd) continue;
      const e = MapsTab.api.addEvent(gd.g, gd.n, 'obj', gd.x, gd.y), id = r.u8[e.off];
      r.w8(e.off + 1, gd.gfx || 18); r.w8(e.off + 9, gd.face === 'up' ? 7 : gd.face === 'left' ? 9 : gd.face === 'right' ? 10 : 8); r.w16(e.off + 20, gd.flag);
      const a = Script.compile([{ op: 'say', text: gd.text || T("You can't go this way yet.") }], ctxFor(gd.g, gd.n, id)); const w = a.write(); addAllocs(w.allocs);
      r.wptr(MapsTab.api.readEvents(r.ptr(G().mapGroups[gd.g][gd.n] + 4)).obj.find(x => r.u8[x.off] === id).off + 16, w.off);
      gd.localId = id; meta.created.push({ kind: 'obj', g: gd.g, n: gd.n, localId: id });
    }
    // rivals placed on the map
    for (const nd of nodes) {
      const st = nd.st; if (st.type !== 'rival' || st.localId != null || !st.newAt) continue;
      const e = MapsTab.api.addEvent(st.g, st.n, 'obj', st.newAt.x, st.newAt.y); st.createdId = r.u8[e.off];
      r.w8(e.off + 1, st.gfx || 7); r.w8(e.off + 9, 8);
      meta.created.push({ kind: 'obj', g: st.g, n: st.n, localId: st.createdId });
    }
    // animated scenes: their new characters and Pokémon become people of the map first
    for (const nd of nodes) if (nd.st.type === 'cutscene') Cutscene.prepare(nd.st, meta);
    // people: every talk / choice / rival step of the same person in one script
    const people = new Map();
    for (const nd of nodes) if (['talk', 'choice', 'rival'].includes(kindOf(nd.st))) { const id = nd.st.localId != null ? nd.st.localId : nd.st.createdId; const k = key(nd.st.g, nd.st.n, id); if (!people.has(k)) people.set(k, []); people.get(k).push(nd); }
    for (const c of s.characters) if (c.g != null && c.localId != null) { const k = key(c.g, c.n, c.localId); if (!people.has(k)) people.set(k, []); }
    for (const [k, list] of people) {
      const [g, n, id] = k.split('.').map(Number), e = objOf(g, n, id); if (!e) continue;
      const orig = r.ptr(e.off + 16); meta.orig[k] = r.r32(e.off + 16);
      const a = new Script.Asm(), ctx = ctxFor(g, n, id);
      Script.C.lock(a); Script.C.faceplayer(a);
      for (const nd of list.sort((x, y) => x.stage - y.stage)) {
        const lSkip = a.fresh('skip');
        Script.C.compare(a, nd.V, nd.stage); Script.C.gotoIf(a, '!=', lSkip); condJump(a, nd.cond, lSkip); reqJump(a, nd.req, lSkip);
        const st = nd.st;
        if (kindOf(st) === 'talk') { const bl = blocksOf(st); Script.emit(bl && bl.length ? bl : [{ op: 'say', text: '...' }], a, ctx); done(a, nd, nd.next, { g, n }); }
        else if (st.type === 'choice') {
          const lNo = a.fresh('no');
          Script.C.msg(a, st.question || '?', 5); Script.C.compare(a, Script.VAR_RESULT, 1); Script.C.gotoIf(a, '!=', lNo);
          Script.emit(st.yesBlocks || [], a, ctx); Script.C.setflag(a, st.flag); done(a, nd, nd.nextYes, { g, n }); Script.C.release(a); Script.C.end(a);
          a.label(lNo); Script.emit(st.noBlocks || [], a, ctx); Script.C.clearflag(a, st.flag); done(a, nd, nd.nextNo, { g, n });
        } else if (st.type === 'rival') {
          const t = st.trainer || (st.trainer = Objects._freeTrainer());
          writeRival(st, t);
          if (st.intro) Script.C.msg(a, st.intro, 4); Script.C.closemessage(a);
          Script.C.trainerNoIntro(a, t, st.defeat || '...');
          if (st.after) Script.C.msg(a, st.after, 4);
          done(a, nd, nd.next, { g, n });
        }
        Script.C.release(a); Script.C.end(a);
        a.label(lSkip);
      }
      // lines that change with the story: the latest one that applies
      const ch = s.characters.find(c => key(c.g, c.n, c.localId) === k);
      if (ch) {
        const stageOf = sid => { const nd = nodes.find(x => x.st.id === sid); return nd ? (nd.next != null ? nd.next : nd.nextYes) : 0; };
        for (const ln of (ch.lines || []).map(l => Object.assign({ stage: l.after ? stageOf(l.after) : 0 }, l)).sort((x, y) => y.stage - x.stage)) {
          const lSkip = a.fresh('line'); Script.C.compare(a, V, ln.stage); Script.C.gotoIf(a, '<', lSkip);
          Script.C.msg(a, ln.text || '...', 4); Script.C.release(a); Script.C.end(a); a.label(lSkip);
        }
      }
      if (orig >= 0) Script.C.gotoAbs(a, orig); else { Script.C.release(a); Script.C.end(a); }
      const w = a.write(); addAllocs(w.allocs); r.wptr(e.off + 16, w.off);
    }
    // trainers: after the battle, the story moves on
    for (const nd of nodes) {
      if (nd.st.type !== 'beat') continue;
      const to = trainerObj(nd.st); if (!to || !to.e) continue;
      const k = key(to.g, to.n, r.u8[to.e.off]); if (meta.orig[k]) continue;   // already rewritten by an earlier step of the same trainer
      // the battle command may come after a few others (FireRed's gym leaders: setvar, setvar, special, trainerbattle)
      let tid = -1; try { tid = Objects.info(to.g, to.n, to.e).trainer.id; } catch (x) { /* unknown */ }
      const sp = r.ptr(to.e.off + 16); let p = sp;
      while (p < sp + 48 && !(r.u8[p] === 0x5C && r.u8[p + 1] <= 2 && (tid < 0 || r.r16(p + 2) === tid))) p++;
      if (r.u8[p] !== 0x5C || ![0, 1, 2].includes(r.u8[p + 1])) throw new Error(Tf('“{t}”: this trainer has a special battle script the story cannot change yet', { t: nd.st.title || '' }));
      meta.orig[k] = r.r32(to.e.off + 16);
      const type = r.u8[p + 1], id = r.r16(p + 2), local = r.r16(p + 4), intro = r.r32(p + 6), defeat = r.r32(p + 10), after = type ? r.ptr(p + 14) : -1, rest = p + (type ? 18 : 14);
      const a = new Script.Asm(), lAfter = a.fresh('after'), lSkip = a.fresh('skip');
      for (let q = sp; q < p; q++) a.b(r.u8[q]);                         // whatever came before (e.g. lock)
      a.b(0x5C, type || 2).h(id).h(local).w(intro).w(defeat).ref(lAfter);
      Script.C.gotoAbs(a, rest);
      a.label(lAfter);
      Script.C.compare(a, nd.V, nd.stage); Script.C.gotoIf(a, '!=', lSkip); condJump(a, nd.cond, lSkip); reqJump(a, nd.req, lSkip);
      Script.emit(nd.st.blocks || [], a, ctxFor(to.g, to.n, r.u8[to.e.off])); done(a, nd, nd.next, { g: to.g, n: to.n });
      a.label(lSkip);
      if (after >= 0) Script.C.gotoAbs(a, after); else { Script.C.releaseall(a); Script.C.end(a); }
      const w = a.write(); addAllocs(w.allocs); r.wptr(to.e.off + 16, w.off);
    }
    // places: a trigger that fires while the story is at that step
    for (const nd of nodes) {
      if (kindOf(nd.st) !== 'reach') continue;
      const st = nd.st, e = MapsTab.api.addEvent(st.g, st.n, 'coord', st.x, st.y);
      r.w8(e.off + 4, 0); r.w16(e.off + 6, nd.V); r.w16(e.off + 8, nd.stage);
      const a = new Script.Asm(), lSkip = a.fresh('skip');
      Script.C.lockall(a); condJump(a, nd.cond, lSkip); reqJump(a, nd.req, lSkip);
      Script.emit(blocksOf(st) || [], a, { stageVar: nd.V, kind: 'trigger', g: st.g, n: st.n }); done(a, nd, nd.next, { g: st.g, n: st.n });
      a.label(lSkip); Script.C.releaseall(a); Script.C.end(a);
      const w = a.write(); addAllocs(w.allocs);
      const ev = MapsTab.api.readEvents(r.ptr(G().mapGroups[st.g][st.n] + 4)).coord.find(x => MapsTab.api.evXY(x)[0] === st.x && MapsTab.api.evXY(x)[1] === st.y && r.r16(x.off + 6) === nd.V);
      r.wptr(ev.off + 12, w.off);
      meta.created.push({ kind: 'coord', g: st.g, n: st.n, x: st.x, y: st.y, v: nd.V });
    }
    // scenes: play once when you are on that map at that step
    for (const nd of nodes) {
      if (kindOf(nd.st) !== 'scene') continue;
      const st = nd.st, a = new Script.Asm(), lSkip = a.fresh('skip');
      Script.C.lockall(a); condJump(a, nd.cond, lSkip); reqJump(a, nd.req, lSkip);
      Script.emit(blocksOf(st) || [], a, { stageVar: nd.V, kind: 'frame', g: st.g, n: st.n }); done(a, nd, nd.next, { g: st.g, n: st.n });
      a.label(lSkip); Script.C.releaseall(a); Script.C.end(a);
      const w = a.write(); addAllocs(w.allocs);
      if (!meta.frames.some(f => f.g === st.g && f.n === st.n)) meta.frames.push({ g: st.g, n: st.n, v: nd.V, orig: r.r32(G().mapGroups[st.g][st.n] + 8) });
      addAllocs(Script.addFrameScript(st.g, st.n, nd.V, nd.stage, w.off));
    }
    // where each step is in the game (its story line's variable and number, what it waits for): the tests start there
    s.at = {};
    for (const nd of nodes) s.at[nd.st.id] = { V: nd.V, stage: nd.stage, cond: nd.cond || null, req: nd.req || null };
    s.meta = meta; s.applied = new Date().toISOString(); s.stages = lines[0].end;
    save(s);
    return { steps: nodes.length, stageVar: V };
  }
  // what tells that a moment of the game happened: a story counter it moves forward, or a flag it sets
  function doneToken(b) {
    const effs = b.events.slice().sort((x, y) => x.depth - y.depth)[0].eff;
    const v = effs.find(e => e.k === 'var' && e.n > 0); if (v) return { k: 'var', v: v.v, n: v.n };
    const f = effs.find(e => e.k === 'flag' && e.set); if (f) return { k: 'flag', f: f.f };
    return null;
  }
  // the game's own moments: skipping one, or making one wait until a line of your steps is done. The pointer that leads
  // into the moment (a goto_if, the person's script...) now leads to a small script of ours; when the moment starts
  // right after a command (no pointer to change), its first commands move into our script and a goto takes their place.
  function hookOriginal(s, sm, lines, meta) {
    const r = R(), C = Script.C, LEN = Gifts.LEN, TL = Gifts.TRAINER_LEN;
    const skip = new Set((s.original && s.original.skip) || []), gifts = !(s.original && s.original.noGifts);
    const starts = new Set(sm.events.map(e => e.start));
    const patch = (at, n) => meta.patches.push({ at, bytes: Array.from(r.u8.slice(at, at + n)) });
    const write = a => { const w = a.write(); meta.allocs.push(...w.allocs); return w.off; };
    const done = new Set();
    // point the way into the moment at our script; pass(a) continues into the moment as before
    function redirect(ev, build) {
      const ref = ev.ref; if (!ref || ref.at < 0) return false;
      const key = ref.type + ref.at; if (done.has(key)) return true;
      if (ref.type === 'fall') {
        let n = 0; while (n < 5) { const op = r.u8[ev.start + n], l = op === 0x5C ? TL[r.u8[ev.start + n + 1]] : LEN[op]; if (!l || op === 0x02 || op === 0x03 || op === 0x05) return false; n += l; }
        for (const x of starts) if (x > ev.start && x < ev.start + n) return false;     // something jumps into the middle: leave it
        const moved = Array.from(r.u8.slice(ev.start, ev.start + n));
        const a = new Script.Asm(); build(a, () => { for (const b of moved) a.b(b); C.gotoAbs(a, ev.start + n); }, () => C.gotoAbs(a, ref.alt));
        const w = write(a); patch(ev.start, 5); r.w8(ev.start, 0x05); r.wptr(ev.start + 1, w);
      } else {
        const target = r.ptr(ref.at); if (target < 0) return false;
        const a = new Script.Asm(); build(a, () => C.gotoAbs(a, target), () => { if (ref.type === 'ptr') C.gotoAbs(a, ref.alt); else { C.releaseall(a); C.end(a); } });
        const w = write(a); patch(ref.at, 4); r.wptr(ref.at, w);
      }
      done.add(key); return true;
    }
    let missed = 0;
    for (const b of sm.beats) {
      if (skip.has(b.id)) {
        // skipped: what it changes still happens, quietly (and its gifts, unless you said no)
        const e0 = b.events.slice().sort((x, y) => x.depth - y.depth)[0];
        for (const ev of b.events) if (!redirect(ev, a => {
          for (const e of e0.eff) { if (e.k === 'flag') (e.set ? C.setflag : C.clearflag)(a, e.f); else if (e.k === 'var' && e.n >= 0) C.setvar(a, e.v, e.n); else if (e.k === 'addvar') a.b(0x17).h(e.v).h(e.n); }
          if (gifts) for (const g of e0.gives) { if (g.k === 'mon') C.givemon(a, g.sp, g.lvl); else if (g.k === 'item' && !g.found) a.b(0x44).h(g.item).h(g.qty || 1); }
          C.releaseall(a); C.end(a);
        })) missed++;
        continue;
      }
      const line = lines.find(l => l.holds && l.holds.id === b.id && l.end > 0);
      if (line) for (const ev of b.events) if (!redirect(ev, (a, pass, alt) => {
        const lNot = a.fresh('notyet');
        C.compare(a, line.V, line.end); C.gotoIf(a, '<', lNot); pass();
        a.label(lNot); alt();
      })) missed++;
    }
    if (missed) toast(Tf('{n} moments of the game could not be changed (their script is unusual)', { n: missed }), 'err');
  }
  function writeRival(st, id) {
    const r = R(), b = G().offsets.trainers + id * 40;
    Objects.setClass(id, st.cls != null ? st.cls : 0x51);
    if (st.name) Objects.setTrainerName(id, st.name);
    const team = (st.team && st.team.length ? st.team : [{ sp: 1, lvl: 5 }]);
    r.w8(b, 0); r.w32(b + 24, 0);
    const arr = new Uint8Array(team.length * 8), dv = new DataView(arr.buffer);
    team.forEach((m, k) => { dv.setUint16(k * 8 + 2, m.lvl, true); dv.setUint16(k * 8 + 4, m.sp, true); });
    r.wptr(b + 36, r.writeNew(arr)); r.w8(b + 32, team.length);
  }

  // ---------- UI ----------
  let selBeat = null;                                     // a moment of the game's own story (StoryView)
  const openChapters = new Set([0]);
  function render(el) {
    root = el; el.innerHTML = '';
    const s = story(), rer = () => { save(s); render(root); };
    const probs = problems(s);
    let m = null; try { m = StoryMap.get(); } catch (e) { console.error(e); }
    const head = h('div', { class: 'panel st-head' },
      h('div', { class: 'row wrap' }, h('h2', {}, '📖 ' + T('Story')), h('span', { style: { flex: 1 } }),
        h('button', { class: 'primary', onclick: async () => {
          try { const res = apply(); toast(Tf('The story is in the game: {n} steps (story variable {v}). Save the project to keep it.', { n: res.steps, v: '0x' + res.stageVar.toString(16).toUpperCase() })); render(root); }
          catch (e) { console.error(e); await ask(e.message, { ok: T('OK'), cancel: T('Close') }); }
        } }, '✨ ' + T('Apply the story to the game'))),
      h('p', { class: 'muted' }, T('The game\'s own story is in grey: open a moment to change what is said, what it gives or who you battle, to skip it, or to add your own steps right after it. Your steps happen in order, each one waits for the one before it.')),
      probs.length ? h('div', { class: 'warn' }, '⚠ ' + probs.length + ' ' + T('steps still need a place on the map')) : (s.applied ? h('div', { class: 'ok' }, '✓ ' + T('Applied') + ' ' + new Date(s.applied).toLocaleString() + (s.stageVar ? ' · ' + T('story variable') + ' 0x' + s.stageVar.toString(16).toUpperCase() : '')) : ''),
      m ? StoryView.bar(rer) : '');
    // your chapters
    const chapterBox = (ch, ci) => {
      const anchorBeat = ch.anchor && m && m.beats.find(b => b.id === ch.anchor);
      const box = h('div', { class: 'st-ch' + (anchorBeat ? ' st-mine' : '') },
        h('div', { class: 'row' }, h('input', { class: 'st-chtitle', value: ch.title, dir: 'auto', onchange: e => { ch.title = e.target.value; save(s); } }),
          h('span', { class: 'bl-tools' }, ci > 0 && !anchorBeat ? h('button', { title: T('Move up'), onclick: () => { s.chapters.splice(ci - 1, 0, s.chapters.splice(ci, 1)[0]); rer(); } }, '↑') : '',
            h('button', { title: T('Delete'), onclick: async () => { if (await ask(Tf('Delete the chapter “{t}” and its steps?', { t: ch.title }), { danger: true })) { s.chapters.splice(ci, 1); selPath = null; rer(); } } }, '✕'))),
        anchorBeat ? holdsField(ch, anchorBeat, m, s, rer) : '');
      const stepList = (steps, pathOf) => {
        const ul = h('div', { class: 'st-steps' });
        steps.forEach((st, si) => {
          const p = pathOf(si), selNow = !selBeat && selPath && JSON.stringify(selPath) === JSON.stringify(p);
          const where = st.type === 'beat' ? (trainerObj(st) ? mapLabel(trainerObj(st).g, trainerObj(st).n) : '') : st.g != null ? mapLabel(st.g, st.n) : '';
          ul.append(h('div', { class: 'st-step' + (selNow ? ' sel' : ''), onclick: () => { selPath = p; selBeat = null; render(root); } },
            h('span', { class: 'st-ic' }, TYPES[st.type][0]), h('span', { class: 'st-title', dir: 'auto' }, st.title || T(TYPES[st.type][1])),
            h('span', { class: 'muted st-where', dir: 'auto' }, where), st.guard ? h('span', { title: T('A guard blocks the way until this step') }, '🚧') : '',
            h('span', { class: 'bl-tools' }, si > 0 ? h('button', { onclick: e => { e.stopPropagation(); steps.splice(si - 1, 0, steps.splice(si, 1)[0]); rer(); } }, '↑') : '',
              h('button', { onclick: async e => { e.stopPropagation(); if (await ask(T('Delete this step?'), { danger: true })) { steps.splice(si, 1); selPath = null; rer(); } } }, '✕'))));
          if (st.type === 'choice') ul.append(h('div', { class: 'st-branches' },
            h('div', { class: 'st-branch' }, h('div', { class: 'bl-branch-label' }, '✔ ' + T('If they answer YES')), stepList(st.yes = st.yes || [], k => p.concat(['yes', k])), addStep(st.yes, s, false)),
            h('div', { class: 'st-branch' }, h('div', { class: 'bl-branch-label' }, '✘ ' + T('If they answer NO')), stepList(st.no = st.no || [], k => p.concat(['no', k])), addStep(st.no, s, false))));
        });
        return ul;
      };
      box.append(stepList(ch.steps, si => [ci, si]), addStep(ch.steps, s, true));
      return box;
    };
    const isAnchored = ch => ch.anchor && m && m.beats.some(b => b.id === ch.anchor);
    const free = h('div', { class: 'st-free' });
    s.chapters.forEach((ch, ci) => { if (!isAnchored(ch)) free.append(chapterBox(ch, ci)); });
    free.append(h('button', { onclick: () => { s.chapters.push({ id: uid(), title: T('Chapter') + ' ' + (s.chapters.length + 1), steps: [] }); rer(); } }, '+ ' + T('Add a chapter')));
    const after = id => s.chapters.map((ch, ci) => ch.anchor === id ? chapterBox(ch, ci) : null).filter(Boolean);
    const o = {
      sel: selBeat, rer, after,
      pick: id => { selBeat = id; selPath = null; const b = m.beats.find(x => x.id === id); if (b) openChapters.add(b.chapter); render(root); },
      openChapter: ci => openChapters.has(ci) || (selBeat && m.beats.some(b => b.id === selBeat && b.chapter === ci)),
      toggleChapter: (ci, open) => { if (open) openChapters.add(ci); else openChapters.delete(ci); },
      addAfter: b => addAfter(b, m, s),
      skip: (b, on) => { s.original = s.original || { skip: [] }; const k = s.original.skip.indexOf(b.id); if (on && k < 0) s.original.skip.push(b.id); if (!on && k >= 0) s.original.skip.splice(k, 1); rer(); },
      test: b => testBeat(b, m, s),
    };
    const tl = h('div', { class: 'panel st-tl' });
    if (m && StoryView.view === 'journey') { el.append(head, Journey.view(m, o)); return; }
    if (m && StoryView.view === 'flow') {
      const beat = selBeat && m.beats.find(b => b.id === selBeat);
      el.append(head, StoryView.flowchart(m, s, o), beat ? h('div', { class: 'panel st-ed' }, StoryView.editor(beat, m, s, o)) : '');
      return;
    }
    if (m && StoryView.view === 'place') tl.append(StoryView.byPlace(m, s, o), h('h3', {}, T('Your own chapters')), free);
    else {
      if (s.chapters.some(ch => !isAnchored(ch)) || !m) tl.append(h('div', { class: 'st-sec' }, T('Your story')), free);
      else tl.append(free);
      if (m) tl.append(h('div', { class: 'st-sec' }, T('The story of the game')), StoryView.timeline(m, s, o));
    }
    const beat = selBeat && m && m.beats.find(b => b.id === selBeat);
    const st = !beat && stepAt(s, selPath);
    const ed = h('div', { class: 'panel st-ed' }, beat ? StoryView.editor(beat, m, s, o) : st ? stepEditor(st, s, rer) : h('p', { class: 'muted' }, T('Choose a moment or a step on the left, or add one.')));
    el.append(head, h('div', { class: 'cols st-cols' }, tl, h('div', {}, ed, beat ? '' : charactersPanel(s, rer))));
  }
  // your chapter right after a moment of the game: which moment of the game waits for it
  function holdsField(ch, anchor, m, s, rer) {
    const next = m.timeline.filter(b => b.main && m.timeline.indexOf(b) > m.timeline.indexOf(anchor)).slice(0, 12);
    return h('div', { class: 'st-hold' }, h('span', { class: 'muted' }, '↳ ' + Tf('After “{t}”', { t: anchor.title }) + ' · ' + T('then') + ' '),
      h('select', { onchange: e => { ch.holds = e.target.value || null; rer(); } },
        h('option', { value: '', selected: !ch.holds }, T('the game goes on as usual')),
        ...next.map(b => h('option', { value: b.id, selected: ch.holds === b.id }, Tf('“{t}” waits for these steps', { t: b.title })))));
  }
  function addAfter(b, m, s) {
    let ch = s.chapters.find(c => c.anchor === b.id);
    if (!ch) {
      const next = m.timeline.find(x => x.main && m.timeline.indexOf(x) > m.timeline.indexOf(b));
      ch = { id: uid(), title: Tf('After “{t}”', { t: b.title }), anchor: b.id, holds: next ? next.id : null, steps: [] };
      s.chapters.push(ch);
    }
    selBeat = null; openChapters.add(b.chapter); save(s); render(root);
    const btn = [...root.querySelectorAll('.st-mine')].map(x => x.querySelector('.bl-add')).filter(Boolean).pop();
    if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
  }
  // the game, right before this moment: flags and variables as its conditions need them
  async function testBeat(b, m, s) {
    const e = b.events.slice().sort((x, y) => x.depth - y.depth)[0];
    const p = await Blocks.pickOnMap(b.g, b.n, {}); if (!p) return;
    const vars = new Map(), flags = [], clear = [];
    for (const c of e.conds) {
      if (c.k === 'flag') { if (c.set) flags.push(c.f); else if (m.init.has(c.f)) clear.push(c.f); }
      else if (c.k === 'var' && !vars.has(c.v)) { const all = e.conds.filter(x => x.k === 'var' && x.v === c.v); for (let x = 0; x < 300; x++) if (all.every(cc => StoryMap.varOk(cc, x))) { vars.set(c.v, x); break; } }
    }
    Emu.playFrom({ g: b.g, n: b.n, x: p.x, y: p.y, team: Emu.team(), vars: [...vars], flags, clear, label: b.title });
  }
  function addStep(list, s, allowChoice) {
    const b = h('button', { class: 'bl-add', onclick: () => {
      const back = h('div', { class: 'bl-pal-back', onclick: e => { if (e.target === back) back.remove(); } });
      back.append(h('div', { class: 'panel bl-pal' }, h('div', { class: 'bl-pal-cat' }, T('What happens next?')),
        h('div', { class: 'bl-pal-row' }, ...Object.entries(TYPES).filter(([k]) => allowChoice || k !== 'choice').map(([k, [ic, l]]) => h('button', { class: 'bl-pal-item', onclick: () => {
          back.remove(); list.push({ id: uid(), type: k, title: '', blocks: k === 'talk' ? [{ op: 'say', text: '' }] : [] }); save(s); render(root);
        } }, ic + ' ' + T(l))))));
      document.body.append(back);
    } }, '+ ' + T('Add a step'));
    return b;
  }
  function mapSelect(cur, on) {
    const opts = [h('option', { value: '' }, '— ' + T('choose a map') + ' —')];
    G().mapGroups.forEach((ms, g) => ms.forEach((_, n) => opts.push(h('option', { value: g + '.' + n, selected: cur && cur[0] === g && cur[1] === n }, mapLabel(g, n)))));
    return h('select', { class: 'st-map', onchange: e => { if (!e.target.value) return; const [g, n] = e.target.value.split('.').map(Number); on(g, n); } }, ...opts);
  }
  function stepEditor(st, s, rer) {
    const box = h('div', { class: 'st-form' });
    const field = (label, ...kids) => h('div', { class: 'st-field' }, h('label', {}, label), ...kids);
    const testBtn = h('button', { title: T('Starts the game at a spot you pick, with the story at this step'), onclick: async () => {
      const gm = st.type === 'beat' ? trainerObj(st) : st;
      if (!gm || gm.g == null) { toast(T('Choose the map of this step first'), 'err'); return; }
      const p = await Blocks.pickOnMap(gm.g, gm.n, {}); if (!p) return;
      await testAt(st, s, gm.g, gm.n, p.x, p.y);
    } }, '▶ ' + T('Test from this step'));
    box.append(h('div', { class: 'row' }, h('h3', { style: { flex: 1 } }, TYPES[st.type][0] + ' ' + T(TYPES[st.type][1])), testBtn, h('button', { title: T('Test team'), onclick: () => Emu.teamDialog() }, '🎒')),
      field(T('Title (only for you)'), h('input', { value: st.title || '', dir: 'auto', placeholder: T(TYPES[st.type][1]), onchange: e => { st.title = e.target.value; rer(); } })));
    const personPick = (label) => {
      const who = st.g != null && st.localId != null ? objOf(st.g, st.n, st.localId) : null;
      return field(label, mapSelect(st.g != null ? [st.g, st.n] : null, (g, n) => { st.g = g; st.n = n; st.localId = null; rer(); }),
        st.g != null ? h('div', { class: 'row' }, h('button', { onclick: async () => { const p = await Blocks.pickOnMap(st.g, st.n, { person: true }); if (p) { st.localId = p.obj.localId; rer(); } } }, '👆 ' + T('Pick the person on the map')),
          h('span', { dir: 'auto' }, who ? Objects.tooltip(st.g, st.n, who).slice(0, 60) : h('i', { class: 'warn' }, T('not chosen')))) : '');
    };
    const placePick = (label, obj = st, keyX = 'x', keyY = 'y') => field(label, mapSelect(obj.g != null ? [obj.g, obj.n] : null, (g, n) => { obj.g = g; obj.n = n; obj[keyX] = null; rer(); }),
      obj.g != null ? h('div', { class: 'row' }, h('button', { onclick: async () => { const p = await Blocks.pickOnMap(obj.g, obj.n, { mark: obj[keyX] != null ? { x: obj[keyX], y: obj[keyY] } : null }); if (p) { obj[keyX] = p.x; obj[keyY] = p.y; rer(); } } }, '👆 ' + T('Pick the spot on the map')),
        h('span', {}, obj[keyX] != null ? '(' + obj[keyX] + ', ' + obj[keyY] + ')' : h('i', { class: 'warn' }, T('not chosen')))) : '');
    const blocksField = (label, arr, ctx) => field(label, Blocks.editor(arr, Object.assign({ onChange: () => save(s) }, ctx)));
    if (st.type === 'talk') {
      box.append(personPick(T('Who')), blocksField(T('What happens when you talk to them at this step'), st.blocks = st.blocks || [], { kind: 'object', g: st.g, n: st.n, selfId: st.localId }),
        h('p', { class: 'muted' }, T('Before and after this step the person says their usual lines (or the lines in “Characters” below).')));
    } else if (st.type === 'beat') {
      const to = trainerObj(st), opts = [h('option', { value: '' }, '— ' + T('choose a trainer') + ' —')];
      let curId = st.trainer; if (to && to.e) { try { curId = Objects.info(to.g, to.n, to.e).trainer.id; } catch (x) { /* not a trainer */ } }
      for (const [id, at] of Objects.usage().trainerAt) { const t = Objects.trainer(id); if (!t || !at.length) continue; opts.push(h('option', { value: id, selected: curId === id }, '#' + id + ' ' + (Objects.classNames()[t.cls] || '') + ' ' + t.name + ' · ' + mapLabel(at[0].g, at[0].n))); }
      box.append(field(T('Which trainer'), h('select', { onchange: e => { st.trainer = +e.target.value || null; st.g = st.n = st.localId = null; rer(); } }, ...opts),
        h('div', { class: 'row' }, mapSelect(st.g != null ? [st.g, st.n] : null, async (g, n) => { const p = await Blocks.pickOnMap(g, n, { person: true }); if (p) { st.g = g; st.n = n; st.localId = p.obj.localId; st.trainer = null; rer(); } }), h('span', { class: 'muted' }, T('← or pick the trainer on a map')))),
        to ? h('div', { class: 'row' }, h('span', { dir: 'auto' }, Objects.tooltip(to.g, to.n, to.e)), h('button', { onclick: () => MapsTab.api.open(to.g, to.n, { kind: 'obj', i: to.e.i }) }, T('Show on the map'))) : '',
        blocksField(T('Right after you win (optional)'), st.blocks = st.blocks || [], { kind: 'object', g: to && to.g, n: to && to.n }));
    } else if (st.type === 'reach') {
      box.append(placePick(T('Where')), blocksField(T('What happens when you step there'), st.blocks = st.blocks || [], { kind: 'trigger', g: st.g, n: st.n, start: st.x != null ? { x: st.x, y: st.y } : null }));
      if (st.g != null && st.blocks.some(b => ['move', 'face', 'emote', 'hide', 'show'].includes(b.op))) box.append(Blocks.preview(st.blocks, { g: st.g, n: st.n, start: st.x != null ? { x: st.x, y: st.y } : null }));
    } else if (st.type === 'scene') {
      box.append(field(T('Map'), mapSelect(st.g != null ? [st.g, st.n] : null, (g, n) => { st.g = g; st.n = n; rer(); })),
        h('p', { class: 'muted' }, T('Plays as soon as the player is on this map at this step (for example right after arriving).')),
        blocksField(T('The scene'), st.blocks = st.blocks || [], { kind: 'frame', g: st.g, n: st.n }));
      if (st.g != null) box.append(placePick(T('Where the player stands in the preview'), st.preview = st.preview || { g: st.g, n: st.n }), Blocks.preview(st.blocks, { g: st.g, n: st.n, start: st.preview && st.preview.x != null ? st.preview : null }));
    } else if (st.type === 'cutscene') {
      st.trig = st.trig || 'arrive';
      const trig = h('select', { onchange: e => { st.trig = e.target.value; rer(); } },
        ...[['arrive', T('when the player arrives on the map')], ['step', T('when the player steps on a square')], ['talk', T('when the player talks to someone')]].map(([k, l]) => h('option', { value: k, selected: st.trig === k }, l)));
      box.append(field(T('Starts'), trig));
      if (st.trig === 'step') box.append(placePick(T('Where')));
      else if (st.trig === 'talk') box.append(personPick(T('Who')));
      else box.append(field(T('Map'), mapSelect(st.g != null ? [st.g, st.n] : null, (g, n) => { st.g = g; st.n = n; rer(); })));
      box.append(h('div', { class: 'cs-open' },
        h('button', { class: 'primary', disabled: st.g == null, onclick: () => Cutscene.open(st, { onChange: () => save(s), onClose: () => rer(), play: () => playScene(st, s) }) }, '🎞 ' + T('Open the scene editor')),
        st.g != null ? h('button', { onclick: () => playScene(st, s) }, '🎮 ' + T('Play in the game')) : null,
        h('span', { class: 'muted' }, st.g == null ? T('Choose the map first') : Cutscene.summary(st))),
        h('p', { class: 'muted' }, T('Build it like an animation: a row for each character on a timeline, and what they do and when. Plays once, at this step of the story.')));
    } else if (st.type === 'choice') {
      box.append(personPick(T('Who asks')), field(T('The question'), (() => { const t = h('textarea', { rows: 2, dir: 'auto', onchange: e => { st.question = e.target.value; save(s); } }); t.value = st.question || ''; return t; })()),
        blocksField('✔ ' + T('Right after YES'), st.yesBlocks = st.yesBlocks || [], { kind: 'object', g: st.g, n: st.n, selfId: st.localId }),
        blocksField('✘ ' + T('Right after NO'), st.noBlocks = st.noBlocks || [], { kind: 'object', g: st.g, n: st.n, selfId: st.localId }),
        h('p', { class: 'muted' }, T('Then the story follows the YES path or the NO path (the steps under the choice on the left). Both paths join again after them.')));
    } else if (st.type === 'rival') {
      const mode = st.newAt ? 'new' : 'existing';
      box.append(field(T('The rival'), h('select', { onchange: e => { if (e.target.value === 'new') { st.newAt = { x: null, y: null }; st.localId = null; } else delete st.newAt; rer(); } },
        h('option', { value: 'existing', selected: mode === 'existing' }, T('a person already on the map')), h('option', { value: 'new', selected: mode === 'new' }, T('a new person I place')))));
      if (mode === 'existing') box.append(personPick(T('Who')));
      else box.append(placePick(T('Where they stand'), st, 'nx', 'ny'), h('div', { class: 'row' }, h('span', {}, T('Looks like') + ': ' + Objects.gfxName(st.gfx || 7)), h('button', { onclick: () => Objects.gallery(st.gfx || 7, v => { st.gfx = v; rer(); }) }, '🖼 ' + T('Change sprite…'))));
      if (st.nx != null) st.newAt = { x: st.nx, y: st.ny };
      const team = st.team = st.team || [{ sp: 1, lvl: 5 }];
      box.append(field(T('Name in battle'), h('input', { value: st.name || '', dir: 'auto', onchange: e => { st.name = e.target.value; save(s); } })),
        field(T('Class'), makeSelect(Objects.classNames(), st.cls != null ? st.cls : 0x51, v => { st.cls = v; save(s); })),
        field(T('Team (stronger every time you meet them)'), ...team.map((m, k) => h('div', { class: 'row' }, makeSelect(App.getLists().species, m.sp, v => { m.sp = v; save(s); }), T('lv') + ' ', h('input', { type: 'number', value: m.lvl, min: 1, max: 100, style: { width: '56px' }, onchange: e => { m.lvl = +e.target.value; save(s); } }),
          team.length > 1 ? h('button', { class: 'mu-x', onclick: () => { team.splice(k, 1); rer(); } }, '✕') : '')), team.length < 6 ? h('button', { onclick: () => { team.push(Object.assign({}, team[team.length - 1])); rer(); } }, T('+ Add a Pokémon')) : ''),
        ...[['intro', T('Before the battle')], ['defeat', T('When you beat them')], ['after', T('After the battle')]].map(([k, l]) => field(l, (() => { const t = h('textarea', { rows: 2, dir: 'auto', onchange: e => { st[k] = e.target.value; save(s); } }); t.value = st[k] || ''; return t; })())));
    }
    // guard
    const gd = st.guard;
    box.append(h('div', { class: 'st-guard' }, h('label', {}, h('input', { type: 'checkbox', checked: !!gd, onchange: e => { st.guard = e.target.checked ? { g: st.g, n: st.n, x: null, y: null, gfx: 18, text: '' } : null; rer(); } }), ' 🚧 ' + T('Someone blocks the way until this step is done')),
      gd ? h('div', {}, placePick(T('Where the guard stands'), gd),
        h('div', { class: 'row' }, h('span', {}, T('Looks like') + ': ' + Objects.gfxName(gd.gfx || 18)), h('button', { onclick: () => Objects.gallery(gd.gfx || 18, v => { gd.gfx = v; rer(); }) }, '🖼 ' + T('Change sprite…'))),
        field(T('What the guard says'), (() => { const t = h('textarea', { rows: 2, dir: 'auto', placeholder: T("You can't go this way yet."), onchange: e => { gd.text = e.target.value; save(s); } }); t.value = gd.text || ''; return t; })())) : ''));
    return box;
  }
  // a test from a step: the whole story goes into the game first (also the steps added since the last time), then the
  // game starts with the story exactly at that step - its line's variable, the YES / NO of a choice before it, and the
  // moment of the game it comes after already done. The next steps follow in the game as they would.
  async function testAt(st, s, g, n, x, y) {
    try { apply(); } catch (e) { await ask(e.message, { ok: T('OK'), cancel: T('Close') }); return false; }
    s = story();
    const at = (s.at || {})[st.id] || { V: s.stageVar, stage: 0 }, flags = [], vars = [];
    if (at.cond && at.cond.set) flags.push(at.cond.flag);
    if (at.req && at.req.k === 'flag') flags.push(at.req.f); else if (at.req && at.req.k === 'var') vars.push([at.req.v, at.req.n]);
    Emu.playFrom({ g, n, x, y, team: Emu.team(), story: { stageVar: at.V, stage: at.stage }, flags, vars, clear: at.cond && !at.cond.set ? [at.cond.flag] : [], label: st.title || T(TYPES[st.type][1]) });
    return true;
  }
  // an animated scene in the game: the game starts on its map with the story at this step
  async function playScene(st, s) {
    const p = Cutscene.playSpot(st);
    if (!(await testAt(st, s, st.g, st.n, p.x, p.y))) return;
    if (st.trig === 'step') toast(T('Walk onto the square to start the scene'));
    else if (st.trig === 'talk') toast(T('Talk to the person to start the scene'));
  }
  function charactersPanel(s, rer) {
    const box = h('div', { class: 'panel st-chars' }, h('h3', {}, '🎭 ' + T('Characters: lines that change with the story')),
      h('p', { class: 'muted' }, T('A person can say something new after a step of the story (when there is no step for them right now).')));
    const steps = allSteps(s);
    s.characters.forEach((c, ci) => {
      const who = objOf(c.g, c.n, c.localId);
      box.append(h('div', { class: 'st-char' },
        h('div', { class: 'row' }, h('b', { dir: 'auto' }, c.name || (who ? Objects.tooltip(c.g, c.n, who).slice(0, 50) : T('a person'))), h('span', { class: 'muted' }, mapLabel(c.g, c.n)),
          h('span', { class: 'bl-tools' }, h('button', { onclick: () => { s.characters.splice(ci, 1); rer(); } }, '✕'))),
        ...(c.lines = c.lines || []).map((ln, li) => h('div', { class: 'row st-line' },
          h('select', { onchange: e => { ln.after = e.target.value || null; save(s); } }, h('option', { value: '' }, T('from the start')),
            ...steps.map(x => h('option', { value: x.id, selected: ln.after === x.id }, T('after') + ' “' + (x.title || T(TYPES[x.type][1])) + '”'))),
          (() => { const t = h('textarea', { rows: 1, dir: 'auto', onchange: e => { ln.text = e.target.value; save(s); } }); t.value = ln.text || ''; return t; })(),
          h('button', { class: 'mu-x', onclick: () => { c.lines.splice(li, 1); rer(); } }, '✕'))),
        h('button', { onclick: () => { c.lines.push({ after: null, text: '' }); rer(); } }, '+ ' + T('Add a line'))));
    });
    const pickBox = h('div', { class: 'row' });
    pickBox.append(mapSelect(null, async (g, n) => { const p = await Blocks.pickOnMap(g, n, { person: true }); if (p) { s.characters.push({ g, n, localId: p.obj.localId, lines: [{ after: null, text: '' }] }); rer(); } }), h('span', { class: 'muted' }, T('← choose a map, then the person')));
    box.append(h('div', { class: 'st-field' }, h('label', {}, '+ ' + T('Add a character')), pickBox));
    return box;
  }
  return { render, apply, story, flatten, undoOn: st => undoPrevious(st) };
})();
