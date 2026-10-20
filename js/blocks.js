// Block editor ("Scratch style"): a script is a list of coloured blocks - say, ask (with YES / NO branches),
// give, battle, move, face, emote, wait, if… - edited as cards, compiled by js/script.js. Includes a map picker
// (choose a tile / person on a map) and a preview that walks the people across the map.
'use strict';

const Blocks = (() => {
  const L = () => App.getLists();
  const CATS = {
    talk: ['#3b82f6', 'Talk'], give: ['#16a34a', 'Give & take'], battle: ['#dc2626', 'Battle'], move: ['#f59e0b', 'Movement'], logic: ['#8b5cf6', 'Story & conditions'], fx: ['#0ea5e9', 'Effects'],
  };
  // op: [category, icon, label, default block]
  const DEFS = {
    say: ['talk', '💬', 'Say', { text: '' }],
    ask: ['talk', '❓', 'Ask yes / no', { text: '', yes: [], no: [] }],
    give_item: ['give', '🎁', 'Give an item', { item: 13, qty: 1 }],
    take_item: ['give', '➖', 'Take an item', { item: 13, qty: 1 }],
    give_mon: ['give', '🐾', 'Give a Pokémon', { sp: 25, lvl: 5, text: '' }],
    heal: ['give', '❤', 'Heal the Pokémon', {}],
    shop: ['give', '🛒', 'Open a shop', { items: [13, 4] }],
    battle_wild: ['battle', '🌿', 'Battle a wild Pokémon', { sp: 25, lvl: 5 }],
    battle_trainer: ['battle', '⚔', 'Battle a trainer', { trainer: 0, intro: '', defeat: '' }],
    move: ['move', '🚶', 'Walk', { who: 'player', steps: [], speed: 'normal' }],
    face: ['move', '↻', 'Turn', { who: 'player', dir: 'down' }],
    face_player: ['move', '🙂', 'Look at the player', {}],
    emote: ['move', '❗', 'Emote', { who: 'self', kind: '!' }],
    wait: ['move', '⏱', 'Wait', { seconds: 1 }],
    hide: ['move', '👻', 'Disappear', { who: 'self' }],
    show: ['move', '✨', 'Appear', { who: 'self' }],
    if_flag: ['logic', '🚩', 'If flag', { flag: 0x3A0, then: [], else: [] }],
    if_item: ['logic', '🎒', 'If the player has', { item: 13, then: [], else: [] }],
    set_flag: ['logic', '🚩', 'Set flag', { flag: 0x3A0 }],
    clear_flag: ['logic', '🏳', 'Clear flag', { flag: 0x3A0 }],
    music: ['fx', '🎵', 'Play music', { song: 0 }],
    sound: ['fx', '🔔', 'Play a sound', { se: 1 }],
    fade: ['fx', '🌑', 'Fade the screen', { out: true }],
    warp: ['fx', '🚪', 'Warp to a map', { g: 3, n: 0, warp: 0 }],
  };
  const DIR_ICON = { up: '↑', down: '↓', left: '←', right: '→' };
  const clone = o => JSON.parse(JSON.stringify(o));

  // who can act: the player, the person running the script, people on the map
  function whoOptions(ctx) {
    const out = [['player', T('the player')]];
    if (ctx.kind === 'object') out.push(['self', T('this person')]);
    if (ctx.g != null) {
      try { const m = MapsTab.api.loadMap(ctx.g, ctx.n); for (const e of m.events.obj) out.push([String(App.rom.u8[e.off]), '#' + App.rom.u8[e.off] + ' ' + Objects.tooltip(ctx.g, ctx.n, e).slice(0, 40)]); } catch (e) { /* no map */ }
    }
    return out;
  }
  const sel = (opts, v, on) => h('select', { onchange: e => on(e.target.value) }, ...opts.map(([k, l]) => h('option', { value: k, selected: String(k) === String(v) }, l)));
  const num = (v, on, w = 60, min, max) => h('input', { type: 'number', value: v, min, max, style: { width: w + 'px' }, onchange: e => on(+e.target.value) });
  const ta = (v, on, ph) => { const t = h('textarea', { rows: 2, dir: 'auto', placeholder: ph || T('what they say…'), oninput: e => on(e.target.value, false), onchange: e => on(e.target.value, true) }); t.value = v || ''; return t; };

  // ---------- editor ----------
  // blocks: array (edited in place); ctx: { kind, g, n, onChange }
  function editor(blocks, ctx) {
    const root = h('div', { class: 'bl-editor' });
    const changed = (rerender = true) => { if (ctx.onChange) ctx.onChange(blocks); if (rerender) draw(); };
    const draw = () => { root.innerHTML = ''; root.append(list(blocks, ctx, changed)); };
    draw();
    return root;
  }
  function list(arr, ctx, changed, label) {
    const box = h('div', { class: 'bl-list' });
    if (label) box.append(h('div', { class: 'bl-branch-label' }, label));
    arr.forEach((bl, i) => box.append(card(bl, i, arr, ctx, changed)));
    box.append(addButton(arr, ctx, changed));
    return box;
  }
  function addButton(arr, ctx, changed) {
    const b = h('button', { class: 'bl-add', onclick: () => palette(b, op => { arr.push(Object.assign({ op }, clone(DEFS[op][3]))); changed(); }) }, '+ ' + T('Add a block'));
    return b;
  }
  function palette(anchor, pick) {
    const back = h('div', { class: 'bl-pal-back', onclick: e => { if (e.target === back) back.remove(); } });
    const pal = h('div', { class: 'panel bl-pal' });
    for (const [cat, [col, name]] of Object.entries(CATS)) {
      const items = Object.entries(DEFS).filter(([, d]) => d[0] === cat);
      pal.append(h('div', { class: 'bl-pal-cat', style: { color: col } }, T(name)),
        h('div', { class: 'bl-pal-row' }, ...items.map(([op, d]) => h('button', { class: 'bl-pal-item', style: { borderColor: col }, onclick: () => { back.remove(); pick(op); } }, d[1] + ' ' + T(d[2])))));
    }
    back.append(pal); document.body.append(back);
  }
  function card(bl, i, arr, ctx, changed) {
    const d = DEFS[bl.op] || ['logic', '?', bl.op, {}], col = CATS[d[0]][0];
    const set = (k, v, rer = true) => { bl[k] = v; changed(rer); };
    const body = h('div', { class: 'bl-body' });
    const who = () => sel(whoOptions(ctx), bl.who, v => set('who', v));
    switch (bl.op) {
      case 'say': body.append(ta(bl.text, (v, end) => set('text', v, false))); break;
      case 'ask': body.append(ta(bl.text, (v) => set('text', v, false), T('the question…')), list(bl.yes, ctx, changed, '✔ ' + T('If they answer YES')), list(bl.no, ctx, changed, '✘ ' + T('If they answer NO'))); break;
      case 'give_item': case 'take_item': body.append(Objects.itemPicker(bl.item, v => set('item', v)), ' × ', num(bl.qty, v => set('qty', Math.max(1, v)), 50, 1, 99)); break;
      case 'give_mon': body.append(makeSelect(L().species, bl.sp, v => set('sp', v)), ' ' + T('lv') + ' ', num(bl.lvl, v => set('lvl', v), 50, 1, 100), ta(bl.text, v => set('text', v, false), T('message (optional): "You received…"'))); break;
      case 'battle_wild': body.append(makeSelect(L().species, bl.sp, v => set('sp', v)), ' ' + T('lv') + ' ', num(bl.lvl, v => set('lvl', v), 50, 1, 100)); break;
      case 'battle_trainer': {
        const opts = [[0, T('— choose a trainer —')]]; for (let id = 1; id < 743; id++) { const t = Objects.trainer(id); if (t && t.team.length) opts.push([id, '#' + id + ' ' + (Objects.classNames()[t.cls] || '') + ' ' + t.name]); }
        body.append(sel(opts, bl.trainer, v => set('trainer', +v)), ta(bl.intro, v => set('intro', v, false), T('before the battle…')), ta(bl.defeat, v => set('defeat', v, false), T('when you beat them…')));
        break;
      }
      case 'move': {
        const path = h('span', { class: 'bl-path' }, (bl.steps || []).map(s => DIR_ICON[s]).join(' ') || T('(no steps yet)'));
        body.append(who(), ' ', ...Object.keys(DIR_ICON).map(dd => h('button', { class: 'bl-dir', title: T(dd), onclick: () => { bl.steps.push(dd); changed(); } }, DIR_ICON[dd])),
          h('button', { class: 'bl-dir', title: T('Remove the last step'), onclick: () => { bl.steps.pop(); changed(); } }, '⌫'), ' ', path, ' ',
          sel([['normal', T('walk')], ['fast', T('run')], ['slow', T('slowly')]], bl.speed, v => set('speed', v)));
        break;
      }
      case 'face': body.append(who(), ' ', sel(Object.keys(DIR_ICON).map(k => [k, DIR_ICON[k] + ' ' + T(k)]), bl.dir, v => set('dir', v))); break;
      case 'emote': body.append(who(), ' ', sel([['!', '❗ ' + T('surprised')], ['?', '❓ ' + T('confused')], ['♥', '♥ ' + T('happy')]], bl.kind, v => set('kind', v))); break;
      case 'wait': body.append(num(bl.seconds, v => set('seconds', Math.max(0.1, v)), 60, 0.1, 30), ' ' + T('seconds')); break;
      case 'hide': case 'show': body.append(who()); break;
      case 'if_flag': body.append(T('flag') + ' ', h('input', { value: '0x' + (bl.flag || 0).toString(16).toUpperCase(), style: { width: '70px' }, onchange: e => set('flag', parseNum(e.target.value) || 0) }), ' ',
        sel([['', T('is set')], ['1', T('is not set')]], bl.not ? '1' : '', v => set('not', !!v)), list(bl.then, ctx, changed, T('Then')), list(bl.else, ctx, changed, T('Otherwise'))); break;
      case 'if_item': body.append(Objects.itemPicker(bl.item, v => set('item', v)), list(bl.then, ctx, changed, T('Then')), list(bl.else, ctx, changed, T('Otherwise'))); break;
      case 'set_flag': case 'clear_flag': body.append(T('flag') + ' ', h('input', { value: '0x' + (bl.flag || 0).toString(16).toUpperCase(), style: { width: '70px' }, onchange: e => set('flag', parseNum(e.target.value) || 0) })); break;
      case 'music': body.append(T('song #') + ' ', num(bl.song, v => set('song', v), 70, 0, 400), h('small', { class: 'muted' }, ' ' + T('0 = back to the map music'))); break;
      case 'sound': body.append(T('sound #') + ' ', num(bl.se, v => set('se', v), 70, 0, 300)); break;
      case 'fade': body.append(sel([['1', T('to black')], ['', T('back from black')]], bl.out ? '1' : '', v => set('out', !!v))); break;
      case 'warp': {
        const maps = []; App.game.mapGroups.forEach((ms, g) => ms.forEach((_, n) => maps.push([g + '.' + n, g + '.' + n + ' ' + Game.mapName(App.rom, App.game, App.rom.u8[App.game.mapGroups[g][n] + 20])])));
        body.append(sel(maps, bl.g + '.' + bl.n, v => { const [g, n] = v.split('.').map(Number); bl.g = g; bl.n = n; changed(); }), ' ' + T('door #') + ' ', num(bl.warp, v => set('warp', v), 50, 0, 50));
        break;
      }
      case 'shop': body.append(...bl.items.map((it, k) => h('span', { class: 'bl-chip' }, Objects.itemPicker(it, v => { if (v) bl.items[k] = v; else bl.items.splice(k, 1); changed(); }))),
        h('button', { class: 'bl-dir', onclick: () => { bl.items.push(13); changed(); } }, '+')); break;
      default: break;
    }
    const tools = h('span', { class: 'bl-tools' },
      i > 0 ? h('button', { title: T('Move up'), onclick: () => { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); changed(); } }, '↑') : '',
      i < arr.length - 1 ? h('button', { title: T('Move down'), onclick: () => { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); changed(); } }, '↓') : '',
      h('button', { title: T('Duplicate'), onclick: () => { arr.splice(i + 1, 0, clone(bl)); changed(); } }, '⧉'),
      h('button', { title: T('Delete'), onclick: () => { arr.splice(i, 1); changed(); } }, '✕'));
    const el = h('div', { class: 'bl-card', style: { borderInlineStartColor: col }, draggable: 'true' }, h('div', { class: 'bl-head', style: { color: col } }, d[1] + ' ' + T(d[2]), tools), body);
    // drag & drop inside the same list
    el.ondragstart = e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', 'bl'); Blocks._drag = { arr, i }; el.classList.add('dragging'); };
    el.ondragend = () => el.classList.remove('dragging');
    el.ondragover = e => { if (Blocks._drag && Blocks._drag.arr === arr) { e.preventDefault(); e.stopPropagation(); } };
    el.ondrop = e => { const dg = Blocks._drag; if (!dg || dg.arr !== arr) return; e.preventDefault(); e.stopPropagation(); const [x] = arr.splice(dg.i, 1); arr.splice(i, 0, x); Blocks._drag = null; changed(); };
    if (['say', 'ask', 'give_mon', 'battle_trainer'].includes(bl.op)) el.querySelectorAll('textarea').forEach(t => { t.draggable = false; t.ondragstart = e => e.stopPropagation(); });
    return el;
  }

  // ---------- map picker: click a tile (and maybe a person) ----------
  function pickOnMap(g, n, opts = {}) {
    return new Promise(res => {
      const m = MapsTab.api.loadMap(g, n), z = 2, cv = h('canvas', { width: m.w * 16, height: m.h * 16, class: 'pixel bl-mapcv' });
      cv.style.width = m.w * 16 * z + 'px';
      const ctx = cv.getContext('2d');
      const draw = (hx, hy) => {
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) ctx.drawImage(MapsTab.api.metatileCanvas(m, App.rom.r16(m.blocks + (y * m.w + x) * 2) & 0x3FF), x * 16, y * 16);
        for (const e of Object.values(m.events).flat()) { const [x, y] = MapsTab.api.evXY(e); Objects.draw(ctx, e, x * 16, y * 16, 16); }
        if (opts.mark) { ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(opts.mark.x * 16 + 1, opts.mark.y * 16 + 1, 14, 14); }
        if (hx != null) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(hx * 16 + 1, hy * 16 + 1, 14, 14); }
      };
      draw();
      const cell = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / (16 * z)), Math.floor((e.clientY - r.top) / (16 * z))]; };
      const objAt = (x, y) => m.events.obj.find(e => { const [ex, ey] = MapsTab.api.evXY(e); return ex === x && ey === y; });
      const status = h('div', { class: 'muted' }, opts.person ? T('Click a person on the map.') : T('Click a spot on the map.'));
      cv.onmousemove = e => { const [x, y] = cell(e); draw(x, y); const o = objAt(x, y); status.textContent = '(' + x + ', ' + y + ')' + (o ? ' · ' + Objects.tooltip(g, n, o) : ''); };
      cv.onclick = e => { const [x, y] = cell(e), o = objAt(x, y); if (opts.person && !o) { toast(T('There is no person there'), 'err'); return; } back.remove(); res({ x, y, obj: o ? { localId: App.rom.u8[o.off], i: o.i } : null }); };
      const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) { back.remove(); res(null); } } },
        h('div', { class: 'panel modal bl-pick' }, h('div', { class: 'row' }, h('h3', {}, m.name + ' ' + g + '.' + n), h('button', { onclick: () => { back.remove(); res(null); } }, '✕')), status, h('div', { class: 'bl-mapscroll' }, cv)));
      document.body.append(back);
    });
  }

  // ---------- preview: people walk on the map ----------
  function preview(blocks, ctx) {
    const m = MapsTab.api.loadMap(ctx.g, ctx.n), cv = h('canvas', { width: m.w * 16, height: m.h * 16, class: 'pixel bl-mapcv' });
    cv.style.width = Math.min(m.w * 32, 720) + 'px';
    const c2 = cv.getContext('2d'), bg = h('canvas', { width: m.w * 16, height: m.h * 16 }), bctx = bg.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) bctx.drawImage(MapsTab.api.metatileCanvas(m, App.rom.r16(m.blocks + (y * m.w + x) * 2) & 0x3FF), x * 16, y * 16);
    // actors: people on the map + the player
    const actors = new Map();
    for (const e of m.events.obj) { const [x, y] = MapsTab.api.evXY(e); actors.set(String(App.rom.u8[e.off]), { gfx: App.rom.u8[e.off + 1], x, y, dir: 'down', vis: true }); }
    const start = ctx.start || { x: Math.floor(m.w / 2), y: Math.floor(m.h / 2) };
    actors.set('player', { gfx: 0, x: start.x, y: start.y, dir: 'up', vis: true });
    if (ctx.selfId != null) actors.set('self', actors.get(String(ctx.selfId)) || { gfx: 18, x: start.x, y: start.y - 1, dir: 'down', vis: true });
    const bubble = { text: '', t: 0 };
    const drawAll = () => {
      c2.drawImage(bg, 0, 0);
      for (const a of [...actors.values()].filter(a => a.vis).sort((p, q) => p.y - q.y)) { const s = Objects.sprite(a.gfx, a.dir); if (s) c2.drawImage(s, Math.round(a.x * 16 + 8 - s.width / 2), Math.round(a.y * 16 + 16 - s.height)); if (a.emote) { c2.font = '14px sans-serif'; c2.fillText(a.emote, a.x * 16 + 4, a.y * 16 - 10); } }
      if (bubble.text) { c2.fillStyle = 'rgba(255,255,255,.95)'; c2.fillRect(4, cv.height - 30, cv.width - 8, 26); c2.fillStyle = '#000'; c2.font = '11px sans-serif'; c2.textAlign = 'right'; c2.direction = 'rtl'; c2.fillText(bubble.text.slice(0, 70), cv.width - 10, cv.height - 13); c2.textAlign = 'left'; c2.direction = 'ltr'; }
    };
    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let running = false;
    async function run(list) {
      for (const bl of list) {
        if (!running) return;
        const a = actors.get(bl.who === 'self' ? 'self' : bl.who == null ? 'player' : String(bl.who));
        if (bl.op === 'move' && a) for (const s of bl.steps || []) { a.dir = s; const [dx, dy] = D[s], frames = bl.speed === 'fast' ? 8 : bl.speed === 'slow' ? 24 : 16; for (let f = 1; f <= frames; f++) { a.x += dx / frames; a.y += dy / frames; drawAll(); await sleep(16); } a.x = Math.round(a.x); a.y = Math.round(a.y); }
        else if (bl.op === 'face' && a) { a.dir = bl.dir; drawAll(); await sleep(200); }
        else if (bl.op === 'emote' && a) { a.emote = bl.kind === '♥' ? '♥' : bl.kind; drawAll(); await sleep(700); a.emote = null; }
        else if (bl.op === 'hide' && a) { a.vis = false; drawAll(); }
        else if (bl.op === 'show' && a) { a.vis = true; drawAll(); }
        else if (bl.op === 'wait') await sleep((bl.seconds || 1) * 1000);
        else if (bl.op === 'say' || bl.op === 'ask') { bubble.text = (bl.text || '').replace(/\n/g, ' '); drawAll(); await sleep(1400); bubble.text = ''; drawAll(); if (bl.op === 'ask') await run(bl.yes || []); }
        else if (bl.op === 'if_flag' || bl.op === 'if_item') await run(bl.then || []);
      }
    }
    drawAll();
    const btn = h('button', { class: 'primary', onclick: async () => { if (running) { running = false; return; } running = true; btn.textContent = '■ ' + T('Stop'); await run(blocks); running = false; btn.textContent = '▶ ' + T('Play the preview'); } }, '▶ ' + T('Play the preview'));
    return h('div', { class: 'bl-preview' }, h('div', { class: 'row' }, btn, h('span', { class: 'muted' }, T('A rough preview in the editor; the real thing plays in the game.'))), h('div', { class: 'bl-mapscroll' }, cv));
  }

  // ---------- simple start: the lines an existing script says, as "say" blocks ----------
  function fromScript(sp) {
    const out = [];
    const walk = nodes => { for (const x of nodes) { if (x.t === 'text') out.push({ op: 'say', text: Charmap.decodeEditable(App.rom.u8, x.p, App.settings.rtl).text.replace(/\\[pl]/g, '\n').replace(/\\n/g, ' ') }); else if (x.kids && !out.length) walk(x.kids); } };
    try { walk(Objects.analyze(sp)); } catch (e) { /* unreadable */ }
    return out;
  }
  return { editor, pickOnMap, preview, fromScript, DEFS };
})();
