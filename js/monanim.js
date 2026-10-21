// Emerald: how a Pokémon moves when it appears in battle. Its front picture has two frames (64×128) shown in a
// sequence of [frame, time] steps (gMonFrontAnimsPtrTable), plus a motion of the whole picture (sMonFrontAnimIdsTable)
// that starts after a delay (sMonAnimationDelayTable), and a motion when it is the player's Pokémon, seen from behind
// (sSpeciesToBackAnimSet). The preview here is close; "Test in battle" shows exactly what the game does.
'use strict';

const MonAnim = (() => {
  const R = () => App.rom, O = () => App.game.offsets;
  let editing = 1;                                      // which frame the pixel editor shows: 0 = frame 1, 1 = frame 2
  const supported = () => !!App.game && App.game.isEmerald && O().frontAnims >= 0 && O().frontAnimIds >= 0;

  // motions, in the game's order: [name, Hebrew]
  const MOTIONS = [
    ['Squish and bounce', 'מתכווץ וקופץ'], ['Stretch in a circle twice', 'נמתח במעגל פעמיים'], ['Vibrate sideways', 'רוטט לצדדים'], ['Slide sideways', 'מחליק לצדדים'],
    ['Slide up and down', 'מחליק למעלה ולמטה'], ['Bounce and tilt', 'קופץ ונוטה לצדדים'], ['Jump up, then sideways', 'קופץ למעלה ואז לצדדים'], ['Tilt to the sides', 'נוטה לצדדים'],
    ['Tilt to the sides twice', 'נוטה לצדדים פעמיים'], ['Grow and vibrate', 'גדל ורוטט'], ['Zigzag, fast', 'זיגזג מהיר'], ['Swing (dip)', 'מתנדנד (בשקע)'],
    ['Swing (dip), fast', 'מתנדנד (בשקע) מהר'], ['Swing (arc)', 'מתנדנד (בקשת)'], ['Swing (arc), fast', 'מתנדנד (בקשת) מהר'], ['Shake sideways', 'רועד לצדדים'],
    ['Shake up and down', 'רועד למעלה ולמטה'], ['Vibrate in a circle', 'רוטט במעגל'], ['Twist', 'מתפתל'], ['Shrink and grow', 'מתכווץ וגדל'],
    ['Circle (counter-clockwise)', 'מעגל נגד כיוון השעון'], ['Glow black', 'זוהר בשחור'], ['Slide and shrink', 'מחליק ומתכווץ'], ['Stretch up', 'נמתח לגובה'],
    ['Stretch wide', 'נמתח לרוחב'], ['Grow in steps', 'גדל בשלבים'], ['Circle into the background', 'מסתובב לתוך הרקע'], ['Quick hops sideways', 'קפיצות מהירות לצדדים'],
    ['Four-petal path', 'מסלול של ארבעה עלים'], ['Squish and bounce, slow', 'מתכווץ וקופץ לאט'], ['Slide sideways, slow', 'מחליק לצדדים לאט'], ['Slide up and down, slow', 'מחליק למעלה ולמטה לאט'],
    ['Bounce and tilt, small', 'קופץ ונוטה, קטן'], ['Bounce and tilt, slow', 'קופץ ונוטה לאט'], ['Bounce and tilt, small and slow', 'קופץ ונוטה, קטן ואיטי'], ['Zigzag, slow', 'זיגזג איטי'],
    ['Shake sideways, slow', 'רועד לצדדים לאט'], ['Shake up and down, slow', 'רועד למעלה ולמטה לאט'], ['Twist twice', 'מתפתל פעמיים'], ['Circle (counter-clockwise), slow', 'מעגל נגד כיוון השעון, לאט'],
    ['Shake up and down twice', 'רועד למעלה ולמטה פעמיים'], ['Tip forward', 'נוטה קדימה'], ['Pivot sideways', 'מסתובב על הציר לצדדים'], ['Slide up and down, wobbling', 'מחליק למעלה ולמטה ומתנדנד'],
    ['Slide sideways, wobbling', 'מחליק לצדדים ומתנדנד'], ['Big jumps', 'קפיצות גדולות'], ['Long spin', 'סיבוב ארוך'], ['Glow orange', 'זוהר בכתום'],
    ['Glow red', 'זוהר באדום'], ['Glow blue', 'זוהר בכחול'], ['Glow yellow', 'זוהר בצהוב'], ['Glow purple', 'זוהר בסגול'],
    ['Back and lunge', 'נסוג ומסתער'], ['Back flip', 'סלטה לאחור'], ['Flicker', 'מהבהב'], ['Big back flip', 'סלטה גדולה לאחור'],
    ['Front flip', 'סלטה קדימה'], ['Tumbling front flip', 'סלטה מתגלגלת קדימה'], ['Figure 8', 'שמינייה'], ['Flash yellow', 'הבזק צהוב'],
    ['Swing (dip), fast and short', 'מתנדנד (בשקע) מהר וקצר'], ['Swing (arc), fast and short', 'מתנדנד (בקשת) מהר וקצר'], ['Rise and slam down', 'מתרומם ונוחת בחבטה'], ['Deep squish and bounce', 'מתכווץ עמוק וקופץ'],
    ['Jumps sideways', 'קפיצות לצדדים'], ['Jumps sideways and stretches', 'קופץ לצדדים ונמתח'], ['Tilt to the sides, fast', 'נוטה לצדדים מהר'], ['Rise and tilt', 'מתרומם ונוטה'],
    ['Flicker faster and faster', 'מהבהב מהר יותר ויותר'], ['Hop forward', 'קופץ קדימה'], ['Pivot and shake', 'מסתובב ורועד'], ['Tip and shake', 'נוטה ורועד'],
    ['Vibrate to the corners', 'רוטט לפינות'], ['Stretch at both ends', 'נמתח משני הצדדים'], ['Stretch at both ends twice', 'נמתח משני הצדדים פעמיים'], ['Stretch far, slow', 'נמתח רחוק לאט'],
    ['Shake and slide', 'רועד ומחליק'], ['Shake and slide, slow', 'רועד ומחליק לאט'], ['Triangle, slow', 'משולש לאט'], ['Triangle', 'משולש'],
    ['Triangle twice', 'משולש פעמיים'], ['Grow', 'גדל'], ['Grow twice', 'גדל פעמיים'], ['Spring sideways', 'קפיץ לצדדים'],
    ['Spring sideways, again and again', 'קפיץ לצדדים שוב ושוב'], ['Shrink and grow, fast', 'מתכווץ וגדל מהר'], ['Shrink and grow, slow', 'מתכווץ וגדל לאט'],
  ];
  const BACK = [
    ['None', 'בלי'], ['Vibrate sideways', 'רוטט לצדדים'], ['Slide sideways', 'מחליק לצדדים'], ['Spring sideways', 'קפיץ לצדדים'], ['Spring sideways, again and again', 'קפיץ לצדדים שוב ושוב'],
    ['Shrink and grow', 'מתכווץ וגדל'], ['Grow', 'גדל'], ['Circle (counter-clockwise)', 'מעגל נגד כיוון השעון'], ['Shake sideways', 'רועד לצדדים'], ['Shake up and down', 'רועד למעלה ולמטה'],
    ['Shake and slide', 'רועד ומחליק'], ['Stretch up', 'נמתח לגובה'], ['Stretch wide', 'נמתח לרוחב'], ['Grow with a stutter', 'גדל בגמגום'], ['Shake low', 'רועד נמוך'],
    ['Triangle', 'משולש'], ['Big dip', 'שקע גדול'], ['Double arc', 'קשת כפולה'], ['Small dip', 'שקע קטן'], ['Dip to the right', 'צולל ימינה'],
    ['Shrink, grow and vibrate', 'מתכווץ, גדל ורוטט'], ['Jolt to the right', 'מזנק ימינה'], ['Flash yellow and shake', 'הבזק צהוב ורעידה'], ['Red and shake', 'מאדים ורועד'], ['Green and shake', 'מוריק ורועד'],
    ['Blue and shake', 'מכחיל ורועד'],
  ];
  const nameOf = (list, i) => { const x = list[i]; return x ? (I18N.lang === 'he' ? x[1] : x[0]) : '#' + i; };

  // ---------- the data ----------
  const motion = sp => R().u8[O().frontAnimIds + sp - 1];
  const delay = sp => O().animDelays >= 0 ? R().u8[O().animDelays + sp - 1] : 0;
  const back = sp => O().backAnimSets >= 0 ? R().u8[O().backAnimSets + sp] : 0;
  function steps(sp) {                                  // the frame sequence: [{ frame, time }] (time in 1/60 s)
    const r = R(), list = r.ptr(r.ptr(O().frontAnims + sp * 4) + 4), out = [];
    if (list < 0) return out;
    for (let k = 0; k < 32; k++) { const v = r.r32(list + k * 4); if ((v & 0xFFFF) >= 0xFFFC) break; out.push({ frame: v & 1, time: (v >> 16) & 0x3F }); }
    return out;
  }
  function writeSteps(sp, list) {                       // a new list and a new pair of pointers (the first one, "stand still", stays shared)
    const r = R(), e = O().frontAnims + sp * 4, pair = r.ptr(e), cmds = new Uint8Array(list.length * 4 + 4), dv = new DataView(cmds.buffer);
    list.forEach((s, i) => dv.setUint32(i * 4, (s.frame & 1) | (Math.max(1, Math.min(63, s.time)) << 16), true));
    dv.setUint32(list.length * 4, 0xFFFF, true);
    const p = new Uint8Array(8), pv = new DataView(p.buffer);
    pv.setUint32(0, r.r32(pair), true); pv.setUint32(4, 0x08000000 + r.writeNew(cmds), true);
    r.wptr(e, r.writeNew(p));
  }

  // ---------- the preview: the frames in their sequence, and a motion close to the game's ----------
  function keyframes(name) {
    const n = name.toLowerCase(), A = [];
    if (/glow|flash|red and|green and|blue and/.test(n)) {
      const c = /black/.test(n) ? '#000' : /orange/.test(n) ? '#ff8c00' : /red/.test(n) ? '#ff2020' : /blue/.test(n) ? '#3070ff' : /purple/.test(n) ? '#a040ff' : /green/.test(n) ? '#30d030' : '#ffe000';
      A.push({ filter: 'none' }, { filter: 'drop-shadow(0 0 6px ' + c + ') brightness(1.3)' }, { filter: 'none' });
    }
    if (/flicker/.test(n)) A.push({ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }, { opacity: 1 });
    if (/shake|vibrate|jolt/.test(n)) { const v = /up and down|low/.test(n); for (let i = 0; i < 8; i++) A.push({ transform: v ? 'translateY(' + (i % 2 ? 3 : -3) + 'px)' : 'translateX(' + (i % 2 ? 4 : -4) + 'px)' }); A.push({ transform: 'none' }); }
    else if (/jump|hop|bounce|rise|slam/.test(n)) A.push({ transform: 'none' }, { transform: 'translateY(-18px)' }, { transform: 'none' }, { transform: 'translateY(-10px)' }, { transform: 'none' });
    else if (/slide|lunge|spring/.test(n)) { const v = /up and down/.test(n); A.push({ transform: 'none' }, { transform: v ? 'translateY(-10px)' : 'translateX(-14px)' }, { transform: v ? 'translateY(6px)' : 'translateX(10px)' }, { transform: 'none' }); }
    else if (/squish|stretch/.test(n)) { const w = /wide|far/.test(n); A.push({ transform: 'none' }, { transform: w ? 'scaleX(1.25)' : 'scaleY(1.25)' }, { transform: w ? 'scaleX(0.85)' : 'scaleY(0.8) translateY(6px)' }, { transform: 'none' }); }
    else if (/grow|shrink/.test(n)) A.push({ transform: 'none' }, { transform: /shrink/.test(n) ? 'scale(0.75)' : 'scale(1.2)' }, { transform: 'none' }, { transform: 'scale(1.12)' }, { transform: 'none' });
    else if (/flip|spin|twist/.test(n)) A.push({ transform: 'none' }, { transform: /twist/.test(n) ? 'scaleX(-1)' : 'rotate(' + (/back/.test(n) ? -360 : 360) + 'deg)' }, { transform: 'none' });
    else if (/tilt|swing|tip|pivot|dip/.test(n)) A.push({ transform: 'none' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(10deg)' }, { transform: 'none' });
    else if (/circle|figure|zigzag|triangle|petal|arc|corner/.test(n)) A.push({ transform: 'none' }, { transform: 'translate(-10px,-8px)' }, { transform: 'translate(10px,-8px)' }, { transform: 'translate(10px,8px)' }, { transform: 'translate(-10px,8px)' }, { transform: 'none' });
    return A.length ? A : [{ transform: 'none' }, { transform: 'none' }];
  }
  function preview(sp, opts) {
    const m = Graphics.monInfo(sp, 'front', false); if (!m) return h('div');
    const load = () => { const mm = Graphics.monInfo(sp, 'front', false) || m; return [0, 1].map(f => {
      const c = h('canvas', { width: 64, height: 64 }), px = f && mm.h >= 128 ? mm.px.subarray(4096, 8192) : mm.px.subarray(0, 4096);
      c.getContext('2d').putImageData(Gfx.toImageData(px, 64, 64, mm.pal, true), 0, 0); return c;
    }); };
    let frames = load();
    const cv = h('canvas', { class: 'pixel ma-sprite', width: 64, height: 64 }), x = cv.getContext('2d');
    const stage = h('div', { class: 'ma-stage' }, h('div', { class: 'ma-ground' }), cv);
    let timer = null, anim = null;
    const show = f => { x.clearRect(0, 0, 64, 64); x.drawImage(frames[f], 0, 0); };
    const play = () => {
      clearTimeout(timer); if (anim) anim.cancel(); frames = load(); show(0);
      const st = opts.steps(), mo = MOTIONS[opts.motion()] ? MOTIONS[opts.motion()][0] : '', slow = /slow/.test(mo.toLowerCase()) ? 1.6 : /fast/.test(mo.toLowerCase()) ? 0.6 : 1;
      let t = 0; for (const s of st) { const f = s.frame; setTimeout(() => show(f), t * 1000 / 60); t += s.time; }
      setTimeout(() => show(0), t * 1000 / 60);
      setTimeout(() => { anim = cv.animate(keyframes(mo), { duration: 900 * slow, iterations: /twice/.test(mo.toLowerCase()) ? 2 : 1, easing: 'ease-in-out' }); }, opts.delay() * 1000 / 60);
      timer = setTimeout(play, Math.max(t * 1000 / 60, opts.delay() * 1000 / 60 + 1800 * slow) + 900);
    };
    show(0); setTimeout(play, 300);
    const obs = new MutationObserver(() => { if (!document.body.contains(stage)) { clearTimeout(timer); obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
    return { el: stage, play };
  }

  // ---------- the tab ----------
  function tab(sp, rerender, tools) {
    if (!supported()) return h('p', { class: 'muted' }, T('Animations can be edited in Emerald.'));
    const r = R(), m = Graphics.monInfo(sp, 'front', false);
    if (!m) return h('p', { class: 'muted' }, 'Picture tables not found.');
    let list = steps(sp);
    const pv = preview(sp, { steps: () => list, motion: () => motion(sp), delay: () => delay(sp) });
    // the frame sequence
    const rows = h('div', { class: 'ma-steps' });
    const drawRows = () => {
      rows.innerHTML = '';
      list.forEach((s, i) => rows.append(h('div', { class: 'row ma-step' },
        h('b', {}, (i + 1) + '.'),
        h('select', { onchange: e => { s.frame = +e.target.value; } }, h('option', { value: 0, selected: s.frame === 0 }, T('Frame 1')), h('option', { value: 1, selected: s.frame === 1 }, T('Frame 2'))),
        h('label', {}, h('input', { type: 'number', min: 1, max: 63, value: s.time, style: { width: '60px' }, onchange: e => { s.time = Math.max(1, Math.min(63, +e.target.value || 1)); } }), ' ' + T('frames (60 = 1 second)')),
        h('button', { class: 'mu-x', title: T('Remove'), onclick: () => { list.splice(i, 1); drawRows(); } }, '✕'))));
      rows.append(h('div', { class: 'row wrap' },
        h('button', { onclick: () => { list.push({ frame: list.length % 2, time: 10 }); drawRows(); } }, '+ ' + T('Add a step')),
        h('button', { onclick: () => { list = [{ frame: 0, time: 10 }, { frame: 1, time: 10 }, { frame: 0, time: 10 }, { frame: 1, time: 10 }, { frame: 0, time: 1 }]; drawRows(); } }, T('Blink twice')),
        h('button', { onclick: () => { list = [{ frame: 1, time: 40 }, { frame: 0, time: 1 }]; drawRows(); } }, T('Hold frame 2')),
        h('button', { class: 'primary', onclick: () => { if (!list.length) { toast(T('Add at least one step'), 'err'); return; } writeSteps(sp, list); toast(T('Saved')); pv.play(); } }, '💾 ' + T('Save the sequence'))));
    };
    drawRows();
    // the motions
    const motionSel = h('select', { onchange: e => { r.w8(O().frontAnimIds + sp - 1, +e.target.value); pv.play(); } }, ...MOTIONS.map((x, i) => h('option', { value: i, selected: i === motion(sp) }, nameOf(MOTIONS, i))));
    const delayIn = h('input', { type: 'number', min: 0, max: 255, value: delay(sp), style: { width: '70px' }, onchange: e => { if (O().animDelays >= 0) { r.w8(O().animDelays + sp - 1, Math.max(0, Math.min(255, +e.target.value || 0))); pv.play(); } } });
    const backSel = O().backAnimSets >= 0 ? h('select', { onchange: e => r.w8(O().backAnimSets + sp, +e.target.value) }, ...BACK.map((x, i) => h('option', { value: i, selected: i === back(sp) }, nameOf(BACK, i)))) : '';
    // the two frames: a slider moves between them in the same editor (the page stays where it is); both are kept until "Save"
    const buf = [m.px.slice(0, 4096), m.h >= 128 ? m.px.slice(4096, 8192) : m.px.slice(0, 4096)];
    const ed = tools.PixelEditor({ px: buf[editing], w: 64, h: 64, pal: m.pal, transparent: true, name: (App.getLists().species[sp] || sp) + '_frame' });
    let ghostOn = false, flip = null, dirty = false;
    const thumbs = [0, 1].map(() => h('canvas', { class: 'pixel ma-thumb', width: 64, height: 64 }));
    const label = h('b', { class: 'ma-which' }), state = h('span', { class: 'muted' });
    const slider = h('input', { type: 'range', min: 1, max: 2, step: 1, value: editing + 1, class: 'ma-slider', oninput: e => show(+e.target.value - 1) });
    const drawThumbs = () => thumbs.forEach((c, f) => { c.getContext('2d').putImageData(Gfx.toImageData(buf[f], 64, 64, ed.pal, true), 0, 0); c.classList.toggle('sel', f === editing); });
    const mark = d => { dirty = d; state.textContent = d ? T('Not saved yet') : ''; };
    function show(f) {                                   // the editor shows frame f, in place
      editing = f; slider.value = f + 1; label.textContent = Tf('Frame {n}', { n: f + 1 });
      ed.setPx(buf[f]); ed.setGhost(ghostOn ? buf[1 - f] : null); drawThumbs();
    }
    ed.onDraw(() => { mark(true); drawThumbs(); });
    thumbs.forEach((c, f) => { c.onclick = () => show(f); });
    const save = () => { tools.savePicture(sp, 'front', buf[0], buf[1]); mark(false); toast(T('Both frames saved')); pv.play(); };
    // keys while the editor has focus: [ and ] (or , and .) move between the frames
    ed.el.addEventListener('keydown', e => { if (['[', ']', ',', '.'].includes(e.key)) { show(e.key === '[' || e.key === ',' ? 0 : 1); e.preventDefault(); } });
    const toggleFlip = btn => {
      if (flip) { clearInterval(flip); flip = null; btn.textContent = '▶ ' + T('Flip between them'); return; }
      flip = setInterval(() => { if (!document.body.contains(slider)) { clearInterval(flip); flip = null; return; } show(1 - editing); }, 350);
      btn.textContent = '⏸ ' + T('Stop');
    };
    setTimeout(() => show(editing));
    return h('div', {},
      h('div', { class: 'row wrap', style: { alignItems: 'flex-start', gap: '20px' } },
        h('div', {}, h('h4', {}, T('In battle')), pv.el,
          h('div', { class: 'row wrap', style: { marginTop: '6px' } }, h('button', { onclick: () => pv.play() }, '▶ ' + T('Play again')), h('button', { onclick: () => Tester.battle(sp) }, '🎮 ' + T('Test in battle'))),
          h('p', { class: 'muted', style: { maxWidth: '300px', fontSize: '12px' } }, T('The preview is close to the game. "Test in battle" shows exactly how it moves.'))),
        h('div', { style: { flex: 1, minWidth: '300px' } },
          h('h4', {}, T('How it moves')),
          h('div', { class: 'fields' },
            h('label', { class: 'field' }, T('Motion when it appears'), motionSel),
            h('label', { class: 'field' }, T('Wait before the motion (frames)'), delayIn),
            backSel ? h('label', { class: 'field' }, T('Motion when it is your Pokémon (from behind)'), backSel) : ''),
          h('h4', {}, T('The picture changes (frame 1 / frame 2)')),
          h('p', { class: 'muted', style: { fontSize: '12px' } }, T('The front picture has two frames. These steps show them one after the other when the Pokémon appears.')),
          rows)),
      h('h4', {}, T('Edit the frames')),
      h('div', { class: 'ma-bar' },
        thumbs[0], h('div', { class: 'ma-slide' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', {}, T('Frame 1')), label, h('span', {}, T('Frame 2'))), slider), thumbs[1],
        h('button', { onclick: e => toggleFlip(e.target) }, '▶ ' + T('Flip between them')),
        h('label', {}, h('input', { type: 'checkbox', onchange: e => { ghostOn = e.target.checked; show(editing); } }), ' ' + T('Show the other frame faintly'))),
      h('div', { class: 'row wrap' },
        h('label', { class: 'btn' }, '🖼 ' + T('Import PNG into this frame'), h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => {
          const f = e.target.files[0]; if (!f) return; try { buf[editing].set((await tools.convertImage(f, 64, m.pal)).px); show(editing); mark(true); } catch (x) { toast(x.message, 'err'); } } })),
        h('button', { onclick: () => { buf[editing].set(buf[1 - editing]); show(editing); mark(true); } }, T('Copy the other frame here')),
        h('button', { title: T('Frame 1 becomes frame 2 and frame 2 becomes frame 1'), onclick: () => { const t = buf[0].slice(); buf[0].set(buf[1]); buf[1].set(t); show(editing); mark(true); } }, '⇄ ' + T('Swap the frames')),
        h('button', { class: 'primary', onclick: save }, '💾 ' + T('Save both frames')), state),
      h('p', { class: 'muted', style: { fontSize: '12px' } }, T('Move the slider, click a small picture, or press [ and ] in the editor to go between the frames.')),
      ed.el);
  }
  return { supported, tab, steps, writeSteps, motion, delay, back, MOTIONS, BACK };
})();
