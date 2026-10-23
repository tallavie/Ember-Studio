// Scene editor: a story event built like an animation. One row per character on a timeline (the player, people on
// the map, new characters, Pokémon), clips on the rows for walking, jumping, turning, emotes, text and waiting; the
// map above shows the scene at the time under the playhead. Time is counted in steps (one step = 16 frames, the time
// a person takes to walk one square), so what the editor shows is what the game does.
'use strict';

const Cutscene = (() => {
  const R = () => App.rom, G = () => App.game;
  const STEP_MS = 16 * 1000 / 60;
  // kind: [icon, label, colour]
  const KINDS = {
    walk: ['🚶', 'Walk', '#d97706'], jump: ['⤴', 'Jump', '#ea580c'], face: ['↻', 'Turn', '#ca8a04'], wait: ['⏱', 'Wait', '#64748b'],
    emote: ['❗', 'Emote', '#0284c7'], say: ['💬', 'Say', '#2563eb'], ask: ['❓', 'Ask yes / no', '#1d4ed8'], hide: ['👻', 'Disappear', '#7c3aed'], show: ['✨', 'Appear', '#7c3aed'],
    battle: ['⚔', 'Battle', '#dc2626'], give: ['🎁', 'Give', '#16a34a'], cry: ['🔊', 'Cry', '#0891b2'],
    shake: ['📳', 'Shake the screen', '#b45309'], flash: ['⚡', 'Flash', '#ca8a04'], fade: ['🌑', 'Fade', '#334155'], tiles: ['🧱', 'Change blocks', '#78716c'],
    music: ['🎵', 'Music', '#9333ea'], sound: ['🔔', 'Sound', '#a855f7'], silence: ['🔇', 'Silence', '#6b21a8'],
  };
  const STRETCH = new Set(['wait', 'emote', 'say', 'ask', 'shake']);
  const MOVES = new Set(['walk', 'jump', 'face', 'emote', 'hide', 'show']);    // what moves a character (one at a time)
  // the scene stops for these (they run between the parts of the scene); these run while everyone goes on moving
  const BLOCK = new Set(['say', 'ask', 'battle', 'give', 'tiles', 'fade', 'flash']), TIMED = new Set(['shake', 'cry', 'music', 'sound', 'silence']);
  // what each row can do
  function kindsFor(a) {
    if (!a) return [];
    if (a.kind === 'scene') return ['shake', 'flash', 'fade', 'tiles', 'music', 'sound', 'silence', 'wait'];
    const move = ['walk', 'jump', 'face', 'wait', 'emote', 'say', 'ask', 'hide', 'show'];
    if (a.kind === 'player') return [...move, 'give'];
    if (a.kind === 'mon') return [...move, 'cry', 'battle'];
    return [...move, 'battle'];
  }
  const SPEED = { walk: 1, run: 0.5, slow: 1.5 };               // steps of time per square (measured in the game: 16 / 8 / 24 frames)
  const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }, ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
  const EMOTES = { '!': '❗', '?': '❓', '♥': '♥' };
  const uid = () => 'c' + Math.random().toString(36).slice(2, 8);
  const clone = o => JSON.parse(JSON.stringify(o));
  const FIXED = { jump: 2, face: 1, hide: 1, show: 1, battle: 4, give: 3, cry: 2, flash: 2, fade: 2, tiles: 1, music: 1, sound: 1, silence: 1 };
  const dur = c => c.k === 'walk' ? Math.max(1, Math.ceil((c.path || []).length * (SPEED[c.speed] || 1)))
    : FIXED[c.k] || Math.max(1, c.len || (c.k === 'say' || c.k === 'ask' || c.k === 'shake' ? 3 : 2));
  const endOf = sc => Math.max(0, ...sc.clips.map(c => c.t + dur(c)));

  // ---------- data: st.scene = { actors: [...], clips: [...] } ----------
  function scene(st) {
    const sc = st.scene = st.scene || { actors: [], clips: [] };
    sc.actors = sc.actors || []; sc.clips = sc.clips || [];
    if (!sc.actors.some(a => a.kind === 'player')) sc.actors.unshift({ id: 'player', kind: 'player', name: T('The player'), gfx: 0, x: null, y: null, dir: 'up' });
    if (!sc.actors.some(a => a.kind === 'scene')) sc.actors.push({ id: 'scene', kind: 'scene', name: T('The whole scene') });   // effects of the whole screen
    return sc;
  }
  function objOf(g, n, localId) {
    if (g == null) return null;
    const ev = MapsTab.api.readEvents(R().ptr(G().mapGroups[g][n] + 4));
    return ev.obj.find(e => R().u8[e.off] === localId) || null;
  }
  const FACE_OF = { 7: 'up', 9: 'left', 10: 'right', 15: 'up', 16: 'up', 21: 'up' };
  // where a character stands when the scene starts
  function startOf(a, st, m) {
    if (a.kind === 'scene') return { x: -9, y: -9, dir: 'down', gfx: -1 };
    if (a.kind === 'npc') {
      const e = objOf(st.g, st.n, a.localId);
      if (e) { const [x, y] = MapsTab.api.evXY(e); return { x, y, dir: a.dir || FACE_OF[R().u8[e.off + 9]] || 'down', gfx: R().u8[e.off + 1] }; }
    }
    if (a.x != null) return { x: a.x, y: a.y, dir: a.dir || 'down', gfx: a.gfx };
    if (a.kind === 'player' && st.trig === 'step' && st.x != null) return { x: st.x, y: st.y, dir: a.dir || 'up', gfx: a.gfx };
    if (a.kind === 'player' && st.trig === 'talk' && st.localId != null) { const e = objOf(st.g, st.n, st.localId); if (e) { const [x, y] = MapsTab.api.evXY(e); return { x, y: y + 1, dir: 'up', gfx: a.gfx }; } }
    return { x: Math.floor(m.w / 2), y: Math.floor(m.h / 2), dir: a.dir || 'down', gfx: a.gfx };
  }
  // everyone at time t (in steps): position (fractional while walking), facing, visible, emote; and the text on screen
  function stateAt(sc, st, m, t) {
    const actors = new Map(); let say = null;
    const fx = effectsAt(sc, t);
    for (const a of sc.actors) {
      if (a.kind === 'scene') continue;
      const p = startOf(a, st, m), s = { x: p.x, y: p.y, dir: p.dir, gfx: p.gfx, vis: true, emote: null, hop: 0 };
      const mine = sc.clips.filter(c => c.a === a.id).sort((x, y) => x.t - y.t);
      const firstVis = mine.find(c => c.k === 'show' || c.k === 'hide');
      if (firstVis && firstVis.k === 'show') s.vis = false;                   // someone who appears later is not there at first
      for (const c of mine) {
        if (c.t > t) break;
        const el = t - c.t;
        if (c.k === 'walk') {
          const sd = SPEED[c.speed] || 1;
          for (let i = 0; i < (c.path || []).length; i++) {
            const f = Math.min(1, Math.max(0, (el - i * sd) / sd)); if (f <= 0) break;
            const [dx, dy] = D[c.path[i]]; s.dir = c.path[i]; s.x += dx * f; s.y += dy * f;
            if (f < 1) break;
          }
        } else if (c.k === 'jump') { const [dx, dy] = D[c.dir || 'down'], f = Math.min(1, el / 2); s.dir = c.dir || 'down'; s.x += dx * 2 * f; s.y += dy * 2 * f; s.hop = f < 1 ? Math.sin(f * Math.PI) : 0; }
        else if (c.k === 'face') s.dir = c.dir || 'down';
        else if (c.k === 'emote') { if (el < dur(c)) s.emote = c.kind || '!'; }
        else if (c.k === 'hide') s.vis = false;
        else if (c.k === 'show') s.vis = true;
        else if (c.k === 'say' || c.k === 'ask') { if (el < dur(c)) say = { a, text: c.text || '', ask: c.k === 'ask' }; }
      }
      actors.set(a.id, s);
    }
    return Object.assign({ actors, say }, fx);
  }
  // what the whole screen shows at time t: a shake, a flash, the fade, blocks changed, and a line about what happens
  function effectsAt(sc, t) {
    const out = { shake: 0, white: 0, black: 0, tiles: new Map(), note: null };
    let dark = 0;
    for (const c of sc.clips.slice().sort((x, y) => x.t - y.t)) {
      if (c.t > t) break;
      const el = t - c.t, on = el < dur(c), L = App.getLists();
      if (c.k === 'shake' && on) out.shake = (c.strength || 2) * 1.5 * Math.sin(el * 16 * 1.3);
      else if (c.k === 'flash' && on) out.white = 1 - Math.abs(el / dur(c) * 2 - 1);
      else if (c.k === 'fade') dark = c.out === false ? Math.max(0, 1 - el / dur(c)) : Math.min(1, el / dur(c));
      else if (c.k === 'tiles') for (const q of c.cells || []) out.tiles.set(q.x + ',' + q.y, q.v);
      else if (c.k === 'battle' && on) out.note = '⚔ ' + (c.trainer ? T('A trainer battle') : Tf('A battle with {who}', { who: L.species[(sc.actors.find(a => a.id === c.a) || {}).sp] || T('the Pokémon') }));
      else if (c.k === 'give' && on) out.note = '🎁 ' + (c.what === 'item' ? L.items[c.item || 13] : L.species[c.sp || 25]);
      else if (c.k === 'cry' && on) out.note = '🔊 ' + T('Cry');
      else if (c.k === 'music' && on) out.note = '🎵 ' + T('Music') + ' #' + (c.song || 0);
      else if (c.k === 'sound' && on) out.note = '🔔 ' + T('Sound') + ' #' + (c.se || 1);
      else if (c.k === 'silence' && on) out.note = '🔇 ' + T('Silence');
    }
    out.black = dark;
    return out;
  }
  // the squares a person can walk on: no collision, not water, not a ledge (a ledge is only jumped down)
  const WATER = () => new Set(G().isEmerald ? [0x10, 0x11, 0x12, 0x14, 0x15, 0x50, 0x51, 0x52, 0x53] : [0x10, 0x11, 0x12, 0x15, 0x1A]), LEDGE = new Set([0x38, 0x39, 0x3A, 0x3B]);
  function walkGrid(m) {
    const r = R(), gm = G(), water = WATER(), bc = new Map(), ok = new Uint8Array(m.w * m.h);
    const beh = id => {
      if (bc.has(id)) return bc.get(id);
      const sec = id >= gm.primaryMetatiles, ts = sec ? m.sec : m.prim, local = sec ? id - gm.primaryMetatiles : id, attr = r.ptr(ts.off + (gm.isEmerald ? 16 : 20));
      const v = attr < 0 ? 0 : gm.isEmerald ? r.r16(attr + local * 2) & 0xFF : r.r32(attr + local * 4) & 0x1FF; bc.set(id, v); return v;
    };
    for (let i = 0; i < m.w * m.h; i++) { const v = r.r16(m.blocks + i * 2), b = beh(v & 0x3FF); ok[i] = !((v >> 10) & 3) && !water.has(b) && !LEDGE.has(b) ? 1 : 0; }
    return ok;
  }
  // the shortest way from a to b on free squares (few turns, so it looks like someone walking); [] when there is none
  function findPath(m, free, a, b) {
    if (a.x === b.x && a.y === b.y) return [];
    const W = m.w, H = m.h, N = W * H * 4, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), dirs = ['up', 'down', 'left', 'right'];
    const open = [];                                                // a small binary heap of [cost, state]
    const push = (c, st) => { open.push([c, st]); let i = open.length - 1; while (i) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r2 = l + 1; let k = i; if (l < open.length && open[l][0] < open[k][0]) k = l; if (r2 < open.length && open[r2][0] < open[k][0]) k = r2; if (k === i) break; [open[k], open[i]] = [open[i], open[k]]; i = k; } } return top; };
    for (let d = 0; d < 4; d++) { const st = (a.y * W + a.x) * 4 + d; cost[st] = 0; push(0, st); }
    while (open.length) {
      const [c, st] = pop(); if (c > cost[st]) continue;
      const cell = st >> 2, d0 = st & 3, x = cell % W, y = (cell - x) / W;
      if (x === b.x && y === b.y) {
        const out = []; let k = st; while (prev[k] >= 0) { out.push(dirs[k & 3]); k = prev[k]; } return out.reverse();
      }
      for (let d = 0; d < 4; d++) {
        const [dx, dy] = D[dirs[d]], nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !free(nx, ny)) continue;
        const ns = (ny * W + nx) * 4 + d, nc = c + 1 + (d !== d0 && prev[st] >= 0 ? 0.3 : 0);
        if (nc < cost[ns]) { cost[ns] = nc; prev[ns] = st; push(nc, ns); }
      }
    }
    return null;
  }
  // what is wrong with clips: two of the same character at the same time, a walk through a wall
  function clipProblems(sc, st, m, grid) {
    const bad = new Map();
    for (const a of sc.actors) {
      const mine = sc.clips.filter(c => c.a === a.id).sort((x, y) => x.t - y.t);
      const moves = mine.filter(c => MOVES.has(c.k));                  // only movement clashes: a cry or a text while walking is fine
      for (let i = 1; i < moves.length; i++) if (moves[i].t < moves[i - 1].t + dur(moves[i - 1])) { bad.set(moves[i].id, T('two actions of the same character at the same time')); bad.set(moves[i - 1].id, T('two actions of the same character at the same time')); }
      if (a.fly) continue;
      for (const c of mine) {
        if (c.k !== 'walk' || bad.has(c.id)) continue;
        const s0 = stateAt(sc, st, m, c.t - 0.001).actors.get(a.id); let x = Math.round(s0.x), y = Math.round(s0.y);
        for (const d of c.path || []) { x += D[d][0]; y += D[d][1]; if (x < 0 || y < 0 || x >= m.w || y >= m.h || !grid[y * m.w + x]) { bad.set(c.id, Tf('walks into a wall or water at ({x}, {y})', { x, y })); break; } }
      }
    }
    return bad;
  }

  // ---------- into the game ----------
  function problems(st) {
    const sc = scene(st), out = [];
    if (G().isEmerald && sc.clips.length) out.push(T('animated scenes go into FireRed for now (Emerald comes later)'));
    for (const c of sc.clips) {
      const a = sc.actors.find(x => x.id === c.a) || {}, at = (a.name || '') + ' · ' + Tf('Step {n}', { n: c.t }) + ': ';
      if (c.k === 'battle' && a.kind === 'mon' && !a.sp) out.push(at + T('choose which Pokémon it is (for the battle)'));
      if (c.k === 'battle' && a.kind !== 'mon' && !c.trainer) out.push(at + T('choose the trainer for the battle'));
      if (c.k === 'tiles' && !(c.cells || []).length) out.push(at + T('choose the squares whose blocks change'));
      if (c.k === 'ask' && c.no === 'jump' && (c.jump == null || c.jump < 0)) out.push(at + T('choose the step the scene jumps to on NO'));
    }
    if (st.g != null) { const m = MapsTab.api.loadMap(st.g, st.n), bad = clipProblems(sc, st, m, walkGrid(m)); for (const [id, why] of bad) { const c = sc.clips.find(x => x.id === id), a = sc.actors.find(x => x.id === c.a); out.push((a.name || '') + ' · ' + Tf('Step {n}', { n: c.t }) + ': ' + why); } }
    return [...new Set(out)];
  }
  // The timeline as movement that runs at the same time. Every clip becomes timed actions of its character (a square
  // walked, a jump, a turn, an emote, appear / disappear) in frames (one step = 16). Text splits the scene into parts: in
  // each part every character gets one movement list (waits fill the gaps) and all of them start together; then the
  // script waits for all, shows the text and waits for A. Whatever starts while the text is on comes after it.
  const SQ = { walk: 16, run: 8, slow: 24 };
  function actionsOf(sc, a) {
    const M = Script.MOVE, out = [];
    const mine = sc.clips.filter(c => c.a === a.id).sort((x, y) => x.t - y.t);
    const firstVis = mine.find(c => c.k === 'show' || c.k === 'hide');
    if (firstVis && firstVis.k === 'show') out.push({ f: 0, len: 1, code: M.invisible });       // there from the start, but not seen yet
    for (const c of mine) {
      const f = c.t * 16;
      if (c.k === 'walk') { const sq = SQ[c.speed] || 16, mv = c.speed === 'run' ? M.walkFast : c.speed === 'slow' ? M.walkSlow : M.walk; (c.path || []).forEach((d, i) => out.push({ f: f + i * sq, len: sq, code: mv(d) })); }
      else if (c.k === 'jump') out.push({ f, len: 32, code: M.jump(c.dir || 'down') });
      else if (c.k === 'face') out.push({ f, len: 1, code: M.face(c.dir || 'down') });
      else if (c.k === 'emote') out.push({ f, len: 1, code: M.emote[c.kind || '!'] || M.emote['!'] });
      else if (c.k === 'hide') out.push({ f, len: 1, code: M.invisible });
      else if (c.k === 'show') out.push({ f, len: 1, code: M.visible });
    }
    return out;
  }
  const DELAYS = [[16, 0x1C], [8, 0x1B], [4, 0x1A]];                   // waits of 16 / 8 / 4 frames (a few frames less are not seen)
  // the parts of the scene, cut by what stops it (text, a question, a battle…) and by the steps a NO jumps to:
  // [{ from, to, ev }] in frames; ev = the stopping clip at the end of the part, or null
  function parts(sc) {
    const cuts = sc.clips.filter(c => BLOCK.has(c.k)).map(c => ({ f: c.t * 16, ev: c }));
    for (const c of sc.clips) if (c.k === 'ask' && c.no === 'jump' && c.jump != null) cuts.push({ f: c.jump * 16, ev: null });
    cuts.sort((x, y) => x.f - y.f || (x.ev ? 1 : 0) - (y.ev ? 1 : 0));
    const out = []; let from = 0;
    for (const cut of cuts) {
      if (!cut.ev && cut.f <= from) continue;                        // a jump target already on a part's start
      out.push({ from, to: Math.max(from, cut.f), ev: cut.ev });
      from = cut.ev ? Math.max(from, (cut.ev.t + dur(cut.ev)) * 16) : Math.max(from, cut.f);
    }
    out.push({ from, to: Infinity, ev: null });
    return out;
  }
  const SHAKE = { 1: [0, 1, 10], 2: [1, 2, 10], 3: [3, 3, 12] };            // ShakeScreen: horizontal, vertical pan, delay
  // a battle with a Pokémon of the scene: legendary music like the game's own birds; won or caught = gone for good,
  // ran = it stays (and can be talked to, to battle again); lost = the player blacks out and the scene comes again
  function wildBattle(a, sp, lvl, cry, legendary) {
    const C = Script.C;
    a.b(0xB6).h(sp).b(lvl).h(0);                                       // setwildbattle
    if (cry) a.b(0xA1).h(sp).h(2).b(0xC5);                             // playmoncry (encounter), waitmoncry
    if (legendary) { C.setflag(a, 0x807); C.special(a, 0x138); a.b(0x27); C.clearflag(a, 0x807); }   // StartLegendaryBattle, waitstate
    else a.b(0xB7);                                                    // dowildbattle
    a.b(0x26).h(0x800D).h(0xB4);                                       // specialvar VAR_RESULT, GetBattleOutcome
  }
  function block(c, sc, a, labels, lEnd) {
    const C = Script.C, L = App.getLists(), who = sc.actors.find(x => x.id === c.a) || {};
    if (c.k === 'say') { const name = who.kind === 'player' ? '{PLAYER}' : (who.name || ''); C.msg(a, (name ? name + ': ' : '') + (c.text || ' '), 4); C.closemessage(a); }
    else if (c.k === 'ask') {
      const name = who.kind === 'player' ? '{PLAYER}' : (who.name || ''), lYes = a.fresh('yes');
      C.msg(a, (name ? name + ': ' : '') + (c.text || '?'), 5); C.closemessage(a);
      C.compare(a, Script.VAR_RESULT, 1); C.gotoIf(a, '=', lYes);
      if (c.no === 'end') { C.releaseall(a); C.end(a); }              // NO: the scene stops and comes again next time
      else if (c.no === 'done') C.goto(a, lEnd);                       // NO: the scene ends here (and counts as seen)
      else if (c.no === 'jump') C.goto(a, labels(c.jump));
      a.label(lYes);
    } else if (c.k === 'battle') {
      if (who.kind === 'mon' && who.sp) {
        const lGone = a.fresh('gone'), lOn = a.fresh('on');
        wildBattle(a, who.sp, c.lvl || 50, c.cry !== false, c.legendary !== false);
        C.compare(a, Script.VAR_RESULT, 1); C.gotoIf(a, '=', lGone); C.compare(a, Script.VAR_RESULT, 7); C.gotoIf(a, '=', lGone);
        if (who._id != null) { const p = who._at || { x: 0, y: 0 }; a.b(0x63).h(who._id).h(p.x).h(p.y); }   // ran: it stays there (setobjectxyperm)
        who._stays = true; C.goto(a, lOn);
        a.label(lGone); if (who._id != null) { C.removeobject(a, who._id); if (who.flag) C.setflag(a, who.flag); }
        a.label(lOn);
      } else if (c.trainer) { if (c.intro) { C.msg(a, c.intro, 4); C.closemessage(a); } C.trainerNoIntro(a, c.trainer, c.defeat || '...'); }
    } else if (c.k === 'give') {
      if (c.what === 'item') C.giveitem(a, c.item || 13, c.qty || 1);
      else { C.givemon(a, c.sp || 25, c.lvl || 5); C.msg(a, c.text || Tf('{PLAYER} received {who}!', { who: L.species[c.sp || 25] || '' }), 4); C.closemessage(a); }
    } else if (c.k === 'tiles') {
      for (const q of c.cells || []) a.b(0xA2).h(q.x).h(q.y).h(q.v & 0x3FF).h((q.v >> 10) & 3 ? 1 : 0);   // setmetatile
      C.special(a, 0x8E);                                              // DrawWholeMapView
    } else if (c.k === 'fade') C.fadescreen(a, c.out === false ? 0 : 1);
    else if (c.k === 'flash') { C.fadescreen(a, 3); C.fadescreen(a, 2); }   // to white and back
  }
  function timed(c, sc, a) {
    const C = Script.C, who = sc.actors.find(x => x.id === c.a) || {};
    if (c.k === 'shake') { const [hz, vt, d] = SHAKE[c.strength || 2]; C.setvar(a, 0x8004, hz); C.setvar(a, 0x8005, vt); C.setvar(a, 0x8006, d); C.setvar(a, 0x8007, Math.max(1, Math.round(dur(c) * 16 / (d * 2)))); C.special(a, 0x136); }
    else if (c.k === 'cry' && (c.sp || who.sp)) a.b(0xA1).h(c.sp || who.sp).h(0);   // playmoncry, normal
    else if (c.k === 'music') { if (c.song) C.playbgm(a, c.song); else C.fadedefaultbgm(a); }
    else if (c.k === 'sound') C.playse(a, c.se || 1);
    else if (c.k === 'silence') a.b(0x37, 4);                          // fadeoutbgm
  }
  const gameId = a => a.kind === 'player' ? Script.PLAYER : a.kind === 'npc' ? a.localId : a._id;
  function emit(st, a, ctx) {
    const sc = scene(st), C = Script.C, P = parts(sc), m = MapsTab.api.loadMap(st.g, st.n);
    const inScene = sc.actors.filter(x => x.kind !== 'scene' && gameId(x) != null);
    const lab = P.map((_, k) => a.fresh('part' + k)), lEnd = a.fresh('end');
    const labels = step => { const f = step * 16; let k = P.findIndex(q => q.from >= f); if (k < 0) k = P.length - 1; return lab[k]; };
    for (const x of sc.actors) if (x.kind === 'mon') { const bt = sc.clips.find(c => c.a === x.id && c.k === 'battle'); if (bt) { const s0 = stateAt(sc, st, m, bt.t).actors.get(x.id); x._at = { x: Math.round(s0.x), y: Math.round(s0.y) }; } }
    const fxOf = k => sc.clips.filter(c => TIMED.has(c.k)).map(c => { let f = c.t * 16, j = 0; for (; j < P.length - 1; j++) { if (f < P[j].to) break; if (f < P[j + 1].from) f = P[j + 1].from; } return { c, f, j }; }).filter(e => e.j === k).sort((p, q) => p.f - q.f);
    // new characters and Pokémon: their flag hid them when the map loaded; now they come out
    for (const x of inScene) if ((x.kind === 'new' || x.kind === 'mon') && x.flag) { C.clearflag(a, x.flag); C.addobject(a, x._id); }
    // each action in its part: one that starts while a text is on starts right after it
    const lists = new Map(inScene.map(x => [x.id, P.map(() => [])]));
    for (const x of inScene) for (const act of actionsOf(sc, x)) {
      let f = act.f, k = 0;
      for (; k < P.length - 1; k++) { if (f < P[k].to) break; if (f < P[k + 1].from) f = P[k + 1].from; }
      lists.get(x.id)[k].push(Object.assign({}, act, { f }));
    }
    P.forEach((part, k) => {
      a.label(lab[k]);
      const moving = [];
      for (const x of inScene) {
        const acts = lists.get(x.id)[k].sort((p, q) => p.f - q.f); if (!acts.length) continue;
        const seq = []; let cur = part.from;
        for (const act of acts) {
          let gap = act.f - cur;
          for (const [n, code] of DELAYS) while (gap >= n) { seq.push(code); gap -= n; }
          seq.push(act.code); cur = Math.max(cur, act.f) + act.len;
        }
        C.move(a, gameId(x), seq); moving.push(gameId(x));
      }
      // the effects of this part at their time, while everyone moves (a shake, a cry, music)
      let cur = part.from;
      for (const e of fxOf(k)) { if (e.f > cur) C.delay(a, e.f - cur); cur = Math.max(cur, e.f); timed(e.c, sc, a); }
      for (const id of moving) C.waitmove(a, id);
      if (part.ev) block(part.ev, sc, a, labels, lEnd);
    });
    // after the scene: each character as chosen (stays there / goes back / is gone for good)
    a.label(lEnd);
    const S = stateAt(sc, st, m, endOf(sc) + 1);
    for (const x of inScene) {
      if (x.kind === 'player') continue;
      const after = afterOf(x), s = S.actors.get(x.id), fl = x.kind === 'npc' ? x._flag : x.flag;
      if (x._stays && x.kind === 'mon') continue;                      // ran from its battle: it waits there for the player
      if (after === 'stay') { a.b(0x63).h(gameId(x)).h(Math.round(s.x)).h(Math.round(s.y)); if (fl && x.kind !== 'npc') C.clearflag(a, fl); }
      else if (after === 'gone') { if (s.vis) C.removeobject(a, gameId(x)); if (fl) C.setflag(a, fl); }
    }
    if (st.doneFlag) C.setflag(a, st.doneFlag);
  }
  // what a character does after the scene: people of the map go back to their place; new ones and Pokémon are gone
  const afterOf = x => x.after || (x.kind === 'npc' ? 'back' : 'gone');
  // before the scripts: new characters and Pokémon become people of the map (hidden by their flag whenever the map
  // loads), so the scene can move them. meta: the story's undo record
  function prepare(st, meta) {
    const sc = scene(st), r = R(), m = MapsTab.api.loadMap(st.g, st.n), flags = [], C = Script.C;
    st.doneFlag = st.doneFlag || Objects._freeFlag();                  // set when the scene has happened
    for (const a of sc.actors) {
      a._stays = false;
      // a person of the map who is gone after the scene needs a flag of their own (the map shows them while it is clear)
      if (a.kind === 'npc') {
        a._flag = 0;
        if (afterOf(a) !== 'gone') continue;
        const e = objOf(st.g, st.n, a.localId); if (!e) continue;
        a._flag = r.r16(e.off + 20) || (() => { const f = Objects._freeFlag(); meta.patches.push({ at: e.off + 20, bytes: Array.from(r.u8.slice(e.off + 20, e.off + 22)) }); r.w16(e.off + 20, f); return f; })();
        continue;
      }
      if (a.kind !== 'new' && a.kind !== 'mon') continue;
      if (!sc.clips.some(c => c.a === a.id)) { a._id = null; continue; }
      a.flag = a.flag || Objects._freeFlag();
      const p = startOf(a, st, m), e = MapsTab.api.addEvent(st.g, st.n, 'obj', p.x, p.y), id = r.u8[e.off];
      r.w8(e.off + 1, a.gfx); r.w8(e.off + 9, ({ up: 7, left: 9, right: 10 })[p.dir] || 8); r.w16(e.off + 20, a.flag); r.w32(e.off + 16, 0);
      a._id = id; flags.push(a.flag);
      meta.created.push({ kind: 'obj', g: st.g, n: st.n, localId: id });
      // a Pokémon the player battles in the scene: if they run, it stays; talking to it starts the battle again
      const bt = sc.clips.find(c => c.a === a.id && c.k === 'battle');
      if (bt && a.sp) {
        const as = new Script.Asm(), lGone = as.fresh('gone');
        C.lock(as); C.faceplayer(as); wildBattle(as, a.sp, bt.lvl || 50, bt.cry !== false, bt.legendary !== false);
        C.compare(as, Script.VAR_RESULT, 1); C.gotoIf(as, '=', lGone); C.compare(as, Script.VAR_RESULT, 7); C.gotoIf(as, '=', lGone);
        C.release(as); C.end(as);
        as.label(lGone); C.removeobject(as, id); C.setflag(as, a.flag); C.release(as); C.end(as);
        const w = as.write(); meta.allocs.push(...w.allocs); r.wptr(e.off + 16, w.off);
      }
    }
    const hdr = G().mapGroups[st.g][st.n], ms = r.ptr(hdr + 8), entries = [];
    if (ms >= 0) for (let i = 0; i < 16 && r.u8[ms + i * 5]; i++) entries.push([r.u8[ms + i * 5], r.r32(ms + i * 5 + 1)]);
    const tiles = sc.clips.filter(c => c.k === 'tiles' && (c.cells || []).length && c.keep !== false);
    if (!flags.length && !tiles.length) return;
    if (!meta.frames.some(f => f.g === st.g && f.n === st.n)) meta.frames.push({ g: st.g, n: st.n, orig: r.r32(hdr + 8) });
    // ours first, then the map's own script of that type
    const chain = (type, build) => {
      const as = new Script.Asm(); build(as);
      const k = entries.findIndex(x => x[0] === type);
      if (k >= 0) C.gotoAbs(as, entries[k][1] - 0x08000000); else C.end(as);
      const w = as.write(); meta.allocs.push(...w.allocs);
      if (k >= 0) entries[k][1] = (0x08000000 + w.off) >>> 0; else entries.push([type, (0x08000000 + w.off) >>> 0]);
    };
    // "on transition" (type 3): until the scene has happened, its new characters and Pokémon are hidden
    if (flags.length) chain(3, as => { const lDone = as.fresh('done'); C.checkflag(as, st.doneFlag); C.gotoIf(as, '=', lDone); for (const f of flags) C.setflag(as, f); as.label(lDone); });
    // "on load" (type 1): once it has happened, the blocks it changed stay changed
    if (tiles.length) chain(1, as => { const lNot = as.fresh('not'); C.checkflag(as, st.doneFlag); C.gotoIf(as, '!=', lNot); for (const c of tiles) for (const q of c.cells) as.b(0xA2).h(q.x).h(q.y).h(q.v & 0x3FF).h((q.v >> 10) & 3 ? 1 : 0); as.label(lNot); });
    const lst = new Uint8Array(entries.length * 5 + 1), dl = new DataView(lst.buffer);
    entries.forEach(([t, q], i) => { lst[i * 5] = t; dl.setUint32(i * 5 + 1, q, true); });
    const lo = r.writeNew(lst); meta.allocs.push([lo, lst.length]); r.wptr(hdr + 8, lo);
  }
  // where the player starts a test: their place in the scene; for a scene on a square, the free square next to it (they walk on)
  function playSpot(st) {
    const sc = scene(st), m = MapsTab.api.loadMap(st.g, st.n), p = startOf(sc.actors.find(a => a.kind === 'player'), st, m);
    if (st.trig !== 'step' || p.x !== st.x || p.y !== st.y) return { x: p.x, y: p.y };
    const ok = walkGrid(m); for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) { const x = p.x + dx, y = p.y + dy; if (x >= 0 && y >= 0 && x < m.w && y < m.h && ok[y * m.w + x]) return { x, y }; }
    return { x: p.x, y: p.y };
  }
  // the scene as one block for the story compiler
  const blocks = st => [{ op: 'emit', fn: (a, ctx) => emit(st, a, ctx) }];
  function toBlocks(st) {
    const sc = scene(st), out = [], who = id => { const a = sc.actors.find(x => x.id === id); return !a ? null : a.kind === 'player' ? 'player' : a.kind === 'npc' ? String(a.localId) : null; };
    let cur = 0;
    for (const c of sc.clips.slice().sort((x, y) => x.t - y.t || sc.actors.findIndex(a => a.id === x.a) - sc.actors.findIndex(a => a.id === y.a))) {
      const w = who(c.a); if (w == null && c.k !== 'say' && c.k !== 'wait') continue;
      if (c.t > cur) out.push({ op: 'wait', seconds: (c.t - cur) * 16 / 60 });
      if (c.k === 'walk') out.push({ op: 'move', who: w, steps: c.path || [], speed: c.speed === 'run' ? 'fast' : c.speed === 'slow' ? 'slow' : 'normal' });
      else if (c.k === 'jump') out.push({ op: 'jump', who: w, dir: c.dir || 'down' });
      else if (c.k === 'face') out.push({ op: 'face', who: w, dir: c.dir || 'down' });
      else if (c.k === 'emote') out.push({ op: 'emote', who: w, kind: c.kind || '!' });
      else if (c.k === 'say') out.push({ op: 'say', text: c.text || ' ' });
      else if (c.k === 'wait') out.push({ op: 'wait', seconds: dur(c) * 16 / 60 });
      else if (c.k === 'hide' || c.k === 'show') out.push({ op: c.k, who: w });
      cur = Math.max(cur, c.t + dur(c));
    }
    return out;
  }
  const summary = st => { const sc = scene(st), n = endOf(sc); return Tf('{a} characters · {c} actions · {s} seconds', { a: sc.actors.length, c: sc.clips.length, s: (n * STEP_MS / 1000).toFixed(1) }); };

  // ---------- the editor ----------
  let clipboard = null;
  function open(st, opts = {}) {
    if (st.g == null) { toast(T('Choose the map of the scene first'), 'err'); return; }
    const sc = scene(st), m = MapsTab.api.loadMap(st.g, st.n);
    const E = { t: 0, sel: null, actor: 'player', zoom: 1, playing: false, placing: null, hist: [], fut: [], answer: 'yes', tilePick: null, blockPick: null };
    const PX = () => 30 * E.zoom, LEFT = 180;
    const save = () => { if (opts.onChange) opts.onChange(); };
    // every change: the old scene goes on the undo list
    const commit = fn => { E.hist.push(JSON.stringify(sc)); if (E.hist.length > 80) E.hist.shift(); E.fut = []; fn(); save(); refresh(); };
    const restore = json => { const o = JSON.parse(json); sc.actors = o.actors; sc.clips = o.clips; if (E.sel && !sc.clips.some(c => c.id === E.sel)) E.sel = null; if (!sc.actors.some(a => a.id === E.actor)) E.actor = 'player'; save(); refresh(); };
    const undo = () => { const j = E.hist.pop(); if (!j) return; E.fut.push(JSON.stringify(sc)); restore(j); };
    const redo = () => { const j = E.fut.pop(); if (!j) return; E.hist.push(JSON.stringify(sc)); restore(j); };
    const clipOf = id => sc.clips.find(c => c.id === id);
    const actorOf = id => sc.actors.find(a => a.id === id);
    const nameOf = a => a.kind === 'scene' ? T('The whole scene') : a.name || (a.kind === 'npc' ? '#' + a.localId : Objects.gfxName(a.gfx));

    // --- the map ---
    const bg = h('canvas', { width: m.w * 16, height: m.h * 16 }), bctx = bg.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) bctx.drawImage(MapsTab.api.metatileCanvas(m, R().r16(m.blocks + (y * m.w + x) * 2) & 0x3FF), x * 16, y * 16);
    const cv = h('canvas', { class: 'pixel cs-map', width: m.w * 16, height: m.h * 16, style: { width: m.w * 32 + 'px' } }), c2 = cv.getContext('2d');
    const sayBox = h('div', { class: 'cs-say', dir: 'auto' });
    function drawMap() {
      const S = stateAt(sc, st, m, E.t);
      c2.setTransform(1, 0, 0, 1, 0, Math.round(S.shake));          // a shaking screen moves up and down
      c2.fillStyle = '#000'; c2.fillRect(0, -8, cv.width, cv.height + 16);
      c2.drawImage(bg, 0, 0);
      for (const [k, v] of S.tiles) { const [x, y] = k.split(',').map(Number); c2.drawImage(MapsTab.api.metatileCanvas(m, v & 0x3FF), x * 16, y * 16); }
      const tsel = clipOf(E.sel);                                   // the squares of the selected block change
      if (tsel && tsel.k === 'tiles') { c2.strokeStyle = E.tilePick === tsel.id ? '#ff4dd2' : 'rgba(255,77,210,.7)'; c2.lineWidth = 2; for (const q of tsel.cells || []) c2.strokeRect(q.x * 16 + 1, q.y * 16 + 1, 14, 14); c2.lineWidth = 1; }
      // the people of the map who are not in the scene stay where they are
      const inScene = new Set(sc.actors.filter(a => a.kind === 'npc').map(a => a.localId));
      for (const e of m.events.obj) if (!inScene.has(R().u8[e.off])) { const [x, y] = MapsTab.api.evXY(e); c2.globalAlpha = 0.55; Objects.draw(c2, e, x * 16, y * 16, 16); c2.globalAlpha = 1; }
      // the path of the selected walk
      const sel = clipOf(E.sel);
      if (sel && sel.k === 'walk') {
        const before = stateAt(sc, st, m, sel.t - 0.001).actors.get(sel.a);
        if (before) { let x = Math.round(before.x), y = Math.round(before.y); c2.strokeStyle = 'rgba(255,220,0,.9)'; c2.lineWidth = 3; c2.beginPath(); c2.moveTo(x * 16 + 8, y * 16 + 8);
          for (const d of sel.path || []) { x += D[d][0]; y += D[d][1]; c2.lineTo(x * 16 + 8, y * 16 + 8); } c2.stroke(); c2.fillStyle = '#ffd43b'; c2.fillRect(x * 16 + 5, y * 16 + 5, 6, 6); c2.lineWidth = 1; }
      }
      if (E.drawPath) {                                            // the way being drawn: blue, red where there is none
        const dp = E.drawPath; let x = dp.from.x, y = dp.from.y;
        c2.strokeStyle = dp.ok ? '#4dabf7' : '#fa5252'; c2.lineWidth = 3; c2.setLineDash([5, 3]); c2.beginPath(); c2.moveTo(x * 16 + 8, y * 16 + 8);
        if (dp.ok) for (const d of dp.path) { x += D[d][0]; y += D[d][1]; c2.lineTo(x * 16 + 8, y * 16 + 8); } else c2.lineTo(dp.to.x * 16 + 8, dp.to.y * 16 + 8);
        c2.stroke(); c2.setLineDash([]); c2.lineWidth = 1;
        c2.strokeStyle = dp.ok ? '#4dabf7' : '#fa5252'; c2.lineWidth = 2; c2.strokeRect(dp.to.x * 16 + 1, dp.to.y * 16 + 1, 14, 14); c2.lineWidth = 1;
        if (dp.ok) { c2.fillStyle = 'rgba(0,0,0,.7)'; c2.fillRect(dp.to.x * 16 - 4, dp.to.y * 16 - 13, 24, 11); c2.fillStyle = '#fff'; c2.font = '9px sans-serif'; c2.fillText(dp.path.length + '', dp.to.x * 16, dp.to.y * 16 - 4); }
      }
      const list = sc.actors.map(a => [a, S.actors.get(a.id)]).filter(([, s]) => s && s.vis).sort((p, q) => p[1].y - q[1].y);
      for (const [a, s] of list) {
        const spr = Objects.sprite(s.gfx, s.dir);
        const px = s.x * 16 + 8, py = s.y * 16 + 16 - s.hop * 10;
        if (spr) c2.drawImage(spr, Math.round(px - spr.width / 2), Math.round(py - spr.height));
        else { c2.fillStyle = '#e03131'; c2.fillRect(s.x * 16 + 3, s.y * 16 + 3, 10, 10); }
        if (a.id === E.actor) { c2.strokeStyle = '#ffd43b'; c2.lineWidth = 2; c2.strokeRect(Math.round(s.x * 16) + 1, Math.round(s.y * 16) + 1, 14, 14); c2.lineWidth = 1; }
        if (s.emote) {                                            // the game's emote: a white bubble above the head
          const bx = Math.round(px - 7), by = Math.round(py - (spr ? spr.height : 16) - 16);
          c2.fillStyle = '#fff'; c2.strokeStyle = '#222'; c2.fillRect(bx, by, 14, 13); c2.strokeRect(bx + .5, by + .5, 13, 12);
          c2.fillStyle = s.emote === '♥' ? '#e03131' : '#222'; c2.font = 'bold 11px sans-serif'; c2.textAlign = 'center'; c2.fillText(s.emote, bx + 7, by + 11); c2.textAlign = 'start';
        }
      }
      for (const a of sc.actors) {                                 // the hidden ones as a faint ghost, so they can be found
        const s = S.actors.get(a.id); if (!s || s.vis) continue;
        c2.globalAlpha = 0.25; const spr = Objects.sprite(s.gfx, s.dir); if (spr) c2.drawImage(spr, Math.round(s.x * 16 + 8 - spr.width / 2), Math.round(s.y * 16 + 16 - spr.height)); c2.globalAlpha = 1;
      }
      if (S.white || S.black) { c2.setTransform(1, 0, 0, 1, 0, 0); c2.fillStyle = S.white ? 'rgba(255,255,255,' + S.white + ')' : 'rgba(0,0,0,' + S.black + ')'; c2.fillRect(0, 0, cv.width, cv.height); }
      c2.setTransform(1, 0, 0, 1, 0, 0);
      const text = S.say ? nameOf(S.say.a) + ': ' + S.say.text + (S.say.ask ? '   [' + T('YES') + ' / ' + T('NO') + ']' : '') : S.note || '';
      sayBox.textContent = text;
      sayBox.style.display = text ? '' : 'none';
      timeLabel.textContent = Tf('Step {n}', { n: (Math.round(E.t * 10) / 10) }) + ' · ' + (E.t * STEP_MS / 1000).toFixed(1) + ' ' + T('s');
      if (playhead) playhead.style.left = (LEFT + E.t * PX()) + 'px';
    }
    const cellOf = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / (r.width / m.w)), Math.floor((e.clientY - r.top) / (r.height / m.h))]; };
    const walk = walkGrid(m), still = new Set();                     // people of the map who are not in the scene stand in the way
    const stillSet = () => { still.clear(); const inScene = new Set(sc.actors.filter(a => a.kind === 'npc').map(a => a.localId)); for (const e of m.events.obj) if (!inScene.has(R().u8[e.off])) { const [x, y] = MapsTab.api.evXY(e); still.add(x + ',' + y); } };
    // free for a: walkable, nobody of the map there, nobody of the scene standing there at time t (a flying one goes over all)
    const freeFor = (a, t) => {
      if (a.fly) return (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
      stillSet(); const S = stateAt(sc, st, m, t), taken = new Set();
      for (const o of sc.actors) { const s = S.actors.get(o.id); if (o.id !== a.id && s && s.vis) taken.add(Math.round(s.x) + ',' + Math.round(s.y)); }
      return (x, y) => walk[y * m.w + x] && !still.has(x + ',' + y) && !taken.has(x + ',' + y);
    };
    // the end of a walk clip on the map (drag it to make the way longer)
    const walkEnd = c => { const s0 = stateAt(sc, st, m, c.t - 0.001).actors.get(c.a); let x = Math.round(s0.x), y = Math.round(s0.y); const from = { x, y }; for (const d of c.path || []) { x += D[d][0]; y += D[d][1]; } return { from, x, y }; };
    cv.onmousedown = e => {
      if (e.button !== 0) return;
      const [x, y] = cellOf(e);
      if (E.placing) { const a = actorOf(E.placing); E.placing = null; if (a) commit(() => { a.x = x; a.y = y; }); return; }
      const tc = clipOf(E.blockPick || E.tilePick);
      if (tc && E.blockPick) { E.blockPick = null; const v = R().r16(m.blocks + (y * m.w + x) * 2); commit(() => { tc.block = v; }); return; }
      if (tc && E.tilePick) {                                       // a square in / out of the block change
        const v = tc.block != null ? tc.block : R().r16(m.blocks + (y * m.w + x) * 2), k = (tc.cells || []).findIndex(q => q.x === x && q.y === y);
        commit(() => { tc.cells = tc.cells || []; if (k >= 0) tc.cells.splice(k, 1); else tc.cells.push({ x, y, v }); }); return;
      }
      stop();
      const S = stateAt(sc, st, m, E.t), sel = clipOf(E.sel);
      let mode = null;
      if (sel && sel.k === 'walk') { const we = walkEnd(sel); if (we.x === x && we.y === y) mode = { kind: 'extend', clip: sel, a: actorOf(sel.a), from: { x, y }, t: sel.t }; }
      if (!mode) {
        const hit = sc.actors.find(a => { const s = S.actors.get(a.id); return a.kind !== 'scene' && s && Math.round(s.x) === x && Math.round(s.y) === y; });
        if (!hit) return;
        // a new walk starts at the playhead, or right after what the character is doing then
        const t0 = sc.clips.filter(c => c.a === hit.id).reduce((v, c) => c.t <= v && c.t + dur(c) > v ? c.t + dur(c) : v, Math.round(E.t));
        const s0 = stateAt(sc, st, m, t0).actors.get(hit.id);
        mode = { kind: 'new', a: hit, from: { x: Math.round(s0.x), y: Math.round(s0.y) }, t: t0 };
        if (E.actor !== hit.id || E.sel) { E.actor = hit.id; E.sel = null; drawProps(); drawTimeline(); }
      }
      e.preventDefault();
      const free = freeFor(mode.a, mode.t);
      let last = null;
      const mv = ev => {
        const [tx, ty] = cellOf(ev); if (last && last[0] === tx && last[1] === ty) return; last = [tx, ty];
        const path = tx === mode.from.x && ty === mode.from.y ? [] : findPath(m, free, mode.from, { x: tx, y: ty });
        E.drawPath = { from: mode.from, path: path || [], ok: !!path, to: { x: tx, y: ty } }; drawMap();
      };
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        const dp = E.drawPath; E.drawPath = null;
        if (!dp || !last) { drawMap(); return; }                                   // a click: the character is selected
        if (!dp.ok) { toast(T('There is no way there (walls, water or people in the way)'), 'err'); drawMap(); return; }
        if (!dp.path.length) { drawMap(); return; }
        if (mode.kind === 'extend') commit(() => {                  // going back the way it came cancels out (no walking back and forth)
          const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' }, p = mode.clip.path, add = dp.path.slice();
          while (p.length && add.length && OPP[p[p.length - 1]] === add[0]) { p.pop(); add.shift(); }
          p.push(...add); if (!p.length) { sc.clips = sc.clips.filter(c => c !== mode.clip); E.sel = null; }
        });
        else { const c = { id: uid(), a: mode.a.id, t: mode.t, k: 'walk', path: dp.path, speed: 'walk' }; commit(() => { sc.clips.push(c); E.sel = c.id; E.actor = mode.a.id; }); }
      };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };
    cv.onmousemove = e => {
      if (E.drawPath) return;
      const [x, y] = cellOf(e), S = stateAt(sc, st, m, E.t), sel = clipOf(E.sel);
      const onActor = sc.actors.some(a => { const s = S.actors.get(a.id); return s && Math.round(s.x) === x && Math.round(s.y) === y; });
      const onEnd = sel && sel.k === 'walk' && (() => { const we = walkEnd(sel); return we.x === x && we.y === y; })();
      cv.title = E.blockPick ? T('Click a square: its block is the one put in') : E.tilePick ? T('Click squares to change them (again to take one out)') : E.placing ? T('Click where the character starts') : onEnd ? T('Drag to make the way longer') : onActor ? T('Drag to where the character walks') : '(' + x + ', ' + y + ')';
      cv.style.cursor = E.placing || E.tilePick || E.blockPick ? 'crosshair' : onActor || onEnd ? 'grab' : 'default';
    };

    // --- playing ---
    let raf = 0, last = 0;
    const stop = () => { E.playing = false; cancelAnimationFrame(raf); playBtn.textContent = '▶ ' + T('Play'); };
    const play = () => {
      if (E.playing) { stop(); return; }
      if (E.t >= endOf(sc)) E.t = 0;
      E.playing = true; playBtn.textContent = '⏸ ' + T('Pause'); last = performance.now();
      const tick = now => {
        if (!E.playing) return;
        const t0 = E.t; E.t += (now - last) / STEP_MS; last = now;
        if (E.answer === 'no') for (const c of sc.clips) if (c.k === 'ask' && t0 < c.t + dur(c) && E.t >= c.t + dur(c)) {   // the question ends with NO
          if (c.no === 'jump' && c.jump != null) E.t = c.jump; else if (c.no === 'end' || c.no === 'done') { E.t = endOf(sc); drawMap(); stop(); return; }
        }
        if (E.t >= endOf(sc)) { E.t = endOf(sc); drawMap(); stop(); return; }
        drawMap(); raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    // --- adding ---
    const NEW_CLIP = { walk: { path: [], speed: 'walk' }, jump: { dir: 'down' }, face: { dir: 'down' }, wait: { len: 2 }, emote: { kind: '!', len: 2 }, say: { text: '', len: 3 }, hide: {}, show: {},
      ask: { text: '', len: 3, no: 'continue' }, battle: { lvl: 50, legendary: true, cry: true }, give: { what: 'mon', sp: 25, lvl: 5, item: 13, qty: 1 }, cry: {},
      shake: { strength: 2, len: 3 }, flash: {}, fade: { out: true }, tiles: { cells: [], keep: true }, music: { song: 0 }, sound: { se: 1 }, silence: {} };
    function addClip(k, aId = E.actor, t = Math.round(E.t)) {
      const mine = sc.clips.filter(c => c.a === aId), free = mine.reduce((v, c) => c.t <= t && c.t + dur(c) > t ? c.t + dur(c) : v, t);   // after a clip already there
      const c = Object.assign({ id: uid(), a: aId, t: free, k }, clone(NEW_CLIP[k]));
      commit(() => { sc.clips.push(c); E.sel = c.id; E.actor = aId; });
    }
    function addMenu(x, y, aId, t) {
      const back = h('div', { class: 'cs-menu-back', onclick: e => { if (e.target === back) back.remove(); } });
      const menu = h('div', { class: 'panel cs-menu', style: { left: x + 'px', top: y + 'px' } },
        h('div', { class: 'muted' }, nameOf(actorOf(aId)) + ' · ' + Tf('Step {n}', { n: t })),
        ...kindsFor(actorOf(aId)).map(k => h('button', { onclick: () => { back.remove(); addClip(k, aId, t); } }, KINDS[k][0] + ' ' + T(KINDS[k][1]))));
      back.append(menu); document.body.append(back);
      const rc = menu.getBoundingClientRect();                      // keep it on the screen
      if (rc.bottom > innerHeight) menu.style.top = Math.max(0, y - rc.height) + 'px';
      if (rc.right > innerWidth) menu.style.left = Math.max(0, x - rc.width) + 'px';
    }
    function addActor() {
      const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) back.remove(); } });
      const done = a => { back.remove(); commit(() => { sc.actors.push(a); E.actor = a.id; E.sel = null; }); if (a.kind !== 'npc' && a.x == null) { E.placing = a.id; toast(T('Click on the map where the character starts')); } };
      back.append(h('div', { class: 'panel modal' }, h('h3', {}, T('Who joins the scene?')),
        h('div', { class: 'col' },
          sc.actors.some(a => a.kind === 'player') ? null : h('button', { onclick: () => done({ id: 'player', kind: 'player', name: T('The player'), gfx: 0, x: null, y: null, dir: 'up' }) }, '🧍 ' + T('The player')),
          h('button', { onclick: async () => { back.remove(); const p = await Blocks.pickOnMap(st.g, st.n, { person: true }); if (!p) return;
            if (sc.actors.some(a => a.kind === 'npc' && a.localId === p.obj.localId)) { toast(T('This person is already in the scene'), 'err'); return; }
            const e = objOf(st.g, st.n, p.obj.localId); commit(() => { const a = { id: uid(), kind: 'npc', localId: p.obj.localId, name: Objects.tooltip(st.g, st.n, e).split(/[·:(]/)[0].trim().slice(0, 24), gfx: R().u8[e.off + 1] }; sc.actors.push(a); E.actor = a.id; E.sel = null; }); } }, '👤 ' + T('A person already on the map')),
          h('button', { onclick: () => Objects.gallery(18, gfx => done({ id: uid(), kind: 'new', gfx, name: Objects.gfxName(gfx), x: null, y: null, dir: 'down' })) }, '✨ ' + T('A new character for the scene')),
          h('button', { onclick: () => Objects.gallery(138, gfx => {                      // which Pokémon: the one the game itself shows with this sprite
            let sp = 0; try { for (const [k, v] of Legends.knownSprites()) if (v === gfx) { sp = k; break; } } catch (e) { /* no legendaries */ }
            done({ id: uid(), kind: 'mon', gfx, sp, name: sp ? App.getLists().species[sp] : Objects.gfxName(gfx), x: null, y: null, dir: 'down' });
          }) }, '🐾 ' + T('A Pokémon or a legendary'))),
        h('button', { onclick: () => back.remove() }, T('Cancel'))));
      document.body.append(back);
    }

    // --- properties of the selected clip / character ---
    const props = h('div', { class: 'cs-props' });
    function drawProps() {
      props.innerHTML = '';
      const add = (...kids) => props.append(...kids.filter(k => k != null && k !== ''));
      const c = clipOf(E.sel), a = actorOf(E.actor);
      const field = (label, ...kids) => h('div', { class: 'st-field' }, h('label', {}, label), ...kids);
      const set = (fn) => commit(fn);
      if (c) {
        const ac = actorOf(c.a);
        add(h('h3', {}, KINDS[c.k][0] + ' ' + T(KINDS[c.k][1])), h('div', { class: 'muted' }, nameOf(ac) + ' · ' + Tf('Step {n}', { n: c.t }) + ' – ' + (c.t + dur(c))));
        const dirSel = (v, on) => h('select', { onchange: e => on(e.target.value) }, ...Object.keys(ARROW).map(d => h('option', { value: d, selected: d === v }, ARROW[d] + ' ' + T(d))));
        if (c.k === 'walk') {
          add(field(T('The way'), h('div', { class: 'row wrap' }, ...Object.keys(ARROW).map(d => h('button', { class: 'bl-dir', title: T(d), onclick: () => set(() => c.path.push(d)) }, ARROW[d])),
            h('button', { class: 'bl-dir', title: T('Remove the last step'), onclick: () => set(() => c.path.pop()) }, '⌫'),
            h('button', { onclick: () => set(() => { c.path = []; }) }, T('Clear'))),
            h('div', { class: 'bl-path' }, (c.path || []).map(d => ARROW[d]).join(' ') || T('(no steps yet)'))),
            field(T('Speed'), h('select', { onchange: e => set(() => { c.speed = e.target.value; }) }, ...[['walk', T('walk')], ['run', T('run')], ['slow', T('slowly')]].map(([k, l]) => h('option', { value: k, selected: c.speed === k }, l)))),
            h('p', { class: 'muted' }, T('The yellow line on the map is the way. Drag the yellow square at its end to make it longer, or drag from the character to draw a new way.')));
          const pb = clipProblems(sc, st, m, walk).get(c.id); if (pb) add(h('div', { class: 'warn' }, '⚠ ' + pb));
        } else if (c.k === 'jump') add(field(T('Direction (2 squares)'), dirSel(c.dir, v => set(() => { c.dir = v; }))));
        else if (c.k === 'face') add(field(T('Look'), dirSel(c.dir, v => set(() => { c.dir = v; }))));
        else if (c.k === 'emote') add(field(T('Emote'), h('select', { onchange: e => set(() => { c.kind = e.target.value; }) }, ...Object.entries(EMOTES).map(([k, ic]) => h('option', { value: k, selected: c.kind === k }, ic + ' ' + T({ '!': 'surprised', '?': 'confused', '♥': 'happy' }[k]))))));
        else if (c.k === 'say') { const t = h('textarea', { rows: 3, dir: 'auto', placeholder: T('what they say…'), onchange: e => set(() => { c.text = e.target.value; }) }); t.value = c.text || ''; add(field(T('Text'), t), h('p', { class: 'muted' }, T('In the game the scene waits here until the player presses A.'))); }
        else if (c.k === 'ask') {
          const t = h('textarea', { rows: 2, dir: 'auto', placeholder: T('the question…'), onchange: e => set(() => { c.text = e.target.value; }) }); t.value = c.text || '';
          add(field(T('The question'), t), field(T('If the answer is NO'), h('select', { onchange: e => set(() => { c.no = e.target.value; if (c.no === 'jump' && c.jump == null) c.jump = c.t + dur(c) + 4; }) },
            ...[['continue', T('the scene goes on the same')], ['jump', T('jump to a step of the scene')], ['done', T('the scene ends here')], ['end', T('the scene stops and comes again next time')]].map(([k, l]) => h('option', { value: k, selected: (c.no || 'continue') === k }, l)))),
            c.no === 'jump' ? field(T('Jump to step'), h('input', { type: 'number', min: 0, value: c.jump || 0, style: { width: '70px' }, onchange: e => set(() => { c.jump = Math.max(0, Math.round(+e.target.value || 0)); }) })) : null,
            h('p', { class: 'muted' }, T('YES goes on with the timeline. The preview answers as chosen at the top (YES / NO).')));
        } else if (c.k === 'battle') {
          if (ac.kind === 'mon') add(field(T('Level'), h('input', { type: 'number', min: 1, max: 100, value: c.lvl || 50, style: { width: '70px' }, onchange: e => set(() => { c.lvl = Math.max(1, Math.min(100, +e.target.value || 50)); }) })),
            ac.sp ? h('div', {}, Tf('A battle with {who}', { who: App.getLists().species[ac.sp] })) : h('div', { class: 'warn' }, T('Choose which Pokémon it is: click its row (on the left of the timeline).')),
            h('label', {}, h('input', { type: 'checkbox', checked: c.legendary !== false, onchange: e => set(() => { c.legendary = e.target.checked; }) }), ' ' + T('Legendary battle (its music, like the birds of the game)')),
            h('label', {}, h('input', { type: 'checkbox', checked: c.cry !== false, onchange: e => set(() => { c.cry = e.target.checked; }) }), ' ' + T('Its cry before the battle')),
            h('p', { class: 'muted' }, T('Won or caught: it is gone for good. Ran away: it stays there, and talking to it starts the battle again. Lost: the player blacks out and the scene comes again.')));
          else {
            const opts = [[0, T('— choose a trainer —')]]; for (let id = 1; id < (TrainersTab.COUNT || 743); id++) { const tr = Objects.trainer(id); if (tr && tr.team && tr.team.length) opts.push([id, '#' + id + ' ' + (Objects.classNames()[tr.cls] || '') + ' ' + tr.name]); }
            const ta = (k, ph) => { const x = h('textarea', { rows: 2, dir: 'auto', placeholder: ph, onchange: e => set(() => { c[k] = e.target.value; }) }); x.value = c[k] || ''; return x; };
            add(field(T('Which trainer'), h('select', { onchange: e => set(() => { c.trainer = +e.target.value || 0; }) }, ...opts.map(([v, l]) => h('option', { value: v, selected: (c.trainer || 0) === v }, l)))),
              field(T('Before the battle'), ta('intro', T('before the battle…'))), field(T('When you beat them'), ta('defeat', T('when you beat them…'))));
          }
        } else if (c.k === 'give') {
          add(field(T('What'), h('select', { onchange: e => set(() => { c.what = e.target.value; }) }, h('option', { value: 'mon', selected: c.what !== 'item' }, '🐾 ' + T('A Pokémon')), h('option', { value: 'item', selected: c.what === 'item' }, '🎒 ' + T('An item')))));
          if (c.what === 'item') add(field(T('Item'), Objects.itemPicker(c.item || 13, v => set(() => { c.item = v || 13; }))), field(T('How many'), h('input', { type: 'number', min: 1, max: 99, value: c.qty || 1, style: { width: '70px' }, onchange: e => set(() => { c.qty = Math.max(1, +e.target.value || 1); }) })));
          else add(field(T('Which Pokémon'), makeSelect(App.getLists().species, c.sp || 25, v => set(() => { c.sp = v; }))), field(T('Level'), h('input', { type: 'number', min: 1, max: 100, value: c.lvl || 5, style: { width: '70px' }, onchange: e => set(() => { c.lvl = Math.max(1, Math.min(100, +e.target.value || 5)); }) })));
        } else if (c.k === 'cry') add(field(T('Whose cry'), makeSelect(App.getLists().species, c.sp || ac.sp || 25, v => set(() => { c.sp = v; }))));
        else if (c.k === 'shake') add(field(T('How strong'), h('select', { onchange: e => set(() => { c.strength = +e.target.value; }) }, ...[[1, T('a little')], [2, T('medium')], [3, T('strong')]].map(([v, l]) => h('option', { value: v, selected: (c.strength || 2) === v }, l)))),
          h('p', { class: 'muted' }, T('Everyone goes on moving while the screen shakes.')));
        else if (c.k === 'fade') add(field(T('The screen'), h('select', { onchange: e => set(() => { c.out = e.target.value === 'out'; }) }, h('option', { value: 'out', selected: c.out !== false }, T('goes dark')), h('option', { value: 'in', selected: c.out === false }, T('comes back from dark')))));
        else if (c.k === 'flash') add(h('p', { class: 'muted' }, T('The screen flashes white, like lightning.')));
        else if (c.k === 'music') add(field(T('Song #'), h('input', { type: 'number', min: 0, max: 400, value: c.song || 0, style: { width: '80px' }, onchange: e => set(() => { c.song = Math.max(0, +e.target.value || 0); }) })), h('p', { class: 'muted' }, T('0 = back to the map music')));
        else if (c.k === 'sound') add(field(T('Sound #'), h('input', { type: 'number', min: 0, max: 300, value: c.se || 1, style: { width: '80px' }, onchange: e => set(() => { c.se = Math.max(0, +e.target.value || 1); }) })));
        else if (c.k === 'silence') add(h('p', { class: 'muted' }, T('The music fades out.')));
        else if (c.k === 'tiles') {
          const bv = c.block, pic = h('canvas', { class: 'pixel', width: 16, height: 16, style: { width: '32px', verticalAlign: 'middle', border: '1px solid var(--line)' } });
          if (bv != null) pic.getContext('2d').drawImage(MapsTab.api.metatileCanvas(m, bv & 0x3FF), 0, 0);
          add(field(T('The block put in'), h('div', { class: 'row' }, bv != null ? pic : h('i', { class: 'muted' }, T('the block of each square, as it is')),
              h('button', { class: E.blockPick === c.id ? 'sel' : '', onclick: () => { E.blockPick = c.id; E.tilePick = null; toast(T('Click a square: its block is the one put in')); drawProps(); } }, '🎯 ' + T('Take a block from the map')))),
            field(T('Squares'), h('div', { class: 'row wrap' }, h('span', {}, String((c.cells || []).length)),
              h('button', { class: E.tilePick === c.id ? 'sel' : '', onclick: () => { E.tilePick = E.tilePick === c.id ? null : c.id; E.blockPick = null; drawProps(); drawMap(); } }, '👆 ' + (E.tilePick === c.id ? T('Done choosing') : T('Choose squares on the map'))),
              (c.cells || []).length ? h('button', { onclick: () => set(() => { c.cells = []; }) }, T('Clear')) : null)),
            h('label', {}, h('input', { type: 'checkbox', checked: c.keep !== false, onchange: e => set(() => { c.keep = e.target.checked; }) }), ' ' + T('They stay changed after the scene')),
            h('p', { class: 'muted' }, T('For example a rock that is gone or a door that opens: take the block (ground, an open door), then click the squares.')));
        }
        if (STRETCH.has(c.k)) add(field(T('Length (steps)'), h('input', { type: 'number', min: 1, max: 99, value: dur(c), style: { width: '70px' }, onchange: e => set(() => { c.len = Math.max(1, +e.target.value || 1); }) })));
        add(field(T('Starts at step'), h('input', { type: 'number', min: 0, value: c.t, style: { width: '70px' }, onchange: e => set(() => { c.t = Math.max(0, Math.round(+e.target.value || 0)); }) })),
          h('div', { class: 'row wrap' }, h('button', { onclick: () => duplicate() }, '⧉ ' + T('Duplicate')), h('button', { class: 'danger', onclick: () => del() }, '✕ ' + T('Delete'))));
      } else if (a) {
        const p = startOf(a, st, m);
        if (a.kind === 'scene') {
          add(h('h3', {}, '🎬 ' + T('The whole scene')), h('p', { class: 'muted' }, T('Effects of the whole screen: shaking, a flash, darkness, music and sounds, blocks of the map that change.')),
            h('div', { class: 'cs-addrow' }, ...kindsFor(a).map(k => h('button', { onclick: () => addClip(k) }, KINDS[k][0] + ' ' + T(KINDS[k][1])))));
          return;
        }
        add(h('h3', {}, nameOf(a)), h('div', { class: 'muted' }, { player: T('The player'), npc: T('A person on the map'), new: T('A new character for the scene'), mon: T('A Pokémon or a legendary') }[a.kind]));
        add(field(T('Name (only for you)'), h('input', { value: a.name || '', dir: 'auto', onchange: e => set(() => { a.name = e.target.value; }) })));
        if (a.kind === 'mon') add(field(T('Which Pokémon (its cry and battle)'), makeSelect(App.getLists().species, a.sp || 0, v => set(() => { a.sp = v; }))));
        if (a.kind !== 'player') add(field(T('After the scene'), h('select', { onchange: e => set(() => { a.after = e.target.value; }) },
          ...[['stay', T('stays where it ended (also next time)')], ...(a.kind === 'npc' ? [['back', T('goes back to its place (next time)')]] : []), ['gone', T('is gone for good')]].map(([k, l]) => h('option', { value: k, selected: afterOf(a) === k }, l)))));
        if (a.kind === 'new' || a.kind === 'mon') add(field(T('Looks like'), h('button', { onclick: () => Objects.gallery(a.gfx, v => set(() => { a.gfx = v; })) }, '🖼 ' + Objects.gfxName(a.gfx))));
        if (a.kind !== 'npc') add(field(T('Starts at'), h('div', { class: 'row' }, h('span', {}, '(' + p.x + ', ' + p.y + ')'), h('button', { class: E.placing === a.id ? 'sel' : '', onclick: () => { E.placing = a.id; toast(T('Click on the map where the character starts')); drawProps(); } }, '👆 ' + T('Pick on the map')))));
        else add(h('p', { class: 'muted' }, Tf('Starts where they stand on the map ({x}, {y}).', { x: p.x, y: p.y })));
        if (a.kind === 'mon' || a.kind === 'new') add(h('label', {}, h('input', { type: 'checkbox', checked: !!a.fly, onchange: e => set(() => { a.fly = e.target.checked; }) }), ' 🪽 ' + T('Flies (goes over walls, trees and water)')));
        add(field(T('Looks at first'), h('select', { onchange: e => set(() => { a.dir = e.target.value; }) }, ...Object.keys(ARROW).map(d => h('option', { value: d, selected: p.dir === d }, ARROW[d] + ' ' + T(d))))));
        add(h('div', { class: 'cs-addrow' }, ...kindsFor(a).map(k => h('button', { title: T(KINDS[k][1]), onclick: () => addClip(k) }, KINDS[k][0] + ' ' + T(KINDS[k][1])))),
          h('p', { class: 'muted' }, T('Adds at the playhead. Or double-click the character\'s row on the timeline.')),
          h('p', { class: 'muted' }, '🖱 ' + T('To make them walk: drag from the character on the map to where they go. The way goes around walls, water and people by itself.')),
          a.kind !== 'player' ? h('button', { class: 'danger', onclick: async () => { if (!(await ask(Tf('Remove {a} and their actions from the scene?', { a: nameOf(a) }), { danger: true }))) return; commit(() => { sc.clips = sc.clips.filter(c => c.a !== a.id); sc.actors = sc.actors.filter(x => x !== a); E.actor = 'player'; }); } }, '✕ ' + T('Remove from the scene')) : null);
      }
    }
    const duplicate = () => { const c = clipOf(E.sel); if (!c) return; const d = Object.assign(clone(c), { id: uid(), t: c.t + dur(c) }); commit(() => { sc.clips.push(d); E.sel = d.id; }); };
    const del = () => { const c = clipOf(E.sel); if (!c) return; commit(() => { sc.clips = sc.clips.filter(x => x !== c); E.sel = null; }); };

    // --- the timeline ---
    const tlScroll = h('div', { class: 'cs-tl-scroll' });
    let playhead = null;
    function drawTimeline() {
      const keep = tlScroll.scrollLeft, keepY = tlScroll.scrollTop, px = PX();
      const len = Math.max(endOf(sc) + 10, 24), W = len * px, bad = clipProblems(sc, st, m, walk);
      const grid = h('div', { class: 'cs-grid', style: { width: (LEFT + W) + 'px' } }); grid.style.setProperty('--z', E.zoom);
      const ruler = h('div', { class: 'cs-track cs-ruler', style: { width: W + 'px' } });
      for (let i = 0; i <= len; i++) ruler.append(h('div', { class: 'cs-tick' + (i % 4 ? '' : ' big'), style: { left: i * px + 'px' } }, i % 4 ? '' : String(i)));
      const scrub = e => { const r = ruler.getBoundingClientRect(); E.t = Math.max(0, Math.min(len, (e.clientX - r.left) / px)); if (!e.shiftKey) E.t = Math.round(E.t * 4) / 4; drawMap(); };
      ruler.onmousedown = e => { stop(); scrub(e); const mv = ev => scrub(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
      grid.append(h('div', { class: 'cs-row cs-head' }, h('div', { class: 'cs-who' }, h('b', {}, T('Characters')), h('button', { title: T('Add a character'), onclick: addActor }, '+ ' + T('Add'))), ruler));
      for (const a of [...sc.actors.filter(x => x.kind !== 'scene'), ...sc.actors.filter(x => x.kind === 'scene')]) {   // the whole scene's row at the bottom
        const p = startOf(a, st, m), icon = a.kind === 'scene' ? h('span', { class: 'cs-icon cs-scene-ic' }, '🎬') : h('canvas', { class: 'pixel cs-icon', width: 32, height: 32 }), spr = a.kind === 'scene' ? null : Objects.sprite(p.gfx, 'down');
        if (spr) icon.getContext('2d').drawImage(spr, Math.round(16 - spr.width / 2), Math.max(0, 32 - spr.height));
        const track = h('div', { class: 'cs-track', style: { width: W + 'px' } });
        track.ondblclick = e => { if (e.target !== track) return; const r = track.getBoundingClientRect(); addMenu(e.clientX, e.clientY, a.id, Math.max(0, Math.floor((e.clientX - r.left) / px))); };
        track.oncontextmenu = e => { if (e.target !== track) return; e.preventDefault(); track.ondblclick(e); };
        for (const c of sc.clips.filter(x => x.a === a.id)) {
          const [ic, l, col] = KINDS[c.k], label = c.k === 'walk' ? (c.path || []).map(d => ARROW[d]).join('') || T(l) : c.k === 'say' || c.k === 'ask' ? (c.text || T(l)) : c.k === 'emote' ? (EMOTES[c.kind] || '!') : c.k === 'face' || c.k === 'jump' ? ARROW[c.dir || 'down'] : c.k === 'fade' ? (c.out === false ? T('back from dark') : T('to dark')) : T(l);
          const el = h('div', { class: 'cs-clip' + (c.id === E.sel ? ' sel' : '') + (bad.has(c.id) ? ' bad' : ''), title: T(l) + (bad.has(c.id) ? ' · ' + bad.get(c.id) : ''),
            style: { left: c.t * px + 'px', width: Math.max(8, dur(c) * px - 2) + 'px', background: col } }, h('span', {}, ic + ' ' + label));
          if (STRETCH.has(c.k)) el.append(h('div', { class: 'cs-grip', title: T('Drag to make it longer or shorter') }));
          el.onmousedown = e => dragClip(e, c, el);
          track.append(el);
        }
        grid.append(h('div', { class: 'cs-row' + (a.id === E.actor ? ' sel' : ''), 'data-actor': a.id },
          h('div', { class: 'cs-who', onclick: () => { E.actor = a.id; E.sel = null; refresh(); } }, icon, h('span', { dir: 'auto' }, nameOf(a))), track));
      }
      playhead = h('div', { class: 'cs-playhead', style: { left: (LEFT + E.t * px) + 'px' } });
      grid.append(playhead);
      tlScroll.innerHTML = ''; tlScroll.append(grid); tlScroll.scrollLeft = keep; tlScroll.scrollTop = keepY;
    }
    // drag a clip: along the row = when, to another row = who; the grip on the right = how long
    function dragClip(e, c, el) {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); stop();
      const grip = e.target.classList.contains('cs-grip'), x0 = e.clientX, t0 = c.t, len0 = dur(c), px = PX();
      if (E.sel !== c.id || E.actor !== c.a) { E.sel = c.id; E.actor = c.a; drawProps(); drawMap(); tlScroll.querySelectorAll('.cs-clip.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); }
      let nt = t0, nlen = len0, na = c.a, moved = false;
      const mv = ev => {
        const d = Math.round((ev.clientX - x0) / px);
        if (grip) { nlen = Math.max(1, len0 + d); el.style.width = (nlen * px - 2) + 'px'; }
        else {
          nt = Math.max(0, t0 + d); el.style.left = nt * px + 'px';
          const row = document.elementsFromPoint(ev.clientX, ev.clientY).map(x => x.closest && x.closest('.cs-row[data-actor]')).find(Boolean);
          if (row) na = row.dataset.actor;
          tlScroll.querySelectorAll('.cs-row.drop').forEach(x => x.classList.remove('drop')); if (row && na !== c.a) row.classList.add('drop');
        }
        moved = moved || d !== 0 || na !== c.a;
      };
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        if (!moved) return;
        if (!grip && na !== c.a && !kindsFor(actorOf(na)).includes(c.k)) { toast(Tf('{who} cannot do this', { who: nameOf(actorOf(na)) }), 'err'); na = c.a; }
        commit(() => { if (grip) c.len = nlen; else { c.t = nt; c.a = na; E.actor = na; } });
      };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    }

    // --- the window ---
    const playBtn = h('button', { class: 'primary', onclick: play }, '▶ ' + T('Play'));
    const timeLabel = h('span', { class: 'cs-time' });
    const close = () => { stop(); window.removeEventListener('keydown', keys, true); back.remove(); if (opts.onClose) opts.onClose(); };
    const trigText = st.trig === 'step' ? T('when the player steps on a square') : st.trig === 'talk' ? T('when the player talks to someone') : T('when the player arrives on the map');
    const back = h('div', { class: 'cs-back' },
      h('div', { class: 'cs-win' },
        h('div', { class: 'cs-top' },
          h('b', { dir: 'auto' }, '🎞 ' + (st.title || T('An animated scene'))), h('span', { class: 'muted', dir: 'auto' }, m.name + ' · ' + trigText),
          h('span', { style: { flex: 1 } }),
          h('button', { title: T('Back to the start'), onclick: () => { stop(); E.t = 0; drawMap(); } }, '⏮'), playBtn, timeLabel,
          sc.clips.some(c => c.k === 'ask') ? h('select', { title: T('The answer the preview takes'), onchange: e => { E.answer = e.target.value; } }, h('option', { value: 'yes' }, '❓ ' + T('YES')), h('option', { value: 'no' }, '❓ ' + T('NO'))) : null,
          opts.play ? h('button', { title: T('Applies the story and starts the game right before this scene'), onclick: () => { stop(); opts.play(); } }, '🎮 ' + T('Play in the game')) : null,
          h('button', { title: T('Undo') + ' (Ctrl+Z)', onclick: undo }, '↶'), h('button', { title: T('Redo') + ' (Ctrl+Y)', onclick: redo }, '↷'),
          h('button', { title: T('Zoom out'), onclick: () => { E.zoom = Math.max(0.4, E.zoom / 1.25); drawTimeline(); } }, '−'), h('button', { title: T('Zoom in'), onclick: () => { E.zoom = Math.min(3, E.zoom * 1.25); drawTimeline(); } }, '+'),
          h('button', { onclick: close }, '✓ ' + T('Done'))),
        h('div', { class: 'cs-main' }, h('div', { class: 'cs-mapbox' }, cv, sayBox), props),
        h('div', { class: 'cs-tlbox' }, tlScroll,
          h('div', { class: 'muted cs-hint' }, T('Double-click a row to add an action · drag a clip to move it (also to another character) · drag its right edge to make it longer · click the ruler to move the playhead · Space = play · Delete · Ctrl+C / Ctrl+V / Ctrl+D · Ctrl+Z')))));
    tlScroll.onwheel = e => { if (!e.ctrlKey) return; e.preventDefault(); E.zoom = Math.max(0.4, Math.min(3, E.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); drawTimeline(); };
    function keys(e) {
      if (!back.isConnected) return;
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (e.key === 'Escape' && !document.querySelector('.modal-back, .cs-menu-back')) { e.preventDefault(); if (E.placing || E.tilePick || E.blockPick) { E.placing = E.tilePick = E.blockPick = null; drawProps(); drawMap(); } else close(); return; }
      if (typing) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { e.preventDefault(); play(); }
      else if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && k === 'c') { const c = clipOf(E.sel); if (c) { clipboard = clone(c); toast(T('Copied')); } }
      else if (mod && k === 'v') { if (!clipboard) return; e.preventDefault(); const c = Object.assign(clone(clipboard), { id: uid(), t: Math.round(E.t), a: actorOf(clipboard.a) && clipboard.a === E.actor ? clipboard.a : E.actor }); commit(() => { sc.clips.push(c); E.sel = c.id; }); }
      else if (mod && k === 'd') { e.preventDefault(); duplicate(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (E.sel) { e.preventDefault(); del(); } }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stop(); E.t = Math.max(0, Math.round(E.t) + (e.key === 'ArrowRight' ? 1 : -1)); drawMap(); }   // time runs left to right, in Hebrew too
    }
    window.addEventListener('keydown', keys, true);
    const refresh = () => { drawTimeline(); drawProps(); drawMap(); };
    document.body.append(back);
    refresh();
    return { close, E, sc };
  }

  return { open, scene, toBlocks, blocks, prepare, emit, playSpot, problems, summary, stateAt, dur, endOf, parts, KINDS, kindsFor };
})();
