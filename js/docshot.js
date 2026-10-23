// Screenshots for the user guide (docs/manual/build.py): index.html?docshot=<name>&lang=he|en&project=<folder>
// opens the project, goes to that screen, then sets window.__shotReady = { clip: css selector or null }.
'use strict';

const DocShot = (() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $b = text => [...document.querySelectorAll('button')].find(b => b.textContent.includes(T(text)));
  const S = {
    home: async () => { Project.close(); App.projectUI(); App.show('home'); return null; },
    'wizard-basics': async () => { await Wizard._test.show(0); return '.wiz'; },
    'wizard-starters': async () => { await Wizard._test.show(2); return '.wiz'; },
    'wizard-gyms': async () => { await Wizard._test.show(4); return '.wiz'; },
    header: async () => { App.show('home'); return 'header'; },
    'map-editor': async () => { MapsTab.api.open(3, 0); await wait(300); return null; },
    'map-collision': async () => { MapsTab.api.open(3, 0); await wait(200); MapsTab.api.setMode('coll'); return null; },
    'map-objects': async () => { MapsTab.api.open(3, 0, { kind: 'obj', i: 0 }); return null; },
    'object-trainer': async () => { const r = App.rom, ev = MapsTab.api.readEvents(r.ptr(App.game.mapGroups[3][0] + 4)).obj; const k = ev.findIndex(e => { try { return Objects.info(3, 0, e).type === 'trainer'; } catch (x) { return false; } }); MapsTab.api.open(3, 0, { kind: 'obj', i: Math.max(0, k) }); return '.mapside'; },
    'object-item': async () => { const r = App.rom, ev = MapsTab.api.readEvents(r.ptr(App.game.mapGroups[3][0] + 4)).obj; const k = ev.findIndex(e => { try { return Objects.info(3, 0, e).type === 'item ball'; } catch (x) { return false; } }); MapsTab.api.open(3, 0, { kind: 'obj', i: Math.max(0, k) }); return '.mapside'; },
    'object-blocks': async () => { MapsTab.api.open(3, 0, { kind: 'bg', i: 0 }); await wait(400); const b = $b('Write it with blocks') || $b('Edit the blocks'); if (b) b.click(); await wait(500); return '.bl-modal'; },
    'sprite-gallery': async () => { MapsTab.api.open(3, 0, { kind: 'obj', i: 0 }); await wait(300); const b = $b('🖼 Change sprite…'); if (b) b.click(); await wait(500); return '.ob-modal'; },
    world: async () => { MapsTab.api.openWorld(); await wait(1500); const W = WorldTab._test.S, p = (W.list || []).find(q => q.k === '3.0'); if (p) { W.active = '3.0'; W.zoom = 0.6; W.panX = (p.x + 10) * 16 - W.cv.width / W.zoom / 2; W.panY = (p.y + 5) * 16 - W.cv.height / W.zoom / 2; WorldTab.render(W.root_el); } return null; },
    'world-wild': async () => { MapsTab.api.openWorld(); await wait(1500); const W = WorldTab._test.S, p = (W.list || []).find(q => q.k === '3.19'); if (p) { W.active = '3.19'; W.tab = 'wild'; W.mode = 'paint'; W.zoom = 1; W.panX = (p.x + 10) * 16 - W.cv.width / W.zoom / 2; W.panY = (p.y + 20) * 16 - W.cv.height / W.zoom / 2; WorldTab.render(W.root_el); } return null; },
    tiles: async () => { MapsTab.api.openTiles(3, 0); await wait(400); return null; },
    story: async () => { App.show('story'); await wait(300); const st = document.querySelectorAll('.st-step'); if (st[1]) st[1].click(); await wait(400); return null; },
    'story-choice': async () => { App.show('story'); await wait(300); const st = document.querySelectorAll('.st-step'); if (st[2]) st[2].click(); await wait(400); return null; },
    'story-add': async () => { App.show('story'); await wait(300); const b = document.querySelector('.st-ch .bl-add'); if (b) b.click(); await wait(300); return '.bl-pal'; },
    'block-palette': async () => { App.show('story'); await wait(300); const st = document.querySelectorAll('.st-step'); if (st[0]) st[0].click(); await wait(300); const b = document.querySelector('.st-ed .bl-add'); if (b) b.click(); await wait(300); return '.bl-pal'; },
    'story-original': async () => { App.show('story'); await wait(500); const c = [...document.querySelectorAll('.sm-beat')].find(x => /rival|יריב/i.test(x.textContent)); if (c) c.click(); await wait(500); return null; },
    'story-flow': async () => { App.show('story'); await wait(400); const b = [...document.querySelectorAll('.sm-bar button')].find(x => x.textContent.includes(T('Flowchart'))); if (b) b.click(); await wait(600); return null; },
    'story-place': async () => { StoryView.setPlace('4.3'); App.show('story'); await wait(600); return null; },
    pokemon: async () => { PokemonTab.select(152); App.show('pokemon'); await wait(500); return null; },
    gifts: async () => { App.show('pokemon'); await wait(300); const b = $b('🎁 Starters & gift Pokémon'); if (b) b.click(); await wait(500); return null; },
    trainers: async () => { TrainersTab.select(414); App.show('trainers'); await wait(800); return null; },
    items: async () => { App.show('items'); await wait(500); return null; },
    'item-icon': async () => { App.show('items'); await wait(400); const b = [...document.querySelectorAll('.tr-item')].find(x => /ULTRA|אולטרה/i.test(x.textContent)); if (b) b.click(); await wait(400); const d = document.querySelector('.tr-card details.tr-sec'); if (d) { d.open = true; d.scrollIntoView(); } await wait(300); return null; },
    legends: async () => { App.show('pokemon'); await wait(300); const b = $b('Legendaries in the world'); if (b) b.click(); await wait(500); const l = [...document.querySelectorAll('.leg-list .monrow')].find(x => /LUGIA|לוגיה/i.test(x.textContent)); if (l) l.click(); await wait(500); return null; },
    shops: async () => { App.show('items'); await wait(300); const b = $b('Shops'); if (b) b.click(); await wait(500); return null; },
    moves: async () => { MovesTab.select(53); App.show('moves'); await wait(500); return null; },
    tms: async () => { App.show('moves'); await wait(300); const b = $b('TMs, HMs & tutors'); if (b) b.click(); await wait(400); return null; },
    text: async () => { App.show('text'); await wait(300); const b = $b('Scan ROM for text'); if (b) b.click(); await wait(6000); return null; },
    hebrew: async () => { App.show('hebrew'); await wait(500); return null; },
    graphics: async () => { App.show('graphics'); await wait(500); return null; },
    character: async () => { const blob = await (await fetch('docs/manual/assets/hero.png')).blob(); await ArtStudio._load(blob, 'hero.png'); App.show('graphics'); await wait(200); const b = $b('🧍 Characters & title screen'); if (b) b.click(); await wait(500); return null; },
    music: async () => { App.show('music'); await wait(1500); return null; },
    doctor: async () => { App.show('doctor'); await wait(1500); return null; },
    // the scene editor with the "a legendary arrives" template, the playhead on the legendary's walk (not saved in the project)
    scene: async () => {
      const st = { id: 'docshot', type: 'cutscene', title: T('A legendary arrives'), trig: 'arrive', g: 3, n: 0, blocks: [] }, sc = Cutscene.scene(st), pl = sc.actors.find(a => a.kind === 'player'); pl.x = 12; pl.y = 12;
      const ed = Cutscene.open(st, {}); await wait(300);
      const b = [...document.querySelectorAll('.cs-templates button')].find(x => x.textContent.startsWith('🐉')); if (b) b.click(); await wait(300);
      ed.E.t = 7; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); await wait(300);
      return null;
    },
    emulator: async () => { MapsTab.api.open(3, 0); await Emu.playFrom({ g: 3, n: 0, x: 10, y: 12, team: Emu.team(), label: '3.0 (10, 12)' }); await wait(4000); return null; },
  };
  // the guide is public: personal folders become generic ones
  function scrub() {
    const fix = t => t.replace(/[A-Z]:\\GBA\\projects\\/g, 'C:\\Users\\you\\Documents\\Ember Studio\\')
      .replace(/[A-Z]:\\GBA\\/g, 'C:\\Games\\').replace(/C:\\Users\\(?!you\\)[^\\]+\\/g, 'C:\\Users\\you\\')
      .replace(/docs_he/g, 'הרפתקת הגחלת').replace(/docs_en/g, 'Ember Quest');
    document.querySelectorAll('.recent > *').forEach(e => { if (/AppData|KacholLavan/.test(e.textContent)) e.remove(); });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { const t = fix(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
    document.querySelectorAll('input').forEach(i => { const t = fix(i.value); if (t !== i.value) i.value = t; });
  }
  async function run(q) {
    const name = q.get('docshot'), dir = q.get('project');
    try {
      if (dir && name !== 'home' && !name.startsWith('wizard')) await Project.open(dir);
      else if (dir && name.startsWith('wizard')) { /* the wizard is shown over the home screen */ }
      const clip = await S[name]();
      await wait(600);
      document.querySelectorAll('.toast, #toast').forEach(t => t.style.display = 'none');
      scrub();
      window.__shotReady = { clip: clip || null, missing: [...I18N.missing] };
    } catch (e) { console.error(e); window.__shotReady = { error: e.message }; }
  }
  return { run, names: Object.keys(S) };
})();
