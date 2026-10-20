# Title screen: the "POKéMON" logo (BG0, 8bpp, 256x160 tilemap) becomes the Hebrew logo "פוקימון" from a reference image.
# The FireRed / Version subtitle is kept (moved a little down); colours are matched to the logo's own palette entries.
import struct
from PIL import Image
from maprender import lz77
from zelekha_sprite import lz77_compress

PTRS = 0x78AA8                 # {palette, tiles (LZ, 8bpp), tilemap (LZ, 32x20)}
LOGO_BOX = (2, 1, 157, 68)     # where the new logo goes (x0, y0, x1, y1)
SUB_SHIFT = 9                  # the subtitle moves down to make room
# logo palette entries (yellow face, blue outline, dark 3-D edge, black shadow) - taken from the original logo
LOGO_INDICES = [36, 35, 121, 115, 26, 10, 162, 187, 79, 1]


def _colour(rom, pal, i):
    v = rom.r16(pal + i * 2)
    return ((v & 31) << 3, (v >> 5 & 31) << 3, (v >> 10 & 31) << 3)


FONT = 'C:/Windows/Fonts/arialbd.ttf'
SUB_BOX = (24, 70, 168, 111)   # the subtitle area (x0, y0, x1, y1)
WHITE, GRAYS, BLACK = 207, [207, 205, 204, 195], 206


def draw_subtitle(img, lines, heights=(22, 18), gap=1, stretch=1.45):
    """white letters with a black outline, greyer towards the bottom, like "FIRERED / VERSION".
    lines: Hebrew strings in logical order (PIL has no RTL shaping here, so they are drawn reversed)."""
    from PIL import ImageDraw, ImageFont
    x0, y0, x1, y1 = SUB_BOX
    y = y0
    for line, lh in zip(lines, heights):
        f = ImageFont.truetype(FONT, 240)
        vis = line[::-1]
        sw = 34
        tmp = Image.new('L', (2000, 500)); d = ImageDraw.Draw(tmp)
        d.text((50, 50), vis, font=f, fill=255, stroke_width=sw, stroke_fill=255)
        box = tmp.getbbox()
        fill = Image.new('L', (2000, 500)); ImageDraw.Draw(fill).text((50, 50), vis, font=f, fill=255)
        edge, fill = tmp.crop(box), fill.crop(box)
        w = round(edge.width * lh / edge.height * stretch)
        edge, fill = edge.resize((w, lh), Image.BOX), fill.resize((w, lh), Image.BOX)
        x = (x0 + x1) // 2 - w // 2
        for yy in range(lh):
            shade = GRAYS[0] if yy < lh * 0.55 else GRAYS[1] if yy < lh * 0.75 else GRAYS[2] if yy < lh * 0.9 else GRAYS[3]
            for xx in range(w):
                a, e = fill.getpixel((xx, yy)), edge.getpixel((xx, yy))
                if a > 120: img[y + yy][x + xx] = shade
                elif e > 60: img[y + yy][x + xx] = BLACK
        y += lh + gap


LOGO_YELLOW = ((255, 236, 96), (248, 200, 16), (232, 160, 0))   # top -> bottom
LOGO_BLUE, LOGO_NAVY, LOGO_EDGE = (48, 96, 176), (8, 24, 64), (8, 8, 32)
LOGO_COLOURS = 60                    # palette entries 1..60 (the subtitle uses 195-207)


