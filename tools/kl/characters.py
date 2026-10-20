# Character art from reference sheets (same layout as Zelekha's: a big full-body drawing on the left,
# six pixel poses on the right: front, back / facing right, facing left / front 2, facing left 2).
#   -> battle picture (trainer front pic, 64x64, 4bpp, own palette)
#   -> overworld sprite (9 frames 16x32, own palette tag, own images table)
import struct
from PIL import Image
import ref_to_intro, ref_to_ow
from zelekha_sprite import lz77_compress, rgb555, write_frame

TRAINER_PICS, TRAINER_PALS = 0x2395EC, 0x239A8C
GFX_INFO = 0x39FE20


def detect(path):
    """-> (art_box, [6 pose boxes]) found from the columns/rows that contain non-background pixels"""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    solid = lambda x, y: min(px[x, y]) < 215
    def runs(vals, off=0, gap=3):
        out, st, last = [], None, None
        for i, v in enumerate(vals):
            if v:
                if st is None: st = i
                last = i
            elif st is not None and i - last > gap:
                out.append((st + off, last + off)); st = None
        if st is not None: out.append((st + off, last + off))
        return out
    prof = [sum(solid(x, y) for y in range(8, h - 8, 2)) for x in range(w)]   # ignore frame lines at the edges
    split = min(range(int(w * 0.5), int(w * 0.72)), key=lambda x: (prof[x], -x))  # emptiest column between art and poses
    art_cols = [x for x in range(split) if prof[x] > 6]
    art = (art_cols[0], art_cols[-1])
    x0 = split + 1
    rows = runs([sum(solid(x, y) for x in range(x0, w - 4)) > 2 for y in range(8, h)], 8)[:3]
    y0, y1 = rows[0][0], rows[-1][1]
    cp = [sum(solid(x, y) for y in range(y0, y1)) for x in range(x0, w)]
    sx = [r for r in runs([v > max(cp) * 0.07 for v in cp], x0) if r[1] - r[0] > 20][:2]
    poses = [(c0, r0, c1 + 1, r1 + 1) for (r0, r1) in rows for (c0, c1) in sx]
    return (art[0], 0, art[1] + 1, h), poses


def cutout(path, box):
    img = ref_to_intro.remove_background(Image.open(path).convert('RGB').crop(box))
    return img.crop(img.getbbox())


def trainer_pic(path, art_box, body=0.80):
    """body: fraction of the figure kept from the top (knees up), so the face gets more pixels"""
    img = ref_to_intro.remove_background(Image.open(path).convert('RGB').crop(art_box))
    bb = img.getbbox()
    img = img.crop((bb[0], bb[1], bb[2], bb[1] + int((bb[3] - bb[1]) * body)))
    canvas = ref_to_intro.to_pixel_art(img, 64, 64, margin_bottom=1)
    grid, colours = ref_to_intro.quantize(canvas, ncol=14)       # 14 + outline = 15, + transparent
    return grid, colours


