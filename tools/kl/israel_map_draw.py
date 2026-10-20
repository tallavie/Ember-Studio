# Draws the town map of Kachol-Lavan in the shape of Israel, at the game's size (240x160, the grid of sections starts
# at tile 4,4), like an Israeli road map: the neighbours in a muted colour, the Mediterranean and the Gulf of Eilat,
# the Kinneret and the Dead Sea, roads and towns. Uses the layout of israel_map.py (data/israel_map.json).
# Writes the picture for the game and a bigger draft with the names, for checking.
#   python israel_map_draw.py israel_map.json out_game.png out_draft.png
import json, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageChops
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import israel_map as IM

OX, OY = 4, 4                                   # the section grid inside the 30x20 tilemap
SEA, SEA2 = (56, 112, 192), (72, 132, 212)
LAKE = (96, 168, 232)
NEIGHBOUR, NEIGHBOUR2 = (184, 176, 160), (172, 164, 148)
GREEN, GREEN2 = (96, 176, 88), (120, 196, 96)
SAND, SAND2 = (224, 200, 120), (204, 176, 100)
COAST = (240, 232, 184)
BORDER = (112, 96, 88)
ROAD, ROAD_EDGE = (252, 252, 244), (92, 76, 60)
TOWN, TOWN_EDGE = (228, 52, 44), (252, 252, 252)
PLACE, POST = (252, 204, 60), (180, 148, 232)

def px(lat, lon): return ((OX + IM.col_of(lon)) * 8, (OY + IM.row_of(lat)) * 8)

# the coast from Lebanon to Sinai (north to south): the sea is west of it
COAST_LINE = [(34.30, 35.62), (33.60, 35.36), (33.09, 35.10), (32.93, 35.07), (32.85, 35.06), (32.83, 34.98), (32.75, 34.95), (32.50, 34.88),
              (32.33, 34.84), (32.08, 34.75), (31.80, 34.63), (31.50, 34.45), (31.22, 34.27), (31.15, 33.90), (31.10, 33.00)]
GULF = [(29.56, 34.95), (29.52, 35.01), (28.60, 34.80), (28.60, 34.60)]

