# Kachol-Lavan: the Seagallop ferry scene becomes an Israel Railways double-decker crossing the country on a track,
# built from a reference picture (art/train_reference.jpg):
#   - the background (sky, clouds, mountains, the double track) is the picture itself, made to wrap around every
#     256 pixels (the layer scrolls), reduced to one 15-colour palette, and to at most 384 tiles (the room before the
#     layout in video memory; the editor patches the scene's code to load that many) by merging the most alike tiles;
#   - the locomotive is the 64x40 ship sprite (drawn facing left; the game flips it when the trip goes right);
#   - the carriages are the four "wake" frames: the wake is ten copies 15 pixels apart behind the ship, so the frames
#     are a carriage pattern that repeats every 15 pixels, and the copies line up into one long train.
#   python train_scene.py out.json preview_dir
import json, os, sys
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'art', 'train_reference.jpg')
# where the train is in the reference picture (pixels): its body and wheels, the cab end, one window period
TRAIN_Y = (405, 790)          # roof to rails
CAB_X = (140, 1197)           # the left end: cab, door, louvers, first windows
WIN_X = (752, 839)            # one period of the window rows
SKY_Y = (0, 415)              # above the train: sky, clouds, mountains
TRACK_Y = (770, 1008)         # below: the track the train stands on, and the near track

def rgb555(c): return (c[0] >> 3) | ((c[1] >> 3) << 5) | ((c[2] >> 3) << 10)
def snap(img): return img.point(lambda v: v & 0xF8)        # GBA colours: 5 bits

def wrap(img, w, blend=40):
    """a strip that repeats every w pixels: the last `blend` pixels fade into the first ones"""
    out = img.crop((0, 0, w, img.size[1])).copy()
    for x in range(blend):
        a = x / blend
        col_a = img.crop((w + x, 0, w + x + 1, img.size[1])); col_b = out.crop((x, 0, x + 1, img.size[1]))
        out.paste(Image.blend(col_a, col_b, a), (x, 0))
    return out

def background(ref):
    W = 256
    sky = ref.crop((0, SKY_Y[0], ref.size[0], SKY_Y[1]))           # rows 0..95: sky and mountains
    s = 96 / sky.size[1]; sky = sky.resize((int(sky.size[0] * s), 96), Image.LANCZOS)
    tr = ref.crop((0, TRACK_Y[0], ref.size[0], TRACK_Y[1]))         # rows 96..159: the track (rails at row ~99)
    s = 64 / tr.size[1]; tr = tr.resize((int(tr.size[0] * s), 64), Image.LANCZOS)
    sky, tr = wrap(sky, W), wrap(tr, W)
    bg = Image.new('RGB', (W, 256)); bg.paste(sky, (0, 0)); bg.paste(tr, (0, 96))
    for y in (160, 192, 224): bg.paste(tr.crop((0, 32, W, 64)), (0, y))   # below the screen: more ballast
    return bg

def quant(img, n, dither=True):
    q = snap(img).quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE)
    pal = q.getpalette()[:n * 3]
    return q, [tuple(pal[i * 3:i * 3 + 3]) for i in range(n)]

