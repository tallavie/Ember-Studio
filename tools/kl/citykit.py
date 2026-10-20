# Rebuilding FireRed towns as new Israeli cities: same map size and connections, new layout.
# A city is composed from: ground, autotiled areas (roads, sand, water - edge rules learned from the original maps),
# pine walls, building stamps cut from original maps (doors carry their warps), people and signs.
import struct, random
from collections import Counter, deque
import newmap
from forest import pine_block

GRASS = (0x001, 0x001, 0x001, 0x008, 0x009, 0x010, 0x011)


def cellv(mt, coll=0, elev=3): return mt | coll << 10 | elev << 12


class Grid:
    def __init__(self, rom, g, n):
        self.rom, self.g, self.n = rom, g, n
        self.h = rom.map_header(g, n)
        lay = rom.ptr(self.h)
        self.lay, self.W, self.H = lay, rom.r32(lay), rom.r32(lay + 4)
        b = rom.ptr(lay + 12)
        self.c = [[rom.r16(b + (y * self.W + x) * 2) for x in range(self.W)] for y in range(self.H)]
        self.prim, self.sec = rom.ptr(lay + 16), rom.ptr(lay + 20)

    def mt(self, x, y): return self.c[y][x] & 0x3FF
    def inb(self, x, y): return 0 <= x < self.W and 0 <= y < self.H


# ---------- autotile: learn which metatile goes with which neighbourhood ----------
DIRS = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]


def norm_key(bits):
    """8 neighbour bits (NW N NE W E SW S SE); a diagonal only matters when both its orthogonals are set"""
    nw, n, ne, w, e, sw, s, se = bits
    return (nw and n and w, n, ne and n and e, w, e, sw and s and w, s, se and s and e)


class Autotile:
    def __init__(self, family, also=()):
        self.family, self.also = set(family), set(also)
        self.rules, self.center = {}, None

    def learn(self, grid, rect=None):
        x0, y0, x1, y1 = rect or (0, 0, grid.W - 1, grid.H - 1)
        isf = lambda x, y: (not grid.inb(x, y)) or grid.mt(x, y) in self.family or grid.mt(x, y) in self.also
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if grid.mt(x, y) not in self.family or grid.c[y][x] >> 10 & 3: continue
                k = norm_key(tuple(isf(x + dx, y + dy) for dx, dy in DIRS))
                self.rules.setdefault(k, Counter())[grid.c[y][x]] += 1
        return self

    def pick(self, key):
        key = norm_key(key)
        if key in self.rules: return self.rules[key].most_common(1)[0][0]
        best, bs = None, -1                 # nearest learned neighbourhood (orthogonals weigh more)
        for k, cnt in self.rules.items():
            s = sum((3 if i in (1, 3, 4, 6) else 1) * (a == b) for i, (a, b) in enumerate(zip(k, key)))
            if s > bs: best, bs = cnt, s
        return best.most_common(1)[0][0]


