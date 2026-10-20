# Render FireRed maps / tilesets to PNG (same logic as js/maps.js) so map edits can be checked by eye.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from gba import Rom

PRIM_TILES, PRIM_META, PRIM_PALS = 640, 640, 7


def lz77(u8, off):
    assert u8[off] == 0x10
    size = u8[off + 1] | u8[off + 2] << 8 | u8[off + 3] << 16
    out, i = bytearray(), off + 4
    while len(out) < size:
        flags = u8[i]; i += 1
        for b in range(8):
            if len(out) >= size: break
            if flags & (0x80 >> b):
                n = (u8[i] >> 4) + 3; d = ((u8[i] & 15) << 8 | u8[i + 1]) + 1; i += 2
                for _ in range(n): out.append(out[-d])
            else:
                out.append(u8[i]); i += 1
    return bytes(out)


def pal(rom, o):
    c = []
    for i in range(16):
        v = rom.r16(o + i * 2)
        c.append(((v & 31) << 3, (v >> 5 & 31) << 3, (v >> 10 & 31) << 3))
    return c


class Tileset:
    def __init__(self, rom, off, secondary):
        self.off, self.secondary = off, secondary
        comp = rom.u8[off]
        tp, pp, mp, ap = rom.ptr(off + 4), rom.ptr(off + 8), rom.ptr(off + 12), rom.ptr(off + 20)
        n = (1024 - PRIM_TILES) if secondary else PRIM_TILES
        self.tiles = lz77(rom.u8, tp) if comp else bytes(rom.u8[tp:tp + n * 32])
        self.pals = [pal(rom, pp + i * 32) for i in range(16)]
        self.meta, self.attr = mp, ap
        cnt = (1024 - PRIM_META) if secondary else PRIM_META
        if ap > mp and (ap - mp) // 16 <= 1024: cnt = min(cnt, (ap - mp) // 16)
        self.count = cnt


class MapGfx:
    def __init__(self, rom, prim_off, sec_off):
        self.rom = rom
        self.p, self.s = Tileset(rom, prim_off, False), Tileset(rom, sec_off, True)
        self.cache = {}

    def palette(self, i): return self.p.pals[i] if i < PRIM_PALS else self.s.pals[i]

    def metatile(self, mid):
        if mid in self.cache: return self.cache[mid]
        img = Image.new('RGBA', (16, 16), (0, 0, 0, 255))
        px = img.load()
        sec = mid >= PRIM_META
        ts, local = (self.s, mid - PRIM_META) if sec else (self.p, mid)
        if local < ts.count:
            mo = ts.meta + local * 16
            for layer in range(2):
                for k in range(4):
                    e = self.rom.r16(mo + layer * 8 + k * 2)
                    t, hf, vf, pl = e & 0x3FF, e & 0x400, e & 0x800, self.palette(e >> 12)
                    src = self.p.tiles if t < PRIM_TILES else self.s.tiles
                    if t >= PRIM_TILES: t -= PRIM_TILES
                    base = t * 32
                    if base + 32 > len(src): continue
                    for y in range(8):
                        for x in range(8):
                            sx, sy = (7 - x if hf else x), (7 - y if vf else y)
                            b = src[base + sy * 4 + (sx >> 1)]
                            c = b >> 4 if sx & 1 else b & 15
                            if c == 0 and layer == 1: continue
                            px[(k & 1) * 8 + x, (k >> 1) * 8 + y] = pl[c] + (255,)
        self.cache[mid] = img
        return img

    def sheet(self, cols=16):
        ids = list(range(self.p.count)) + [PRIM_META + i for i in range(self.s.count)]
        rows = (len(ids) + cols - 1) // cols
        img = Image.new('RGBA', (cols * 16, rows * 16))
        for k, mid in enumerate(ids): img.paste(self.metatile(mid), ((k % cols) * 16, (k // cols) * 16))
        return img, ids


def layout_of(rom, hdr):
    lay = rom.ptr(hdr)
    return {'lay': lay, 'w': rom.r32(lay), 'h': rom.r32(lay + 4), 'border': rom.ptr(lay + 8), 'blocks': rom.ptr(lay + 12),
            'prim': rom.ptr(lay + 16), 'sec': rom.ptr(lay + 20)}


def render_map(rom, hdr, events=True, scale=1):
    L = layout_of(rom, hdr)
    g = MapGfx(rom, L['prim'], L['sec'])
    img = Image.new('RGBA', (L['w'] * 16, L['h'] * 16))
    for y in range(L['h']):
        for x in range(L['w']):
            img.paste(g.metatile(rom.r16(L['blocks'] + (y * L['w'] + x) * 2) & 0x3FF), (x * 16, y * 16))
    if events:
        from PIL import ImageDraw
        d = ImageDraw.Draw(img)
        E = rom.map_events(hdr)
        col = {'obj': (255, 60, 140), 'warp': (40, 210, 70), 'coord': (255, 176, 0), 'bg': (138, 92, 255)}
        for k, lst in E.items():
            for o in lst:
                x, y = (rom.s16(o + 4), rom.s16(o + 6)) if k == 'obj' else (rom.s16(o), rom.s16(o + 2))
                d.rectangle([x * 16 + 2, y * 16 + 2, x * 16 + 13, y * 16 + 13], outline=col[k], width=2)
    if scale != 1: img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    return img


if __name__ == '__main__':
    rom = Rom(sys.argv[1])
    g, m = map(int, sys.argv[2].split('.'))
    out = sys.argv[3]
    render_map(rom, rom.map_header(g, m), scale=2).save(out)
    print('saved', out)
