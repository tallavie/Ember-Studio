# Turns the Israel town-map picture (israel_map_draw.py, 240x160) into the game's region-map graphics: 4bpp tiles
# (same flips merged), a 30x20 tilemap and four 15-colour palettes - the same shape as FireRed's own Kanto map
# (320 tiles, palettes 0-3), so it drops into the same slots. Writes a .json the editor reads (tiles / tilemap /
# palette as hex) and a preview rebuilt from the tiles.
#   python israel_townmap.py picture.png out.json preview.png
import json, sys
from PIL import Image

MAX_TILES, NPAL = 320, 4

def rgb555(c): return (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10)

def main(src, out, prev):
    img = Image.open(src).convert('RGB')
    assert img.size == (240, 160), img.size
    px = img.load()
    # colours as GBA colours (5 bits each): nearby shades merge
    cells = []
    for ty in range(20):
        for tx in range(30):
            cells.append([[rgb555(px[tx * 8 + x, ty * 8 + y]) for x in range(8)] for y in range(8)])
    # palettes: tiles whose colours fit join a palette, biggest colour sets first
    sets = [frozenset(c for row in t for c in row) for t in cells]
    pals = []
    for s in sorted(set(sets), key=len, reverse=True):
        for p in pals:
            if s <= p or len(p | s) <= 15:
                p |= s; break
        else:
            pals.append(set(s))
    if len(pals) > NPAL: raise SystemExit('needs %d palettes (max %d): simplify the picture' % (len(pals), NPAL))
    pal_list = [sorted(p) for p in pals]
    # tiles
    tiles, index, tm = [], {}, []
    for t, s in zip(cells, sets):
        pi = next(i for i, p in enumerate(pals) if s <= p)
        lut = {c: pal_list[pi].index(c) + 1 for c in pal_list[pi]}      # colour 0 stays transparent
        rows = tuple(tuple(lut[c] for c in row) for row in t)
        found = None
        for hf in (0, 1):
            for vf in (0, 1):
                v = rows[::-1] if vf else rows
                v = tuple(r[::-1] for r in v) if hf else v
                if v in index: found = (index[v], hf, vf); break
            if found: break
        if not found:
            index[rows] = len(tiles); tiles.append(rows); found = (len(tiles) - 1, 0, 0)
        i, hf, vf = found
        tm.append(i | (hf << 10) | (vf << 11) | (pi << 12))
    if len(tiles) > MAX_TILES: raise SystemExit('%d tiles (max %d): simplify the picture' % (len(tiles), MAX_TILES))
    gfx = bytearray()
    for t in tiles:
        for row in t:
            for x in range(0, 8, 2): gfx.append(row[x] | (row[x + 1] << 4))
    gfx += bytes(32 * (MAX_TILES - len(tiles)))
    palette = []
    for p in pal_list: palette += [0] + p + [0] * (15 - len(p))
    palette += [0] * (16 * NPAL - len(palette))
    json.dump({'tiles': gfx.hex(), 'tilemap': tm, 'palette': palette, 'count': len(tiles)}, open(out, 'w'))
    # preview from the tiles
    im = Image.new('RGB', (240, 160))
    for k, e in enumerate(tm):
        t, hf, vf, pi = tiles[e & 0x3FF], (e >> 10) & 1, (e >> 11) & 1, e >> 12
        for y in range(8):
            for x in range(8):
                c = palette[pi * 16 + t[7 - y if vf else y][7 - x if hf else x]]
                im.putpixel(((k % 30) * 8 + x, (k // 30) * 8 + y), ((c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3))
    im.resize((480, 320), Image.NEAREST).save(prev)
    print('%d tiles, %d palettes (%s colours)' % (len(tiles), len(pals), '/'.join(str(len(p)) for p in pals)))

if __name__ == '__main__':
    main(*sys.argv[1:4])
