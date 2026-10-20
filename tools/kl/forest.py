# Rosh HaAyin grows to the west (forest edge + path) and a new map "יער ראש העין" with tall grass:
# wild Ekans and Poochyena. The path into the forest is blocked by a trigger until you have a Pokémon.
import struct, os
import newmap
from newmap import grass

SHIFT = 10                     # new columns added on the west side of Rosh HaAyin
EAST = 8                       # and on the east side, so the lab is out of view from מגדל צדק
SAND = 0x0D9                   # primary forest dirt: paths (neighbour maps are drawn with OUR tilesets, so only primary tiles near borders)
W, H = 32, 20                  # forest map: big trees x 0-23, pines (shared tiles, seen from the town) x 24-31
PRIM, SEC = 0x2D4B04, 0x2D4E34  # general primary + Viridian Forest secondary (big trees, tall grass)
MAPSEC = 0x9C                  # unused "SEVII ISLE 7" slot, renamed to יער ראש העין
PATH_ROWS = (15, 16)
EKANS, POOCHYENA = 23, 286
TALL_GRASS = 0x0D


# ---------- Rosh HaAyin: widen to the west ----------
def widen_pallet(rom):
    h = rom.map_header(3, 0)
    lay = rom.ptr(h)
    w, hh, blocks = rom.r32(lay), rom.r32(lay + 4), rom.ptr(lay + 12)
    old = [[rom.r16(blocks + (y * w + x) * 2) for x in range(w)] for y in range(hh)]
    nw = w + SHIFT + EAST
    west = [[SAND | 3 << 12] * SHIFT for _ in range(hh)]
    east = [[SAND | 3 << 12] * EAST for _ in range(hh)]
    pw = lambda grid: (lambda x, y, mt, c: grid[y].__setitem__(x, mt | c << 10 | 3 << 12))
    pine_block(pw(west), 0, SHIFT - 1, 0, 14, trunk=True)                 # path on rows 15-16
    pine_block(pw(west), 0, SHIFT - 1, 18, hh - 1, top=True, caps=True)   # row 17: walkable tree tips
    pine_block(pw(east), 0, EAST - 1, 0, 8, trunk=True)                   # path on rows 9-10
    pine_block(pw(east), 0, EAST - 1, 12, hh - 1, top=True, caps=True)    # row 11: tips
    new = [west[y] + old[y] + east[y] for y in range(hh)]
    nb = rom.write_new(b''.join(struct.pack('<H', v) for row in new for v in row))
    data = bytearray(rom.u8[lay:lay + 28])
    struct.pack_into('<II', data, 0, nw, hh)
    struct.pack_into('<I', data, 12, 0x08000000 + nb)
    nl = rom.write_new(bytes(data))
    rom.wptr(h, nl)
    lid = rom.r16(h + 18)
    rom.wptr(newmap.LAYOUTS + (lid - 1) * 4, nl)
    # events move with the map
    E = rom.map_events(h)
    for kind, off in (('obj', 4), ('warp', 0), ('coord', 0), ('bg', 0)):
        for o in E[kind]: rom.w16(o + off, rom.s16(o + off) + SHIFT)
    # scripts / tables with absolute Rosh HaAyin coordinates
    for x_off in (0x16552C, 0x165538):           # setobjectxyperm in the town's on-transition script
        rom.w16(x_off, rom.r16(x_off) + SHIFT)
    rom.w16(0x3EEC6A, rom.r16(0x3EEC6A) + SHIFT)  # heal / fly location
    # connections: our up/down offsets grow, the neighbours' offsets back to us shrink
    con = rom.ptr(h + 12); cp = rom.ptr(con + 4)
    for i in range(rom.r32(con)):
        e = cp + i * 12
        d, off, g, m = rom.r32(e), struct.unpack_from('<i', rom.u8, e + 4)[0], rom.u8[e + 8], rom.u8[e + 9]
        if d in (1, 2):
            struct.pack_into('<i', rom.u8, e + 4, off + SHIFT)
            oh = rom.map_header(g, m); oc = rom.ptr(oh + 12); ocp = rom.ptr(oc + 4)
            for j in range(rom.r32(oc)):
                f = ocp + j * 12
                if rom.u8[f + 8] == 3 and rom.u8[f + 9] == 0:
                    struct.pack_into('<i', rom.u8, f + 4, struct.unpack_from('<i', rom.u8, f + 4)[0] - SHIFT)
    return nw


# ---------- forest map ----------
def tree(x, y): return [0x298, 0x299, 0x29A][x % 3] if y % 2 == 0 else [0x290, 0x291, 0x292][x % 3]


def pine(x, y):
    """plain pine tile inside a forest (14/15 over 1C/1D)"""
    return (0x14 if x % 2 == 0 else 0x15) if y % 2 == 0 else (0x1C if x % 2 == 0 else 0x1D)


