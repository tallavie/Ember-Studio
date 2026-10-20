// "Game check": finds problems before you build - doors that lead nowhere, objects outside the map, item balls that
// share a flag, trainers used twice, lines too wide for the message box, a leader weaker than the one before,
// untranslated lines and running out of free space. Every finding has a "Show" button.
'use strict';

const Doctor = (() => {
  const LEADERS = [414, 415, 416, 417, 418, 420, 419, 350];   // FireRed gym order
  const BOX = 208;                                              // message box width (pixels)
  const PH = { 1: 42, 2: 60, 3: 60, 4: 60, 6: 42 };              // {PLAYER} {STR_VAR_1..3} {RIVAL}: widest names
  let last = null;

  function lineWidths(r, p) {
    const f = App.game.fonts.length ? Font.fontById(App.game.dialogueFont) : null, wOf = c => f ? r.u8[f.widths + c] : 6;
    const out = []; let w = 0;
    for (let i = p, n = 0; n < 1200; i++, n++) {
      const c = r.u8[i];
      if (c === 0xFF) break;
      if (c === 0xFE || c === 0xFA || c === 0xFB) { out.push(w); w = 0; continue; }
      if (c === 0xFD) { w += PH[r.u8[i + 1]] || 48; i++; continue; }
      if (c === 0xFC) { const k = r.u8[i + 1]; i += 1 + ((Charmap.FC[k] || [0, 0])[1]); continue; }   // colours, {SKIP} (alignment padding)…
      if (c >= 0xF7) { i++; continue; }
      w += wOf(c);
    }
    out.push(w); return out;
  }

  function run() {
    const r = App.rom, g = App.game, o = g.offsets, out = [];
    const add = (sev, cat, msg, go) => out.push({ sev, cat, msg, go });
    const mapLabel = (gi, mi) => Game.mapName(r, g, r.u8[g.mapGroups[gi][mi] + 20]) + ' ' + gi + '.' + mi;
    const flagUsers = new Map(), trainerUsers = new Map(), texts = new Map();
    g.mapGroups.forEach((maps, gi) => maps.forEach((hp, mi) => {
      let m; try { m = MapsTab.api.loadMap(gi, mi); } catch (e) { add('err', 'Maps', mapLabel(gi, mi) + ': ' + T('the map cannot be loaded') + ' (' + e.message + ')'); return; }
      const where = mapLabel(gi, mi);
      for (const e of Object.values(m.events).flat()) {
        const [x, y] = MapsTab.api.evXY(e), go = { g: gi, n: mi, kind: e.kind, i: e.i };
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) add('info', 'Objects', where + ': ' + T('an object stands outside the map (often on purpose: it walks in during a scene)') + ' (' + x + ',' + y + ')', go);
        if (e.kind === 'warp') {
          const dg = r.u8[e.off + 7], dn = r.u8[e.off + 6], dw = r.u8[e.off + 5];
          if (dg === 0x7F || dn === 0x7F) continue;               // "dynamic" warps (go back to where you came from)
          const dh = (g.mapGroups[dg] || [])[dn];
          if (dh == null) { add('err', 'Doors', where + ': ' + T('a door leads to a map that does not exist') + ' (' + dg + '.' + dn + ')', go); continue; }
          const dev = r.ptr(dh + 4), nw = dev >= 0 ? r.u8[dev + 1] : 0;
          if (dw >= nw && dw !== 0xFF) add('err', 'Doors', where + ': ' + T('a door leads to door') + ' ' + (dw + 1) + ' ' + T('of') + ' ' + mapLabel(dg, dn) + ', ' + T('which has only') + ' ' + nw, go);
        }
        let info; try { info = Objects.info(gi, mi, e); } catch (x) { continue; }
        if (info.type === 'item ball') {
          const f = r.r16(e.off + 20);
          if (!f) add('warn', 'Items', where + ': ' + T('an item ball has no picked-up flag: it comes back every time') + ' (' + info.who + ')', go);
          else { if (!flagUsers.has(f)) flagUsers.set(f, []); flagUsers.get(f).push({ where, go, who: info.who }); }
        }
        if (info.type === 'trainer') { const id = info.trainer.id; if (!trainerUsers.has(id)) trainerUsers.set(id, []); trainerUsers.get(id).push({ where, go, who: info.who }); }
        if (info.tree) collectTexts(info.tree, t => { if (!texts.has(t)) texts.set(t, { where, go }); });
      }
    }));
    for (const [f, list] of flagUsers) if (list.length > 1) add('warn', 'Items', T('item balls share flag') + ' 0x' + f.toString(16).toUpperCase() + ': ' + list.map(x => x.who + ' (' + x.where + ')').join(', ') + ' — ' + T('picking up one hides the others'), list[1].go);
    for (const [id, list] of trainerUsers) if (new Set(list.map(x => x.where)).size > 1) add('warn', 'Trainers', T('the same trainer is used twice') + ' (#' + id + ' ' + list[0].who + '): ' + list.map(x => x.where).join(', ') + ' — ' + T('beating one counts for both'), list[1].go);
    // message box width
    let wide = 0;
    for (const [p, at] of texts) {
      const ws = lineWidths(r, p), mx = Math.max(...ws);
      if (mx > BOX) { wide++; if (wide <= 40) add('warn', 'Text', at.where + ': ' + T('a line is too wide for the message box') + ' (' + mx + '/' + BOX + 'px): “' + Charmap.decode(r.u8, p, 80).text.slice(0, 50) + '…”', at.go); }
    }
    if (wide > 40) add('warn', 'Text', (wide - 40) + ' ' + T('more lines are too wide'));
    // untranslated lines in a Hebrew game
    const heb = Object.values(texts).length && [...texts.keys()].some(p => /[א-ת]/.test(Charmap.decode(r.u8, p, 200).text));
    if (heb) {
      let en = 0; const first = [];
      for (const [p, at] of texts) { const t = Charmap.decode(r.u8, p, 200).text.replace(/\{[^}]*\}/g, ''); if (!/[א-ת]/.test(t) && /[A-Za-z]{3,}/.test(t)) { en++; if (first.length < 10) first.push([t, at]); } }
      for (const [t, at] of first) add('info', 'Translation', at.where + ': ' + T('a line is still in English') + ': “' + t.slice(0, 50) + '”', at.go);
      if (en > first.length) add('info', 'Translation', (en - first.length) + ' ' + T('more lines are still in English'));
    }
    // gym leaders get stronger
    if (o.trainers >= 0 && !g.isEmerald) {
      let prev = 0, prevName = '';
      for (const id of LEADERS) {
        const t = Objects.trainer(id); if (!t || !t.team.length) continue;
        const mx = Math.max(...t.team.map(m => m.lvl));
        if (mx < prev) add('warn', 'Trainers', T('gym leader') + ' ' + t.name + ' (' + T('level') + ' ' + mx + ') ' + T('is weaker than the leader before') + ', ' + prevName + ' (' + prev + ')');
        prev = Math.max(prev, mx); prevName = t.name;
      }
    }
    // free space
    let free = 0; for (let i = g.freeStart; i < g.freeEnd; i++) if (r.u8[i] === 0xFF) free++;
    if (free < 64 * 1024) add('err', 'ROM', T('almost no free space left in the ROM') + ' (' + (free >> 10) + ' KB)');
    else add('ok', 'ROM', T('free space in the ROM') + ': ' + (free >> 10) + ' KB');
    last = { time: new Date(), out };
    return out;
  }
  function collectTexts(tree, fn) { for (const x of tree) { if (x.t === 'text') fn(x.p); else if (x.t === 'trainer') x.texts.forEach(t => t[1] >= 0 && fn(t[1])); if (x.kids) collectTexts(x.kids, fn); } }

  const ICON = { err: '⛔', warn: '⚠', info: 'ℹ', ok: '✓' };
  function render(root) {
    root.innerHTML = '';
    const body = h('div');
    const go = () => { body.innerHTML = ''; body.append(h('p', { class: 'muted' }, T('Checking the whole game…'))); setTimeout(() => { const res = run(); show(body, res); }, 30); };
    root.append(h('div', { class: 'panel' }, h('div', { class: 'row' }, h('h2', {}, '🩺 ' + T('Game check')), h('button', { class: 'primary', onclick: go }, T('Check again'))),
      h('p', { class: 'muted' }, 'Finds problems before you build: doors that lead nowhere, item balls that share a flag, lines too wide for the message box, untranslated lines and more.'), body));
    if (last) show(body, last.out); else go();
  }
  function show(body, res) {
    body.innerHTML = '';
    const n = s => res.filter(x => x.sev === s).length;
    body.append(h('p', {}, h('b', {}, ICON.err + ' ' + n('err') + '  ' + ICON.warn + ' ' + n('warn') + '  ' + ICON.info + ' ' + n('info')), ' ', n('err') + n('warn') === 0 ? h('span', { class: 'ok' }, T('No problems found!')) : ''));
    const cats = [...new Set(res.map(x => x.cat))];
    for (const c of cats) {
      const items = res.filter(x => x.cat === c).sort((a, b) => 'ewio'.indexOf(a.sev[0]) - 'ewio'.indexOf(b.sev[0]));
      body.append(h('details', { class: 'doc-cat', open: items.some(x => x.sev === 'err' || x.sev === 'warn') }, h('summary', {}, T(c) + ' (' + items.length + ')'),
        ...items.map(x => h('div', { class: 'doc-item doc-' + x.sev }, h('span', {}, ICON[x.sev]), h('span', { dir: 'auto', style: { flex: 1 } }, x.msg),
          x.go ? h('button', { onclick: () => MapsTab.api.open(x.go.g, x.go.n, { kind: x.go.kind, i: x.go.i }) }, T('Show')) : ''))));
    }
  }
  return { run, render };
})();
