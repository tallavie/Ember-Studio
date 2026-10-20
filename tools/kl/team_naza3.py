# Kachol-Lavan: Yuval and Rachel's battle pictures, drawn again from the full-body figures of the reference sheet
# (art/naza_reference.webp), and the grunts without any mark on the shirt.
#   - the figures on the sheet have real proportions (the head is a sixth of the body); a FireRed trainer picture is
#     64x64 with a big head, so the head is scaled down less than the body (head ~20 px, body ~42 px), which keeps the
#     face readable;
#   - scaling: box average (no ringing), then the figure's own 15 colours without dithering, then a crisp dark outline
#     around the figure (the scaled outline comes out grey and broken);
#   - grunts (battle pictures 109, 137; walking 49, 50): the red R becomes the shirt's black, no logo.
#   python team_naza3.py team_raw.json out.json preview.png
import json, sys, os
from PIL import Image, ImageDraw, ImageFilter
from team_naza import REF, FULL, cutout, untile, tile, pal_of, rgb555

# the chin on the cut-out figure (fraction of its height), the head's target height and the body's
SPLIT = {'yuval': (0.245, 24, 39), 'rachel': (0.235, 24, 39)}

def scaled(img, h):
    w = max(1, round(img.size[0] * h / img.size[1]))
    return img.resize((w, h), Image.BOX)

