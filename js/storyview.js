// The game's own story inside the Story tab (js/storymap.js finds it): a timeline by chapters, the moments of
// one place in order, and a flowchart. A moment can be edited (its lines, the Pokémon / items it gives, its
// battle), skipped, tested, and your own steps can go right after it.
'use strict';

const StoryView = (() => {
  const R = () => App.rom, G = () => App.game;
  let view = 'timeline', filter = 'main', query = '', place = null;
  const mapLabel = (g, n) => { try { return Game.mapName(R(), G(), R().u8[G().mapGroups[g][n] + 20]) + ' ' + g + '.' + n; } catch (e) { return g + '.' + n; } };

  const icon = b => {
    const all = b.events;
    if (all.some(e => e.battles.some(x => x.k === 'trainer'))) return '⚔';
    if (all.some(e => e.battles.length)) return '🌿';
    if (all.some(e => e.gives.some(x => x.k === 'mon' || x.k === 'egg'))) return '🐾';
    if (all.some(e => e.gives.length)) return '🎁';
    const k = all[0].kind; return k === 'frame' || k === 'warpin' ? '🎬' : k === 'coord' ? '📍' : k === 'bg' ? '🪧' : '💬';
  };
  const KIND = { obj: 'Talking to someone', bg: 'Reading a sign', coord: 'Stepping on a spot', frame: 'Arriving on the map (a scene)', warpin: 'Arriving on the map' };

  function visible(m, s) {
    const q = query.trim().toLowerCase();
    return m.timeline.filter(b => (filter === 'all' || b.main || (s.original && (s.original.skip || []).includes(b.id))) &&
      (!q || b.title.toLowerCase().includes(q) || mapLabel(b.g, b.n).toLowerCase().includes(q)));
  }

  // ---------- the top bar ----------
  function bar(rer) {
    const tab = (k, label) => h('button', { class: view === k ? 'sel' : '', onclick: () => { view = k; rer(); } }, label);
    return h('div', { class: 'row wrap sm-bar' },
      h('div', { class: 'tabs small' }, tab('timeline', '📜 ' + T('Timeline')), tab('place', '📍 ' + T('By place')), tab('flow', '🔀 ' + T('Flowchart'))),
      h('select', { onchange: e => { filter = e.target.value; rer(); } },
        h('option', { value: 'main', selected: filter === 'main' }, T('The main story')), h('option', { value: 'all', selected: filter === 'all' }, T('Everything that happens'))),
      h('input', { type: 'search', placeholder: T('Search the story…'), value: query, oninput: e => { query = e.target.value; clearTimeout(bar.t); bar.t = setTimeout(rer, 250); } }));
  }

  function card(b, s, sel, pick) {
    const skipped = s.original && (s.original.skip || []).includes(b.id);
    return h('div', { class: 'sm-beat' + (sel ? ' sel' : '') + (b.main ? '' : ' side') + (skipped ? ' skipped' : ''), onclick: () => pick(b.id), title: KIND[b.events[0].kind] ? T(KIND[b.events[0].kind]) : '' },
      h('span', { class: 'st-ic' }, icon(b)), h('span', { class: 'st-title', dir: 'auto' }, b.title),
      b.events.length > 1 && new Set(b.events.flatMap(e => e.gives.concat(e.battles).map(x => x.sp || x.item || x.id))).size > 1 ? h('span', { class: 'sm-alt', title: T('There are alternatives (for example one per starter)') }, '×' + new Set(b.events.flatMap(e => e.gives.concat(e.battles).map(x => x.sp || x.item || x.id))).size) : '',
      skipped ? h('span', { class: 'sm-tag' }, '⏭ ' + T('skipped')) : '',
      h('span', { class: 'muted st-where', dir: 'auto' }, mapLabel(b.g, b.n)));
  }

  // ---------- timeline ----------
  // after(beatId) -> your chapters that come right after that moment
  function timeline(m, s, o) {
    const out = h('div', { class: 'sm-tl' }), list = visible(m, s), shown = new Set(list.map(b => b.id));
    m.chapters.forEach((ch, ci) => {
      const beats = list.filter(b => b.chapter === ci);
      const mine = m.timeline.filter(b => b.chapter === ci && !shown.has(b.id)).flatMap(b => o.after(b.id));   // your steps after a hidden moment still show
      if (!beats.length && !mine.length) return;
      const box = h('details', { class: 'sm-ch', open: o.openChapter(ci) }, h('summary', {}, h('b', {}, ch.title), h('span', { class: 'muted' }, ' · ' + beats.length)));
      box.ontoggle = () => o.toggleChapter(ci, box.open);
      for (const b of beats) {
        box.append(h('div', { class: 'sm-row' }, card(b, s, o.sel === b.id, o.pick), h('button', { class: 'sm-add', title: T('Add your own step right after this moment'), onclick: () => o.addAfter(b) }, '+')));
        for (const el of o.after(b.id)) box.append(el);
      }
      for (const el of mine) box.append(el);
      out.append(box);
    });
    if (!list.length) out.append(h('p', { class: 'muted' }, T('Nothing matches.')));
    return out;
  }

  // ---------- by place ----------
  function byPlace(m, s, o) {
    const out = h('div', { class: 'sm-place' }), list = visible(m, s);
    const maps = [...new Set(list.map(b => b.g + '.' + b.n))];
    if (!place || !maps.includes(place)) place = maps[0] || null;
    const sel = h('select', { onchange: e => { place = e.target.value; o.rer(); } },
      ...m.chapters.map((ch, ci) => { const ms = maps.filter(k => list.some(b => b.chapter === ci && b.g + '.' + b.n === k)); return ms.length ? h('optgroup', { label: ch.title }, ...ms.map(k => { const [g, n] = k.split('.').map(Number); return h('option', { value: k, selected: k === place }, mapLabel(g, n) + ' (' + list.filter(b => b.g + '.' + b.n === k).length + ')'); })) : null; }).filter(Boolean));
    out.append(h('div', { class: 'row' }, h('b', {}, T('Place') + ':'), sel, place ? h('button', { onclick: () => { const [g, n] = place.split('.').map(Number); MapsTab.api.open(g, n); } }, '🗺 ' + T('Show on the map')) : ''));
    if (place) {
      const here = list.filter(b => b.g + '.' + b.n === place);
      const seq = h('div', { class: 'sm-seq' });
      here.forEach((b, i) => { if (i) seq.append(h('div', { class: 'sm-arrow' }, '↓')); seq.append(card(b, s, o.sel === b.id, o.pick)); for (const el of o.after(b.id)) seq.append(el); });
      out.append(seq);
    }
    return out;
  }
  const setPlace = k => { place = k; view = 'place'; filter = 'all'; };

  // ---------- flowchart ----------
  function flowchart(m, s, o) {
    const list = visible(m, s), W = 190, H = 46, GX = 26, GY = 40, LANE = 22, perRow = 6, rtl = document.documentElement.dir === 'rtl' || I18N.lang === 'he';
    const total = 20 + perRow * (W + GX);
    const lanes = m.chapters.map((ch, ci) => list.filter(b => b.chapter === ci)).filter(x => x.length);
    const pos = new Map(); let y = 10, maxX = 0;
    const NS = 'http://www.w3.org/2000/svg', el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = el('svg', { class: 'sm-flow' }), defs = el('defs', {});
    const mk = el('marker', { id: 'smArrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }); mk.append(el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'sm-flow-head' })); defs.append(mk); svg.append(defs);
    const boxes = el('g', {}), lines = el('g', {});
    for (const lane of lanes) {
      const t = el('text', rtl ? { x: total - 10, y: y + 14, class: 'sm-flow-lane', 'text-anchor': 'start', direction: 'rtl' } : { x: 10, y: y + 14, class: 'sm-flow-lane' }); t.textContent = m.chapters[lane[0].chapter].title; boxes.append(t); y += LANE;
      lane.forEach((b, i) => {
        const x0 = 10 + (i % perRow) * (W + GX), x = rtl ? total - x0 - W : x0, yy = y + Math.floor(i / perRow) * (H + GY);
        pos.set(b.id, { x, y: yy }); maxX = Math.max(maxX, x + W);
        const g = el('g', { class: 'sm-flow-box' + (b.main ? '' : ' side') + (o.sel === b.id ? ' sel' : ''), transform: 'translate(' + x + ',' + yy + ')' });
        g.append(el('rect', { width: W, height: H, rx: 8 }));
        const ta = rtl ? { x: W - 8, 'text-anchor': 'start', direction: 'rtl' } : { x: 8 };      // with direction rtl, 'start' is the right edge
        const tt = el('text', Object.assign({ y: 18 }, ta)); tt.textContent = icon(b) + ' ' + (b.title.length > 26 ? b.title.slice(0, 25) + '…' : b.title); g.append(tt);
        const tp = el('text', Object.assign({ y: 36, class: 'sm-flow-place' }, ta)); tp.textContent = mapLabel(b.g, b.n); g.append(tp);
        g.addEventListener('click', () => o.pick(b.id)); boxes.append(g);
      });
      y += Math.ceil(lane.length / perRow) * (H + GY) + 6;
    }
    // what made each moment possible (inside a chapter, or from the chapter before; older ones are listed in the moment itself)
    const byId = new Map(list.map(b => [b.id, b]));
    for (const b of list) for (const a of b.after) {
      const p = pos.get(a), q = pos.get(b.id); if (!p || !q || b.chapter - byId.get(a).chapter > 1) continue;
      const x1 = p.x + W / 2, y1 = p.y + H, x2 = q.x + W / 2, y2 = q.y;
      const d = y2 > y1 ? 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + (y1 + 30) + ' ' + x2 + ',' + (y2 - 30) + ' ' + x2 + ',' + y2
        : (() => { const a1 = q.x > p.x ? p.x + W : p.x, a2 = q.x > p.x ? q.x : q.x + W, k = q.x > p.x ? 20 : -20;      // side by side (left to right, or right to left in Hebrew)
            return 'M' + a1 + ',' + (p.y + H / 2) + ' C' + (a1 + k) + ',' + (p.y + H / 2) + ' ' + (a2 - k) + ',' + (q.y + H / 2) + ' ' + a2 + ',' + (q.y + H / 2); })();
      lines.append(el('path', { d, class: 'sm-flow-line', 'marker-end': 'url(#smArrow)' }));
    }
    svg.append(lines, boxes);
    svg.setAttribute('width', Math.max(maxX + 20, total)); svg.setAttribute('height', y + 10);
    return h('div', { class: 'panel sm-flow-wrap' }, h('p', { class: 'muted' }, T('Each box is a moment of the story; an arrow means "this has to happen first". Click a box to open it.')), svg);
  }

  // ---------- one moment ----------
  function condText(c, m, b) {
    if (c.k === 'flag' && c.visible) return Tf('the person is there (flag {f} is not set)', { f: '0x' + c.f.toString(16).toUpperCase() });
    if (c.k === 'flag' && c.f >= StoryMap.TRAINER_FLAGS && c.f < StoryMap.TRAINER_FLAGS + 0x300) return (c.set ? T('after beating trainer') : T('before beating trainer')) + ' #' + (c.f - StoryMap.TRAINER_FLAGS);
    if (c.k === 'flag') return Tf(c.set ? 'flag {f} is set' : 'flag {f} is not set', { f: '0x' + c.f.toString(16).toUpperCase() });
    if (c.k === 'var') return Tf('variable {v} {op} {n}', { v: '0x' + c.v.toString(16).toUpperCase(), op: StoryMap.OPS[c.c], n: c.n });
    return '';
  }
  function effText(e) {
    if (e.k === 'flag') return e.trainer != null ? T('the trainer counts as beaten') : Tf(e.set ? 'sets flag {f}' : 'clears flag {f}', { f: '0x' + e.f.toString(16).toUpperCase() });
    if (e.k === 'var') return Tf('variable {v} becomes {n}', { v: '0x' + e.v.toString(16).toUpperCase(), n: e.n < 0 ? '?' : e.n });
    return Tf('variable {v} goes up by {n}', { v: '0x' + e.v.toString(16).toUpperCase(), n: e.n });
  }

  function editor(b, m, s, o) {
    const L = App.getLists(), box = h('div', { class: 'st-form sm-ed' }), r = R();
    const skipped = s.original && (s.original.skip || []).includes(b.id);
    const ctx = { commit: (label, fn) => { try { fn(); return true; } catch (x) { console.error(x); toast(x.message, 'err'); return false; } }, refresh: () => o.rer() };
    box.append(h('div', { class: 'row wrap' }, h('h3', { style: { flex: 1 }, dir: 'auto' }, icon(b) + ' ' + b.title),
      h('button', { title: T('Starts the game at a spot you pick, right before this moment'), onclick: () => o.test(b) }, '▶ ' + T('Test from here')),
      h('button', { onclick: () => o.addAfter(b) }, '+ ' + T('Add a step after this'))),
      h('div', { class: 'muted' }, T('From the game') + ' · ' + m.chapters[b.chapter].title + ' · ',
        h('a', { href: '#', onclick: e => { e.preventDefault(); const e0 = b.events[0]; MapsTab.api.open(b.g, b.n, e0.kind === 'obj' || e0.kind === 'bg' || e0.kind === 'coord' ? { kind: e0.kind, i: e0.places[0].i } : null); } }, mapLabel(b.g, b.n)),
        ' · ' + T(KIND[b.events[0].kind] || '')));
    // what comes before
    const before = b.after.map(id => m.beats.find(x => x.id === id)).filter(Boolean);
    if (before.length) box.append(h('div', { class: 'st-field' }, h('label', {}, T('Happens after')),
      h('div', { class: 'row wrap' }, ...before.map(x => h('button', { class: 'sm-link', onclick: () => o.pick(x.id) }, icon(x) + ' ' + x.title)))));
    // skipping
    box.append(h('div', { class: 'sm-skip' + (skipped ? ' on' : '') },
      h('label', {}, h('input', { type: 'checkbox', checked: skipped, onchange: e => o.skip(b, e.target.checked) }), ' ⏭ ' + T('Skip this moment')),
      h('div', { class: 'muted' }, T('It does not play, but what it changes still happens (so the story goes on). Applied with “Apply the story to the game”.'))));
    // the alternatives: what each one gives / who it battles
    const alts = [], altKeys = new Set();                 // the same gift found on several paths of the script is one alternative
    for (const e of b.events) { const k = e.gives.map(x => x.k + x.at + ':' + (x.sp || x.item)).concat(e.battles.map(x => x.k + (x.id || x.sp))).join(','); if (!altKeys.has(k)) { altKeys.add(k); alts.push(e); } }
    const gl = h('div', { class: 'sm-alts' });
    alts.forEach((e, k) => {
      const parts = [];
      for (const x of e.gives) {
        if (x.k === 'mon' && x.at >= 0) parts.push(h('span', { class: 'row' }, '🐾 ', makeSelect(L.species, x.sp, v => { ctx.commit('species', () => r.w16(x.at, +v)); o.rer(); }), ' ' + T('lv') + ' ',
          h('input', { type: 'number', min: 1, max: 100, value: x.lvl, style: { width: '56px' }, onchange: ev => { ctx.commit('level', () => r.w8(x.lvlAt, +ev.target.value)); o.rer(); } })));
        else if (x.k === 'item' && x.at >= 0) parts.push(h('span', { class: 'row' }, '🎁 ', Objects.itemPicker(x.item, v => { ctx.commit('item', () => r.w16(x.at, v)); o.rer(); }),
          x.qtyAt >= 0 ? h('input', { type: 'number', min: 1, max: 99, value: x.qty, style: { width: '50px' }, onchange: ev => { ctx.commit('qty', () => r.w16(x.qtyAt, +ev.target.value)); o.rer(); } }) : ''));
        else parts.push(h('span', {}, '🎁 ' + (x.k === 'mon' ? L.species[x.sp] : L.items[x.item] || '#' + x.item)));
      }
      for (const x of e.battles) {
        if (x.k === 'trainer') { const t = Objects.trainer(x.id), cls = Objects.classNames();
          parts.push(h('span', { class: 'row' }, '⚔ ' + (t ? ((cls[t.cls] || '') + ' ' + t.name).trim() : '#' + x.id) + (t && t.team.length ? ' — ' + t.team.map(p => L.species[p.sp] + ' ' + p.lvl).join(', ') : ''),
            h('button', { onclick: () => { TrainersTab.select(x.id); App.show('trainers'); } }, T('Edit the team')))); }
        else parts.push(h('span', { class: 'row' }, '🌿 ', makeSelect(L.species, x.sp, v => { ctx.commit('species', () => r.w16(x.at, +v)); o.rer(); }), ' ' + T('lv') + ' ',
          h('input', { type: 'number', min: 1, max: 100, value: x.lvl, style: { width: '56px' }, onchange: ev => { ctx.commit('level', () => r.w8(x.lvlAt, +ev.target.value)); o.rer(); } })));
      }
      const answer = e.acts.find(a => a.k === 'answer' && a.what === 'yesno');
      if (parts.length || alts.length > 1) gl.append(h('div', { class: 'sm-alt-row' }, alts.length > 1 ? h('b', {}, (k + 1) + '. ') : '', answer ? h('span', { class: 'muted' }, (answer.yes ? T('If they answer YES') : T('If they answer NO')) + ': ') : '', ...parts));
    });
    if (gl.childNodes.length) box.append(h('div', { class: 'st-field' }, h('label', {}, alts.length > 1 ? T('What happens (each alternative)') : T('What happens')), gl));
    // the lines
    const seen = new Set(), texts = [];
    for (const e of alts) for (const t of e.texts) if (t.p >= 0 && !seen.has(t.p)) { seen.add(t.p); texts.push(t); }
    if (texts.length) {
      const tl = h('div', { class: 'sm-texts' });
      texts.slice(0, 30).forEach(t => tl.append(Objects.textBubble(t.p, ctx, '')));
      box.append(h('div', { class: 'st-field' }, h('label', {}, T('What they say') + ' (' + texts.length + ')'), tl));
    }
    // the technical part
    const conds = [...new Set(alts[0].conds.map(c => condText(c, m, b)).filter(Boolean))];
    const effs = [...new Set(alts.flatMap(e => e.eff.map(effText)))];
    box.append(h('details', { class: 'sm-tech' }, h('summary', {}, T('How the game decides (flags and variables)')),
      h('div', {}, h('b', {}, T('It can happen when') + ': '), conds.length ? conds.join(' · ') : T('always')),
      h('div', {}, h('b', {}, T('It changes') + ': '), effs.join(' · ') || '—'),
      h('div', { class: 'muted' }, T('Script') + ' 0x' + (alts[0].entry >>> 0).toString(16).toUpperCase() + ' · ' + T('this moment starts at') + ' 0x' + (alts[0].start >>> 0).toString(16).toUpperCase())));
    return box;
  }

  return { bar, timeline, byPlace, flowchart, editor, get view() { return view; }, setPlace, icon, mapLabel };
})();