def write_trainer_pic(rom, pic, grid, colours):
    t = bytearray(0x800)
    for y in range(64):
        for x in range(64):
            c = grid[y][x]
            o = ((y // 8) * 8 + x // 8) * 32 + (y % 8) * 4 + (x % 8) // 2
            t[o] |= c << 4 if x & 1 else c
    pal = [(112, 192, 160)] + colours + [(0, 0, 0)] * (15 - len(colours))
    pb = b''.join(struct.pack('<H', rgb555(*c)) for c in pal[:16])
    rom.wptr(TRAINER_PICS + pic * 8, rom.write_new(lz77_compress(bytes(t))))
    rom.wptr(TRAINER_PALS + pic * 8, rom.write_new(lz77_compress(pb)))


def ow_frames(path, poses):
    ref_to_ow.BOXES = poses
    return ref_to_ow.quantize(ref_to_ow.frames(path))


def write_ow(rom, gid, grids, colours, tag, sprite_pals):
    """own 9 frames + images table + graphics info copy with palette tag; sprite_pals: list collecting (tag, pal offset)"""
    frames = []
    for g in grids:
        off = rom.write_new(bytes(256))
        write_frame(rom, off, g)
        frames.append(off)
    images = rom.write_new(b''.join(struct.pack('<IHH', 0x08000000 + f, 0x100, 0) for f in frames))
    pal = rom.write_new(b''.join(struct.pack('<H', rgb555(*c)) for c in colours))
    info = rom.ptr(GFX_INFO + gid * 4)
    data = bytearray(rom.u8[info:info + 0x24])
    struct.pack_into('<H', data, 2, tag)
    struct.pack_into('<I', data, 0x1C, 0x08000000 + images)
    rom.wptr(GFX_INFO + gid * 4, rom.write_new(bytes(data)))
    sprite_pals.append((tag, pal))


def add_sprite_palettes(rom, entries, table):
    """append (tag, pal offset) entries to the object palette table (ends with {NULL, 0}); returns new table offset"""
    n = 0
    while rom.r32(table + n * 8) != 0: n += 1
    data = bytes(rom.u8[table:table + n * 8]) + b''.join(struct.pack('<IHH', 0x08000000 + p, t, 0) for t, p in entries) + bytes(8)
    new = rom.write_new(data)
    for p in rom.find_ptrs(table, True): rom.wptr(p, new)
    return new


# ---------- overworld sprites drawn with one of the 4 shared NPC palettes (slots 2-5 are shared by every NPC) ----------
SHARED = [(0x1103, 2), (0x1104, 3), (0x1105, 4), (0x1106, 5)]


def _pal(rom, off):
    return [((v & 31) << 3, (v >> 5 & 31) << 3, (v >> 10 & 31) << 3) for v in (rom.r16(off + i * 2) for i in range(16))]


def fit_shared(rom, frames, pal_table=0x3A51C8):
    """frames: 9 RGBA 16x32 images -> (tag, slot, grids) using the shared palette with the smallest colour error"""
    def nearest(c, P):
        return min(range(1, 16), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, P[i])))
    best = None
    for tag, slot in SHARED:
        P = _pal(rom, rom.ptr(pal_table + (tag - 0x1103) * 8))
        err = 0
        for f in frames:
            for c in f.getdata():
                if c[3]: err += min(sum((a - b) ** 2 for a, b in zip(c[:3], P[i])) for i in range(1, 16))
        if best is None or err < best[0]: best = (err, tag, slot, P)
    _, tag, slot, P = best
    grids = []
    for f in frames:
        g = [[nearest(f.getpixel((x, y))[:3], P) if f.getpixel((x, y))[3] else 0 for x in range(16)] for y in range(32)]
        out = [row[:] for row in g]
        for y in range(32):                      # black outline around the silhouette
            for x in range(16):
                if g[y][x] == 0 and any(0 <= x + dx < 16 and 0 <= y + dy < 32 and g[y + dy][x + dx] not in (0, 15)
                                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = 15
        grids.append(out)
    return tag, slot, grids


def write_ow_shared(rom, gid, grids, tag, slot):
    frames = []
    for g in grids:
        off = rom.write_new(bytes(256))
        write_frame(rom, off, g)
        frames.append(off)
    images = rom.write_new(b''.join(struct.pack('<IHH', 0x08000000 + f, 0x100, 0) for f in frames))
    info = rom.ptr(GFX_INFO + gid * 4)
    data = bytearray(rom.u8[info:info + 0x24])
    struct.pack_into('<H', data, 2, tag)
    data[12] = (data[12] & 0xF0) | slot
    struct.pack_into('<I', data, 0x1C, 0x08000000 + images)
    rom.wptr(GFX_INFO + gid * 4, rom.write_new(bytes(data)))


# ---------- battle pictures made from existing art (base picture + colour / pixel changes) ----------
def portrait(rom, spec):
    from zelekha_sprite import lz77_decompress
    b = spec['base']
    t = lz77_decompress(rom.u8, rom.ptr(TRAINER_PICS + b * 8))
    p = lz77_decompress(rom.u8, rom.ptr(TRAINER_PALS + b * 8))
    pal = [((p[k * 2] | p[k * 2 + 1] << 8) & 31) << 3 for k in range(16)]
    pal = [(((v := p[k * 2] | p[k * 2 + 1] << 8) & 31) << 3, (v >> 5 & 31) << 3, (v >> 10 & 31) << 3) for k in range(16)]
    g = [[(t[((y // 8) * 8 + x // 8) * 32 + (y % 8) * 4 + (x % 8) // 2] >> (4 if x & 1 else 0)) & 15 for x in range(64)] for y in range(64)]
    for k, c in spec.get('pal', {}).items(): pal[int(k)] = tuple(c)
    for y0, y1, m in spec.get('remap', []):
        m = {int(a): b for a, b in m.items()}
        for y in range(y0, y1 + 1):
            g[y] = [m.get(v, v) if v else 0 for v in g[y]]
    for x, y, c in spec.get('px', []): g[y][x] = c
    return g, pal


def write_portrait(rom, pic, g, pal):
    t = bytearray(0x800)
    for y in range(64):
        for x in range(64):
            c = g[y][x]
            t[((y // 8) * 8 + x // 8) * 32 + (y % 8) * 4 + (x % 8) // 2] |= c << 4 if x & 1 else c
    pb = b''.join(struct.pack('<H', rgb555(*c)) for c in pal)
    rom.wptr(TRAINER_PICS + pic * 8, rom.write_new(lz77_compress(bytes(t))))
    rom.wptr(TRAINER_PALS + pic * 8, rom.write_new(lz77_compress(pb)))
