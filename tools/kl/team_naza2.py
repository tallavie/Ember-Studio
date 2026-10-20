# Kachol-Lavan: Yuval and Rachel made from the game's own sprites (sharp, the right size), not from scaled pictures:
#   walking sprites: the man with glasses (people sprite 52) - Rachel keeps the glasses and gets longer hair; Yuval
#     loses them and gets a beard; both: black shirt and trousers, dark brown / brown hair (each has a palette of
#     their own, so the same pixels can have other colours);
#   battle pictures: Yuval from the old boss (hands in pockets, like the reference): black clothes, curly hair, a
#     beard; Rachel from the girl with brown hair (84): black shirt and wide black trousers, glasses.
#   python team_naza2.py team_raw2.json out.json preview.png
import json, sys, random
from PIL import Image, ImageDraw
from team_naza import pal_of, untile, tile, rgb555

def copy(px): return [r[:] for r in px]

# ---------- walking sprites (16x32) ----------
# rows: hair 11..17, face 16..22, shirt 22..27, trousers 27..30 (frames of people sprite 52)
def ow_common(px, kind, hair_long):
    """kind: 'down' | 'up' | 'left'"""
    for y in range(32):
        for x in range(16):
            c = px[y][x]
            if y <= 17 and c in (13, 12, 11): px[y][x] = 6 if c == 13 else 5      # hair: own colours (palette 5, 6)
            elif y >= 22 and y <= 27 and c in (14, 11, 12): px[y][x] = 10 if c == 14 else 13   # shirt: black
            elif y >= 27 and c in (9, 8): px[y][x] = 10                           # trousers: black
    if kind in ('left', 'up'):                                                    # the back of the head below row 17: hair, not shirt
        for y in range(18, 21):
            for x in range(6 if kind == 'left' else 3, 12 if kind == 'left' else 13):
                if px[y][x] == 13: px[y][x] = 6
    if kind == 'left':                                                            # the glasses' arm to the ear (a dark band): cheek and hair
        for x in range(6, 12):
            if px[19][x] == 15: px[19][x] = 2 if x < 8 else 6
        for x in (10, 11):
            if px[18][x] == 15: px[18][x] = 6
    if hair_long:                                                                 # Rachel: hair down to the jaw
        if kind == 'down':
            for y in range(17, 22):
                for x in (2, 13):
                    if px[y][x] in (15, 0): px[y][x] = 6
                px[y][1] = 15 if px[y][1] == 0 else px[y][1]; px[y][14] = 15 if px[y][14] == 0 else px[y][14]
        elif kind == 'up':
            for y in range(17, 23):
                for x in range(3, 13):
                    if px[y][x] in (15, 13, 10): px[y][x] = 6 if (x + y) % 3 else 5
        else:
            for y in range(17, 22):
                for x in (9, 10, 11):
                    if px[y][x] in (15, 13, 10, 3, 2, 4): px[y][x] = 6
    return px

def ow_yuval(px, kind):
    """no glasses, a beard"""
    if kind == 'down':
        for x in (5, 10): px[18][x] = 2                          # the glasses' rim: skin, the eyes stay
        for x in (5, 6, 9, 10):
            px[19][x] = 2; px[20][x] = 2                         # the lenses: skin
        for x in (4, 5, 10, 11):
            if px[21][x] in (2, 3): px[21][x] = 6                # beard along the jaw
        for x in range(5, 11):
            if px[22][x] in (2, 3, 4): px[22][x] = 6 if x not in (7, 8) else 5
    elif kind == 'left':
        px[18][4] = 2; px[18][5] = 15                              # the side rim: skin, one eye
        for x in (4, 5): px[19][x] = 2; px[20][x] = 2
        for x in range(5, 9):
            if px[21][x] in (2, 3, 7): px[21][x] = 6
            if px[22][x] in (2, 3, 4): px[22][x] = 6
    return px

def curls(px, rnd):
    """a little texture in the hair, so it reads as curly"""
    for y in range(11, 18):
        for x in range(16):
            if px[y][x] == 6 and rnd.random() < 0.22: px[y][x] = 5
    return px

