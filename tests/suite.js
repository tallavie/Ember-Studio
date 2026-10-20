// Ember Studio test suite, run by tests/run_all.py in a headless Edge:
//   index.html?testsuite=1&lang=en|he&rom=<FireRed v1.1>&out=<folder>
// Part A works on the plain ROM (every tab, the game check, blocks, objects, the story and its undo).
// Part B makes a game with the wizard and checks the project: save / reopen / build give the same ROM, and the story
// survives. It also writes one test ROM per story step (out/steps/*.gba + steps.json): run_all.py plays each of them
// in mGBA and checks that the step moves the story on.
// The result is window.__testDone = { results: [{ name, ok, ms, msg }], steps: [...] }.
'use strict';

const TestSuite = (() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const results = [], errors = [];
  let lang = 'en', out = '', baseRom = '';

  // ---------- capturing problems ----------
  window.addEventListener('error', e => errors.push('error: ' + e.message));
  window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
  const cerr = console.error; console.error = (...a) => { errors.push('console: ' + a.map(x => x && x.message || String(x)).join(' ')); cerr.apply(console, a); };
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('err')) errors.push('toast: ' + n.textContent); })
    .observe(document.getElementById('toasts'), { childList: true });
  window.ask = async () => true;                         // no questions while testing

  async function test(name, fn) {
    const t0 = performance.now(); errors.length = 0;
    let ok = true, msg = '';
    try { const r = await fn(); if (r) msg = String(r); } catch (e) { ok = false; msg = e.message || String(e); console.warn(name, e); }
    const panelErr = document.querySelector('#main .panel.err');
    if (ok && panelErr) { ok = false; msg = panelErr.textContent; }
    if (ok && errors.length) { ok = false; msg = errors.slice(0, 3).join(' | '); }
    results.push({ name, ok, ms: Math.round(performance.now() - t0), msg });
  }
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const R = () => App.rom, G = () => App.game;
  const crc = u8 => Project.crc32(u8).toString(16).toUpperCase().padStart(8, '0');

  // ---------- map helpers ----------
  const events = (g, n) => MapsTab.api.readEvents(R().ptr(G().mapGroups[g][n] + 4));
  const xy = e => MapsTab.api.evXY(e);
  function layout(g, n) {
    const r = R(), l = r.ptr(G().mapGroups[g][n]);
    return { w: r.r32(l), h: r.r32(l + 4), data: r.ptr(l + 12) };
  }
  // a square the player can stand on: walkable, nothing on it, not a door or a trigger
  function free(g, n, x, y) {
    const L = layout(g, n), r = R();
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return false;
    const v = r.r16(L.data + (y * L.w + x) * 2);
    if ((v >> 10) & 3) return false;
    const E = events(g, n);
    for (const k of ['obj', 'warp', 'coord', 'bg']) for (const e of E[k]) { const [ex, ey] = xy(e); if (ex === x && ey === y) return false; }
    return true;
  }
  const DIRS = [['down', 0, 1], ['up', 0, -1], ['left', -1, 0], ['right', 1, 0]];
  // next to (x, y), facing it
  function beside(g, n, x, y) {
    for (const [dir, dx, dy] of DIRS) { const sx = x - dx, sy = y - dy; if (free(g, n, sx, sy)) return { x: sx, y: sy, face: dir }; }
    return null;
  }
  // a free square with free squares around it, away from the ones already taken (and from FireRed's own triggers)
  function spot(g, n, taken = []) {
    const L = layout(g, n), E = events(g, n), trig = E.coord.map(xy);
    for (let d = 0; d < 20; d++) for (let y = (L.h >> 1) - d; y <= (L.h >> 1) + d; y++) for (let x = (L.w >> 1) - d; x <= (L.w >> 1) + d; x++) {
      if (!free(g, n, x, y) || DIRS.some(([, dx, dy]) => !free(g, n, x + dx, y + dy))) continue;
      if (taken.concat(trig).some(([tx, ty]) => Math.abs(tx - x) + Math.abs(ty - y) < 4)) continue;
      return { x, y };
    }
    return null;
  }
  function anyFree(g, n) {
    const L = layout(g, n);
    for (let d = 0; d < 20; d++) for (let y = (L.h >> 1) - d; y <= (L.h >> 1) + d; y++) for (let x = (L.w >> 1) - d; x <= (L.w >> 1) + d; x++) if (free(g, n, x, y)) return { x, y };
    return null;
  }
  const objOf = (g, n, id) => events(g, n).obj.find(e => R().u8[e.off] === id);

  // a team that wins any early battle by pressing A: the strongest Pokémon whose first move (at level 100) is a plain hit
  function battleTeam() {
    const r = R(), o = G().offsets; let best = null;
    for (let sp = 1; sp < 412; sp++) {
      if (sp > 251 && sp < 277) continue;
      const p = r.ptr(o.learnsets + sp * 4); if (p < 0) continue;
      const list = [];
      for (let k = 0; k < 40; k++) { const v = r.r16(p + k * 2); if (v === 0xFFFF) break; const m = v & 0x1FF; if ((v >> 9) <= 100 && !list.includes(m)) list.push(m); }
      const m = list.slice(-4)[0]; if (!m) continue;
      const md = o.moveData + m * 12;
      if (r.u8[md] !== 0 || r.u8[md + 1] < 70 || r.u8[md + 3] < 95) continue;
      const bs = o.baseStats + sp * 28, bst = [0, 1, 2, 3, 4, 5].reduce((s, i) => s + r.u8[bs + i], 0);
      if (!best || bst > best.bst) best = { sp, bst, move: m };
    }
    return [{ sp: best.sp, lvl: 100 }];
  }

  // ---------- part A: the plain ROM ----------
  async function partA() {
    await test('load the base ROM', async () => {
      const b = await Host.readFile(baseRom);
      await App.load(b.buffer.slice(0), 'base.gba', b.buffer.slice(0));
      assert(/fire/i.test(G().name), 'not FireRed: ' + G().name);
      return G().name;
    });
    for (const k of Object.keys(App.tabs)) await test('tab: ' + k, async () => { App.show(k); await wait(k === 'music' || k === 'doctor' ? 1500 : 400); });
    await test('maps: editor, collision, events, world, tiles', async () => {
      MapsTab.api.open(3, 0); await wait(200); MapsTab.api.setMode('coll'); await wait(200); MapsTab.api.setMode('events'); await wait(200);
      MapsTab.api.openWorld(); await wait(1500); MapsTab.api.openTiles(3, 0); await wait(400);
    });
    await test('world view: no warnings on the original game', async () => {
      MapsTab.api.openWorld(); await wait(1500);
      const w = (document.getElementById('wv-warn') || {}).textContent || '';
      assert(!w.trim(), w);
    });
    const click = async (tab, label, ms = 500) => { App.show(tab); await wait(300); const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(T(label))); assert(b, 'no button ' + label); b.click(); await wait(ms); };
    await test('pokemon: starters & gifts', () => click('pokemon', '🎁 Starters & gift Pokémon'));
    await test('items: shops', () => click('items', 'Shops'));
    await test('moves: TMs & tutors', () => click('moves', 'TMs, HMs & tutors'));
    await test('graphics: characters & title', () => click('graphics', '🧍 Characters & title screen'));
    await test('text: scan the ROM', async () => { await click('text', 'Scan ROM for text', 6000); const n = +((document.getElementById('textCount') || {}).textContent || '0').split('/').pop().replace(/\D/g, ''); assert(n > 9000, 'only ' + n + ' strings'); return n + ' strings'; });
    await test('game check: no errors on the original game', () => { const res = Doctor.run(); const e = res.filter(x => x.sev === 'err'); assert(!e.length, e.length + ' errors: ' + e.slice(0, 2).map(x => x.msg).join('; ')); return res.length + ' notes'; });

    await test('story: a place on a tree is refused', () => {
      Project.setData('story', { format: 'ember-story-1', characters: [], chapters: [{ id: 'c', title: 'c', steps: [{ id: 'r', type: 'reach', g: 3, n: 0, x: 8, y: 0, blocks: [] }] }] });
      let msg = ''; try { StoryTab.apply(); } catch (e) { msg = e.message; }
      Project.resetData();
      assert(msg.includes('(8,0)'), 'applied anyway: ' + (msg || 'no error'));
    });
    await test('blocks: every block compiles and reads back', () => {
      const L = [{ op: 'say', text: 'Hello there!' }, { op: 'ask', text: 'Ready?', yes: [{ op: 'say', text: 'Great' }], no: [{ op: 'say', text: 'Oh' }] },
        { op: 'give_item', item: 13, qty: 2 }, { op: 'take_item', item: 13, qty: 1 }, { op: 'give_mon', sp: 25, lvl: 5, text: '' }, { op: 'heal' }, { op: 'shop', items: [13, 4] },
        { op: 'battle_wild', sp: 25, lvl: 5 }, { op: 'battle_trainer', trainer: 1, intro: 'Hi', defeat: 'Bye' }, { op: 'move', who: 'player', steps: [['up', 2], ['left', 1]], speed: 'normal' },
        { op: 'face', who: 'player', dir: 'down' }, { op: 'face_player' }, { op: 'emote', who: 'self', kind: '!' }, { op: 'wait', seconds: 1 }, { op: 'hide', who: 'self' }, { op: 'show', who: 'self' },
        { op: 'if_flag', flag: 0x3A0, then: [{ op: 'say', text: 'a' }], else: [] }, { op: 'if_item', item: 13, then: [], else: [{ op: 'say', text: 'b' }] },
        { op: 'set_flag', flag: 0x3A0 }, { op: 'clear_flag', flag: 0x3A0 }, { op: 'music', song: 0x12C }, { op: 'sound', se: 1 }, { op: 'fade', out: true }, { op: 'fade', out: false }, { op: 'warp', g: 3, n: 0, warp: 0 }];
      const missing = Object.keys(Blocks.DEFS).filter(k => !L.some(b => b.op === k)); assert(!missing.length, 'not tested: ' + missing.join(', '));
      const a = Script.compile(L, { kind: 'object', g: 3, n: 0, selfId: 1 }), w = a.write();
      // reading a script back gives its text (that is what "Write it with blocks" uses for old scripts)
      const nodes = Objects.analyze(w.off), back = Blocks.fromScript(w.off);
      assert(nodes && nodes.length, 'the compiled script cannot be read');
      assert(back.length && back[0].text === 'Hello there!', 'first line read back: ' + JSON.stringify(back[0]));
      Script.free(w.allocs);
      return w.allocs.reduce((n, [, k]) => n + k, 0) + ' bytes';
    });

    await test('objects: add and delete every kind', () => {
      const before = JSON.stringify(Object.fromEntries(Object.entries(events(3, 0)).map(([k, v]) => [k, v.length])));
      const added = [];
      for (const [tpl] of Objects.TEMPLATES) { const p = anyFree(3, 0); Objects.add(3, 0, tpl, p.x, p.y); added.push([Objects.KIND_OF[tpl], p]); }
      for (const [kind, p] of added.reverse()) { const i = events(3, 0)[kind].findIndex(e => { const [x, y] = xy(e); return x === p.x && y === p.y; }); assert(i >= 0, 'lost a ' + kind); MapsTab.api.deleteEvent(3, 0, kind, i); }
      const after = JSON.stringify(Object.fromEntries(Object.entries(events(3, 0)).map(([k, v]) => [k, v.length])));
      assert(before === after, before + ' → ' + after);
    });

    await test('story: every step type applies, and undo puts the maps back', () => {
      const snap = maps => maps.map(([g, n]) => { const r = R(), h = G().mapGroups[g][n], E = events(g, n);
        return [r.r32(h + 8), ...['obj', 'warp', 'coord', 'bg'].map(k => E[k].map(e => [...r.u8.subarray(e.off, e.off + ({ obj: 24, warp: 8, coord: 16, bg: 12 })[k])].join(',')).join('|'))].join('#'); });
      const brock = Objects.usage().trainerAt.get(414)[0];
      const maps = [[3, 0], [4, 0], [brock.g, brock.n]];
      const before = snap(maps), p = spot(3, 0), q = spot(3, 0, [[p.x, p.y]]);
      Project.setData('story', storyTemplate(p, q));
      const res = StoryTab.apply();
      assert(res.steps === 7, res.steps + ' steps instead of 7');
      assert(snap(maps).join() !== before.join(), 'nothing changed');
      const s = StoryTab.story(); s.chapters = [{ id: 'x', title: 'empty', steps: [] }]; s.characters = []; StoryTab.apply();
      const after = snap(maps);
      maps.forEach(([g, n], i) => assert(after[i] === before[i], 'map ' + g + '.' + n + ' differs after undo'));
      Project.resetData();
      return res.steps + ' steps';
    });
  }

  // chapter 1 of the test game (the same one the guide shows) + the first gym leader
  function storyTemplate(rivalAt, exitAt) {
    return { format: 'ember-story-1', characters: [{ g: 3, n: 0, localId: 1, lines: [{ after: null, text: 'I heard the professor is looking for a new trainer.' }, { after: 'exit', text: 'You left the village? Well done!' }] }],
      chapters: [{ id: 'c1', title: 'Chapter 1', steps: [
        { id: 'mom', type: 'talk', title: 'Talk to Mom', g: 4, n: 0, localId: 1, blocks: [{ op: 'say', text: 'Good morning! The professor is waiting.' }, { op: 'give_item', item: 13, qty: 1 }] },
        { id: 'arrive', type: 'scene', title: 'A scene outside', g: 3, n: 0, blocks: [{ op: 'emote', who: 'player', kind: '!' }, { op: 'say', text: 'What a nice day!' }] },
        { id: 'ask', type: 'choice', title: 'Ready?', g: 3, n: 0, localId: 2, question: 'Are you ready for your adventure?', yes: [
          { id: 'gift', type: 'talk', title: 'A gift', g: 3, n: 0, localId: 2, blocks: [{ op: 'say', text: 'Take this!' }, { op: 'give_item', item: 4, qty: 5 }],
            guard: { g: 3, n: 0, x: 13, y: 1, gfx: 19, text: 'Get the gift first!' } }] },
        { id: 'exit', type: 'reach', title: 'Leave the village', g: 3, n: 0, x: exitAt.x, y: exitAt.y, blocks: [{ op: 'say', text: 'The adventure begins!' }] },
        { id: 'rival', type: 'rival', title: 'Rival battle', g: 3, n: 0, newAt: { x: rivalAt.x, y: rivalAt.y }, name: 'RIVAL', team: [{ sp: 16, lvl: 5 }], intro: 'Let us battle!', defeat: 'You won...' },
      ] }, { id: 'c2', title: 'Badge 1', steps: [{ id: 'beat414', type: 'beat', trainer: 414, title: 'Beat the first gym leader', blocks: [{ op: 'say', text: 'The story goes on!' }] }] }] };
  }

  // ---------- part B: a project made with the wizard ----------
  async function partB() {
    const dir = joinPath(out, 'qa_game_' + lang);
    let romCrc = '';
    await test('wizard: create a game (' + lang + ')', async () => {
      await Wizard._test.run({ dir, name: lang === 'he' ? 'משחק בדיקה' : 'QA Game', language: lang, baseRom, prof: lang === 'he' ? 'אלון' : 'ALDER', starters: [152, 155, 158] });
      assert(Project.cur && Project.cur.dir === dir, 'the project did not open');
      if (lang === 'he') assert(Font.rtlStatus() === 'on', 'right-to-left is ' + Font.rtlStatus());
      romCrc = crc(R().u8);
      return romCrc;
    });
    if (!Project.cur) return;
    await test('project: build = what the editor shows', async () => {
      const r = await Project.build(); assert(r && r.out, 'no build');
      const b = await Host.readFile(r.out); const c = crc(b);
      assert(c === crc(R().u8), 'out/game.gba ' + c + ' but the editor has ' + crc(R().u8));
      return c;
    });
    await test('project: building twice gives the same file', async () => {
      const a = await Host.readFile((await Project.build()).out), b = await Host.readFile((await Project.build()).out);
      assert(crc(a) === crc(b), crc(a) + ' vs ' + crc(b));
    });
    await test('project: an edit survives save and reopen', async () => {
      const t = G().offsets.trainers + 414 * 40; R().w8(t + 2, 0x5A);   // the music byte of the first leader
      const want = crc(R().u8); await Project.save(true);
      R().dirty = false; await Project.open(dir);
      assert(crc(R().u8) === want, 'reopened ' + crc(R().u8) + ', saved ' + want);
    });
    let story = null;
    await test('story: apply, save and reopen', async () => {
      const p = spot(3, 0), q = spot(3, 0, [[p.x, p.y]]);
      Project.setData('story', storyTemplate(p, q));
      const res = StoryTab.apply(); story = StoryTab.story();
      const want = crc(R().u8); await Project.save(true); R().dirty = false; await Project.open(dir);
      assert(crc(R().u8) === want, 'the story did not survive reopening');
      assert(StoryTab.story().applied, 'story.json lost');
      return res.steps + ' steps, variable 0x' + res.stageVar.toString(16);
    });
    if (lang !== 'en' || !story) return;
    await test('story: one test ROM per step', async () => {
      const s = StoryTab.story(), nodes = StoryTab.flatten(s), team = battleTeam(), steps = [];
      for (const nd of nodes) {
        const st = nd.st, base = { id: st.id, type: st.type, stageVar: s.stageVar, stage: nd.stage, team, flags: nd.cond && nd.cond.set ? [nd.cond.flag] : [] };
        let g = st.g, n = st.n, target = null;
        if (st.type === 'beat') { const at = Objects.usage().trainerAt.get(st.trainer)[0]; g = at.g; n = at.n; target = events(g, n).obj[at.i]; }
        else if (['talk', 'choice', 'rival'].includes(st.type)) target = objOf(g, n, st.localId != null ? st.localId : st.createdId);
        const variants = [];
        if (target) {
          const [tx, ty] = xy(target), b = beside(g, n, tx, ty); assert(b, st.id + ': no free square next to ' + tx + ',' + ty);
          if (st.type === 'choice') variants.push({ key: 'A', expect: nd.nextYes, flag: [st.flag, 1], suffix: '_yes' }, { key: 'B', expect: nd.nextNo, flag: [st.flag, 0], suffix: '_no' });
          else variants.push({ key: 'A', expect: nd.next, flag: st.type === 'beat' && st.trainer === 414 ? [0x820, 1] : null });
          for (const v of variants) steps.push(Object.assign({}, base, { g, n, x: b.x, y: b.y, face: b.face, arrive: 'spot', key: v.key, expect: v.expect, flag: v.flag, still: target.off, target: [R().u8[target.off], tx, ty], file: st.id + (v.suffix || '') + '.gba' }));
        } else if (st.type === 'reach') {
          const b = beside(g, n, st.x, st.y); assert(b, 'reach: no free square next to the spot');
          steps.push(Object.assign({}, base, { g, n, x: b.x, y: b.y, walk: b.face, arrive: 'spot', key: 'A', expect: nd.next, file: st.id + '.gba' }));
        } else if (st.type === 'scene') {
          const p = anyFree(g, n); steps.push(Object.assign({}, base, { g, n, x: p.x, y: p.y, arrive: 'map', key: 'A', expect: nd.next, file: st.id + '.gba' }));
        }
      }
      for (const sp of steps) {
        const keep = R().u8.slice();
        if (sp.still) R().w8(sp.still + 9, 8);                 // the person stands still (only in this test ROM)
        const bytes = Emu.testRom({ g: sp.g, n: sp.n, x: sp.x, y: sp.y, team: sp.team, story: { stageVar: sp.stageVar, stage: sp.stage }, flags: sp.flags });
        R().u8.set(keep);
        await Host.writeFile(joinPath(out, 'steps', sp.file), bytes);
        delete sp.still;
      }
      await Host.writeJSON(joinPath(out, 'steps', 'steps.json'), { team, steps });
      window.__testSteps = steps;
      return steps.length + ' step ROMs, team species ' + team[0].sp;
    });
    // the game's own story: skip "Oak stops you", and put a step between the starter and the rival battle
    await test('game story: skip a moment, a step the rival waits for', async () => {
      const m = StoryMap.get(true);
      const grass = m.beats.find(b => b.named && b.rank === 0), starter = m.beats.find(b => b.named && b.rank === 2), rival = m.beats.find(b => b.named && b.rank === 3);
      assert(grass && starter && rival, 'the moments of Pallet Town were not found');
      const s = StoryTab.story();
      s.original = { skip: [grass.id] };
      s.chapters.push({ id: 'qa_after_starter', title: 'After the starter', anchor: starter.id, holds: rival.id,
        steps: [{ id: 'aide', type: 'talk', title: 'Talk to the aide', g: 4, n: 3, localId: 1, blocks: [{ op: 'say', text: 'Your rival is waiting for you!' }] }] });
      StoryTab.apply();
      const Vk = StoryTab.story().lineVars.qa_after_starter, team = window.__testSteps[0].team, out2 = [];
      assert(Vk, 'no variable for the new line');
      // stepping on Oak's spot: the story moves on at once, without the scene
      const gp = grass.events[0].places[0].xy, gb = beside(3, 0, gp[0], gp[1]);
      out2.push({ id: 'skip_grass', type: 'skip', file: 'skip_grass.gba', g: 3, n: 0, x: gb.x, y: gb.y, walk: gb.face, arrive: 'spot', key: 'A', stageVar: 0x4055, expect: 1, within: 150, vars: [], flags: [] });
      // after the starter: the rival does not come while the new step is not done…
      const rp = rival.events[0].places[0], rb = beside(4, 3, rp.xy[0], rp.xy[1]), after = [[0x4055, 3], [0x4031, 0]];
      out2.push({ id: 'gate_wait', type: 'wait', file: 'gate_wait.gba', g: 4, n: 3, x: rb.x, y: rb.y, walk: rb.face, arrive: 'spot', key: 'A', stageVar: 0x4055, expect: 3, stay: 900, vars: after.concat([[Vk, 0]]), flags: [0x828] });
      // …the new step works…
      const aide = objOf(4, 3, 1), [ax, ay] = xy(aide), ab = beside(4, 3, ax, ay);
      out2.push({ id: 'gate_step', type: 'talk', file: 'gate_step.gba', g: 4, n: 3, x: ab.x, y: ab.y, face: ab.face, arrive: 'spot', key: 'A', stageVar: Vk, expect: 1, still: aide.off, target: [1, ax, ay], vars: after.concat([[Vk, 0]]), flags: [0x828] });
      // …and then the rival battle comes
      out2.push({ id: 'gate_go', type: 'rival', file: 'gate_go.gba', g: 4, n: 3, x: rb.x, y: rb.y, walk: rb.face, arrive: 'spot', key: 'A', stageVar: 0x4055, expect: 4, vars: after.concat([[Vk, 1]]), flags: [0x828] });
      for (const sp of out2) {
        const keep = R().u8.slice();
        if (sp.still) R().w8(sp.still + 9, 8);
        const bytes = Emu.testRom({ g: sp.g, n: sp.n, x: sp.x, y: sp.y, team, vars: sp.vars, flags: sp.flags });
        R().u8.set(keep); delete sp.still;
        await Host.writeFile(joinPath(out, 'steps', sp.file), bytes);
      }
      window.__testSteps = window.__testSteps.concat(out2);
      await Host.writeJSON(joinPath(out, 'steps', 'steps.json'), { team, steps: window.__testSteps });
      return out2.length + ' ROMs, line variable 0x' + Vk.toString(16);
    });
  }

  async function run(q) {
    lang = q.get('lang') || 'en'; out = q.get('out'); baseRom = q.get('rom');
    try {
      if (q.get('part') !== 'B') await partA();
      if (q.get('part') !== 'A') await partB();
    } catch (e) { results.push({ name: 'suite', ok: false, msg: e.message }); }
    window.__testDone = { results, steps: window.__testSteps || [] };
  }
  return { run };
})();
