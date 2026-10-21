// A person's conversation as a chat: their lines in bubbles (in the game's own font), the player's yes / no answers as
// two threads side by side, what happens (gifts, battles, flags) as small notes between the bubbles. Click a bubble
// to edit it; the preview shows the game's message box as you type.
'use strict';

const Dialogue = (() => {
  const R = () => App.rom, G = () => App.game;
  const scriptOf = e => { const r = R(), o = e.off; return e.kind === 'obj' ? r.ptr(o + 16) : e.kind === 'bg' ? r.ptr(o + 8) : e.kind === 'coord' ? r.ptr(o + 12) : -1; };
  const rtl = () => App.settings.rtl;
  const textOf = p => { try { return Charmap.decodeEditable(R().u8, p, rtl()).text; } catch (x) { return ''; } };
  function preview(p) {
    try { return TextTab.preview(R().u8.slice(p, p + (Charmap.scanString(R().u8, p, 0) || 200) + 1), G().dialogueFont, 1); }
    catch (x) { return h('span', {}, textOf(p)); }
  }

  function open(g, n, e, ctx) {
    const sp = scriptOf(e); if (sp < 0) { toast(T('This one has no script'), 'err'); return; }
    const d = Objects.info(g, n, e), o = e.off;
    const avatar = () => {
      if (e.kind !== 'obj') return h('span', { class: 'dl-ava dl-ava-icon' }, d.icon || '📋');
      const cv = Objects.sprite(R().u8[o + 1], 'down'); if (!cv) return h('span', { class: 'dl-ava dl-ava-icon' }, '💬');
      const c = h('canvas', { width: cv.width, height: cv.height, class: 'pixel dl-ava' }); c.getContext('2d').drawImage(cv, 0, 0); return c;
    };
    const back = h('div', { class: 'modal-back', onclick: ev => { if (ev.target === back) back.remove(); } });
    const body = h('div', { class: 'dl-body' });
    const win = h('div', { class: 'dl-win' },
      h('div', { class: 'dl-top' }, avatar(), h('div', { style: { flex: 1 } }, h('div', { class: 'dl-name' }, d.who || T(d.type)), h('div', { class: 'muted', style: { fontSize: '12px' } }, T('Click a bubble to edit it. Answers and conditions split the conversation into threads.'))),
        h('button', { class: 'iconbtn', title: T('Close'), onclick: () => back.remove() }, '✕')), body);
    back.append(win); document.body.append(back);
    const commit = ctx && ctx.commit ? ctx.commit : (label, fn) => { try { fn(); return true; } catch (x) { toast(x.message, 'err'); return false; } };

    const draw = () => { body.innerHTML = ''; body.append(thread(Objects.analyze(sp))); };
    // one bubble of the person; click = edit in place
    function bubble(p, label, who = 'them') {
      const wrap = h('div', { class: 'dl-msg dl-' + who });
      const show = () => {
        wrap.innerHTML = '';
        wrap.append(who === 'them' ? avatar() : '', h('div', { class: 'dl-col' }, label ? h('div', { class: 'dl-label' }, T(label)) : '',
          h('div', { class: 'dl-bubble', title: T('Click to edit'), onclick: edit }, preview(p))));
      };
      const edit = () => {
        wrap.innerHTML = '';
        const ta = h('textarea', { dir: 'auto', rows: 3 }); ta.value = textOf(p);
        const pv = h('div', { class: 'ob-preview' });
        const upd = () => { pv.innerHTML = ''; try { pv.append(TextTab.preview(Charmap.encode(ta.value, { rtl: rtl() }), G().dialogueFont, 1)); } catch (x) { pv.textContent = x.message; } };
        ta.oninput = upd; upd();
        const save = () => { if (commit('edit text', () => { TextTab.saveAt(p, ta.value); })) { toast(T('Text saved')); if (ctx && ctx.refresh) ctx.refresh(); draw(); } };
        ta.onkeydown = ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { save(); ev.preventDefault(); } else if (ev.key === 'Escape') { show(); ev.stopPropagation(); } };
        wrap.append(who === 'them' ? avatar() : '', h('div', { class: 'dl-col dl-editing' }, ta, pv, h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: save }, T('Save')), h('button', { onclick: show }, T('Cancel')), h('span', { class: 'muted', style: { fontSize: '11px' } }, 'Ctrl+Enter · Esc'))));
        ta.focus();
      };
      show(); return wrap;
    }
    const note = (icon, text) => h('div', { class: 'dl-note' }, h('span', {}, icon + ' ' + T(text)));
    const answerOf = label => { const m = /answer (YES|NO)/.exec(label); return m ? m[1] : null; };
    // a list of nodes; yes / no branches next to each other
    function thread(nodes) {
      const box = h('div', { class: 'dl-thread' });
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        if (nd.t === 'text') { box.append(bubble(nd.p)); if (nd.yesno) box.append(h('div', { class: 'dl-msg dl-me' }, h('div', { class: 'dl-choice' }, h('span', {}, T('YES')), h('span', {}, T('NO'))))); }
        else if (nd.t === 'act') box.append(note(nd.icon, nd.text));
        else if (nd.t === 'trainer') { const t = Objects.trainer(nd.id); box.append(note('⚔', T('A trainer battle') + (t ? ': ' + (Objects.classNames()[t.cls] || '') + ' ' + t.name : ''))); for (const [l, p] of nd.texts) if (p >= 0) box.append(bubble(p, l)); }
        else if (nd.t === 'branch') {
          const a = answerOf(nd.label), next = nodes[i + 1];
          const nb = next && next.t === 'branch' ? answerOf(next.label) : null;
          if (a && (nb || next && next.t === 'branch' && next.label === 'Otherwise:')) {     // two answers: two threads side by side
            const other = nb || (a === 'YES' ? 'NO' : 'YES');
            box.append(h('div', { class: 'dl-split' },
              h('div', { class: 'dl-side' }, h('div', { class: 'dl-msg dl-me' }, h('div', { class: 'dl-bubble dl-mine' }, T(a))), thread(nd.kids)),
              h('div', { class: 'dl-side' }, h('div', { class: 'dl-msg dl-me' }, h('div', { class: 'dl-bubble dl-mine' }, T(other))), thread(next.kids))));
            i++; continue;
          }
          if (a) { box.append(h('div', { class: 'dl-msg dl-me' }, h('div', { class: 'dl-bubble dl-mine' }, T(a))), thread(nd.kids)); continue; }
          box.append(h('div', { class: 'dl-cond' }, h('div', { class: 'dl-cond-label' }, T(nd.label)), thread(nd.kids)));
        }
      }
      if (!nodes.length) box.append(h('p', { class: 'muted' }, T('Nothing is said here.')));
      return box;
    }
    draw();
  }
  return { open };
})();