# ---------- battle pictures (64x64) ----------
def pic_yuval(px):
    rnd = random.Random(3)
    for y in range(64):
        for x in range(64):
            c = px[y][x]
            if 30 <= x <= 39 and 17 <= y <= 28 and c in (14, 8, 10): px[y][x] = 12      # the white shirt: black
            if 34 <= x <= 42 and 22 <= y <= 29 and c in (5, 6): px[y][x] = 12          # the boss's logo: gone
    for y in range(17, 20):                                                            # an open collar
        for x in range(33 + (y - 17), 36 - (y - 17) + 1):
            if px[y][x] == 12: px[y][x] = 2
    # curly hair: a rounded mass over the head (dark brown, palette 7), lighter curls (4), a black outline
    cx, cy, rx, ry = 36.0, 5.0, 9.5, 6.5
    inside = lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    for y in range(0, 12):
        for x in range(24, 48):
            if not inside(x, y): continue
            c = px[y][x]
            face = c in (1, 2, 3) and y >= 6                    # keep the forehead and the face
            if not face: px[y][x] = 7
    for y in range(0, 12):
        for x in range(24, 48):
            if px[y][x] == 7 and any(not inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, -1))) and y < 9: px[y][x] = 15
    for y in range(0, 12):
        for x in range(24, 48):
            if px[y][x] == 7 and ((x * 3 + y * 5) % 7 == 0 or rnd.random() < 0.12): px[y][x] = 4
    # a beard: the lower face
    for y in range(11, 17):
        for x in range(31, 42):
            if px[y][x] in (1, 2, 3): px[y][x] = 7 if (y > 12 or x < 33 or x > 39) else px[y][x]
    return px

def pic_rachel(px):
    for y in range(64):
        for x in range(64):
            c = px[y][x]
            if 27 <= x <= 44 and 24 <= y <= 35 and c == 14: px[y][x] = 12              # white shirt -> dark
            if 24 <= x <= 42 and 41 <= y <= 57 and c in (1, 2, 3): px[y][x] = 12 if c != 3 else 13   # legs -> trousers
            if 24 <= x <= 42 and 51 <= y <= 59 and c == 14: px[y][x] = 13             # socks -> trousers
    # glasses: thin frames (dark grey) around both eyes, and a bridge
    for (x0, x1) in ((34, 37), (39, 42)):
        for x in range(x0, x1 + 1): px[19][x] = 12
        px[20][x0] = 12; px[20][x1] = 12; px[21][x0] = 12; px[21][x1] = 12
    px[20][38] = 12
    return px

# the game does not load a palette per person: every NPC uses one of four fixed palettes (slots 2..5, tags 0x1103..0x1106),
# so the finished sprites are moved onto the nearest colours of one of them (Yuval: slot 2, the dark browns; Rachel:
# slot 5, the auburn and the greys)
SLOT_PAL = {
    2: (0x1103, '112,192,160 248,208,176 240,184,144 216,144,112 120,64,64 248,216,72 208,168,32 128,96,0 160,136,232 104,80,184 64,56,96 232,112,64 168,64,56 72,48,48 248,248,248 0,0,0'),
    3: (0x1104, '112,192,160 248,208,176 240,184,144 216,144,112 120,64,64 248,160,176 208,104,120 136,64,80 144,192,232 96,128,200 56,56,72 192,192,208 136,136,144 72,72,88 248,248,248 0,0,0'),
    4: (0x1105, '112,192,160 248,208,176 240,184,144 216,144,112 120,64,64 216,184,64 160,128,32 80,80,32 128,200,48 56,136,0 32,64,16 216,144,184 160,72,128 80,32,64 248,248,248 0,0,0'),
    5: (0x1106, '112,192,160 248,208,176 240,184,144 216,144,112 120,64,64 200,168,96 120,112,64 56,56,24 224,104,72 144,56,40 80,16,0 192,192,208 136,136,144 72,72,88 248,248,248 0,0,0'),
}
def slot_pal(slot): return [tuple(int(v) for v in c.split(',')) for c in SLOT_PAL[slot][1].split()]
def to_slot(frames, pal, slot, force={}):
    """each colour of `pal` -> the nearest colour of the slot's palette (or as forced); returns new frames"""
    sp = slot_pal(slot)
    def near(c): return min(range(1, 16), key=lambda j: sum((a - b) ** 2 for a, b in zip(c, sp[j])))
    m = [0] + [force.get(i, near(pal[i])) for i in range(1, 16)]
    return [[[m[c] for c in row] for row in f] for f in frames], sp

def recolour(pal, changes):
    pal = list(pal)
    for i, c in changes.items(): pal[i] = c
    return pal