def draw_logo(rom, img, ref_path):
    """the reference is split into its colours (background / yellow / blue / navy) at 4x size, the area of each colour
    is measured per screen pixel, and the pixel gets the mixed colour (smooth edges inside the logo).
    Outside, a hard edge with a dark outline and a one-pixel shadow keeps it sharp over the white and the blue of the flag."""
    ref = Image.open(ref_path).convert('RGB')
    big = ref.resize((ref.width * 4, ref.height * 4), Image.LANCZOS)
    keys = [(240, 240, 240), (245, 196, 0), (50, 98, 168), (0, 16, 44)]
    planes = [Image.new('L', big.size) for _ in keys]
    pp = [q.load() for q in planes]; bp = big.load()
    for y in range(big.height):
        for x in range(big.width):
            c = bp[x, y]
            k = min(range(4), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, keys[i])))
            pp[k][x, y] = 255
    x0, y0, x1, y1 = LOGO_BOX
    w, h = x1 - x0 + 1, y1 - y0 + 1
    fr = [q.resize((w, h), Image.BOX).load() for q in planes]
    def yellow(t):
        a, b = (LOGO_YELLOW[0], LOGO_YELLOW[1]) if t < .5 else (LOGO_YELLOW[1], LOGO_YELLOW[2])
        u = t * 2 if t < .5 else t * 2 - 1
        return tuple(round(p + (q - p) * u) for p, q in zip(a, b))
    rgb = {}
    for y in range(h):
        for x in range(w):
            f = [fr[i][x, y] / 255 for i in range(4)]
            ink = f[1] + f[2] + f[3]
            if ink < .5: continue
            yl = yellow(y / (h - 1))
            rgb[x, y] = tuple(round((yl[i] * f[1] + LOGO_BLUE[i] * f[2] + LOGO_NAVY[i] * f[3]) / ink) for i in range(3))
    # outline + shadow
    solid = set(rgb)
    for x, y in list(solid):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1)):
            n = (x + dx, y + dy)
            if n not in solid and n not in rgb: rgb[n] = LOGO_EDGE
    # palette: the mixed colours reduced to LOGO_COLOURS entries
    keys_ = list(rgb)
    strip = Image.new('RGB', (len(keys_), 1)); strip.putdata([rgb[k] for k in keys_])
    q = strip.quantize(LOGO_COLOURS, method=Image.MEDIANCUT, dither=Image.NONE)
    qp = q.getpalette()[:LOGO_COLOURS * 3]
    for k, i in zip(keys_, q.getdata()):
        x, y = x0 + k[0], y0 + k[1]
        if 0 <= x < 256 and 0 <= y < 160 and not img[y][x]: img[y][x] = 1 + i
    pal = bytearray(rom.u8[rom.ptr(PTRS):rom.ptr(PTRS) + 0x1A0])
    for i in range(LOGO_COLOURS):
        r, g, b = qp[i * 3:i * 3 + 3]
        struct.pack_into('<H', pal, (1 + i) * 2, (r >> 3) | (g >> 3) << 5 | (b >> 3) << 10)
    p = rom.write_new(bytes(pal))
    for ref_ in (PTRS, 0x796D4): rom.wptr(ref_, p)


def original_image(rom):
    pal, tiles, tmap = rom.ptr(PTRS), rom.ptr(PTRS + 4), rom.ptr(PTRS + 8)
    t, m = lz77(rom.u8, tiles), lz77(rom.u8, tmap)
    img = [[0] * 256 for _ in range(160)]
    for ty in range(20):
        for tx in range(32):
            e = struct.unpack_from('<H', m, (ty * 32 + tx) * 2)[0]
            n, hf, vf = e & 0x3FF, e >> 10 & 1, e >> 11 & 1
            for y in range(8):
                for x in range(8):
                    sx, sy = (7 - x if hf else x), (7 - y if vf else y)
                    img[ty * 8 + y][tx * 8 + x] = t[n * 64 + sy * 8 + sx]
    return img


def build(rom, ref_path, subtitle=None):
    pal = rom.ptr(PTRS)
    cols = {i: _colour(rom, pal, i) for i in LOGO_INDICES}
    old = original_image(rom)
    new = [[0] * 256 for _ in range(160)]
    if subtitle:
        draw_subtitle(new, subtitle)
    else:
        for y in range(52, 160):                               # FireRed subtitle, shifted down
            for x in range(256):
                if old[y][x] and y + SUB_SHIFT < 160: new[y + SUB_SHIFT][x] = old[y][x]
    draw_logo(rom, new, ref_path)
    # tiles (tile 0 = empty), with flips
    tiles, index, tmap = [bytes(64)], {bytes(64): (0, 0)}, []
    for ty in range(20):
        for tx in range(32):
            t = bytes(new[ty * 8 + y][tx * 8 + x] for y in range(8) for x in range(8))
            found = None
            for hf in (0, 1):
                for vf in (0, 1):
                    v = bytes(new[ty * 8 + (7 - y if vf else y)][tx * 8 + (7 - x if hf else x)] for y in range(8) for x in range(8))
                    if v in index and found is None: found = (index[v][0], hf, vf)
            if found is None:
                index[t] = (len(tiles), 0); tiles.append(t); found = (len(tiles) - 1, 0, 0)
            n, hf, vf = found
            tmap.append(n | hf << 10 | vf << 11)
    assert len(tiles) <= 256, 'too many tiles: %d' % len(tiles)
    rom.wptr(PTRS + 4, rom.write_new(lz77_compress(b''.join(tiles))))
    rom.wptr(PTRS + 8, rom.write_new(lz77_compress(b''.join(struct.pack('<H', e) for e in tmap))))
    return len(tiles)


