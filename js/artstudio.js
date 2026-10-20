// Graphics → "Character from a picture" (a battle picture + an overworld sprite from one drawing) and
// "Title screen" (logo, subtitle and a hero picture instead of Charizard, with a preview from the emulator).
'use strict';

const ArtStudio = (() => {
  const R = () => App.rom;
  let ch = null;                                   // the character being made: { src, battle: {px, pal}, ow: {px} }
  let tgtPic = 0, tgtGfx = 18, tgtTrainer = 0, title = { logo: '', hero: '', sub1: '', sub2: '', background: 'keep' }, shotUrl = '';

  // ---------- character from a picture ----------
  async function loadPicture(root) {
    const f = await ImgTools.pick(); if (!f) return;
    const src = ImgTools.removeBackground(await ImgTools.load(f));
    ch = { src, name: f.name };
    makeBattle(); makeOw(); render(root);
  }
  function makeBattle() {
    const cv = ImgTools.fit(ch.src, 62, 62), full = h('canvas', { width: 64, height: 64 }); full.getContext('2d').drawImage(cv, 1, 2);
    const id = ImgTools.data(full), cols = ImgTools.medianCut(id, 15), pal = [0x7FFF, ...cols]; while (pal.length < 16) pal.push(0);
    ch.battle = { px: ImgTools.quantize(id, pal, 1), pal };
  }
  function makeOw() {
    const info = Objects.spriteInfo(tgtGfx);
    if (!info || info.w !== 16 || info.h !== 32) { ch.ow = null; return; }
    const cv = ImgTools.fit(ch.src, 16, 31), full = h('canvas', { width: 16, height: 32 }); full.getContext('2d').drawImage(cv, 0, 1);
    ch.ow = { px: ImgTools.quantize(ImgTools.data(full), info.pal, 1), pal: info.pal };
  }
  function writeBattle(px, pal) {
    const r = R(), T2 = TrainersTab;
    r.wptr(T2.PICS + tgtPic * 8, r.writeNew(LZ.compress(Gfx.pixelsToTiles(px, 64, 64))));
    r.wptr(T2.PALS + tgtPic * 8, r.writeNew(LZ.compress(Gfx.palBytes(pal))));
    if (tgtTrainer) r.w8(App.game.offsets.trainers + tgtTrainer * 40 + 3, tgtPic);
  }
  // all 9 frames (down, up, left + walking) get the drawing; the game mirrors "left" for "right"
  function writeOw(px) {
    const r = R(), info = Objects.spriteInfo(tgtGfx), tiles = Gfx.pixelsToTiles(px, 16, 32);
    const frames = r.writeNew(new Uint8Array(tiles.length * 9).map((_, i) => tiles[i % tiles.length]));
    const img = new Uint8Array(9 * 8), dv = new DataView(img.buffer);
    for (let k = 0; k < 9; k++) { dv.setUint32(k * 8, (0x08000000 + frames + k * 256) >>> 0, true); dv.setUint16(k * 8 + 4, 256, true); }
    const imgs = r.writeNew(img), data = r.u8.slice(info.info, info.info + 36);
    new DataView(data.buffer).setUint32(28, (0x08000000 + imgs) >>> 0, true);
    r.wptr(Objects.GFX_TABLE + tgtGfx * 4, r.writeNew(data));
    Objects.refresh();
  }
  function characterPanel(root) {
    const box = h('div', { class: 'panel' }, h('h3', {}, '🧍 ' + T('Character from a picture')),
      h('p', { class: 'muted' }, T('One drawing becomes the battle picture (64×64, its own 15 colours) and the person on the map (16×32, in the colours of the sprite it replaces). A plain background is removed. Touch up the pixels before writing.')),
      h('button', { class: 'primary', onclick: () => loadPicture(root) }, '🖼 ' + (ch ? T('Choose another picture…') : T('Choose a picture…'))));
    if (!ch) return box;
    const prevSrc = h('canvas', { width: ch.src.width, height: ch.src.height, class: 'as-src' }); prevSrc.getContext('2d').drawImage(ch.src, 0, 0);
    box.append(h('div', { class: 'muted' }, ch.name), prevSrc);
    // battle picture
    const bed = PixelEditor({ px: ch.battle.px, w: 64, h: 64, pal: ch.battle.pal, transparent: true, zoom: 5, name: 'battle' });
    const picOpts = []; for (let i = 0; i < TrainersTab.PIC_COUNT; i++) picOpts.push(T('Picture') + ' ' + i);
    const trainerOpts = [T('— no trainer —')]; for (let id = 1; id < 743; id++) { const t = Objects.trainer(id); trainerOpts.push(t ? '#' + id + ' ' + (Objects.classNames()[t.cls] || '') + ' ' + t.name : '#' + id); }
    const oldPic = TrainersTab.picCanvas(tgtPic);
    box.append(h('div', { class: 'as-sec' }, h('h4', {}, T('Battle picture')), bed.el,
      h('div', { class: 'row wrap' }, h('label', {}, T('Replaces') + ' ', makeSelect(picOpts, tgtPic, v => { tgtPic = v; render(root); })), oldPic ? (() => { const c = h('canvas', { width: 64, height: 64, class: 'pixel' }); c.getContext('2d').drawImage(oldPic, 0, 0); return c; })() : '',
        h('label', {}, T('and give it to') + ' ', makeSelect(trainerOpts, tgtTrainer, v => { tgtTrainer = v; })),
        h('button', { class: 'primary', onclick: () => { try { writeBattle(bed.px, bed.pal); toast(T('Battle picture written')); render(root); } catch (x) { toast(x.message, 'err'); } } }, '💾 ' + T('Write the battle picture')))));
    // overworld sprite
    const info = Objects.spriteInfo(tgtGfx), owBox = h('div', { class: 'as-sec' }, h('h4', {}, T('On the map')),
      h('div', { class: 'row wrap' }, h('span', {}, T('Replaces') + ': ' + Objects.gfxName(tgtGfx) + ' (' + tgtGfx + ')'), h('button', { onclick: () => Objects.gallery(tgtGfx, v => { tgtGfx = v; makeOw(); render(root); }) }, '🖼 ' + T('Change sprite…'))));
    if (!ch.ow) owBox.append(h('p', { class: 'warn' }, T('Choose a 16×32 person sprite (most people on the maps are).')));
    else {
      const oed = PixelEditor({ px: ch.ow.px, w: 16, h: 32, pal: ch.ow.pal, transparent: true, zoom: 10, name: 'overworld' });
      owBox.append(oed.el, h('p', { class: 'muted' }, Tf('The colours come from the palette this sprite shares with other people (tag {t}), so other people keep their colours.', { t: '0x' + info.tag.toString(16).toUpperCase() })),
        h('button', { class: 'primary', onclick: () => { try { writeOw(oed.px); toast(Tf('{name} now looks like the picture on every map', { name: Objects.gfxName(tgtGfx) })); render(root); } catch (x) { toast(x.message, 'err'); } } }, '💾 ' + T('Write the sprite')));
    }
    box.append(owBox);
    return box;
  }

  // ---------- title screen ----------
  async function choose(key, root) {
    const p = await Host.dialog('open', T('Choose a picture'), { filters: [[T('Pictures'), ['*.png', '*.jpg', '*.jpeg', '*.webp']]] });
    if (p) { title[key] = p; render(root); }
  }
  async function applyTitle(root) {
    if (!title.logo && !title.hero) { toast(T('Choose a logo picture or a hero picture first'), 'err'); return; }
    const tmp = Host.info.temp, inp = joinPath(tmp, 'title_in.gba'), out = joinPath(tmp, 'title_out.gba');
    App.busy(T('Drawing the title screen…'));
    try {
      await Host.writeFile(inp, R().u8);
      const sub = [title.sub1, title.sub2].map(s => s.trim()).filter(Boolean);
      const res = await Host.json('POST', '/api/tools/title', { in: inp, out, logo: title.logo || null, subtitle: sub.length ? sub : null, hero: title.hero || null, background: title.background });
      const bytes = await Host.readFile(out);
      if (bytes.length !== R().u8.length) throw new Error('size changed');
      R().write(0, bytes); MapsTab.reset(true);
      toast(T('Title screen written') + ' · ' + res.log.replace(/\n/g, ' · '));
      await preview(root);
    } catch (x) { toast(x.message, 'err'); } finally { App.busy(); }
  }
  async function preview(root) {
    const tmp = Host.info.temp, rom = joinPath(tmp, 'title_preview.gba');
    App.busy(T('Starting the game to look at the title screen…'));
    try {
      await Host.writeFile(rom, R().u8);
      const res = await Host.json('POST', '/api/tools/screenshot', { rom, frame: 1300, presses: [300, 500] });
      const png = await Host.readFile(res.png);
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
      render(root);
    } catch (x) { toast(x.message, 'err'); } finally { App.busy(); }
  }
  function titlePanel(root) {
    const pick = (key, label) => h('div', { class: 'row wrap' }, h('b', { style: { minWidth: '140px' } }, label), h('span', { class: title[key] ? '' : 'muted', dir: 'ltr' }, title[key] || T('not chosen')),
      h('button', { onclick: () => choose(key, root) }, '📁 ' + T('Choose…')), title[key] ? h('button', { class: 'mu-x', onclick: () => { title[key] = ''; render(root); } }, '✕') : '');
    const box = h('div', { class: 'panel' }, h('h3', {}, '🎬 ' + T('Title screen')),
      Host.ok ? '' : h('p', { class: 'warn' }, T('The title screen tool needs Ember Studio (the EXE or ember/server.py).')),
      h('p', { class: 'muted' }, T('The logo picture replaces the Pokémon logo (up to 60 colours, it is fitted into the logo area). The hero picture replaces Charizard (a plain background is removed). The subtitle is drawn under the logo.')),
      pick('logo', T('Logo picture')),
      h('div', { class: 'row wrap' }, h('b', { style: { minWidth: '140px' } }, T('Subtitle')), h('input', { value: title.sub1, dir: 'auto', placeholder: T('first line'), oninput: e => title.sub1 = e.target.value }), h('input', { value: title.sub2, dir: 'auto', placeholder: T('second line'), oninput: e => title.sub2 = e.target.value })),
      pick('hero', T('Hero picture')),
      h('div', { class: 'row wrap' }, h('b', { style: { minWidth: '140px' } }, T('Background')), h('select', { onchange: e => title.background = e.target.value },
        h('option', { value: 'keep', selected: title.background === 'keep' }, T('keep the fire')), h('option', { value: 'flag', selected: title.background === 'flag' }, T('the flag of Israel')))),
      h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'primary', disabled: !Host.ok, onclick: () => applyTitle(root) }, '✨ ' + T('Write the title screen')),
        h('button', { disabled: !Host.ok, onclick: () => preview(root) }, '👁 ' + T('Show the title screen (runs the game)'))),
      shotUrl ? h('img', { src: shotUrl, class: 'pixel as-shot' }) : '');
    return box;
  }

  function render(root) {
    root.innerHTML = '';
    root.append(h('div', { class: 'cols as-cols' }, characterPanel(root), titlePanel(root)));
  }
  return { render, _load: async (blob, name) => { const src = ImgTools.removeBackground(await ImgTools.load(blob)); ch = { src, name }; makeBattle(); makeOw(); } };
})();
