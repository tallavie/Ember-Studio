# Kachol-Lavan: Herzl, from the user's pictures (art/herzl/):
#   walking sprite (16x32, 9 frames) from the small sheet 22.jpg (3 columns: step, stand, step; rows: front, back,
#     left, right), in the fixed NPC palette of slot 3 (0x1104: skin, greys for the black coat, white);
#   battle picture (64x64) from the full figure 20.jpg, the head scaled down less than the body (like Yuval and Rachel).
#   python herzl.py out.json preview.png
import json, sys
from PIL import Image, ImageDraw
from team_naza import cutout, tile, rgb555
from team_naza2 import slot_pal, SLOT_PAL
from team_naza3 import index
import team_naza3

ART = __file__.replace('herzl.py', 'art/herzl/')
SLOT = 3

def main_part(img):
    """only the figure: opaque pieces smaller than 3% of the biggest are stray marks of the next cell"""
    a = img.split()[3]; w, h = img.size; seen = [[False] * w for _ in range(h)]; parts = []
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or a.getpixel((x0, y0)) < 120: continue
            st = [(x0, y0)]; seen[y0][x0] = True; pts = []
            while st:
                x, y = st.pop(); pts.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and a.getpixel((nx, ny)) >= 120: seen[ny][nx] = True; st.append((nx, ny))
            parts.append(pts)
    big = max(len(p) for p in parts); out = Image.new('RGBA', img.size, (0, 0, 0, 0)); src = img.load(); op = out.load()
    for pts in parts:
        if len(pts) >= big * 0.03:
            for x, y in pts: op[x, y] = src[x, y]
    return out.crop(out.split()[3].getbbox())

def cells(sheet):
    """the 12 figures of a 3x4 sheet, each cut out of its own cell"""
    w, h = sheet.size; out = []; g = sheet.convert('L')
    ink = [sum(1 for x in range(0, w, 2) if g.getpixel((x, y)) < 200) > 2 for y in range(h)]
    bands, y = [], 0
    while y < h:
        if ink[y]:
            y0 = y
            while y < h and ink[y]: y += 1
            if y - y0 > 40: bands.append((y0, y))
        y += 1
    assert len(bands) == 4, bands
    for r in range(4):
        for c in range(3):
            box = (c * w // 3, bands[r][0] - 2, (c + 1) * w // 3, bands[r][1] + 2)
            out.append(main_part(cutout(sheet.crop(box))))
    return out

def small(fig, H):
    """the figure H pixels tall (box average), alpha kept"""
    W = max(1, round(fig.size[0] * H / fig.size[1]))
    return fig.resize((W, H), Image.BOX)

def to_frame(fig, H, sp):
    """a 16x32 frame: the figure H tall, bottom-centred (feet on row 31), colours -> the slot palette"""
    im = small(fig, H); W = im.size[0]
    ox = (16 - W) // 2; oy = 32 - H
    px = [[0] * 16 for _ in range(32)]
    dark = [i for i in range(1, 16) if sum(sp[i]) < 260 and i != 15]          # greys/darks for the coat and hair
    for y in range(H):
        for x in range(W):
            r, g, b, a = im.getpixel((x, y))
            if a < 120 or not (0 <= x + ox < 16): continue
            c = (r, g, b)
            px[y + oy][x + ox] = min(range(1, 16), key=lambda i: sum((p - q) ** 2 for p, q in zip(c, sp[i])))
    # an outline: figure pixels that touch the outside -> black (15)
    out = [row[:] for row in px]
    for y in range(32):
        for x in range(16):
            if px[y][x] and any(not (0 <= x + dx < 16 and 0 <= y + dy < 32) or not px[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out[y][x] = 15
    return out

if __name__ == '__main__':
    out, prev = sys.argv[1], sys.argv[2]
    H = int(sys.argv[3]) if len(sys.argv) > 3 else 28
    sp = slot_pal(SLOT)
    figs = cells(Image.open(ART + '22.jpg'))
    # FireRed order: down, up, left (standing), down step x2, up step x2, left step x2
    order = [1, 4, 7, 0, 2, 3, 5, 6, 8]
    frames = [to_frame(figs[i], H, sp) for i in order]
    # the battle picture
    fig = cutout(Image.open(ART + '20.jpg'))
    pxl = fig.load()                                   # the grey shadow under the feet: away
    for y in range(int(fig.size[1] * 0.88), fig.size[1]):
        for x in range(fig.size[0]):
            r, g, b, a = pxl[x, y]
            if a and max(r, g, b) - min(r, g, b) < 40 and (r + g + b) / 3 > 150: pxl[x, y] = (0, 0, 0, 0)
    fig = fig.crop(fig.split()[3].getbbox())
    fig = main_part(fig)
    pxl = fig.load(); W0, H0 = fig.size                # white holes closed in by the figure (between the coat and the legs)
    seen = set()
    for y0 in range(H0):
        for x0 in range(W0):
            if (x0, y0) in seen: continue
            r, g, b, a = pxl[x0, y0]
            if not (a and min(r, g, b) > 215): continue
            st = [(x0, y0)]; pts = []; seen.add((x0, y0))
            while st:
                x, y = st.pop(); pts.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W0 and 0 <= ny < H0 and (nx, ny) not in seen:
                        q = pxl[nx, ny]
                        if q[3] and min(q[:3]) > 215: seen.add((nx, ny)); st.append((nx, ny))
            if len(pts) > 1500:
                for x, y in pts: pxl[x, y] = (0, 0, 0, 0)
    fig = fig.crop((0, 0, W0, int(H0 * 0.74)))         # to the knees: a bigger face
    fig = fig.crop(fig.split()[3].getbbox())
    body = small(fig, 63)
    if body.size[0] > 64: body = fig.resize((64, round(fig.size[1] * 64 / fig.size[0])), Image.BOX)
    big = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    big.alpha_composite(body, ((64 - body.size[0]) // 2, 64 - body.size[1]))
    pic, pal = index(big)
    json.dump({'ow': [tile(f, 16, 32).hex() for f in frames], 'ow_slot': [SLOT, SLOT_PAL[SLOT][0]],
               'pic': {'gfx': tile(pic, 64, 64).hex(), 'pal': [rgb555(c) for c in pal]}}, open(out, 'w'))
    S = 5; parts = []
    def draw(px, pal, S, w, h):
        im = Image.new('RGB', (w * S, h * S), (144, 200, 168)); d = ImageDraw.Draw(im)
        for y in range(h):
            for x in range(w):
                if px[y][x]: d.rectangle([x * S, y * S, x * S + S - 1, y * S + S - 1], fill=pal[px[y][x]])
        return im
    parts.append(draw(pic, pal, 4, 64, 64))
    for f in frames: parts.append(draw(f, sp, 6, 16, 32))
    W = sum(p.width + 10 for p in parts); Hh = max(p.height for p in parts)
    sheet = Image.new('RGB', (W, Hh), (90, 110, 130)); x = 0
    for p in parts: sheet.paste(p, (x, Hh - p.height)); x += p.width + 10
    sheet.save(prev); print('ok')
