// Kachol-Lavan: writes the Israel town map into the open project (run inside Ember Studio, like israel_world.js):
// the graphics from data/israel_townmap.json (israel_townmap.py), the section grid from data/israel_map.json
// (which game map each cell shows, a city's dot, a road's box for the player marker), and locks the town map so
// later world edits do not redraw it.
(async () => {
  const r = App.rom, g = App.game, d = TOWNMAP_DATA, W = 22, H = 15, NONE = 0xC5, pc = typeof Project.cur === 'function' ? Project.cur() : Project.cur, dir = pc.dir;
  const SEC = k => { const [a, b] = k.split('.').map(Number); return r.u8[g.mapGroups[a][b] + 20]; };
  const tmj = await Host.readJSON(dir + '\\data\\israel_townmap.json'), lay = await Host.readJSON(dir + '\\data\\israel_map.json');
  const CITY = { rosh_haayin: '3.0', ashdod: '3.5', beer_sheva: '3.1', eilat: '3.8', dead_sea: '3.4', tiberias: '3.7', nazareth: '3.6', haifa: '3.3', raanana: '3.11', tel_aviv: '3.2', jerusalem: '3.9' };
  // places of the story on the map, and the post-game places that sit on a road (they get their own names later)
  const PLACE = { masada: '1.90', hula: '1.63', carmel: '1.72', ramon: '1.81', shaar_hagai: '1.39' };
  // the seven islands became places in Israel: the island town on its cell (a dot, a Fly point), its paths and caves
  // share the cell (where the player marker goes)
  const ISLAND = { kinneret: [0x8F, 0x96, 0x97, 0xAF, 0xC3], upper_galilee: [0x90, 0x98], golan: [0x91, 0x99, 0x9A, 0xB0, 0xB9], hermon: [0x92, 0xB1],
    caesarea: [0x93, 0x9F, 0xA0, 0xA1, 0xA2, 0xB2], beit_shean: [0x95, 0xA3, 0xA4, 0xA5, 0xA6, 0xB4], ein_avdat: [0x94, 0xA7, 0xA8, 0xA9, 0xAA, 0xB3, 0xB8, 0xBA] };
  // each road of the picture: the game maps along it, in order
  const ROAD = { 'כביש 4': ['3.19'], 'כביש 40 צפון': ['3.29', '1.0', '3.20'], 'כביש 40': ['3.28'], 'כביש 90 ערבה': ['3.33', '3.32', '3.31', '3.30'], 'בקעת הירדן': ['3.68', '3.69'],
    'כביש 77': ['3.70'], 'כביש 75': ['3.27'], 'כביש החוף': ['3.23'], 'כביש 4 מרכז': ['3.24'], 'כביש 1': ['3.21', '3.22', '3.41', '3.42'], 'כביש 5': ['3.67'], 'כביש 75 כרמל': ['3.27'], 'כביש 90 צפון': ['1.63'] };
  const grid = Array.from({ length: H }, () => new Array(W).fill(NONE)), cellsOf = new Map(), townOf = new Map();
  const put = (x, y, sec) => { if (x < 0 || y < 0 || x >= W || y >= H) return; grid[y][x] = sec; (cellsOf.get(sec) || cellsOf.set(sec, []).get(sec)).push([x, y]); };
  for (const rd of lay.roads) { const ks = ROAD[rd.name]; if (!ks) continue; rd.cells.forEach((c, i) => put(c[0], c[1], SEC(ks[Math.min(ks.length - 1, Math.floor(i * ks.length / rd.cells.length))]))); }
  for (const p of lay.places) {
    if (lay.share[p.key]) continue;
    if (ISLAND[p.key]) { const [town, ...rest] = ISLAND[p.key]; put(p.cell[0], p.cell[1], town); townOf.set(town, p.cell); for (const s of rest) { cellsOf.set(s, [p.cell.slice()]); townOf.set(s, p.cell); } continue; }
    const k = CITY[p.key] || PLACE[p.key]; if (!k) continue; const s = SEC(k); put(p.cell[0], p.cell[1], s); if (CITY[p.key]) townOf.set(s, p.cell);
  }
  // the Kinneret water route keeps its box on the Kinneret (its cell now shows the town)
  cellsOf.set(SEC('3.37'), [lay.places.find(p => p.key === 'kinneret').cell.slice()]);
  // the player marker on a road can land anywhere in the road's box: empty cells in a road's box show that road
  for (const rd of lay.roads) {
    const ks = ROAD[rd.name]; if (!ks) continue;
    for (const k of ks) {
      const s = SEC(k), cs = cellsOf.get(s); if (!cs || townOf.has(s)) continue;
      const x0 = Math.min(...cs.map(p => p[0])), y0 = Math.min(...cs.map(p => p[1])), x1 = Math.max(...cs.map(p => p[0])), y1 = Math.max(...cs.map(p => p[1]));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grid[y][x] === NONE) grid[y][x] = s;
    }
  }
  // the grid (map layer + an empty dungeon layer)
  const gb = new Uint8Array(W * H * 2).fill(NONE); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gb[y * W + x] = grid[y][x]; r.write(d.grid, gb);
  // a map of a road that got no cell of its own (short roads, more maps than cells): it still needs a box for the
  // player marker - its share of the road's cells, or the cells of the two places the road joins
  const cellOfPlace = Object.fromEntries(lay.places.map(p => [p.key, p.cell]));
  for (const rd of lay.roads) {
    const ks = ROAD[rd.name]; if (!ks) continue;
    ks.forEach((k, j) => {
      const s = SEC(k); if (cellsOf.has(s)) return;
      const n = rd.cells.length, part = n ? [rd.cells[Math.min(n - 1, Math.floor(j * n / ks.length))]] : [cellOfPlace[rd.stops[0]], cellOfPlace[rd.stops[rd.stops.length - 1]]];
      cellsOf.set(s, part.map(c => c.slice()));
    });
  }
  // corners / sizes: a city is its dot, a road the box of its cells
  const boxes = [];
  for (const [s, cs] of cellsOf) {
    const pts = townOf.has(s) ? [townOf.get(s)] : cs, x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), x1 = Math.max(...pts.map(p => p[0])), y1 = Math.max(...pts.map(p => p[1]));
    const c = new Uint8Array(8), dv = new DataView(c.buffer); dv.setUint16(0, x0, true); dv.setUint16(2, y0, true); dv.setUint16(4, x1 - x0 + 1, true); dv.setUint16(6, y1 - y0 + 1, true);
    r.write(d.corners + (s - 0x58) * 4, c.slice(0, 4)); r.write(d.dims + (s - 0x58) * 4, c.slice(4)); boxes.push(s.toString(16) + ' ' + x0 + ',' + y0 + ' ' + (x1 - x0 + 1) + 'x' + (y1 - y0 + 1));
  }
  // graphics: tiles and tilemap in new space (repointed), the four palettes in place
  const hexb = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
  const gfx = r.writeNew(LZ.compress(hexb(tmj.tiles))); for (const p of r.findPointers(r.ptr(0xC0344), true)) r.wptr(p, gfx);
  const pb = new Uint8Array(128), pv = new DataView(pb.buffer); tmj.palette.forEach((c, i) => pv.setUint16(i * 2, c, true)); r.write(d.pal, pb);
  const raw = new Uint8Array(1200); tmj.tilemap.forEach((e, i) => { raw[i * 2] = e & 255; raw[i * 2 + 1] = e >> 8; });
  const tm = r.writeNew(LZ.compress(raw)); for (const p of r.findPointers(r.ptr(d.tilemap_ref), true)) r.wptr(p, tm);
  if (r.u8[d.sevii_cmp] === 0x8E && r.u8[d.sevii_cmp + 1] === 0x28) r.w8(d.sevii_cmp, 0xFF);    // always the main map
  Project.setData('townmap', { locked: true, source: 'tools/kl/israel_townmap.py + israel_townmap_write.js' });
  window._townBoxes = boxes;
})();