# ---- the scene behind the logo: a hero instead of Charizard (BG1), the Israeli flag instead of the fire (BG3) ----
BG1_PAL_REFS = (0x78AB4, 0x78FA4, 0x796D8)          # Charizard's palette (bank 13)
BG2_PAL_REFS = (0x78AC0, 0x794D8, 0x79530, 0x796DC)  # copyright / PRESS START / background palette (banks 14 and 15)
BG1_TILES, BG1_MAP, BG2_TILES, BG3_TILES, BG3_MAP = 0x78AB8, 0x78ABC, 0x78AC4, 0x78ACC, 0x78AD0
FLAME_SHEET = 0x3BFC0C                               # sprite sheet {LZ data, size, tag} of the rising flames
HERO_BOX = (161, 28, 120)                            # x, y, height on screen
FLAG_BLUE = (0, 56, 184)
# the flag: white / blue stripe / white with the star / blue stripe (PRESS START sits on it) / white
STRIPES = ((12, 36), (120, 144))
STAR = (120, 78, 31, 4)                              # centre x, y, outer radius, line width


def _gba(c):
    return (c[0] >> 3) | (c[1] >> 3) << 5 | (c[2] >> 3) << 10


def _tiles4(img, w, h, bank, base_blank=True):
    """img[y][x] = 0..15 (w x h pixels, multiple of 8) -> (4bpp tiles, 32-wide tilemap); flips are reused"""
    tiles, index, tmap = [bytes(32)], {bytes(32): 0}, [0] * (32 * 32)
    for ty in range(h // 8):
        for tx in range(w // 8):
            px = [[img[ty * 8 + y][tx * 8 + x] for x in range(8)] for y in range(8)]
            found = None
            for hf in (0, 1):
                for vf in (0, 1):
                    v = bytes((px[7 - y if vf else y][7 - 2 * k if hf else 2 * k] | px[7 - y if vf else y][6 - 2 * k if hf else 2 * k + 1] << 4)
                              for y in range(8) for k in range(4))
                    if found is None and v in index: found = (index[v], hf, vf)
            if found is None:
                t = bytes(px[y][2 * k] | px[y][2 * k + 1] << 4 for y in range(8) for k in range(4))
                index[t] = len(tiles); tiles.append(t); found = (len(tiles) - 1, 0, 0)
            n, hf, vf = found
            tmap[ty * 32 + tx] = n | hf << 10 | vf << 11 | bank << 12
    return tiles, tmap


def _write_bg(rom, tiles_ref, map_ref, tiles, tmap):
    rom.wptr(tiles_ref, rom.write_new(lz77_compress(b''.join(tiles))))
    rom.wptr(map_ref, rom.write_new(lz77_compress(b''.join(struct.pack('<H', e) for e in tmap))))


def hero_image(path, height):
    """cut the figure out of its plain background (flood fill from the corners, the floor shadow too),
    scale it down and reduce it to 15 colours; a dark outline keeps it apart from the white flag"""
    from collections import deque
    im = Image.open(path).convert('RGB'); W, H = im.size; px = im.load()
    bg = px[0, 0]; shadow = None
    d = lambda a, b: sum(abs(x - y) for x, y in zip(a, b))
    keep = bytearray([255]) * (W * H)
    q = deque([(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]); seen = set(q)
    while q:
        x, y = q.popleft(); c = px[x, y]
        bluish = c[0] > 140 and c[0] + 8 < c[2] < c[0] + 50 and c[0] <= c[1] <= c[2]   # background or the floor shadow
        if not (d(c, bg) < 24 or bluish): continue
        keep[y * W + x] = 0
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= n[0] < W and 0 <= n[1] < H and n not in seen: seen.add(n); q.append(n)
    mask = Image.frombytes('L', (W, H), bytes(keep))
    rgba = im.convert('RGBA'); rgba.putalpha(mask)
    rgba = rgba.crop(mask.point(lambda v: 255 if v > 128 else 0).getbbox())
    w = round(rgba.width * height / rgba.height)
    s = rgba.resize((w, height), Image.BOX)
    solid = [[s.getpixel((x, y))[3] > 140 for x in range(w)] for y in range(height)]
    ops = [s.getpixel((x, y))[:3] for y in range(height) for x in range(w) if solid[y][x]]
    strip = Image.new('RGB', (len(ops), 1)); strip.putdata(ops)
    qs = strip.quantize(14, method=Image.MEDIANCUT, dither=Image.NONE)
    cols = [tuple(qs.getpalette()[k * 3:k * 3 + 3]) for k in range(14)]
    flat = list(qs.getdata()); i = 0
    out = [[0] * w for _ in range(height)]
    for y in range(height):
        for x in range(w):
            if solid[y][x]: out[y][x] = flat[i] + 2; i += 1
    for y in range(height):                                    # outline (colour 1) around the figure
        for x in range(w):
            if not solid[y][x] and any(0 <= y + dy < height and 0 <= x + dx < w and solid[y + dy][x + dx]
                                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = 1
    return out, [(0, 0, 0), (16, 16, 32)] + cols


def hero_only(rom, hero_path):
    """the hero instead of Charizard (BG1), everything else stays"""
    fig, cols = hero_image(hero_path, HERO_BOX[2])
    x0, y0 = HERO_BOX[0], HERO_BOX[1]
    img = [[0] * 256 for _ in range(160)]
    for y, row in enumerate(fig):
        for x, c in enumerate(row):
            if c and 0 <= x0 + x < 256 and y0 + y < 160: img[y0 + y][x0 + x] = c
    tiles, tmap = _tiles4(img, 256, 160, 13)
    _write_bg(rom, BG1_TILES, BG1_MAP, tiles, tmap)
    p = rom.write_new(b''.join(struct.pack('<H', _gba(c)) for c in cols))
    for ref in BG1_PAL_REFS: rom.wptr(ref, p)
    return len(tiles)


def _star_cells(cx, cy, r, lw):
    """pixels of a Star of David outline: two triangles, lines lw pixels wide"""
    import math
    tris = [[(cx + r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a))) for a in (0, 120, 240)],
            [(cx + r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a))) for a in (60, 180, 300)]]
    def seg(px, py, a, b):
        (x1, y1), (x2, y2) = a, b
        dx, dy = x2 - x1, y2 - y1
        t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - x1 - t * dx, py - y1 - t * dy)
    cells = set()
    for y in range(int(cy - r - lw), int(cy + r + lw) + 1):
        for x in range(int(cx - r - lw), int(cx + r + lw) + 1):
            for t in tris:
                if min(seg(x + .5, y + .5, t[k], t[(k + 1) % 3]) for k in range(3)) <= lw / 2: cells.add((x, y))
    return cells


