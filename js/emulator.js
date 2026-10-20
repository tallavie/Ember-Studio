// The emulator inside the editor: mGBA compiled to WebAssembly (lib/mgba, MPL-2.0). A floating window plays a ROM
// from memory; "Play from here" builds a test copy of the game that starts on the chosen map and spot (with a test
// team and the story at a chosen step) and, through the backend, skips the intro with a save state.
'use strict';

const Emu = (() => {
  let mod = null, loading = null, win = null, canvas = null, statusEl = null, speed = 1, muted = false, current = null;
  const KEYS = [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['ArrowLeft', 'Left'], ['ArrowRight', 'Right'], ['KeyX', 'A'], ['KeyZ', 'B'], ['Enter', 'Start'], ['Backspace', 'Select'], ['KeyA', 'L'], ['KeyS', 'R']];
  const supported = () => typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated;

  async function ensure() {
    if (mod) return mod;
    if (!loading) loading = (async () => {
      if (!supported()) throw new Error(T('The emulator needs Ember Studio (the EXE or ember/server.py): this page is not cross-origin isolated.'));
      const { default: mGBA } = await import(new URL('lib/mgba/mgba.js', location.href).href);
      const m = await mGBA({ canvas });
      await m.FSInit();
      m.toggleInput(false);                                   // the editor handles the keyboard (only while the window has focus)
      mod = m; return m;
    })();
    return loading;
  }
  function buildWindow() {
    if (win) return;
    canvas = h('canvas', { id: 'emu-canvas', width: 240, height: 160, class: 'pixel' });
    statusEl = h('span', { class: 'muted' });
    const btn = (label, title, fn) => h('button', { title: T(title), onclick: fn }, label);
    const speedBtn = btn('⏩ 1×', 'Speed', () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; speedBtn.textContent = '⏩ ' + speed + '×'; if (mod) mod.setFastForwardMultiplier(speed); });
    win = h('div', { class: 'emu-win', tabindex: 0 },
      h('div', { class: 'emu-bar' }, h('b', {}, '🎮 ' + T('Game')), statusEl, h('span', { style: { flex: 1 } }),
        btn('⏸', 'Pause / continue', e => { if (!mod) return; const p = e.target.textContent === '⏸'; p ? mod.pauseGame() : mod.resumeGame(); e.target.textContent = p ? '▶' : '⏸'; }),
        speedBtn,
        btn('🔊', 'Sound on / off', e => { if (!mod) return; muted = !muted; mod.setVolume(muted ? 0 : 100); e.target.textContent = muted ? '🔇' : '🔊'; }),
        btn('💾', 'Save state', () => { if (mod && mod.saveState(2)) toast(T('State saved')); }),
        btn('📂', 'Load state', () => { if (mod && mod.loadState(2)) toast(T('State loaded')); }),
        btn('↻', 'Restart', () => { if (mod && current) run(current.bytes, current.opts); }),
        btn('✕', 'Close', close)),
      h('div', { class: 'emu-screen' }, canvas),
      h('div', { class: 'emu-help muted' }, T('Arrows = move · X = A · Z = B · Enter = Start · Backspace = Select · A / S = L / R (click the game first)')));
    document.body.append(win);
    // keyboard: only while the emulator window has focus, so typing in the editor never moves the player
    const down = new Set();
    win.addEventListener('keydown', e => { const k = KEYS.find(x => x[0] === e.code); if (!k || !mod) return; e.preventDefault(); if (!down.has(k[1])) { down.add(k[1]); mod.buttonPress(k[1]); } });
    win.addEventListener('keyup', e => { const k = KEYS.find(x => x[0] === e.code); if (!k || !mod) return; e.preventDefault(); down.delete(k[1]); mod.buttonUnpress(k[1]); });
    win.addEventListener('blur', () => { if (mod) for (const b of down) mod.buttonUnpress(b); down.clear(); }, true);
    // drag the window by its bar
    const bar = win.querySelector('.emu-bar');
    bar.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { win.style.left = Math.max(0, ev.clientX - dx) + 'px'; win.style.top = Math.max(0, ev.clientY - dy) + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto'; };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
  }
  function close() { if (mod) { try { mod.pauseGame(); mod.setVolume(0); } catch (e) { /* not running */ } } if (win) win.hidden = true; }

  // play ROM bytes; opts: { name, state (Uint8Array save state to start from) }
  async function run(bytes, opts = {}) {
    buildWindow(); win.hidden = false; win.focus();
    statusEl.textContent = T('starting…');
    try {
      const m = await ensure(), p = m.filePaths(), name = (opts.name || 'game') + '.gba';
      try { m.quitGame(); } catch (e) { /* nothing running */ }
      m.FS.writeFile(p.gamePath + '/' + name, bytes);
      const sav = p.savePath + '/' + name.replace(/\.gba$/, '.sav'); try { m.FS.unlink(sav); } catch (e) { /* no save */ }
      if (!m.loadGame(p.gamePath + '/' + name)) throw new Error(T('The emulator could not load the game'));
      m.setVolume(muted ? 0 : 100); m.setFastForwardMultiplier(speed); m.resumeGame();
      if (opts.state) {                                       // the core needs a moment after loadGame before it takes a state
        m.FS.writeFile(p.saveStatePath + '/' + name.replace(/\.gba$/, '.ss1'), opts.state);
        let ok = false;
        for (let k = 0; k < 10 && !ok; k++) { await new Promise(r => setTimeout(r, 150)); ok = !!m.loadState(1); }
        if (!ok) toast(T('The start state could not be loaded: the game starts from the beginning'), 'err');
      }
      current = { bytes, opts };
      statusEl.textContent = opts.label || '';
      win.focus();
    } catch (e) { console.error(e); statusEl.textContent = ''; toast(e.message, 'err'); }
  }

  // ---------- play from here ----------
  // a copy of the game: when the new game first reaches the player's room, a frame script gives the test team,
  // sets the story step and warps to (g, n, x, y). The backend runs the intro at full speed in mGBA and saves a state
  // there, so the game in the editor starts right on the spot.
  const TEST_VAR = 0x40EE;
  function testRom(spec) {
    const src = App.rom, r = new Rom(src.u8.slice().buffer, 'test.gba'); r.freeStart = src.freeStart; r.freeEnd = src.freeEnd; r._hint = src._hint;
    const keep = App.rom; App.rom = r;
    try {
      const a = new Script.Asm(), C = Script.C;
      C.lockall(a); C.setvar(a, TEST_VAR, 1);
      for (const m of spec.team || []) C.givemon(a, m.sp, m.lvl);
      if ((spec.team || []).length) C.setflag(a, 0x828);                  // FLAG_SYS_POKEMON_GET: the start menu shows POKéMON
      for (const [mon, slot, move] of spec.moves || []) a.b(0x7B, mon, slot).h(move);   // setmonmove: e.g. HMs for a test team
      if (spec.story && spec.story.stageVar != null) C.setvar(a, spec.story.stageVar, spec.story.stage);
      for (const f of spec.flags || []) C.setflag(a, f);
      for (const [item, qty] of spec.items || []) C.additem(a, item, qty || 1);   // e.g. the Town Map, to look at it in a test
      for (const f of spec.clear || []) C.clearflag(a, f);
      for (const [v, n] of spec.vars || []) C.setvar(a, v, n);         // the game's own story at a moment (StoryView)
      a.b(0x39, spec.g, spec.n, 0xFF).h(spec.x).h(spec.y);           // warp to x, y
      C.releaseall(a); C.end(a);
      const w = a.write();
      Script.addFrameScript(4, 1, TEST_VAR, 0, w.off);
    } finally { App.rom = keep; }
    return r.u8;
  }
  async function playFrom(spec) {
    if (!Host.ok) { toast(T('Play from here needs Ember Studio (the EXE or ember/server.py)'), 'err'); return; }
    App.busy(T('Preparing the game: running the intro at full speed…'));
    try {
      const bytes = testRom(spec), tmp = Host.info.temp, rom = joinPath(tmp, 'play.gba');
      await Host.writeFile(rom, bytes);
      const res = await Host.json('POST', '/api/tools/startstate', { rom, g: spec.g, n: spec.n, x: spec.x, y: spec.y });
      const state = await Host.readFile(res.state);
      App.busy();
      await run(bytes, { name: 'play', state, label: spec.label || '' });
    } catch (e) { App.busy(); toast(e.message, 'err'); }
  }
  // just the game as it is now, from the beginning
  function playNow() { return run(App.rom.u8.slice(), { name: 'game', label: T('from the beginning') }); }
  // the team the player gets in "Play from here" (kept in the project: data/playtest.json)
  function team() { return Project.getData('playtest', () => ({ team: [{ sp: 6, lvl: 50 }] })).team; }
  function teamDialog() {
    const pt = Project.getData('playtest', () => ({ team: [{ sp: 6, lvl: 50 }] })), back = h('div', { class: 'modal-back' });
    const draw = () => {
      back.innerHTML = '';
      back.append(h('div', { class: 'panel modal' }, h('h3', {}, '🎒 ' + T('Test team')), h('p', { class: 'muted' }, T('"Play from here" gives the player these Pokémon (only in the test, not in the real game).')),
        ...pt.team.map((m, k) => h('div', { class: 'row' }, makeSelect(App.getLists().species, m.sp, v => { m.sp = v; Project.setData('playtest', pt); }), T('lv') + ' ',
          h('input', { type: 'number', value: m.lvl, min: 1, max: 100, style: { width: '56px' }, onchange: e => { m.lvl = +e.target.value; Project.setData('playtest', pt); } }),
          h('button', { class: 'mu-x', onclick: () => { pt.team.splice(k, 1); Project.setData('playtest', pt); draw(); } }, '✕'))),
        pt.team.length < 6 ? h('button', { onclick: () => { pt.team.push({ sp: 25, lvl: 20 }); Project.setData('playtest', pt); draw(); } }, T('+ Add a Pokémon')) : '',
        h('div', { class: 'row ask-btns' }, h('button', { class: 'primary', onclick: () => back.remove() }, T('Close')))));
    };
    draw(); document.body.append(back);
  }
  return { run, playFrom, playNow, supported, testRom, team, teamDialog, _mod: () => mod };
})();
