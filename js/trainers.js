// Trainers tab: every trainer of the game - picture, class, name, team (species, level, held item, moves, strength),
// battle items, how smart they are, where they battle and what they say - plus the difficulty curve of the whole
// game (each trainer's strongest Pokémon along the story, with the gym leaders as milestones).
'use strict';

const TrainersTab = (() => {
  const R = () => App.rom, G = () => App.game, O = () => App.game.offsets, L = () => App.getLists();
  const PICS = 0x2395EC, PALS = 0x239A8C, PIC_COUNT = 148, COUNT = 743;    // FireRed 1.1
  const LEADER = 0x54, ELITE = 0x57, CHAMPION = 0x5A, RIVALS = [0x51, 0x59];
  const MUSIC = ['Male', 'Female', 'Girl', 'Suspicious', 'Intense', 'Cool', 'Team Rocket', 'Swimmer', 'Twins', 'Elite Four', 'Hiker', 'Interviewer', 'Rich'];
  const AI_BITS = ['Avoids useless moves', 'Goes for the knock-out', 'Picks good moves', 'Sets up on the first turn', 'Takes risks', 'Prefers its strongest move', 'Uses Baton Pass', 'Double battle tactics', 'Watches its HP'];
  const AI_PRESETS = [[0, 'Simple (random moves)'], [1, 'Normal'], [7, 'Smart'], [0x10F, 'Expert']];
  // story order of FireRed's map sections, for the difficulty curve
  const PROG = [0x65, 0x59, 0x7A, 0x66, 0x7E, 0x5A, 0x67, 0x7F, 0x63, 0x68, 0x5B, 0x7C, 0x7D, 0x69, 0x6A, 0x5D, 0x80, 0x6F, 0x83, 0x6D, 0x64, 0x6E, 0x8A, 0x5C, 0x6C, 0x6B,
    0x5E, 0x85, 0x8C, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x5F, 0x88, 0x62, 0x86, 0x77, 0x78, 0x8B, 0x60, 0x87, 0x79, 0x8F, 0x96, 0xAF, 0x90, 0x98, 0x91, 0x99, 0xB0,
    0x7B, 0x84, 0x61, 0x89, 0x92, 0xB1, 0x93, 0xA1, 0xA2, 0xB2, 0x95, 0xA4, 0xA5, 0xA6, 0xA9, 0xAA, 0x94, 0xA7, 0xB3, 0x8D];
  let sel = 0, filter = 'map', query = '', root = null;

  // ---------- data ----------
  const base = id => O().trainers + id * 40;
  function info(id) {
    const r = R(), b = base(id), flags = r.u8[b], size = flags & 1 ? 16 : 8, pp = r.ptr(b + 36), n = Math.min(6, r.u8[b + 32]);
    const team = [];
    for (let i = 0; i < n && pp >= 0; i++) {
      const e = pp + i * size;
      team.push({ iv: r.r16(e), lvl: r.r16(e + 2), sp: r.r16(e + 4), item: flags & 2 ? r.r16(e + 6) : 0, moves: flags & 1 ? [0, 1, 2, 3].map(k => r.r16(e + (flags & 2 ? 8 : 6) + k * 2)) : null });
    }
    // FireRed layouts: flags 0 {iv lvl sp pad} · 1 {iv lvl sp moves[4] pad} · 2 {iv lvl sp item} · 3 {iv lvl sp item moves[4]}
    return { id, b, flags, cls: r.u8[b + 1], music: r.u8[b + 2] & 0x7F, female: !!(r.u8[b + 2] & 0x80), pic: r.u8[b + 3], name: Charmap.decode(r.u8, b + 4, 12).text,
      items: [0, 1, 2, 3].map(k => r.r16(b + 16 + k * 2)), double: !!r.r32(b + 24), ai: r.r32(b + 28), team, max: team.reduce((a, m) => Math.max(a, m.lvl), 0) };
  }
  function writeTeam(id, team, flags) {
    const r = R(), b = base(id), size = flags & 1 ? 16 : 8, arr = new Uint8Array(team.length * size), dv = new DataView(arr.buffer);
    team.forEach((m, i) => {
      const o = i * size;
      dv.setUint16(o, m.iv & 0xFFFF, true); dv.setUint16(o + 2, m.lvl, true); dv.setUint16(o + 4, m.sp, true);
      if (flags & 2) dv.setUint16(o + 6, m.item || 0, true);
      if (flags & 1) { const mv = m.moves || movesAt(m.sp, m.lvl); mv.forEach((v, k) => dv.setUint16(o + (flags & 2 ? 8 : 6) + k * 2, v, true)); }
    });
    const old = info(id), oldSize = old.flags & 1 ? 16 : 8, pp = r.ptr(b + 36);
    if (pp >= 0 && arr.length <= old.team.length * oldSize) r.write(pp, arr); else r.wptr(b + 36, r.writeNew(arr));
    r.w8(b, flags); r.w8(b + 32, team.length);
  }
  // the 4 last level-up moves at that level (what the game gives when the team has no moves of its own)
  function movesAt(sp, lvl) {
    const r = R(), p = r.ptr(O().learnsets + sp * 4), out = [];
    for (let i = 0; p >= 0 && i < 64; i++) { const v = r.r16(p + i * 2); if (v === 0xFFFF) break; if ((v >> 9) <= lvl) { const mv = v & 0x1FF; if (!out.includes(mv)) out.push(mv); } }
    const last = out.slice(-4); while (last.length < 4) last.push(0); return last;
  }
  let picCache = new Map(), picVer = -1;
  function picCanvas(pic) {
    if (picVer !== App.romVersion) { picCache.clear(); picVer = App.romVersion; }
    if (picCache.has(pic)) return picCache.get(pic);
    const r = R(), gp = r.ptr(PICS + pic * 8), pp = r.ptr(PALS + pic * 8);
    let cv = null;
    try {
      const g = LZ.decompress(r.u8, gp), p = LZ.decompress(r.u8, pp);
      if (g && p) { cv = h('canvas', { width: 64, height: 64, class: 'pixel' }); cv.getContext('2d').putImageData(Gfx.toImageData(Gfx.tilesToPixels(g.data, 64, 64), 64, 64, Gfx.readPal(p.data, 0), true), 0, 0); }
    } catch (e) { cv = null; }
    picCache.set(pic, cv); return cv;
  }
  const big = (cv, s = 2) => { if (!cv) return h('span'); const c = h('canvas', { width: cv.width, height: cv.height, class: 'pixel' }); c.getContext('2d').drawImage(cv, 0, 0); c.style.width = cv.width * s + 'px'; return c; };
  const where = id => (Objects.usage().trainerAt.get(id) || []);
  const mapLabel = (g, n) => Game.mapName(R(), G(), R().u8[G().mapGroups[g][n] + 20]) + ' ' + g + '.' + n;
  const group = t => t.cls === LEADER ? 'leader' : t.cls === ELITE || t.cls === CHAMPION ? 'elite' : RIVALS.includes(t.cls) ? 'rival' : 'other';

  // ---------- difficulty curve ----------
  function curve() {
    const r = R(), pts = [], leaders = [];
    const progOf = (g, n) => { const i = PROG.indexOf(r.u8[G().mapGroups[g][n] + 20]); return i < 0 ? -1 : i; };
    for (let id = 1; id < COUNT; id++) {
      const at = where(id); if (!at.length) continue;
      const xs = at.map(a => progOf(a.g, a.n)).filter(x => x >= 0); if (!xs.length) continue;
      const t = info(id); if (!t.team.length) continue;
      const p = { id, x: Math.min(...xs), y: t.max, kind: group(t), name: t.name, maps: at.map(a => a.g + '.' + a.n) };
      pts.push(p); if (p.kind === 'leader') leaders.push(p);
    }
    // badges come in level order: a leader whose gym is early on the map but who is fought late (Giovanni in
    // Viridian) moves to just after the leader before them
    leaders.sort((a, b) => a.y - b.y);
    for (let i = 1; i < leaders.length; i++) if (leaders[i].x <= leaders[i - 1].x) leaders[i].x = leaders[i - 1].x + 1;
    leaders.sort((a, b) => a.x - b.x);
    // gym trainers stand where their leader is in the story
    for (const l of leaders) for (const p of pts) if (p.kind !== 'leader' && p.maps.some(m => l.maps.includes(m))) p.x = l.x;
    // expected level: from 5 at the start to each leader in turn, then +6 for the league
    const anchors = [{ x: 0, y: 5 }].concat(leaders.map(l => ({ x: l.x, y: l.y })));
    const expect = x => { for (let i = 1; i < anchors.length; i++) if (x <= anchors[i].x) { const a = anchors[i - 1], b = anchors[i]; return a.y + (b.y - a.y) * (x - a.x) / Math.max(1, b.x - a.x); } const l = anchors[anchors.length - 1]; return l.y + Math.min(15, (x - l.x) * 0.5); };
    // a trainer stands out when it is stronger than the next gym leader, or much weaker than the last one you beat
    for (const p of pts) {
      const prev = [...leaders].reverse().find(l => l.x < p.x), next = leaders.find(l => l.x >= p.x);
      const lo = Math.round((prev ? prev.y : 5) * 0.6) - 2, hi = next ? next.y + 3 : (prev ? prev.y : 5) + 15;
      p.exp = Math.round(expect(p.x)); p.lo = lo; p.hi = hi;
      p.off = p.kind === 'other' && (p.y > hi || p.y < lo);
    }
    return { pts, leaders, expect };
  }
  function drawCurve(cv, data, hover) {
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d'), pad = 28, maxY = Math.max(70, ...data.pts.map(p => p.y)) + 5, maxX = PROG.length;
    const X = x => pad + (W - pad - 8) * x / maxX, Y = y => H - pad - (H - pad - 8) * y / maxY;
    const css = getComputedStyle(document.body);
    ctx.clearRect(0, 0, W, H); ctx.font = '10px sans-serif'; ctx.fillStyle = css.getPropertyValue('--muted') || '#888';
    ctx.strokeStyle = 'rgba(128,128,128,.25)';
    for (let y = 0; y <= maxY; y += 10) { ctx.beginPath(); ctx.moveTo(pad, Y(y)); ctx.lineTo(W - 8, Y(y)); ctx.stroke(); ctx.fillText(String(y), 4, Y(y) + 3); }
    ctx.fillText(T('story →'), W - 60, H - 8);
    ctx.strokeStyle = 'rgba(80,160,255,.8)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x <= maxX; x++) { const y = data.expect(x); x ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); } ctx.stroke(); ctx.lineWidth = 1;
    const col = { leader: '#f2b705', elite: '#9b59b6', rival: '#3b82f6', other: '#9aa1b1' };
    for (const p of data.pts) {
      const s = p.kind === 'other' ? 3 : 5;
      ctx.fillStyle = p.off ? '#e03131' : col[p.kind]; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), s, 0, 7); ctx.fill();
      if (p.id === sel || p === hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), s + 3, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
    }
    return { X, Y };
  }
  function curvePanel() {
    const data = curve(), cv = h('canvas', { width: 520, height: 240, class: 'tr-curve' });
    let geo = drawCurve(cv, data);
    const near = e => { const rc = cv.getBoundingClientRect(), sx = (e.clientX - rc.left) * cv.width / rc.width, sy = (e.clientY - rc.top) * cv.height / rc.height; let best = null, bd = 64; for (const p of data.pts) { const d = (geo.X(p.x) - sx) ** 2 + (geo.Y(p.y) - sy) ** 2; if (d < bd) { bd = d; best = p; } } return best; };
    cv.onmousemove = e => { const p = near(e); cv.title = p ? p.name + ' · ' + T('level') + ' ' + p.y + (p.off ? ' · ' + Tf('expected about {n}', { n: p.exp }) : '') : ''; geo = drawCurve(cv, data, p); };
    cv.onclick = e => { const p = near(e); if (p) { sel = p.id; render(root); } };
    const off = data.pts.filter(p => p.off);
    const pct = h('input', { type: 'number', value: 10, min: -50, max: 100, style: { width: '60px' } });
    return h('div', { class: 'panel tr-curvep' }, h('h3', {}, '📈 ' + T('Difficulty along the story')),
      h('p', { class: 'muted' }, T('Each dot is a trainer (their strongest Pokémon), from the start of the game to the end. Gold = gym leaders, purple = Elite Four, blue = rival, red = much stronger or weaker than the blue line around it. Click a dot to open the trainer.')),
      cv,
      off.length ? h('div', { class: 'row wrap' }, h('span', { class: 'warn' }, Tf('{n} trainers stand out', { n: off.length })),
        h('button', { onclick: async () => { if (!(await ask(Tf('Move the levels of {n} trainers closer to the blue line?', { n: off.length })))) return; for (const p of off) scaleTo(p.id, Math.max(p.lo, Math.min(p.hi, p.exp))); toast(T('Levels adjusted')); render(root); } }, T('Fit them to the curve'))) : h('div', { class: 'ok' }, '✓ ' + T('No trainer stands out')),
      h('div', { class: 'row wrap', style: { marginTop: '6px' } }, T('All trainers on the maps'), ' ', pct, ' %',
        h('button', { onclick: async () => { const f = 1 + (+pct.value) / 100; if (!(await ask(Tf('Change the level of every trainer on the maps by {p}%?', { p: pct.value })))) return;
          for (const p of data.pts) { const t = info(p.id); writeTeam(p.id, t.team.map(m => Object.assign(m, { lvl: Math.max(2, Math.min(100, Math.round(m.lvl * f))) })), t.flags); }
          toast(T('Levels changed')); render(root); } }, T('Apply'))));
  }
  function scaleTo(id, target) {
    const t = info(id); if (!t.max) return;
    const f = target / t.max; writeTeam(id, t.team.map(m => Object.assign(m, { lvl: Math.max(2, Math.min(100, Math.round(m.lvl * f))) })), t.flags);
  }

  // ---------- UI ----------
  function render(el) {
    root = el; el.innerHTML = '';
    if (O().trainers < 0) { el.append(h('div', { class: 'panel err' }, T('The trainer table was not found in this ROM.'))); return; }
    const classes = Objects.classNames();
    const all = []; for (let id = 1; id < COUNT; id++) all.push(id);
    const listEl = h('div', { class: 'tr-list' });
    const fill = () => {
      listEl.innerHTML = '';
      const q = query.trim().toLowerCase();
      for (const id of all) {
        const t = info(id), at = where(id), gk = group(t);
        if (filter === 'map' && !at.length) continue;
        if (filter === 'leader' && gk !== 'leader' && gk !== 'elite') continue;
        if (filter === 'rival' && gk !== 'rival') continue;
        if (filter === 'unused' && (at.length || gk !== 'other')) continue;
        const label = (classes[t.cls] || '') + ' ' + t.name;
        if (q && !label.toLowerCase().includes(q) && String(id) !== q) continue;
        listEl.append(h('button', { class: 'tr-item' + (id === sel ? ' sel' : ''), onclick: () => { sel = id; render(root); } },
          h('span', { class: 'tr-id' }, '#' + id), h('span', { class: 'tr-name', dir: 'auto' }, label), h('span', { class: 'muted' }, t.team.length ? T('lv') + ' ' + t.max : '—')));
      }
      if (!listEl.children.length) listEl.append(h('p', { class: 'muted' }, T('No trainers here.')));
    };
    fill();
    const left = h('div', { class: 'panel tr-left' },
      h('div', { class: 'tabs small' }, ...[['map', 'On the maps'], ['leader', 'Leaders & Elite Four'], ['rival', 'Rival'], ['all', 'All'], ['unused', 'Free slots']].map(([k, l]) =>
        h('button', { class: filter === k ? 'sel' : '', onclick: () => { filter = k; fill(); render(root); } }, l))),
      h('input', { type: 'search', placeholder: 'Search name, class or #…', value: query, oninput: e => { query = e.target.value; fill(); } }), listEl);
    if (!sel) { const first = all.find(id => where(id).length); sel = first || 1; }
    el.append(h('div', { class: 'cols tr-cols' }, left, card(sel, classes), curvePanel()));
  }

  function card(id, classes) {
    const r = R(), t = info(id), b = t.b, rer = () => render(root);
    const set8 = (off, v) => { r.w8(off, v); rer(); };
    const team = t.team.map(m => Object.assign({}, m));
    const save = () => { writeTeam(id, team, t.flags); rer(); };
    const picSel = h('select', { onchange: e => set8(b + 3, +e.target.value) }, ...Array.from({ length: PIC_COUNT }, (_, i) => h('option', { value: i, selected: i === t.pic }, T('Picture') + ' ' + i)));
    const nameIn = h('input', { value: t.name, dir: 'auto', style: { width: '130px' }, onchange: e => { try { Objects.setTrainerName(id, e.target.value); rer(); } catch (x) { toast(x.message, 'err'); } } });
    const head = h('div', { class: 'tr-head' }, h('div', { class: 'tr-pic' }, big(picCanvas(t.pic), 2), picSel),
      h('div', { class: 'tr-fields' },
        h('div', { class: 'card-chip' }, '🧢 ' + T('Trainer') + ' · #' + id),
        h('div', { class: 'tr-title', dir: 'auto' }, (classes[t.cls] || '') + ' ' + t.name),
        h('label', { class: 'field' }, T('Name'), nameIn),
        h('label', { class: 'field' }, T('Class'), makeSelect(classes, t.cls, v => { Objects.setClass(id, v); rer(); })),
        h('label', { class: 'field' }, T('Music when they see you'), makeSelect(MUSIC, t.music, v => set8(b + 2, (r.u8[b + 2] & 0x80) | v))),
        h('label', {}, h('input', { type: 'checkbox', checked: t.female, onchange: e => set8(b + 2, (r.u8[b + 2] & 0x7F) | (e.target.checked ? 0x80 : 0)) }), ' ' + T('Female trainer (pink name in battle)')),
        h('label', {}, h('input', { type: 'checkbox', checked: t.double, onchange: e => { r.w32(b + 24, e.target.checked ? 1 : 0); rer(); } }), ' ' + T('Double battle (2 against 2)'))));
    // team
    const rows = team.map((m, i) => {
      const ic = h('span', { class: 'tr-ic' }); try { ic.append(PokemonTab.iconCanvas(m.sp, 32)); } catch (e) { /* no icon */ }
      const row = h('div', { class: 'tr-mon' }, ic,
        makeSelect(L().species, m.sp, v => { m.sp = v; if (m.moves) m.moves = movesAt(v, m.lvl); save(); }),
        h('label', {}, T('lv') + ' ', h('input', { type: 'number', value: m.lvl, min: 1, max: 100, style: { width: '52px' }, onchange: e => { m.lvl = Math.max(1, Math.min(100, +e.target.value)); save(); } })),
        h('label', { title: T('0 = weakest, 255 = strongest (all its hidden strengths)') }, T('Strength') + ' ', h('input', { type: 'range', min: 0, max: 255, value: m.iv, style: { width: '70px' }, onchange: e => { m.iv = +e.target.value; save(); } })),
        t.flags & 2 ? h('label', {}, '🎒 ', Objects.itemPicker(m.item, v => { m.item = v; save(); })) : '',
        h('span', { class: 'tr-btns' },
          i > 0 ? h('button', { class: 'mu-x', title: T('Move up'), onclick: () => { team.splice(i - 1, 0, team.splice(i, 1)[0]); save(); } }, '↑') : '',
          team.length > 1 ? h('button', { class: 'mu-x', title: T('Remove'), onclick: () => { team.splice(i, 1); save(); } }, '✕') : ''));
      const moves = m.moves ? h('div', { class: 'tr-moves' }, ...m.moves.map((mv, k) => makeSelect(L().moves, mv, v => { m.moves[k] = v; save(); }))) : '';
      return h('div', { class: 'tr-monwrap' }, row, moves);
    });
    const flagsBox = h('div', { class: 'row wrap' },
      h('label', {}, h('input', { type: 'checkbox', checked: !!(t.flags & 2), onchange: e => { writeTeam(id, team, (t.flags & ~2) | (e.target.checked ? 2 : 0)); rer(); } }), ' ' + T('Pokémon hold items')),
      h('label', {}, h('input', { type: 'checkbox', checked: !!(t.flags & 1), onchange: e => { team.forEach(m => { m.moves = e.target.checked ? movesAt(m.sp, m.lvl) : null; }); writeTeam(id, team, (t.flags & ~1) | (e.target.checked ? 1 : 0)); rer(); } }), ' ' + T('Choose their moves (otherwise: the moves they would know at that level)')));
    const teamSec = h('div', { class: 'tr-sec' }, h('h4', {}, T('Team')), flagsBox, ...rows,
      team.length < 6 ? h('button', { onclick: () => { const last = team[team.length - 1] || { sp: 16, lvl: 5, iv: 0, item: 0 }; team.push({ sp: last.sp, lvl: last.lvl, iv: last.iv, item: 0, moves: t.flags & 1 ? movesAt(last.sp, last.lvl) : null }); save(); } }, T('+ Add a Pokémon')) : '');
    // battle items + AI
    const items = h('div', { class: 'row wrap' }, ...t.items.map((it, k) => Objects.itemPicker(it, v => { r.w16(b + 16 + k * 2, v); rer(); })));
    const aiPreset = AI_PRESETS.find(p => p[0] === t.ai);
    const ai = h('div', {},
      h('select', { onchange: e => { if (e.target.value !== 'x') { r.w32(b + 28, +e.target.value); rer(); } } }, ...AI_PRESETS.map(([v, l]) => h('option', { value: v, selected: aiPreset && aiPreset[0] === v }, T(l))), aiPreset ? '' : h('option', { value: 'x', selected: true }, T('Custom'))),
      h('details', { class: 'hdr' }, h('summary', {}, T('Advanced')), h('div', { class: 'tr-ai' }, ...AI_BITS.map((l, k) => h('label', {}, h('input', { type: 'checkbox', checked: !!(t.ai & (1 << k)), onchange: e => { r.w32(b + 28, (t.ai & ~(1 << k)) | (e.target.checked ? 1 << k : 0)); rer(); } }), ' ' + T(l))))));
    const battleSec = h('div', { class: 'tr-sec' }, h('h4', {}, T('In battle')), h('div', { class: 'muted' }, T('Items they use (up to 4):')), items, h('div', { class: 'muted', style: { marginTop: '6px' } }, T('How smart they are:')), ai);
    // where + lines
    const at = where(id), whereSec = h('div', { class: 'tr-sec' }, h('h4', {}, T('Where they battle')));
    if (!at.length) whereSec.append(h('p', { class: 'muted' }, T('This trainer is not on any map (a free slot: new trainers from the map editor use these).')));
    for (const a of at) {
      const evs = MapsTab.api.readEvents(r.ptr(G().mapGroups[a.g][a.n] + 4)), e = evs.obj[a.i];
      whereSec.append(h('div', { class: 'row' }, h('b', { dir: 'auto' }, mapLabel(a.g, a.n)), h('button', { onclick: () => MapsTab.api.open(a.g, a.n, { kind: 'obj', i: a.i }) }, T('Show on the map'))));
      if (e) {
        const sp = r.ptr(e.off + 16);
        if (sp >= 0) whereSec.append(Objects.tree(Objects.analyze(sp), { g: a.g, n: a.n, commit: (l, fn) => { try { fn(); return true; } catch (x) { toast(x.message, 'err'); return false; } }, refresh: rer, jump: () => {} }));
        whereSec.append(h('div', { class: 'muted' }, Tf('Sees you from {n} blocks away', { n: r.r16(e.off + 14) })));
      }
    }
    return h('div', { class: 'panel tr-card' }, head, teamSec, battleSec, whereSec);
  }

  return { render, info, curve, movesAt, writeTeam, picCanvas, PICS, PALS, PIC_COUNT, select: id => { sel = id; }, COUNT };
})();