# ---------- the city being built ----------
class City:
    def __init__(self, rom, orig, g, n, sec_from=None, seed=1):
        self.rom, self.orig = rom, orig
        self.base = Grid(rom, g, n)
        self.W, self.H, self.g, self.n = self.base.W, self.base.H, g, n
        self.sec = Grid(orig, *sec_from).sec if sec_from else self.base.sec
        self.c = [[0] * self.W for _ in range(self.H)]
        self.rnd = random.Random(seed)
        self.E = rom.map_events(self.base.h)
        self.new_objs, self.new_signs, self.notes = [], [], []
        self.border = None
        self.ground()

    # --- painting ---
    def put(self, x, y, v):
        if 0 <= x < self.W and 0 <= y < self.H: self.c[y][x] = v

    def ground(self, rect=None, tiles=GRASS):
        x0, y0, x1, y1 = rect or (0, 0, self.W - 1, self.H - 1)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.put(x, y, cellv(self.rnd.choice(tiles)))

    def fill(self, x0, y0, x1, y1, mt, coll=0, elev=3):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.put(x, y, cellv(mt, coll, elev))

    def keep(self, x0, y0, x1, y1):
        """copy a rectangle of the original map unchanged (e.g. a connection corridor that scripts depend on)"""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.c[y][x] = self.base.c[y][x]

    def keep_if(self, x0, y0, x1, y1, mts):
        """restore original cells inside the rectangle whose metatile is in mts (e.g. deep water at the edge)"""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.base.mt(x, y) in mts: self.c[y][x] = self.base.c[y][x]

    def pines(self, x0, x1, ya, yb, **kw):
        pine_block(lambda x, y, mt, c: self.put(x, y, cellv(mt, c)), x0, x1, ya, yb, **kw)

    def area(self, tile, mask_cells, ctx=()):
        """autotile a set of cells with an Autotile (roads, sand, water). ctx: extra cells that count as the same
        area for the edges but are not painted (e.g. the part of a road kept from the original map)"""
        S = set(mask_cells)
        F = S.union(ctx)
        for (x, y) in S:
            key = tuple(((x + dx, y + dy) in F) or not (0 <= x + dx < self.W and 0 <= y + dy < self.H) for dx, dy in DIRS)
            self.put(x, y, tile.pick(key))

    def cells_of(self, family, rect):
        """cells inside rect whose current metatile is in family (for ctx=)"""
        x0, y0, x1, y1 = rect
        return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if (self.c[y][x] & 0x3FF) in family]

    @staticmethod
    def rects(*rs):
        return [(x, y) for x0, y0, x1, y1 in rs for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]

    def stamp(self, st, x, y, warps=()):
        """paste a stamp (see STAMPS); warps[i] = index of the map warp that sits on the stamp's i-th door"""
        src = Grid(self.orig, *st['map'])
        x0, y0, x1, y1 = st['rect']
        skip = set(st.get('skip', GRASS))
        for yy in range(y0, y1 + 1):
            for xx in range(x0, x1 + 1):
                v = src.c[yy][xx]
                if (v & 0x3FF) in skip and (v >> 10 & 3) == 0: continue
                self.put(x + xx - x0, y + yy - y0, v)
        for i, wi in enumerate(warps):
            dx, dy = st['doors'][i]
            self.move_warp(wi, x + dx, y + dy)

    # --- events ---
    def move_warp(self, i, x, y):
        o = self.E['warp'][i]; self.rom.w16(o, x); self.rom.w16(o + 2, y)

    def move_obj(self, i, x, y, mv=None):
        """i = local id (1-based, as scripts use it)"""
        o = self.E['obj'][i - 1]; self.rom.w16(o + 4, x); self.rom.w16(o + 6, y)
        if mv is not None: self.rom.u8[o + 9] = mv

    def obj_script(self, i, text, std=2):
        o = self.E['obj'][i - 1]
        self.rom.wptr(o + 16, newmap.msgbox_script(self.rom, self.text(text), std))

    def move_coord(self, i, x, y, script=None):
        o = self.E['coord'][i]; self.rom.w16(o, x); self.rom.w16(o + 2, y)
        if script is not None: self.rom.wptr(o + 12, script)

    def coords(self, items):
        """replace all coord events: [(x, y, var, value, script)]"""
        rom = self.rom
        data = b''.join(struct.pack('<hhBBHHHI', x, y, 3, 0, var, val, 0, 0x08000000 + sc) for x, y, var, val, sc in items)
        ev = rom.ptr(self.base.h + 4)
        hdr = bytearray(rom.u8[ev:ev + 20]); hdr[2] = len(items)
        struct.pack_into('<I', hdr, 12, 0x08000000 + rom.write_new(data) if data else 0)
        n = rom.write_new(bytes(hdr)); rom.wptr(self.base.h + 4, n)
        self.E = rom.map_events(self.base.h)

    def move_bg(self, i, x, y, text=None):
        o = self.E['bg'][i]; self.rom.w16(o, x); self.rom.w16(o + 2, y)
        if text is not None: self.rom.wptr(o + 8, newmap.msgbox_script(self.rom, self.text(text), 3))

    def text(self, t):
        """'|' = new box (\\p), '~' = second line (\\n)"""
        t = t.replace('|', '\\p').replace('~', '\\n')
        return self.rom.write_new(self.rom.encode(self.rom.wrap(t), align=True))

    def npc(self, x, y, gfx, text, mv=8):
        self.new_objs.append((x, y, gfx, mv, newmap.msgbox_script(self.rom, self.text(text), 2)))

    def sign(self, x, y, text):
        self.new_signs.append((x, y, newmap.msgbox_script(self.rom, self.text(text), 3)))

    # --- write back ---
    def walkable(self, x, y):
        v = self.c[y][x]
        return (v >> 10 & 3) == 0 and (v >> 12) not in (1,)

    def commit(self):
        rom = self.rom
        nb = rom.write_new(b''.join(struct.pack('<H', v) for row in self.c for v in row))
        data = bytearray(rom.u8[self.base.lay:self.base.lay + 28])
        struct.pack_into('<I', data, 12, 0x08000000 + nb)
        struct.pack_into('<I', data, 20, 0x08000000 + self.sec)
        if self.border: struct.pack_into('<I', data, 8, 0x08000000 + rom.write_new(b''.join(struct.pack('<H', v) for v in self.border)))
        nl = rom.write_new(bytes(data))
        rom.wptr(self.base.h, nl)
        lid = rom.r16(self.base.h + 18)
        rom.wptr(newmap.LAYOUTS + (lid - 1) * 4, nl)
        if self.new_objs or self.new_signs:
            ev = rom.ptr(self.base.h + 4)
            n_o, n_b = rom.u8[ev], rom.u8[ev + 3]
            po, pb = rom.ptr(ev + 4), rom.ptr(ev + 16)
            objs = bytearray(rom.u8[po:po + n_o * 24]) if n_o else bytearray()
            tmpl = self.E['obj'][0] if self.E['obj'] else rom.map_events(rom.map_header(3, 0))['obj'][0]
            for i, (x, y, gfx, mv, sc) in enumerate(self.new_objs):
                t = bytearray(rom.u8[tmpl:tmpl + 24])
                t[0] = n_o + i + 1; t[1] = gfx; t[2] = 0
                struct.pack_into('<hh', t, 4, x, y); t[9] = mv
                struct.pack_into('<HHH', t, 10, 0x11, 0, 0)
                struct.pack_into('<IHH', t, 16, 0x08000000 + sc, 0, 0)
                objs += t
            bgs = bytearray(rom.u8[pb:pb + n_b * 12]) if n_b else bytearray()
            for x, y, sc in self.new_signs: bgs += struct.pack('<hhBBHI', x, y, 0, 0, 0, 0x08000000 + sc)
            hdr = bytearray(rom.u8[ev:ev + 20])
            hdr[0] = len(objs) // 24; hdr[3] = len(bgs) // 12
            struct.pack_into('<I', hdr, 4, 0x08000000 + rom.write_new(bytes(objs)))
            if bgs: struct.pack_into('<I', hdr, 16, 0x08000000 + rom.write_new(bytes(bgs)))
            rom.wptr(self.base.h + 4, rom.write_new(bytes(hdr)))


