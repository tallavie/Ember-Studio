# Turns Prof. Oak's overworld sprite (graphics id 71) into Prof. Yaron Zelekha:
# bald crown, short dark hair on the sides/back, thin glasses, light shirt instead of the red tie.
# Only pixel indices change (the palette is shared with ~50 other NPCs).
import struct
OAK_FRAMES = 0x389B98       # 9 frames x 256 bytes, 16x32, 4bpp, uncompressed
FRONT, BACK, SIDE = (0, 3, 4), (1, 5, 6), (2, 7, 8)
SKIN = {5: 2, 6: 3, 7: 4}    # hair -> skin (base, shade, dark outline)
DARK = {5: 13, 6: 13, 7: 15}  # hair -> dark gray / black


def read_frame(rom, off):
    g = [[0] * 16 for _ in range(32)]
    for t in range(8):
        tx, ty = t % 2, t // 2
        for y in range(8):
            for x in range(8):
                b = rom.u8[off + t * 32 + y * 4 + x // 2]
                g[ty * 8 + y][tx * 8 + x] = b >> 4 if x & 1 else b & 15
    return g


def write_frame(rom, off, g):
    for t in range(8):
        tx, ty = t % 2, t // 2
        for y in range(8):
            for x in range(0, 8, 2):
                rom.u8[off + t * 32 + y * 4 + x // 2] = g[ty * 8 + y][tx * 8 + x] | g[ty * 8 + y][tx * 8 + x + 1] << 4


def zelekha(g, kind):
    crown = 31                             # completely bald
    g[11] = [0] * 16                       # no spiky hair on top
    for y in range(12, 24):
        row = g[y]
        for x in range(16):
            c = row[x]
            if c not in (5, 6, 7): continue
            if y <= crown:
                edge = y == 12 or any(g[y + dy][x + dx] in (0, 15) for dx, dy in ((-1, 0), (1, 0), (0, -1)) if 0 <= x + dx < 16)
                row[x] = 4 if edge else (3 if c == 7 else SKIN[c])
            else:
                row[x] = DARK[c]
    # round bald dome: a half-ellipse sitting on the widest row of the head
    import math
    ext = lambda y: [x for x in range(16) if g[y][x] != 0]
    base = max(range(13, 18), key=lambda y: (len(ext(y)), -y))
    L, R = ext(base)[0], ext(base)[-1]
    c, half, top = (L + R) / 2, (R - L) / 2, base - 5
    for y in range(11, base):
        if y < top:
            g[y] = [0] * 16; continue
        w = half * math.sqrt(max(0.0, 1 - ((base - y) / (base - top + 0.6)) ** 2))
        lo, hi = round(c - w), round(c + w)
        for x in range(16):
            if x < lo or x > hi: g[y][x] = 0
            elif x in (lo, hi) or y == top: g[y][x] = 4
            elif g[y][x] in (0, 4, 15): g[y][x] = 3 if x >= hi - 1 else 2
    # shine on the bald head
    for x in range(16):
        if g[13][x] == 2 and g[13][x - 1] == 2 and 5 <= x <= 9:
            g[13][x] = 1; break
    if kind == 'front':                     # thin glasses: rims next to each eye + bridge
        for ey in range(18, 24):
            eyes = [x for x in range(4, 12) if g[ey][x] == 15]
            if len(eyes) == 2 and 2 <= eyes[1] - eyes[0] <= 4:
                a, b = eyes
                for x in [a - 1, b + 1] + list(range(a + 1, b)): g[ey][x] = 12
                break
    for y in range(22, 32):                 # red tie -> light shirt
        for x in range(16):
            if g[y][x] == 8: g[y][x] = 11
            elif g[y][x] == 9: g[y][x] = 12
    return g


def apply(rom, frames=OAK_FRAMES):
    for i in range(9):
        kind = 'front' if i in FRONT else 'back' if i in BACK else 'side'
        off = frames + i * 256
        write_frame(rom, off, zelekha(read_frame(rom, off), kind))


# ---------- trainer front pic 132 (Prof. Oak, used for the intro speech) ----------
TRAINER_PICS, TRAINER_PALS, OAK_PIC = 0x2395EC, 0x239A8C, 132
INTRO_PIC, INTRO_PAL = 0x45EDE0, 0x45F5E0


def lz77_decompress(u8, off):
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
    return out


def lz77_compress(data):
    out = bytearray([0x10, len(data) & 255, len(data) >> 8 & 255, len(data) >> 16 & 255])
    i = 0
    while i < len(data):
        flag_pos = len(out); out.append(0); flags = 0
        for b in range(8):
            if i >= len(data): break
            best_n, best_d = 0, 0
            for d in range(2, min(i, 4096) + 1):   # d >= 2: safe for LZ77UnCompVram (16-bit VRAM writes)
                n = 0
                while n < 18 and i + n < len(data) and data[i + n - d] == data[i + n]: n += 1
                if n > best_n: best_n, best_d = n, d
                if n == 18: break
            if best_n >= 3:
                flags |= 0x80 >> b
                out += bytes([(best_n - 3) << 4 | (best_d - 1) >> 8, (best_d - 1) & 255]); i += best_n
            else:
                out.append(data[i]); i += 1
        out[flag_pos] = flags
    while len(out) % 4: out.append(0)
    return bytes(out)


def rgb555(r, g, b): return (r >> 3) | (g >> 3) << 5 | (b >> 3) << 10


def edit_pic(t):
    def get(x, y):
        k = (y // 8) * 8 + x // 8; b = t[k * 32 + (y % 8) * 4 + (x % 8) // 2]
        return b >> 4 if x & 1 else b & 15

    def put(x, y, c):
        k = (y // 8) * 8 + x // 8; o = k * 32 + (y % 8) * 4 + (x % 8) // 2
        t[o] = (t[o] & 0x0F) | c << 4 if x & 1 else (t[o] & 0xF0) | c

    HAIR = (0xC, 0xD, 0xA, 0x8)
    for x in range(64):                       # bald round head instead of the hair crest
        for y in (0, 1, 2): put(x, y, 0)
    for x in range(33, 39): put(x, 2, 4)      # rounded top of the bald head
    dome = {3: (31, 40), 4: (29, 42), 5: (29, 43)}
    for y, (a, b) in dome.items():
        for x in range(26, 48):
            if a < x < b: put(x, y, 1 if (y > 3 and 32 <= x <= 35) else (3 if x >= b - 2 and y == 5 else 2))
            elif x in (a, b): put(x, y, 4)
            else: put(x, y, 0)
    for y in range(6, 13):                    # no hair at all: forehead and sides become skin (eyebrows stay)
        for x in range(26, 48):
            c = get(x, y)
            if c in HAIR:
                if 31 <= x <= 41 and y >= 9 and c == 8: continue
                edge = get(x - 1, y) == 0 or get(x + 1, y) == 0
                put(x, y, 4 if edge else (2 if 31 <= x <= 41 else 3))
    for y in range(3, 13):                    # round head: cut the old hair flare sticking out on both sides
        lo, hi = (29, 44) if y < 10 else (30, 44)
        for x in range(20, 52):
            if (x < lo or x > hi) and get(x, y) != 0: put(x, y, 0)
        xs = [x for x in range(20, 52) if get(x, y) != 0]
        if xs: put(xs[0], y, 4); put(xs[-1], y, 4 if y < 10 else get(xs[-1], y))
    import math                               # round cranium: ellipse from the top of the head down to the eyes
    cx, cy, rx, ry = 36.5, 10.5, 8.0, 9.0
    for y in range(1, 11):
        w = rx * math.sqrt(max(0.0, 1 - ((y - cy) / ry) ** 2))
        lo, hi = round(cx - w), round(cx + w) - 1
        for x in range(20, 52):
            c = get(x, y)
            if x < lo or x > hi:
                if c != 0 and y < 10: put(x, y, 0)
            elif x in (lo, hi) or (y == 1 + int(cy - ry) + 0 and True and get(x, y - 1) == 0 and False):
                put(x, y, 4)
            elif c in (0, 4, 0xF) and not (y >= 9 and c == 0xF):
                put(x, y, 1 if (y <= 5 and 32 <= x <= 35) else (3 if x >= hi - 1 else 2))
        top = [x for x in range(lo, hi + 1)]
        if y == 2: [put(x, y, 4) for x in top]
    G = 0xB                                   # thin metal glasses
    for x in list(range(31, 35)) + list(range(37, 41)):
        put(x, 10, G); put(x, 13, 0xC)
    for y in (11, 12):
        for x in (31, 34, 37, 40): put(x, y, 0xC)
    put(35, 11, G); put(36, 11, G); put(41, 11, 0xC)
    put(33, 15, 4); put(39, 15, 4)            # big smile
    put(34, 16, 4); put(35, 16, 0xE); put(36, 16, 0xE); put(37, 16, 0xE); put(38, 16, 4)


def apply_pic(rom):
    pp, lp = TRAINER_PICS + OAK_PIC * 8, TRAINER_PALS + OAK_PIC * 8
    t = lz77_decompress(rom.u8, rom.ptr(pp))
    edit_pic(t)
    edit_pic_v2(t)
    pal = lz77_decompress(rom.u8, rom.ptr(lp))
    new = {0x6: (168, 200, 240), 0x7: (112, 152, 208),           # light blue shirt
           0xD: (96, 96, 104), 0xA: (64, 64, 72), 0x8: (40, 40, 48),  # dark hair / dark gray trousers
           0xC: (176, 176, 184)}
    for k, (r, g, b) in new.items():
        v = rgb555(r, g, b); pal[k * 2] = v & 255; pal[k * 2 + 1] = v >> 8
    rom.write(INTRO_PIC, bytes(t))            # the intro speech uses an uncompressed copy + raw palette
    rom.write(INTRO_PAL, bytes(pal))
    rom.wptr(pp, rom.write_new(lz77_compress(bytes(t))))
    rom.wptr(lp, rom.write_new(lz77_compress(bytes(pal))))


# ---------- v2: Zelekha like the reference art: blue shirt, dark trousers, backpack, bald top + short dark hair ring ----------
SPRITE_PALS = 0x3A51C8          # sObjectEventSpritePalettes {ptr, u16 tag, u16 pad}, ends with {NULL, 0}
GFX_INFO_TABLE, OAK_GFX = 0x39FE20, 71
NEW_TAG = 0x1130
OW_PAL = [(112, 192, 160), (248, 208, 176), (240, 184, 144), (216, 144, 112), (120, 64, 64), (88, 64, 48), (64, 48, 40),
          (56, 48, 48), (184, 208, 248), (136, 168, 224), (96, 120, 176), (96, 96, 104), (64, 64, 72), (48, 48, 56),
          (232, 232, 240), (0, 0, 0)]


def zelekha_v2(g, kind):
    import math
    HAIR = (5, 6, 7)
    ext = lambda y: [x for x in range(16) if g[y][x] != 0]
    base = max(range(13, 18), key=lambda y: (len(ext(y)), -y))
    L, R = ext(base)[0], ext(base)[-1]
    c, half, top = (L + R) / 2, (R - L) / 2, base - 5
    face_lo = next(y for y in range(14, 24) if any(v in (1, 2, 3) for v in g[y]))
    # head: round dome; bald top, short dark hair on the sides / back
    for y in range(10, 24):
        row = g[y]
        if y < top: g[y] = [0] * 16; continue
        if y < base:
            w = half * math.sqrt(max(0.0, 1 - ((base - y) / (base - top + 0.6)) ** 2))
            lo, hi = round(c - w), round(c + w)
            for x in range(16):
                if x < lo or x > hi: row[x] = 0
                elif x in (lo, hi) or y == top: row[x] = 4
                elif row[x] in (0, 4, 15) or row[x] in HAIR: row[x] = -1
        for x in range(16):
            v = row[x]
            if v in HAIR or v == -1:
                if kind == 'back':
                    row[x] = (1 if y == top + 1 and abs(x - c) < 2 else 2) if y < 19 else (6 if x in (L, R) else 5)
                elif kind == 'side':
                    row[x] = 2 if y < base or x <= c else (6 if x == R else 5)
                else:
                    edge = x <= L + 1 or x >= R - 1
                    row[x] = (6 if x in (L, R) else 5) if (edge and y >= top + 3) else (1 if y == top + 1 and abs(x - c) < 1.5 else 2)
    if kind == 'front':
        for ey in range(18, 24):
            eyes = [x for x in range(4, 12) if g[ey][x] == 15]
            if len(eyes) == 2 and 2 <= eyes[1] - eyes[0] <= 4:
                a, b = eyes
                g[ey][a - 1] = g[ey][b + 1] = 12      # thin rims only, no dark bar across the face
                break
    # body: white coat -> light blue shirt, red tie -> shirt, gray -> trousers, olive shoes -> dark shoes
    for y in range(22, 32):
        row = g[y]
        for x in range(16):
            v = row[x]
            if y >= 27 and v in (11, 12, 14, 13): row[x] = 11 if v in (11, 14) else 12
            elif y >= 29 and v in (5, 6, 7): row[x] = 7
            elif v == 14: row[x] = 8
            elif v in (11, 9): row[x] = 9
            elif v == 12: row[x] = 10
            elif v == 8: row[x] = 8
            elif v == 13: row[x] = 13
            elif v in (5, 6, 7): row[x] = 7 if y >= 28 else 13
    # backpack: straps in front, the bag itself on the back / side
    body = [y for y in range(22, 28)]
    if kind == 'front':
        for y in body[1:4]:
            xs = [x for x in range(16) if g[y][x] in (8, 9, 10)]
            if len(xs) > 4: g[y][xs[1]] = g[y][xs[-2]] = 13
    elif kind == 'back':
        for y in body[1:5]:
            xs = [x for x in range(16) if g[y][x] in (8, 9, 10)]
            for x in xs[1:-1]: g[y][x] = 13 if y > body[1] else 12
    else:
        for y in body[1:5]:
            xs = [x for x in range(16) if g[y][x] != 0]
            if xs: g[y][xs[-1] - 1] = 13; g[y][xs[-1]] = 15
    return g


def apply_v2(rom, orig, grids=None, colours=None):
    """redraw gfx 71 (from given 9 frames, else from the ORIGINAL Oak frames) with its own palette (tag NEW_TAG)"""
    for i in range(9):
        kind = 'front' if i in FRONT else 'back' if i in BACK else 'side'
        off = OAK_FRAMES + i * 256
        write_frame(rom, off, grids[i] if grids else zelekha_v2(read_frame(orig, off), kind))
    pal = b''.join(struct.pack('<H', rgb555(*c)) for c in (colours or OW_PAL))
    pal_off = rom.write_new(pal)
    # palette table: copy, append our entry before the 0x11FF terminator, repoint
    n = 0
    while rom.r32(SPRITE_PALS + n * 8) != 0: n += 1          # ends with {NULL, 0}
    table = bytes(rom.u8[SPRITE_PALS:SPRITE_PALS + n * 8]) + struct.pack('<IHH', 0x08000000 + pal_off, NEW_TAG, 0) + \
        bytes(rom.u8[SPRITE_PALS + n * 8:SPRITE_PALS + n * 8 + 8])
    new = rom.write_new(table)
    for p in rom.find_ptrs(SPRITE_PALS, True): rom.wptr(p, new)
    global _PAL_TABLE
    _PAL_TABLE = new
    # own copy of the graphics info with the new palette tag
    info = rom.ptr(GFX_INFO_TABLE + OAK_GFX * 4)
    data = bytearray(rom.u8[info:info + 0x24])
    struct.pack_into('<H', data, 2, NEW_TAG)
    rom.wptr(GFX_INFO_TABLE + OAK_GFX * 4, rom.write_new(bytes(data)))


def edit_pic_v2(t):
    def get(x, y):
        k = (y // 8) * 8 + x // 8; b = t[k * 32 + (y % 8) * 4 + (x % 8) // 2]
        return b >> 4 if x & 1 else b & 15

    def put(x, y, c):
        k = (y // 8) * 8 + x // 8; o = k * 32 + (y % 8) * 4 + (x % 8) // 2
        t[o] = (t[o] & 0x0F) | c << 4 if x & 1 else (t[o] & 0xF0) | c
    for y in range(18, 37):                      # lab coat -> light blue shirt
        for x in range(64):
            v = get(x, y)
            if v in (0xE, 0x9): put(x, y, 6)
            elif v == 0x5: put(x, y, 7)
    for y in range(36, 50):                      # no coat tails below the belt
        for x in list(range(20, 31)) + list(range(40, 56)):
            if get(x, y) in (0xE, 0x9, 0x5, 0xB, 0xC, 0xF, 6, 7): put(x, y, 0)
    for y in range(36, 50):                      # close the trouser outline where the coat was
        xs = [x for x in range(20, 56) if get(x, y) != 0]
        if xs: put(xs[0], y, 0xF); put(xs[-1], y, 0xF)
    for y in range(19, 36):                      # backpack straps over both shoulders
        for x in (31, 32, 46, 47):
            if get(x, y) not in (0, 0xF): put(x, y, 0x8)
    for y in range(6, 13):                       # short dark hair ring above the ears
        for x in (30, 31, 43, 44):
            if get(x, y) in (2, 3) and (x in (30, 44) or y >= 8): put(x, y, 0x4)


# ---------- the intro speech picture: 64x96, 8bpp, LZ at 0x461D74, palette (indices 96-127) raw at 0x461D34 ----------
INTRO8_GFX, INTRO8_PAL = 0x461D74, 0x461D34


def apply_intro8(rom):
    import math
    d = lz77_decompress(rom.u8, INTRO8_GFX)
    W, H = 64, 96
    idx = lambda x, y: ((y // 8) * 8 + x // 8) * 64 + (y % 8) * 8 + x % 8
    g = [[d[idx(x, y)] for x in range(W)] for y in range(H)]
    SK1, SK2, SK3, OUTL, BLACK = 97, 98, 99, 100, 111
    HAIR = range(116, 121)
    SHIRT_L, SHIRT_M, SHIRT_D = 113, 114, 115
    COAT = {110: SHIRT_L, 107: SHIRT_M, 108: SHIRT_M, 109: SHIRT_D}
    STRAP, PANT = 105, (103, 104, 105)
    # 1. bald round dome (rows 5-13) + short dark hair only on the sides
    cx, top, base, half = 38.5, 6, 14, 9.5
    for y in range(0, base):
        w = half * math.sqrt(max(0.0, 1 - ((base - y) / (base - top + 0.5)) ** 2)) if y >= top else -1
        lo, hi = math.ceil(cx - w), math.floor(cx + w)
        for x in range(W):
            if w < 0 or x < lo or x > hi: g[y][x] = 0
            elif x in (lo, hi) or y == top: g[y][x] = OUTL
            else: g[y][x] = SK1 if (y < 10 and cx - 5 < x < cx) else (SK3 if x > hi - 2 else SK2)
    for y in range(base, 26):
        for x in range(W):
            if g[y][x] in HAIR:
                g[y][x] = (118 if x in (28, 29, 47, 48) else 117) if (x <= 31 or x >= 45) and 15 <= y <= 19 else (OUTL if (x <= 29 or x >= 47) else SK2)
    # 2. glasses
    for x in list(range(33, 38)) + list(range(40, 45)):
        g[17][x] = 108; g[21][x] = 108
    for y in range(18, 21):
        for x in (33, 37, 40, 44): g[y][x] = 108
    g[18][38] = g[18][39] = 108
    # 3. smile
    for x in (35, 40): g[24][x] = OUTL
    for x in range(36, 40): g[25][x] = 110
    g[25][35] = g[25][40] = OUTL
    for x in range(36, 40): g[26][x] = OUTL
    # 4. lab coat -> light blue shirt; no coat tails below the belt
    for y in range(27, H):
        for x in range(W):
            v = g[y][x]
            if y < 58 and v in COAT: g[y][x] = COAT[v]
            elif y >= 58 and v in (107, 108, 109, 110): g[y][x] = 0
    for y in range(44, 58):                   # the coat flap sticking out to the right of the hand
        for x in range(51, W):
            if g[y][x] in (SHIRT_L, SHIRT_M, SHIRT_D, BLACK) and not any(g[y][k] in (SK1, SK2, SK3, OUTL) for k in range(x, min(W, x + 3))):
                g[y][x] = 0
        xs = [x for x in range(W) if g[y][x] != 0]
        if xs and g[y][xs[-1]] in (SHIRT_L, SHIRT_M, SHIRT_D): g[y][xs[-1]] = BLACK
    for y in range(55, 72):                   # leftover coat edge under the right hand
        for x in range(49, W):
            if g[y][x] not in PANT + (SK1, SK2, SK3, OUTL, 121) and not (y < 58 and g[y][x - 1] in (SK1, SK2, SK3, OUTL)):
                g[y][x] = 0
    for y in range(58, H):                    # close the trouser outline where the coat was
        xs = [x for x in range(W) if g[y][x] in PANT + (BLACK, 121, OUTL, SK1, SK2, SK3)]
        if xs:
            for x in (xs[0], xs[-1]):
                if g[y][x] in PANT: g[y][x] = BLACK
    # 5. backpack straps over the shoulders
    for y in range(29, 57):
        for x in (31, 32, 46, 47):
            if g[y][x] in (SHIRT_L, SHIRT_M, SHIRT_D): g[y][x] = STRAP
    out = bytearray(len(d))
    for y in range(H):
        for x in range(W): out[idx(x, y)] = g[y][x]
    new = rom.write_new(lz77_compress(bytes(out)))
    for p in rom.find_ptrs(INTRO8_GFX, True): rom.wptr(p, new)
    # palette: blue shirt, dark trousers + straps, dark short hair
    cols = {113: (184, 208, 248), 114: (136, 168, 224), 115: (88, 112, 168),
            103: (104, 104, 112), 104: (72, 72, 80), 105: (40, 40, 48),
            117: (88, 64, 48), 118: (64, 48, 40), 116: (112, 88, 64), 119: (64, 48, 40), 120: (48, 32, 24)}
    for i, (r, gg, b) in cols.items():
        rom.w16(INTRO8_PAL + (i - 96) * 2, rgb555(r, gg, b))


_PAL_TABLE = None


def SPRITE_PALS_CURRENT(rom):
    """where the object palette table is now (moved by apply_v2)"""
    return _PAL_TABLE or rom.ptr(0x5F5DC)