def build_scene(rom, hero_path, background='flag'):
    """background: 'flag' = the Israeli flag instead of the fire (Kachol-Lavan), 'keep' = only the hero replaces Charizard"""
    if background == 'keep': return hero_only(rom, hero_path)
    # palette shared by BG2 and BG3: 1-5 PRESS START (the blink hides it with colour 6, so 6 is the stripe blue),
    # 7-10 the copyright line (now blue on white), 11 the white of the flag
    pal = [(0, 0, 0), (0, 0, 0), (123, 123, 123), (198, 198, 198), (222, 222, 222), (255, 255, 255), FLAG_BLUE,
           (0, 16, 72), (0, 32, 128), (0, 44, 160), FLAG_BLUE, (255, 255, 255), (0, 0, 0), (0, 0, 0), (0, 32, 128), (0, 0, 0)]
    p = rom.write_new(b''.join(struct.pack('<H', _gba(c)) for c in pal))
    for ref in BG2_PAL_REFS: rom.wptr(ref, p)
    # BG3: the flag
    star = _star_cells(*STAR)
    img = [[6 if any(a <= y < b for a, b in STRIPES) or (x, y) in star else 11 for x in range(256)] for y in range(256)]
    tiles, tmap = _tiles4(img, 256, 256, 14)
    assert len(tiles) <= 256, 'flag: %d tiles' % len(tiles)
    _write_bg(rom, BG3_TILES, BG3_MAP, tiles, tmap)
    # BG2: keep only the PRESS START and copyright letters (the black fill and the orange / red bars go)
    t = bytearray(lz77(rom.u8, rom.ptr(BG2_TILES)))
    for i in range(len(t)):
        lo, hi = t[i] & 15, t[i] >> 4
        lo = 0 if lo in (6, 11, 12, 13, 15) else lo
        hi = 0 if hi in (6, 11, 12, 13, 15) else hi
        t[i] = lo | hi << 4
    rom.wptr(BG2_TILES, rom.write_new(lz77_compress(bytes(t))))
    # BG1: the hero
    fig, cols = hero_image(hero_path, HERO_BOX[2])
    x0, y0 = HERO_BOX[0], HERO_BOX[1]
    img = [[0] * 256 for _ in range(160)]
    for y, row in enumerate(fig):
        for x, c in enumerate(row):
            if c and 0 <= x0 + x < 256 and y0 + y < 160: img[y0 + y][x0 + x] = c
    tiles, tmap = _tiles4(img, 256, 160, 13)
    _write_bg(rom, BG1_TILES, BG1_MAP, tiles, tmap)
    p = rom.write_new(b''.join(struct.pack('<H', _gba(c)) for c in cols))
    for ref in BG1_PAL_REFS: rom.wptr(ref, p)
    # the flames: an empty sheet
    size = rom.r16(FLAME_SHEET + 4)
    rom.wptr(FLAME_SHEET, rom.write_new(lz77_compress(bytes(size))))
    return len(tiles)