if __name__ == '__main__':
    raw = json.load(open(sys.argv[1])); out, prev = sys.argv[2], sys.argv[3]
    base = pal_of(raw['ow']['52']['pal'])
    pal_y = recolour(base, {5: (104, 72, 56), 6: (56, 36, 28), 7: (64, 48, 40), 9: (64, 64, 80)})
    pal_r = recolour(base, {5: (176, 120, 72), 6: (120, 72, 40), 7: (64, 48, 40), 9: (64, 64, 80)})
    KIND = ['down', 'up', 'left', 'down', 'down', 'up', 'up', 'left', 'left', 'down', 'up', 'left']
    frames = [untile(bytes.fromhex(f), 16, 32) for f in raw['ow']['52']['frames']]
    oy, orr = [], []
    for k, f in enumerate(frames):
        kind = KIND[k] if k < len(KIND) else 'down'
        # the walking frames are one row lower (the head bobs): edit them moved up to the standing rows, then back
        dy = next(y for y in range(32) if any(f[y])) - 11
        up = lambda p: [p[y + dy] if 0 <= y + dy < 32 else [0] * 16 for y in range(32)]
        down = lambda p, o: [p[y - dy] if 0 <= y - dy < 32 else o[y] for y in range(32)]
        y = curls(ow_yuval(ow_common(up(copy(f)), kind, False), kind), random.Random(k)); oy.append(down(y, f))
        r = curls(ow_common(up(copy(f)), kind, True), random.Random(k + 50)); orr.append(down(r, f))
    oy, sp_y = to_slot(oy, pal_y, 2, {6: 13, 5: 4, 7: 13, 9: 10, 10: 10})
    orr, sp_r = to_slot(orr, pal_r, 5, {6: 10, 5: 9, 7: 10, 9: 13, 10: 13, 13: 13})
    pal_y, pal_r = sp_y, sp_r
    p108 = untile(bytes.fromhex(raw['pics']['108']['gfx']), 64, 64); pp108 = pal_of(raw['pics']['108']['pal'])
    pal108 = recolour(pp108, {13: (88, 88, 96), 11: (56, 56, 64), 12: (36, 36, 44), 9: (20, 20, 28), 10: (104, 104, 112), 7: (60, 40, 28), 4: (96, 66, 48)})
    yp = pic_yuval(copy(p108))
    p84 = untile(bytes.fromhex(raw['pics']['84']['gfx']), 64, 64); pp84 = pal_of(raw['pics']['84']['pal'])
    pal84 = recolour(pp84, {12: (60, 60, 70), 13: (36, 36, 44), 8: (56, 56, 64), 7: (40, 40, 48), 6: (24, 24, 32)})
    rp = pic_rachel(copy(p84))
    json.dump({'ow': {'yuval': [tile(f, 16, 32).hex() for f in oy], 'rachel': [tile(f, 16, 32).hex() for f in orr]},
               'ow_slot': {'yuval': [2, SLOT_PAL[2][0]], 'rachel': [5, SLOT_PAL[5][0]]},
               'ow_pal': {'yuval': [rgb555(c) for c in pal_y], 'rachel': [rgb555(c) for c in pal_r]},
               'pics': {'yuval': {'gfx': tile(yp, 64, 64).hex(), 'pal': [rgb555(c) for c in pal108]},
                        'rachel': {'gfx': tile(rp, 64, 64).hex(), 'pal': [rgb555(c) for c in pal84]}}}, open(out, 'w'))
    # preview: the battle pictures 4x, the walking sprites 6x (down, up, left), next to an ordinary person for size
    def draw(px, pal, S, w, h):
        im = Image.new('RGB', (w * S, h * S), (144, 200, 168)); d = ImageDraw.Draw(im)
        for y in range(h):
            for x in range(w):
                if px[y][x]: d.rectangle([x * S, y * S, x * S + S - 1, y * S + S - 1], fill=pal[px[y][x]])
        return im
    parts = [draw(yp, pal108, 4, 64, 64), draw(rp, pal84, 4, 64, 64)]
    for fr, pal in ((oy, pal_y), (orr, pal_r)):
        for k in (0, 1, 2): parts.append(draw(fr[k], pal, 6, 16, 32))
    parts.append(draw(frames[0], base, 6, 16, 32))
    W = sum(p.width + 12 for p in parts); H = max(p.height for p in parts)
    sheet = Image.new('RGB', (W, H), (90, 110, 130)); x = 0
    for p in parts: sheet.paste(p, (x, H - p.height)); x += p.width + 12
    sheet.save(prev); print('ok')