def native(img, k=3):
    """the sheet is pixel art drawn with 3x3 screen pixels: back to one pixel each (the grid phase with the least
    variation inside the blocks; each block -> its median colour)"""
    import statistics
    w, h = img.size; px = img.load()
    def cost(ox, oy):
        t = 0
        for by in range(oy, h - k, k * 2):
            for bx in range(ox, w - k, k * 2):
                vals = [px[bx + i, by + j] for j in range(k) for i in range(k)]
                for c in range(4): t += max(v[c] for v in vals) - min(v[c] for v in vals)
        return t
    ox, oy = min(((a, b) for a in range(k) for b in range(k)), key=lambda p: cost(*p))
    out = Image.new('RGBA', ((w - ox) // k, (h - oy) // k)); op = out.load()
    for y in range(out.size[1]):
        for x in range(out.size[0]):
            vals = [px[ox + x * k + i, oy + y * k + j] for j in range(k) for i in range(k)]
            op[x, y] = tuple(int(statistics.median(v[c] for v in vals)) for c in range(4))
    return out

SPLIT_BODY = [39]
MEDIAN = False
def chibi(fig, who):
    frac, hh, bh = SPLIT[who]
    cut = round(fig.size[1] * frac)
    hh = cut; bh = 63 - hh; SPLIT_BODY[0] = bh           # the head at its own size (one pixel = one of the sheet's)
    head = fig.crop((0, 0, fig.size[0], cut))
    head = head.resize((max(1, round(head.size[0] * hh / head.size[1])), hh), Image.NEAREST)
    if False:                       # the glasses: the grey (unsaturated) pixels on the face -> a clear dark frame
        hp = head.load()
        for y in range(hh // 3, hh):
            for x in range(head.size[0]):
                r, g, b, a = hp[x, y]
                if a > 128 and max(r, g, b) - min(r, g, b) < 28 and 50 < (r + g + b) / 3 < 190: hp[x, y] = (52, 52, 64, 255)
    body = scaled(fig.crop((0, cut, fig.size[0], fig.size[1])), bh)
    # the head keeps its place over the body: the same centre of mass on the neck row
    def centre(im, rows):
        a = im.split()[3]; xs = [x for y in rows for x in range(im.size[0]) if a.getpixel((x, y)) > 128]
        return sum(xs) / len(xs) if xs else im.size[0] / 2
    ch = centre(head, range(hh - 3, hh)); cb = centre(body, range(0, 3))
    W = 64; out = Image.new('RGBA', (W, 64), (0, 0, 0, 0))
    top = 64 - 1 - hh - bh + 1
    bx = round(W / 2 - body.size[0] / 2); hx = round(bx + cb - ch)
    out.alpha_composite(body, (bx, top + hh - 1))
    out.alpha_composite(head, (hx, top))
    return out

def index(img):
    a = img.split()[3]; rgb = Image.new('RGB', img.size, (0, 0, 0)); rgb.paste(img, mask=a)
    # the clothes: a median filter takes the sheet's noise out of the cloth (not the head: the face keeps its detail)
    neck = 64 - SPLIT_BODY[0]
    if MEDIAN: body = rgb.crop((0, neck, 64, 64)).filter(ImageFilter.MedianFilter(3)); rgb.paste(body, (0, neck))
    opaque = [[a.getpixel((x, y)) > 120 for x in range(64)] for y in range(64)]
    src = Image.new('RGB', (64, 64)); n = 0
    pts = [(x, y) for y in range(64) for x in range(64) if opaque[y][x]]
    strip = Image.new('RGB', (len(pts), 1))
    for i, (x, y) in enumerate(pts): strip.putpixel((i, 0), tuple(v & 0xF8 for v in rgb.getpixel((x, y))))
    q = strip.quantize(colors=13, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    qp = q.getpalette()
    pal = [(0, 0, 0)] + [tuple(qp[i * 3:i * 3 + 3]) for i in range(13)] + [(96, 96, 112), (16, 16, 16)]   # 14: glasses, 15: outline
    px = [[0] * 64 for _ in range(64)]
    for i, (x, y) in enumerate(pts): px[y][x] = q.getpixel((i, 0)) + 1
    # the outline: every figure pixel that touches the outside
    for y in range(64):
        for x in range(64):
            if px[y][x] and any(not (0 <= x + dx < 64 and 0 <= y + dy < 64) or not opaque[y + dy][x + dx]
                                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[y][x] = 15
    return px, pal

def degrunt_pic(px, pal, box):
    red = lambda i: i and pal[i][0] > pal[i][1] + 40 and pal[i][0] > pal[i][2] + 40
    pts = [(x, y) for y in range(box[1], box[3]) for x in range(box[0], box[2]) if red(px[y][x])]
    if not pts: return px
    x0, x1 = min(x for x, y in pts) - 1, max(x for x, y in pts) + 1; y0, y1 = min(y for x, y in pts) - 1, max(y for x, y in pts) + 1
    ring = [px[y][x] for y in (y0 - 1, y1 + 1) for x in range(x0, x1 + 1)] + [px[y][x] for x in (x0 - 1, x1 + 1) for y in range(y0, y1 + 1)]
    ring = [c for c in ring if c and not red(c)]
    ring = [c for c in ring if sum(pal[c]) > 150] or ring       # the cloth, not the outline
    shirt = max(set(ring), key=ring.count)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if red(px[y][x]): px[y][x] = shirt
    return px

if __name__ == '__main__':
    raw = json.load(open(sys.argv[1])); out, prev = sys.argv[2], sys.argv[3]
    ref = Image.open(REF)
    res = {'pics': {}, 'ow': {}}; show = []
    def glasses(px, dx=0):                    # Rachel's glasses: two thin frames round the eyes, and a bridge (64x64)
        g = 14
        for x0, x1 in ((31 + dx, 35 + dx), (38 + dx, 42 + dx)):
            for x in range(x0, x1 + 1): px[15][x] = g
            for y in (16, 17): px[y][x0] = g; px[y][x1] = g
            for x in range(x0 + 1, x1): px[18][x] = g
        px[16][37 + dx] = g
    figs = {}
    for who in ('yuval', 'rachel'):
        fig = native(cutout(ref.crop(FULL[who]))); fig = fig.crop(fig.split()[3].getbbox())
        if len(sys.argv) > 4: print(who, 'native', fig.size, round(fig.size[1] * SPLIT[who][0]))
        figs[who] = chibi(fig, who)
        px, pal = index(figs[who])
        if who == 'rachel': glasses(px)
        px = [row[::-1] for row in px]        # mirrored: facing the player (who stands at the bottom left)
        res['pics'][who] = {'gfx': tile(px, 64, 64).hex(), 'pal': [rgb555(c) for c in pal]}
        show.append((px, pal, 64, 64))
    # the double battle: FireRed shows one picture per opponent, so the pair is one picture (like the twins):
    # Rachel a little behind on the right, Yuval in front on the left, one shared palette
    DUO = (-11, 12)
    duo = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    duo.alpha_composite(figs['rachel'], (DUO[1], 0)); duo.alpha_composite(figs['yuval'], (DUO[0], 0))
    px, pal = index(duo); glasses(px, DUO[1]); px = [row[::-1] for row in px]
    res['pics']['duo'] = {'gfx': tile(px, 64, 64).hex(), 'pal': [rgb555(c) for c in pal]}
    show.append((px, pal, 64, 64))
    # the R: male - red inside the chest box; female - the R's pixels (her hair is red too, so a tight box)
    for p, box in (('109', (16, 22, 46, 44)), ('137', (29, 24, 39, 30))):
        pal = pal_of(raw['pics'][p]['pal']); px = degrunt_pic(untile(bytes.fromhex(raw['pics'][p]['gfx']), 64, 64), pal, box)
        if p == '137': px = degrunt_pic(px, pal, (32, 32, 40, 38))       # her red belt buckle: black too
        # black uniform: the greys of the clothes (not the white of the eyes or the outline) much darker
        pal = [c if i == 0 or max(c) - min(c) > 30 or sum(c) > 700 or sum(c) < 30 else tuple(int(v * 0.5) for v in c) for i, c in enumerate(pal)]
        res['pics'][p] = {'gfx': tile(px, 64, 64).hex(), 'pal': [rgb555(c) for c in pal]}; show.append((px, pal, 64, 64))
    owpal = pal_of(raw['ow']['49']['pal'])
    for g in ('49', '50'):
        fr = []
        for k, f in enumerate(raw['ow'][g]['frames']):
            px = untile(bytes.fromhex(f), 16, 32)
            for y in range(22, 28):
                for x in range(5, 11):
                    if px[y][x] in (8, 9): px[y][x] = 13
            fr.append(tile(px, 16, 32).hex())
            if k == 0: show.append((px, owpal, 16, 32))
        res['ow'][g] = fr
    json.dump(res, open(out, 'w'))
    S = 4; W = sum(w * S + 10 for _, _, w, _ in show); sheet = Image.new('RGB', (W, 64 * S), (144, 200, 168)); d = ImageDraw.Draw(sheet); X = 0
    for px, pal, w, h in show:
        for y in range(h):
            for x in range(w):
                if px[y][x]: d.rectangle([X + x * S, (64 - h) * S + y * S, X + x * S + S - 1, (64 - h) * S + y * S + S - 1], fill=pal[px[y][x]])
        X += w * S + 10
    sheet.save(prev); print('ok')