# ---------- checks: reachability, people on blocked cells, connection edges ----------
def check(rom, g, n, starts=None):
    G = Grid(rom, g, n)
    E = rom.map_events(G.h)
    walk = lambda x, y: G.inb(x, y) and (G.c[y][x] >> 10 & 3) == 0 and (G.c[y][x] >> 12) != 1
    problems = []
    objs = {(rom.s16(o + 4), rom.s16(o + 6)) for o in E['obj']}
    if starts is None:
        starts = [(rom.s16(o), rom.s16(o + 2)) for o in E['warp'][:1]]
    seen, dq = set(starts), deque(starts)
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (x + dx, y + dy)
            if p not in seen and walk(*p) and p not in objs: seen.add(p); dq.append(p)
    for i, o in enumerate(E['warp']):
        p = (rom.s16(o), rom.s16(o + 2))
        if p not in seen and not any((p[0] + dx, p[1] + dy) in seen for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))):
            problems.append('warp %d at %s unreachable' % (i, p))
    for i, o in enumerate(E['obj']):
        p = (rom.s16(o + 4), rom.s16(o + 6))
        if not G.inb(*p): continue
        if not walk(*p) and rom.u8[o + 1] not in (95, 96, 97): problems.append('obj %d at %s on a blocked cell' % (i + 1, p))
        if not any((p[0] + dx, p[1] + dy) in seen for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))) and rom.u8[o+1] not in (95, 96, 97):
            problems.append('obj %d at %s cannot be reached' % (i + 1, p))
    for i, o in enumerate(E['bg']):
        p = (rom.s16(o), rom.s16(o + 2))
        if not any((p[0] + dx, p[1] + dy) in seen for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))):
            problems.append('sign %d at %s cannot be reached' % (i, p))
    for i, o in enumerate(E['coord']):
        p = (rom.s16(o), rom.s16(o + 2))
        if p not in seen: problems.append('trigger %d at %s not on a reachable cell' % (i, p))
    # connections: walkable edge cells should meet walkable cells of the neighbour
    con = rom.ptr(G.h + 12)
    if con >= 0:
        cp = rom.ptr(con + 4)
        for i in range(rom.r32(con)):
            e = cp + i * 12
            d, off, cg, cn = rom.r32(e), struct.unpack_from('<i', rom.u8, e + 4)[0], rom.u8[e + 8], rom.u8[e + 9]
            if d not in (1, 2, 3, 4): continue
            N = Grid(rom, cg, cn)
            nwalk = lambda x, y: N.inb(x, y) and (N.c[y][x] >> 10 & 3) == 0
            mism, opening = [], 0
            if d in (1, 2):
                for x in range(G.W):
                    mine = walk(x, G.H - 1 if d == 1 else 0)
                    theirs = nwalk(x - off, 0 if d == 1 else N.H - 1)
                    opening += mine and theirs and (x, G.H - 1 if d == 1 else 0) in seen
                    if mine != theirs and N.inb(x - off, 0): mism.append(x)
            else:
                for y in range(G.H):
                    mine = walk(G.W - 1 if d == 4 else 0, y)
                    theirs = nwalk(0 if d == 4 else N.W - 1, y - off)
                    opening += mine and theirs and (G.W - 1 if d == 4 else 0, y) in seen
                    if mine != theirs and N.inb(0, y - off): mism.append(y)
            if not opening: problems.append('connection %s to %d.%d: no reachable opening' % (d, cg, cn))
            if mism: problems.append('connection %s to %d.%d: walkability differs at %s' % (d, cg, cn, mism))
    return problems, seen


