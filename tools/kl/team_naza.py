# Kachol-Lavan: Team Naza (instead of Team Rocket / "Bureaucracy"). Builds, from the reference sheet
# (art/naza_reference.webp) and the game's own pictures (team_raw.json, exported by the editor):
#   - Yuval and Rachel: battle pictures (64x64, their own 16 colours) from the full-body figures, and walking sprites
#     (16x32, the shared people palette - no new colours) from the small figures;
#   - the grunts: black clothes, the red R on the chest replaced by a Naza clapperboard logo (battle pictures and
#     walking sprites).
# Writes the result as .json (for the editor) and a preview picture to approve first.
#   python team_naza.py team_raw.json out.json preview.png
import json, sys, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'art', 'naza_reference.webp')
FULL = {'rachel': (295, 90, 420, 395), 'yuval': (1055, 85, 1190, 400)}
NPC = {'rachel': (30, 775, 375, 895), 'yuval': (800, 775, 1145, 895)}

def c555(v): return ((v & 31) << 3, ((v >> 5) & 31) << 3, ((v >> 10) & 31) << 3)
def rgb555(c): return (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10)
def pal_of(hexs): b = bytes.fromhex(hexs); return [c555(b[i] | (b[i + 1] << 8)) for i in range(0, 32, 2)]