PINE = {'14': (0x14, 0x15), '1C': (0x1C, 0x1D), 'top': (0x1E, 0x1F), 'trunk': (0x24, 0x25), 'cap': (0x0E, 0x0F)}
EDGE_L = {0x14: 0x16, 0x1C: 0x1E, 0x24: 0x26, 0x1E: 0x1E, 0x0E: 0x0E}     # grass on the left of the block
EDGE_R = {0x15: 0x17, 0x1D: 0x1F, 0x25: 0x27, 0x1F: 0x1F, 0x0F: 0x0F}     # grass on the right of the block


def pine_block(put, x0, x1, ya, yb, top=False, trunk=False, caps=False, edge_l=(), edge_r=()):
    """A wall of pines like FireRed's routes: [caps row above (walkable tips)] top row 1E/1F, then 14/15 and 1C/1D
    alternating, the last canopy row is always 1C/1D, then a trunk row 24/25 (blocked). Width must be even.
    edge_l / edge_r: rows where open ground touches the block's left / right side."""
    rows = list(range(ya, yb + 1))
    kinds = {}
    if trunk:
        kinds[yb] = 'trunk'
        for r in rows[:-1]: kinds[r] = '1C' if (yb - 1 - r) % 2 == 0 else '14'
        if top: kinds[ya] = 'top'
    else:
        for i, r in enumerate(rows): kinds[r] = ('top' if i == 0 else '14' if i % 2 == 1 else '1C') if top else ('14' if i % 2 == 0 else '1C')
    if caps: kinds[ya - 1] = 'cap'
    for r, k in kinds.items():
        for x in range(x0, x1 + 1):
            t = PINE[k][(x - x0) % 2]
            if x == x0 and r in edge_l: t = EDGE_L.get(t, t)
            if x == x1 and r in edge_r: t = EDGE_R.get(t, t)
            put(x, r, t, 0 if k == 'cap' else 1)


BIG_W = 24


def blocks():
    """Viridian-Forest style: 3x2 trees; tree areas end in a 2A0-2A2 row + trunk row (2A3-2A5) above open ground,
    and start with 288/299/28A (+ 284 tip on the grass row above). Open areas: x0 % 3 == 0, x1 % 3 == 2, y0/y1 odd."""
    g = [[0] * W for _ in range(H)]
    put = lambda x, y, mt, c=1: g[y].__setitem__(x, mt | c << 10 | 3 << 12)
    open_ = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(BIG_W): put(x, y, tree(x, y))
    pine_block(put, BIG_W, W - 1, 0, 14, trunk=True, edge_l=range(5, 15))
    pine_block(put, BIG_W, W - 1, 18, H - 1, top=True, caps=True)
    def clearing(x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): open_[y][x] = True
    clearing(3, 5, 23, 17)                         # main clearing (big-tree part)
    for y in PATH_ROWS + (17,):                    # path (+ tips row) through the pines to the town
        for x in range(BIG_W, W): open_[y][x] = True
    # tree clusters standing inside the clearing: top row even (288/299/28A), trunk row even
    clusters = [(9, 6, 11, 10), (15, 12, 17, 16), (21, 6, 23, 10)]
    for x0, y0, x1, y1 in clusters:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): open_[y][x] = False
    for y in range(H):
        for x in range(W):
            if open_[y][x] and not (x >= BIG_W and y == 17): put(x, y, grass(x, y), 0)
    for x in range(3, BIG_W):
        # bottom of the tree mass above the main clearing: 2A0-2A2 row (y 3) + trunk row (y 4)
        if open_[5][x]: put(x, 3, [0x2A0, 0x2A1, 0x2A2][x % 3]); put(x, 4, [0x2A3, 0x2A4, 0x2A5][x % 3])
        # top of the tree mass below the clearing (y 18): 288/299/28A, tip 284 on the grass row above
        if open_[17][x]: put(x, 18, [0x288, 0x299, 0x28A][x % 3]); (x % 3 == 1) and put(x, 17, 0x284, 0)
    for x0, y0, x1, y1 in clusters:
        for x in range(x0, x1 + 1):
            put(x, y0, [0x288, 0x299, 0x28A][x % 3])
            if x % 3 == 1: put(x, y0 - 1, 0x284, 0)
            put(x, y1 - 1, [0x2A0, 0x2A1, 0x2A2][x % 3]); put(x, y1, [0x2A3, 0x2A4, 0x2A5][x % 3])
    for y in range(5, 18):                         # right edge of the tree wall left of the clearing
        if y % 2 == 1: put(2, y, 0x2A2)
    # tall grass (wild Pokémon)
    for x0, y0, x1, y1 in ((4, 11, 8, 15), (12, 5, 14, 9), (18, 7, 20, 11), (4, 6, 7, 8), (19, 13, 23, 16)):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if open_[y][x] and (g[y][x] & 0x3FF) != 0x284: put(x, y, TALL_GRASS, 0)
    for y in PATH_ROWS:                            # dirt path from the clearing to the town
        for x in range(20, W): put(x, y, SAND, 0)
    return [v for row in g for v in row]