# ---------- tiny event-script assembler (for the new story scripts) ----------
class Script:
    """Script(rom).lockall().msg('...').setvar(0x406C, 2).releaseall().end().write() -> offset.
    Texts use the City.text conventions ('|' new box, '~' line 2). Labels: .label('x') / .goto_if(1, 'x')."""
    def __init__(self, rom):
        self.rom, self.b, self.fix, self.labels = rom, bytearray(), [], {}

    def _ptr(self, target):                  # target: ROM offset (int) or label name (str)
        self.fix.append((len(self.b), target)); self.b += b'\0\0\0\0'; return self

    def raw(self, *bs): self.b += bytes(bs); return self
    def h(self, v): self.b += struct.pack('<H', v); return self
    def label(self, name): self.labels[name] = len(self.b); return self

    def text(self, t):
        t = t.replace('|', '\\p').replace('~', '\\n')
        return self.rom.write_new(self.rom.encode(self.rom.wrap(t), align=True))

    def lock(self): return self.raw(0x6A)
    def lockall(self): return self.raw(0x69)
    def faceplayer(self): return self.raw(0x5A)
    def release(self): return self.raw(0x6C)
    def releaseall(self): return self.raw(0x6B)
    def end(self): return self.raw(0x02)
    def ret(self): return self.raw(0x03)
    def msg(self, t, std=4):
        """loadword 0, text; callstd std (4 = plain message, 2 = npc, 3 = sign, 5 = yes/no)"""
        self.raw(0x0F, 0x00); self._ptr(self.text(t) if isinstance(t, str) else t); return self.raw(0x09, std)
    def close(self): return self.raw(0x68)
    def setvar(self, v, x): return self.raw(0x16).h(v).h(x)
    def setflag(self, f): return self.raw(0x29).h(f)
    def clearflag(self, f): return self.raw(0x2A).h(f)
    def checkflag(self, f): return self.raw(0x2B).h(f)
    def compare(self, v, x): return self.raw(0x21).h(v).h(x)
    def goto_if(self, cond, target): self.raw(0x06, cond); return self._ptr(target)     # cond: 0 <, 1 ==, 2 >, 5 !=
    def call_if(self, cond, target): self.raw(0x07, cond); return self._ptr(target)
    def goto(self, target): self.raw(0x05); return self._ptr(target)
    def call(self, target): self.raw(0x04); return self._ptr(target)
    def move(self, obj, steps):
        """applymovement obj, [movement bytes]; waitmovement 0. steps e.g. [0x12] = walk left (0x10 down 0x11 up 0x12 left 0x13 right)"""
        m = self.rom.write_new(bytes(steps) + b'\xfe')
        self.raw(0x4F).h(obj); self._ptr(m); return self.raw(0x51).h(0)
    def battle(self, trainer, defeat_text):
        """trainerbattle 3 (no intro): trainer, local id 0, defeat text"""
        self.raw(0x5C, 0x03).h(trainer).h(0); return self._ptr(self.text(defeat_text) if isinstance(defeat_text, str) else defeat_text)
    def additem(self, item, n=1): return self.raw(0x44).h(item).h(n)
    def fanfare(self, f=0x13E): return self.raw(0x31).h(f).raw(0x32)
    def addobject(self, i): return self.raw(0x55).h(i)
    def removeobject(self, i): return self.raw(0x53).h(i)
    def xyperm(self, i, x, y): return self.raw(0x63).h(i).h(x).h(y)
    def special(self, s): return self.raw(0x25).h(s)
    def sound(self, s): return self.raw(0x2F).h(s)

    def write(self):
        o = self.rom.alloc(len(self.b))
        for pos, tg in self.fix:
            t = o + self.labels[tg] if isinstance(tg, str) else tg
            struct.pack_into('<I', self.b, pos, 0x08000000 + t)
        self.rom.write(o, bytes(self.b))
        return o


