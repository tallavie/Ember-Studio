// Kachol-Lavan story helpers for the browser console (load: eval(new TextDecoder().decode(await Host.readFile(path))))
//   KL.d(paras)            the same for Script.C.msg (encodeDialogue): lines joined, boxes by newline
//   KL.fmt(paras)          paragraphs [[line, line, line], ...] -> the editor's text format (\n, \l, \p)
//   KL.texts(re)           all ROM texts whose current text matches re -> [{off, cur, refs}]
//   KL.set(off, paras)     rewrite a text (moved to free space when longer; pointers follow); returns the new offset
//   KL.map(g, n)           map header offset;  KL.events(g, n) -> {obj, warp, coord, bg} with offsets
//   KL.obj(g, n, i)        an object's fields {id, gfx, x, y, script, flag, off}
//   KL.compile(blocks, ctx) -> {off} script written to free space (Script.compile)
window.KL = (() => {
  const R = () => App.rom;
  const fmt = paras => paras.map(p => p.map((l, i) => l + (i < p.length - 1 ? (i === 0 ? '\\n\n' : '\\l\n') : '')).join('')).join('\\p\n');
  // for Script.C.msg / TextTab.encodeDialogue (it wraps by itself; a real newline = a new box): never pass fmt() there
  const d = paras => paras.map(p => p.join(' ')).join('\n');
  let cache = null;
  async function texts(re) { if (!cache) cache = await TextTab.scanRom(); return cache.filter(t => re.test(t.cur || '')); }
  function set(off, paras) { cache = null; return TextTab.saveAt(off, typeof paras === 'string' ? paras : fmt(paras)); }
  const map = (g, n) => App.game.mapGroups[g][n];
  const events = (g, n) => MapsTab.api.readEvents(R().ptr(map(g, n) + 4));
  function obj(g, n, i) {
    const r = R(), o = events(g, n).obj[i].off;
    return { off: o, id: r.u8[o], gfx: r.u8[o + 1], x: r.r16(o + 4), y: r.r16(o + 6), script: r.ptr(o + 16), flag: r.r16(o + 20) };
  }
  function objs(g, n) { return events(g, n).obj.map((_, i) => obj(g, n, i)); }
  function compile(blocks, ctx = { kind: 'object' }) { return Script.compile(blocks, ctx).write(); }
  async function save(build = false) { R().changed && R().changed(); await Project.save(); if (build) await Project.build(); }
  async function png(cv, path) {
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    await Host.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  }
  return { fmt, d, texts, set, map, events, obj, objs, compile, save, png };
})();
window.savePng = KL.png;
'KL ready';