def add_wild(rom, group, num, mons):
    """append a grass encounter table for a map. mons: 12 x (min, max, species)"""
    wt = find_wild(rom)
    n = 0
    while rom.u8[wt + n * 20] != 0xFF: n += 1
    ml = rom.write_new(b''.join(struct.pack('<BBH', a, b, s) for a, b, s in mons))
    info = rom.write_new(struct.pack('<BxxxI', 20, 0x08000000 + ml))
    entry = struct.pack('<BBHIIII', group, num, 0, 0x08000000 + info, 0, 0, 0)
    table = bytes(rom.u8[wt:wt + n * 20]) + entry + bytes(rom.u8[wt + n * 20:wt + n * 20 + 20])
    new = rom.write_new(table)
    for p in rom.find_ptrs(wt, True): rom.wptr(p, new)


def find_wild(rom):
    for x in range(0x3C0000, 0x3D0000, 4):
        ok = True
        for k in range(8):
            e = x + k * 20
            if rom.u8[e] > 60: ok = False; break
            ps = [rom.ptr(e + 4 + j * 4) for j in range(4)]
            if not any(p >= 0 for p in ps) or any(rom.r32(e + 4 + j * 4) and (p < 0 or rom.u8[p] > 100) for j, p in enumerate(ps)):
                ok = False; break
        if ok: return x
    raise RuntimeError('wild table not found')


def add_block_trigger(rom, encode):
    """coord events on the forest path (west of the rock ridge): pushed back until the player has a Pokémon"""
    h = rom.map_header(3, 0)
    ev = rom.ptr(h + 4)
    text = rom.write_new(encode('יש פה שלט: ״יער ראש העין - פוקימוני פרא! אסור להיכנס בלי פוקימון.״\\pכדאי ללכת קודם למעבדה של פרופסור זליכה.'))
    move = rom.write_new(bytes([0x13, 0xFE]))     # walk right, end
    sc = rom.write_new(bytes([0x69, 0x0F, 0x00]) + struct.pack('<I', 0x08000000 + text) + bytes([0x09, 0x04, 0x68, 0x4F, 0xFF, 0x00])
                       + struct.pack('<I', 0x08000000 + move) + bytes([0x51, 0x00, 0x00, 0x6B, 0x02]))
    cnt, cp = rom.u8[ev + 2], rom.ptr(ev + 12)
    items = bytes(rom.u8[cp:cp + cnt * 16]) if cnt else b''
    for y in PATH_ROWS:                           # var 0x4050 stays 0 until Zelekha brings you to the lab
        items += struct.pack('<hhBBHHHI', SHIFT + 1, y, 3, 0, 0x4050, 0, 0, 0x08000000 + sc)
    rom.u8[ev + 2] = cnt + len(PATH_ROWS)
    rom.wptr(ev + 12, rom.write_new(items))


def build(rom, encode):
    border = [pine(0, 0) | 1 << 10 | 3 << 12, pine(1, 0) | 1 << 10 | 3 << 12, pine(0, 1) | 1 << 10 | 3 << 12, pine(1, 1) | 1 << 10 | 3 << 12]
    lay, lay_id = newmap.add_layout(rom, W, H, blocks(), PRIM, SEC, border)
    sign_text = rom.write_new(encode('יער ראש העין\\nזהירות, פוקימוני פרא בעשב הגבוה!'))
    ev = newmap.add_events(rom, objects=[], signs=[(29, 14, newmap.msgbox_script(rom, sign_text, 3))],
                           template_obj=rom.map_events(rom.map_header(3, 0))['obj'][0])
    route1 = rom.map_header(3, 19)
    hdr = bytearray(rom.u8[route1:route1 + 28])
    struct.pack_into('<IIII', hdr, 0, 0x08000000 + lay, 0x08000000 + ev, 0x08000000 + rom.write_new(b'\x00'), 0)
    struct.pack_into('<H', hdr, 18, lay_id)
    hdr[20] = MAPSEC
    h = rom.write_new(bytes(hdr))
    num = newmap.add_to_group(rom, 3, h)
    newmap.add_connection(rom, h, 'right', 0, 3, 0)
    newmap.add_connection(rom, rom.map_header(3, 0), 'left', 0, 3, num)
    mons = [(2, 3, POOCHYENA), (2, 3, EKANS), (3, 4, POOCHYENA), (3, 4, EKANS), (2, 4, POOCHYENA), (2, 4, EKANS),
            (3, 5, POOCHYENA), (3, 5, EKANS), (4, 5, POOCHYENA), (4, 5, EKANS), (5, 5, POOCHYENA), (5, 5, EKANS)]
    add_wild(rom, 3, num, mons)
    add_block_trigger(rom, encode)
    return num