def patch_xyperm(rom, at, x, y):
    """change the coordinates of the setobjectxyperm instruction at offset `at` (from the disassembly)"""
    assert rom.u8[at] == 0x63, hex(at)
    rom.w16(at + 3, x); rom.w16(at + 5, y)


def openings(rom, g, n):
    """{direction: [edge cells of this map where the connected map is walkable]} - where the roads must meet the edge"""
    G = Grid(rom, g, n)
    out = {}
    con = rom.ptr(G.h + 12)
    if con < 0: return out
    cp = rom.ptr(con + 4)
    for i in range(rom.r32(con)):
        e = cp + i * 12
        d, off, cg, cn = rom.r32(e), struct.unpack_from('<i', rom.u8, e + 4)[0], rom.u8[e + 8], rom.u8[e + 9]
        N = Grid(rom, cg, cn)
        ok = lambda x, y: N.inb(x, y) and (N.c[y][x] >> 10 & 3) == 0
        if d == 1: cells = [(x, G.H - 1) for x in range(G.W) if ok(x - off, 0)]
        elif d == 2: cells = [(x, 0) for x in range(G.W) if ok(x - off, N.H - 1)]
        elif d == 3: cells = [(0, y) for y in range(G.H) if ok(N.W - 1, y - off)]
        else: cells = [(G.W - 1, y) for y in range(G.H) if ok(0, y - off)]
        out[('down', 'up', 'left', 'right')[d - 1] + ' %d.%d' % (cg, cn)] = cells
    return out