def pattern(img, colour, step, mask=None):
    d = ImageDraw.Draw(img)
    for y in range(0, 160, step):
        for x in range((y // step) % 2 * step, 240, step * 2):
            if mask is None or mask.getpixel((x, y)): d.point((x, y), fill=colour)

def draw(design):
    img = Image.new('RGB', (240, 160), NEIGHBOUR)
    pattern(img, NEIGHBOUR2, 4)
    d = ImageDraw.Draw(img)
    # sea: everything west of the coast, and the gulf
    sea = [px(lat, lon) for lat, lon in COAST_LINE]
    sea_poly = [(-10, -10)] + sea + [(-10, sea[-1][1]), (-10, -10)]
    seamask = Image.new('L', (240, 160), 0); sm = ImageDraw.Draw(seamask)
    sm.polygon(sea_poly, fill=255); sm.polygon([px(*p) for p in GULF], fill=255)
    seaimg = Image.new('RGB', (240, 160), SEA); pattern(seaimg, SEA2, 4)
    img.paste(seaimg, (0, 0), seamask)
    # Israel: green north, sand south
    poly = [px(lat, lon) for lat, lon in IM.OUTLINE]
    mask = Image.new('L', (240, 160), 0); ImageDraw.Draw(mask).polygon(poly, fill=255)
    land = Image.new('RGB', (240, 160), GREEN); pattern(land, GREEN2, 4)
    desert = Image.new('RGB', (240, 160), SAND); pattern(desert, SAND2, 4)
    edge = px(31.35, 35)[1]
    dmask = Image.new('L', (240, 160), 0); dm = ImageDraw.Draw(dmask)
    for y in range(160):                       # an ordered dither over two tile rows (no in-between colours)
        for x in range(240):
            t = (y - edge) / 16 + 0.5
            if t >= 1 or (t > 0 and ((x * 5 + y * 3) % 8) / 8 < t): dm.point((x, y), fill=255)
    land.paste(desert, (0, 0), dmask)
    img.paste(land, (0, 0), mask)
    # the border with the neighbours: dashed; the coast: light
    for (a, b) in zip(poly, poly[1:] + poly[:1]):
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        on_sea = seamask.getpixel((max(0, min(239, int(mid[0]) - 2)), max(0, min(159, int(mid[1]))))) or seamask.getpixel((max(0, min(239, int(mid[0]) - 1)), max(0, min(159, int(mid[1]) + 1))))
        if on_sea: d.line([a, b], fill=COAST, width=1)
        else:
            n = max(1, int(((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 / 2))
            for i in range(0, n, 2):
                p0 = (a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n); p1 = (a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n)
                d.line([p0, p1], fill=BORDER, width=1)
    # lakes: on their cells, rounded
    lakes = [tuple(c) for c in design['lakes']]
    for x, y in lakes:
        X, Y = (OX + x) * 8, (OY + y) * 8
        up, dn = (x, y - 1) in lakes, (x, y + 1) in lakes
        d.rounded_rectangle([X + 1, Y + (0 if up else 1), X + 6, Y + (7 if dn else 6)], radius=2, fill=LAKE, outline=COAST)
    for x, y in lakes:                          # join neighbouring lake cells
        X, Y = (OX + x) * 8, (OY + y) * 8
        if (x, y + 1) in lakes: d.rectangle([X + 2, Y + 5, X + 5, Y + 9], fill=LAKE)
    # roads
    cen = {p['key']: ((OX + p['cell'][0]) * 8 + 4, (OY + p['cell'][1]) * 8 + 4) for p in design['places']}
    for r in design['roads']:
        pts = [cen[s] for s in r['stops']]
        d.line(pts, fill=ROAD_EDGE, width=4); d.line(pts, fill=ROAD, width=2)
    # places
    share = design.get('share', {})
    for p in design['places']:
        if p['key'] in share: continue
        x, y = cen[p['key']]
        if p['kind'] == 'city': d.rectangle([x - 3, y - 3, x + 3, y + 3], fill=TOWN, outline=TOWN_EDGE)
        else: d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=PLACE if p['kind'] == 'place' else POST, outline=ROAD_EDGE)
    return img, cen

def draft(img, cen, design, out, scale=4):
    big = img.resize((240 * scale, 160 * scale), Image.NEAREST)
    W, H = big.size
    L, T = 300, 30
    canvas = Image.new('RGB', (W + 2 * L, H + 2 * T), (24, 28, 40)); canvas.paste(big, (L, T))
    d = ImageDraw.Draw(canvas)
    f_city = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 17); f_place = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    rtl = lambda s: s[::-1].translate(str.maketrans('()', ')('))   # Pillow does not reorder Hebrew: flip it (the names have no digits)
    share = design.get('share', {})
    used = {True: [], False: []}
    items = []
    for p in design['places']:
        x, y = cen[p['key']]
        right = x >= 100                       # east of the hills: labels on the right
        items.append((right, y, x, p))
    for right, y0, x, p in sorted(items, key=lambda t: (t[0], t[1])):
        X, Y = L + x * scale, T + y0 * scale
        y = Y
        while any(abs(y - u) < 20 for u in used[right]): y += 20      # push down until it does not overlap
        used[right].append(y)
        name = rtl(p['he']) + (' (' + rtl(dict((q['key'], q['he']) for q in design['places'])[share[p['key']]]) + '-ב)' if p['key'] in share else '')
        f = f_city if p['kind'] == 'city' else f_place
        col = (255, 255, 255) if p['kind'] == 'city' else (255, 214, 102) if p['kind'] == 'place' else (200, 176, 255)
        tw = d.textlength(name, font=f)
        lx = L + W + 16 if right else L - 16 - tw
        d.line([(X, Y), ((lx - 6) if right else (lx + tw + 6), y)], fill=(110, 110, 130))
        d.text((lx, y - 10), name, font=f, fill=col)
    # the two top rows are under the game's title bar: shade them in the draft
    shade = Image.new('RGBA', (W, 2 * 8 * scale), (0, 0, 0, 150)); canvas.paste(shade, (L, T), shade)
    d.text((L + 8, T + 6), rtl('מוסתר במשחק מאחורי פס הכותרת'), font=f_place, fill=(200, 200, 210))
    legend = [('עיר', (255, 255, 255)), ('מקום בעלילה', (255, 214, 102)), ('אחרי המשחק (האיים)', (200, 176, 255))]
    for i, (t, c) in enumerate(legend): d.text((L + 10 + i * 230, H + T + 4), rtl(t), font=f_place, fill=c)
    canvas.save(out)

if __name__ == '__main__':
    design = json.load(open(sys.argv[1], encoding='utf8'))
    img, cen = draw(design)
    img.save(sys.argv[2])
    draft(img, cen, design, sys.argv[3])
    print('ok')
