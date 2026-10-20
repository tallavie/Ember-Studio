# Kachol-Lavan: the Seagallop ferry that lies at the piers (walking sprite 151, 128x64) becomes an Israel Railways
# double-decker standing on a bridge (it is placed over water), drawn from art/train_car.webp.
#   The 128x64 picture is four 64x32 pieces (the sprite's subsprites): top-left, top-right, bottom-left,
#   bottom-right, each 8x4 tiles in order. Its palette (tag 0x1115) is used by this sprite only.
#   python train_ferry.py game.gba out.json preview.png      (game.gba: to show the old ferry next to the new one)
import json, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
CAR = os.path.join(HERE, 'art', 'train_car.webp')

def rgb555(c): return (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10)
def c555(v): return ((v & 31) << 3, ((v >> 5) & 31) << 3, ((v >> 10) & 31) << 3)

PIECES = ((0, 0), (64, 0), (0, 32), (64, 32))
def to_bytes(px):
    out = bytearray()
    for X, Y in PIECES:
        for ty in range(4):
            for tx in range(8):
                for y in range(8):
                    for x in range(0, 8, 2):
                        a = px[Y + ty * 8 + y][X + tx * 8 + x]; b = px[Y + ty * 8 + y][X + tx * 8 + x + 1]
                        out.append(a | (b << 4))
    return bytes(out)

def from_bytes(data):
    px = [[0] * 128 for _ in range(64)]; i = 0
    for X, Y in PIECES:
        for ty in range(4):
            for tx in range(8):
                for y in range(8):
                    for x in range(0, 8, 2):
                        v = data[i]; i += 1
                        px[Y + ty * 8 + y][X + tx * 8 + x] = v & 15; px[Y + ty * 8 + y][X + tx * 8 + x + 1] = v >> 4
    return px

def picture():
    """the train (128 wide) on a bridge: rails, a concrete deck and three piers"""
    im = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    car = Image.open(CAR).convert('RGBA'); car = car.crop(car.split()[3].getbbox())
    h = round(car.size[1] * 126 / car.size[0])
    car = car.resize((126, h), Image.BOX)
    top = 50 - h
    d = ImageDraw.Draw(im)
    for x in (14, 58, 102):                                   # piers
        d.rectangle([x, 54, x + 11, 63], fill=(120, 116, 112, 255)); d.rectangle([x + 9, 54, x + 11, 63], fill=(84, 80, 80, 255))
        d.line([x, 54, x, 63], fill=(24, 24, 24, 255)); d.line([x + 11, 54, x + 11, 63], fill=(24, 24, 24, 255))
    d.rectangle([0, 51, 127, 55], fill=(168, 164, 156, 255))   # the deck
    d.line([0, 55, 127, 55], fill=(96, 92, 88, 255)); d.line([0, 56, 127, 56], fill=(24, 24, 24, 255))
    for x in range(1, 128, 4): d.line([x, 51, x + 1, 51], fill=(104, 72, 48, 255))   # sleepers
    d.line([0, 50, 127, 50], fill=(72, 72, 80, 255))           # the rail
    im.alpha_composite(car, (1, top))
    a = im.split()[3]; rgb = Image.new('RGB', im.size); rgb.paste(im, mask=a)
    q = rgb.point(lambda v: v & 0xF8).quantize(colors=15, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    qp = q.getpalette(); pal = [(0, 0, 0)] + [tuple(qp[i * 3:i * 3 + 3]) for i in range(15)]
    px = [[(q.getpixel((x, y)) + 1) if a.getpixel((x, y)) > 128 else 0 for x in range(128)] for y in range(64)]
    return px, pal

if __name__ == '__main__':
    rom, out, prev = sys.argv[1], sys.argv[2], sys.argv[3]
    px, pal = picture()
    json.dump({'gfx': to_bytes(px).hex(), 'pal': [rgb555(c) for c in pal]}, open(out, 'w'))
    d = open(rom, 'rb').read()
    rd32 = lambda a: int.from_bytes(d[a:a + 4], 'little')
    info = rd32(0x39FE20 + 151 * 4) - 0x08000000; img = rd32(rd32(info + 28) - 0x08000000) - 0x08000000
    t = rd32(0x5F5DC) - 0x08000000; opal = None
    for k in range(100):
        p, tag = rd32(t + k * 8), int.from_bytes(d[t + k * 8 + 4:t + k * 8 + 6], 'little')
        if tag == 0x1115: q = p - 0x08000000; opal = [c555(int.from_bytes(d[q + i * 2:q + i * 2 + 2], 'little')) for i in range(16)]
    old = from_bytes(d[img:img + 4096])
    S = 4; sheet = Image.new('RGB', (128 * S, 2 * 64 * S + 8), (64, 128, 200)); dr = ImageDraw.Draw(sheet)
    for k, (p, pl) in enumerate(((old, opal), (px, pal))):
        for y in range(64):
            for x in range(128):
                if p[y][x]: dr.rectangle([x * S, k * (64 * S + 8) + y * S, x * S + S - 1, k * (64 * S + 8) + y * S + S - 1], fill=pl[p[y][x]])
    sheet.save(prev); print('ok')