def tiles_of(idx):
    w, h = idx.size; px = idx.load(); tiles, index, tm = [], {}, []
    for ty in range(h // 8):
        for tx in range(w // 8):
            t = tuple(tuple(px[tx * 8 + x, ty * 8 + y] + 1 for x in range(8)) for y in range(8))   # colour 0 = transparent
            if t not in index: index[t] = len(tiles); tiles.append(t)
            tm.append(index[t] | (4 << 12))
    return tiles, tm

MAX_TILES = 384
def merge(tiles, tm, pal, limit):
    """too many tiles: join the most alike ones (colour distance over the 64 pixels) until `limit` are left; each
    group keeps the tile used most often"""
    if len(tiles) <= limit: return tiles, tm
    import itertools
    use = [0] * len(tiles)
    for e in tm: use[e & 0x3FF] += 1
    flat = [[pal[c] for row in t for c in row] for t in tiles]
    def dist(a, b): return sum(abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2]) for p, q in zip(flat[a], flat[b]))
    pairs = sorted((dist(a, b), a, b) for a, b in itertools.combinations(range(len(tiles)), 2))
    parent = list(range(len(tiles)))
    def root(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    groups = len(tiles)
    for d, a, b in pairs:
        if groups <= limit: break
        ra, rb = root(a), root(b)
        if ra == rb: continue
        if use[rb] > use[ra]: ra, rb = rb, ra
        parent[rb] = ra; use[ra] += use[rb]; groups -= 1
    keep = sorted(set(root(i) for i in range(len(tiles))))
    new = {k: i for i, k in enumerate(keep)}
    return [tiles[k] for k in keep], [(new[root(e & 0x3FF)]) | (e & 0xF000) for e in tm]

def pack(tiles):
    out = bytearray()
    for t in tiles:
        for row in t:
            for x in range(0, 8, 2): out.append(row[x] | (row[x + 1] << 4))
    return out

def sprite_bytes(px, w, h):
    out = bytearray()
    for ty in range(h // 8):
        for tx in range(w // 8):
            for y in range(8):
                for x in range(0, 8, 2): out.append(px[tx * 8 + x][ty * 8 + y] | (px[tx * 8 + x + 1][ty * 8 + y] << 4))
    return out

CAR = os.path.join(HERE, 'art', 'train_car.webp')        # the train alone, with transparency (preferred)
def train_parts(ref):
    H = 24                                                            # body + wheels: rows 16..39 of the sprite
    if os.path.isfile(CAR):
        car_img = Image.open(CAR).convert('RGBA'); car_img = car_img.crop(car_img.split()[3].getbbox())
        h = car_img.size[1]; s = H / h
        cab = car_img.crop((0, 0, int(64 / s), h)).resize((64, H), Image.LANCZOS)
        # two window periods of the middle section, squeezed into the 15 px the carriage copies repeat at
        w0 = int(car_img.size[0] * 0.39); win = car_img.crop((w0, 0, w0 + int(car_img.size[0] * 0.107), h)).resize((15, H), Image.LANCZOS)
    else:
        cab = ref.crop((CAB_X[0], TRAIN_Y[0], CAB_X[1], TRAIN_Y[1])).resize((64, H), Image.LANCZOS).convert('RGBA')
        win = ref.crop((WIN_X[0], TRAIN_Y[0], WIN_X[1], TRAIN_Y[1])).resize((15, H), Image.LANCZOS).convert('RGBA')
    both = Image.new('RGBA', (64 + 15, H)); both.paste(cab, (0, 0)); both.paste(win, (64, 0))
    alpha = both.split()[3]; rgb = Image.new('RGB', both.size, (0, 0, 0)); rgb.paste(both, mask=alpha)
    q, pal = quant(rgb, 15, dither=False)
    px, ap = q.load(), alpha.load()
    loco = [[0] * 40 for _ in range(64)]
    for y in range(H):
        for x in range(64):
            loco[x][16 + y] = px[x, y] + 1 if ap[x, y] >= 128 else 0
    car = [[0] * 32 for _ in range(32)]
    for y in range(H):
        for x in range(32):
            car[x][y] = px[64 + (x % 15), y] + 1 if ap[64 + (x % 15), y] >= 128 else 0
    one = sprite_bytes(car, 32, 32)
    return sprite_bytes(loco, 64, 40), one * 4, pal, loco, car     # all four wake frames: the same carriage pattern

if __name__ == '__main__':
    out, pdir = sys.argv[1], sys.argv[2]
    ref = Image.open(REF).convert('RGB')
    bg = background(ref)
    idx, bpal = quant(bg, 15, False)
    tiles, tm = tiles_of(idx)
    tiles, tm = merge(tiles, tm, [(0, 0, 0)] + bpal, MAX_TILES)
    blur, dither = 0, False
    sp, wake, spal, loco, car = train_parts(ref)
    json.dump({'bg_tiles': pack(tiles).hex(), 'ntiles': len(tiles), 'bg_pal': [0] + [rgb555(c) for c in bpal],
               'bg_map': tm, 'sprite': sp.hex(), 'wake': wake.hex(), 'sprite_pal': [0] + [rgb555(c) for c in spal]}, open(out, 'w'))
    # preview: the background, the carriages (copies 15 px apart, flipped like in the game) and the locomotive
    prev = Image.new('RGB', (240, 160)); bp = [(0, 0, 0)] + bpal; sp_pal = [(0, 0, 0)] + spal
    for y in range(160):
        for x in range(240): prev.putpixel((x, y), bp[idx.getpixel((x, y)) + 1])
    for k in range(10):
        X = 20 + k * 15
        for y in range(32):
            for x in range(32):
                c = car[31 - x][y]
                if c: prev.putpixel((X + x, 76 + y), sp_pal[c])
    for y in range(40):
        for x in range(64):
            c = loco[63 - x][y]
            if c and 170 + x < 240: prev.putpixel((170 + x, 60 + y), sp_pal[c])
    prev.resize((720, 480), Image.NEAREST).save(os.path.join(pdir, 'train_scene.png'))
    print('bg tiles', len(tiles), 'blur', blur, 'dither', dither)