def untile(data, w, h):            # 4bpp tiles -> 2D index list
    px = [[0] * w for _ in range(h)]
    for t in range(w * h // 64):
        tx, ty = t % (w // 8), t // (w // 8)
        for y in range(8):
            for x in range(8):
                b = data[t * 32 + y * 4 + x // 2]
                px[ty * 8 + y][tx * 8 + x] = (b >> 4) if x & 1 else (b & 15)
    return px
def tile(px, w, h):
    out = bytearray()
    for ty in range(h // 8):
        for tx in range(w // 8):
            for y in range(8):
                for x in range(0, 8, 2): out.append(px[ty * 8 + y][tx * 8 + x] | (px[ty * 8 + y][tx * 8 + x + 1] << 4))
    return out

def cutout(img):
    """the figure without the sheet's background (flood fill from the border, light colours)"""
    img = img.convert('RGBA'); w, h = img.size; px = img.load()
    bg = px[1, 1][:3]; seen = set(); st = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    def close(c): return sum(abs(a - b) for a, b in zip(c[:3], bg)) < 60 or min(c[:3]) > 215
    while st:
        x, y = st.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h): continue
        seen.add((x, y))
        if not close(px[x, y]): continue
        px[x, y] = (0, 0, 0, 0); st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return img.crop(img.split()[3].getbbox())

def to_indexed(img, size, colours=15, palette=None):
    """fit into size (bottom-centred), keep transparency; palette=None: its own 15 colours, else nearest of these"""
    W, H = size; s = min(W / img.size[0], H / img.size[1])
    im = img.resize((max(1, round(img.size[0] * s)), max(1, round(img.size[1] * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0)); canvas.paste(im, ((W - im.size[0]) // 2, H - im.size[1]), im)
    a = canvas.split()[3]; rgb = Image.new('RGB', size, (0, 0, 0)); rgb.paste(canvas, mask=a)
    if palette is None:
        q = rgb.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = [tuple(q.getpalette()[i * 3:i * 3 + 3]) for i in range(colours)]
        px = [[(q.getpixel((x, y)) + 1) if a.getpixel((x, y)) > 110 else 0 for x in range(W)] for y in range(H)]
        return px, [(0, 0, 0)] + pal
    def near(c): return 1 + min(range(1, 16), key=lambda i: sum((p - q) ** 2 for p, q in zip(c, palette[i]))) - 1
    px = [[near(rgb.getpixel((x, y))) if a.getpixel((x, y)) > 110 else 0 for x in range(W)] for y in range(H)]
    return px, palette

def npc_frames(sheet):
    """the four small figures (front, back, left, right), cut where the background separates them"""
    img = sheet.convert('RGB'); w, h = img.size; bg = img.getpixel((2, 2))
    cols = [any(sum(abs(a - b) for a, b in zip(img.getpixel((x, y)), bg)) > 60 for y in range(h)) for x in range(w)]
    runs, x = [], 0
    while x < w:
        if cols[x]:
            s = x
            while x < w and cols[x]: x += 1
            if x - s > 15: runs.append((s, x))
        x += 1
    return [cutout(img.crop((a - 2, 0, b + 2, h))) for a, b in runs[:4]]

def clapper(px, x0, y0, white, black):
    """a tiny clapperboard (8x7): striped top, white board"""
    for x in range(8):
        px[y0][x0 + x] = black
        px[y0 + 1][x0 + x] = white if (x // 2) % 2 == 0 else black
        px[y0 + 2][x0 + x] = black
    for y in range(3, 7):
        for x in range(8): px[y0 + y][x0 + x] = white if 0 < x < 7 and y < 6 else black

def recolour_red(px, pal, box, to):
    n = 0
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            c = pal[px[y][x]]
            if px[y][x] and c[0] > 150 and c[0] > c[1] * 1.6 and c[0] > c[2] * 1.6: px[y][x] = to; n += 1
    return n

def darkest(pal): return min(range(1, 16), key=lambda i: sum(pal[i]))
def lightest(pal): return max(range(1, 16), key=lambda i: sum(pal[i]))

if __name__ == '__main__':
    raw = json.load(open(sys.argv[1])); out, prev_path = sys.argv[2], sys.argv[3]
    ref = Image.open(REF)
    result, previews = {'pics': {}, 'ow': {}}, []
    # ---- grunts: battle pictures 109 (man), 137 (woman); the R is red on the chest ----
    for p in ('109', '137'):
        pal = pal_of(raw['pics'][p]['pal']); px = untile(bytes.fromhex(raw['pics'][p]['gfx']), 64, 64)
        before = [row[:] for row in px]
        red = lambda i: i and pal[i][0] > pal[i][1] + 40 and pal[i][0] > pal[i][2] + 40
        box = (16, 22, 46, 44) if p == '109' else (20, 24, 44, 40)
        pts = [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2]) if red(px[y][x])]
        if pts:
            x0, x1 = min(x for x, y in pts) - 1, max(x for x, y in pts) + 1; y0, y1 = min(y for x, y in pts) - 1, max(y for x, y in pts) + 1
            ring = [px[y][x] for y in (y0 - 1, y1 + 1) for x in range(x0, x1 + 1)] + [px[y][x] for x in (x0 - 1, x1 + 1) for y in range(y0, y1 + 1)]
            ring = [c for c in ring if c and not red(c)]
            shirt = max(set(ring), key=ring.count)
            dark = sum(pal[shirt])
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    if red(px[y][x]) or (px[y][x] and sum(pal[px[y][x]]) <= dark): px[y][x] = shirt
            # the logo: a small clapperboard (7x5)
            cx, cy = (x0 + x1) // 2 - 3, (y0 + y1) // 2 - 2
            W, B = lightest(pal), darkest(pal)
            for x in range(7): px[cy][cx + x] = W if x % 2 == 0 else B
            for y in range(1, 5):
                for x in range(7): px[cy + y][cx + x] = W if 0 < x < 6 and y < 4 else B
        result['pics'][p] = {'gfx': tile(px, 64, 64).hex()}
        previews.append(('grunt %s' % p, before, px, pal, 64, 64))
    # ---- grunts walking (49 man, 50 woman): red shirt -> black, a white dot logo on the chest ----
    owpal = pal_of(raw['ow']['49']['pal'])
    for g in ('49', '50'):
        frames = []
        for k, f in enumerate(raw['ow'][g]['frames']):
            px = untile(bytes.fromhex(f), 16, 32); before = [r[:] for r in px]
            hits = []
            for y in range(20, 30):                    # the shirt: the red R (colours 8, 9) -> the dark shirt colour
                for x in range(16):
                    if px[y][x] in (8, 9): px[y][x] = 13; hits.append((x, y))
            if hits:                                    # a white mark where the R was
                cx = round(sum(x for x, y in hits) / len(hits)); cy = min(y for x, y in hits)
                px[cy][cx] = 14; px[cy + 1][cx] = 14; px[cy][cx - 1] = 15 if px[cy][cx - 1] else px[cy][cx - 1]
            frames.append(tile(px, 16, 32).hex())
            if k == 0: previews.append(('walk %s' % g, before, px, owpal, 16, 32))
        result['ow'][g] = frames
    # ---- Yuval and Rachel: battle pictures and walking sprites from the reference ----
    # their walking sprites share one new palette (15 colours from both of them)
    allf = [f for w in ('yuval', 'rachel') for f in npc_frames(ref.crop(NPC[w]))]
    strip = Image.new('RGBA', (sum(f.size[0] for f in allf), max(f.size[1] for f in allf)), (0, 0, 0, 0)); xx = 0
    for f in allf: strip.paste(f, (xx, 0), f); xx += f.size[0]
    a_ = strip.split()[3]; rgbs = Image.new('RGB', strip.size); rgbs.paste(strip, mask=a_)
    small = rgbs.resize((rgbs.size[0] // 3, rgbs.size[1] // 3), Image.LANCZOS)
    qq = small.quantize(colors=15, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    npcpal = [(0, 0, 0)] + [tuple(qq.getpalette()[i * 3:i * 3 + 3]) for i in range(15)]
    result['npc_pal'] = [rgb555(c) for c in npcpal]
    for who in ('yuval', 'rachel'):
        fig = cutout(ref.crop(FULL[who]))
        px, pal = to_indexed(fig, (64, 62))
        px = [[0] * 64, [0] * 64] + px
        result['pics'][who] = {'gfx': tile(px, 64, 64).hex(), 'pal': [rgb555(c) for c in pal]}
        previews.append((who + ' battle', None, px, pal, 64, 64))
        fr = npc_frames(ref.crop(NPC[who]))
        owf = [to_indexed(f, (16, 31), palette=npcpal)[0] for f in fr]
        owf = [[[0] * 16] + p for p in owf]                     # 16x32
        # FireRed's 9 walking frames: down, up, left (standing), then the walking steps (the same pictures here)
        order = [0, 1, 2, 0, 0, 1, 1, 2, 2]
        result['ow'][who] = [tile(owf[i], 16, 32).hex() for i in order]
        for i, name in enumerate(('front', 'back', 'left')): previews.append((who + ' ' + name, None, owf[i], npcpal, 16, 32))
    json.dump(result, open(out, 'w'))
    # ---- the preview: before | after, 4x ----
    S = 4; cells = []
    for name, before, after, pal, w, h in previews:
        im = Image.new('RGB', (w * S * (2 if before else 1) + (8 if before else 0), h * S + 16), (140, 170, 200)); d = ImageDraw.Draw(im)
        for k, src in enumerate([before, after] if before else [after]):
            for y in range(h):
                for x in range(w):
                    if src[y][x]: d.rectangle([k * (w * S + 8) + x * S, 16 + y * S, k * (w * S + 8) + x * S + S - 1, 16 + y * S + S - 1], fill=pal[src[y][x]])
        d.text((2, 2), name, fill=(0, 0, 0)); cells.append(im)
    W = sum(c.width + 10 for c in cells); H = max(c.height for c in cells)
    sheet = Image.new('RGB', (W, H), (90, 110, 130)); x = 0
    for c in cells: sheet.paste(c, (x, 0)); x += c.width + 10
    sheet.save(prev_path); print('ok', len(cells))
