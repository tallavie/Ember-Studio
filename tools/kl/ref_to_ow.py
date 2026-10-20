# Reference pixel-art sheet (6 poses) -> FireRed overworld sprite: 9 frames of 16x32, 4bpp, 15 colours + transparent.
# Frame order: 0 down, 1 up, 2 left, 3-4 walk down, 5-6 walk up, 7-8 walk left (right = mirrored left).
from PIL import Image, ImageOps, ImageEnhance
from ref_to_intro import remove_background, deepen_grays

# poses in the reference sheet (x0, y0, x1, y1): front, back, facing right, facing left, front 2, facing left 2
BOXES = [(404, 27, 499, 191), (540, 27, 634, 191), (404, 214, 499, 370), (540, 214, 634, 370),
         (404, 392, 499, 547), (540, 392, 634, 547)]
FIG_H = 22                      # character height in pixels (FireRed NPCs are ~20-22 px tall, feet on row 31)


def pose_images(path):
    im = Image.open(path).convert('RGB')
    out = []
    for b in BOXES:
        p = remove_background(im.crop(b))
        out.append(p.crop(p.getbbox()))
    return out


def shrink(p):
    s = FIG_H / p.height
    w, h = max(1, round(p.width * s)), FIG_H
    small = p.resize((w * 4, h * 4), Image.LANCZOS).resize((w, h), Image.BOX)
    a = small.split()[3].point(lambda v: 255 if v >= 120 else 0)
    rgb = ImageEnhance.Color(ImageEnhance.Contrast(small.convert('RGB')).enhance(1.2)).enhance(1.2)
    fr = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    piece = rgb.convert('RGBA'); piece.putalpha(a)
    piece = deepen_grays(piece)
    fr.paste(piece, ((16 - w) // 2, 31 - h), piece)
    return fr


DEFAULT_ORDER = ['0', '1', '3', '4', 'm4', '1', 'm1', '5', 'm2']   # Zelekha's sheet


def frames(path, order=None):
    """order: 9 entries (down, up, left, walk down x2, walk up x2, walk left x2): pose index, 'm' prefix = mirrored"""
    P = [shrink(p) for p in pose_images(path)]
    pick = lambda k: ImageOps.mirror(P[int(k[1:])]) if k.startswith('m') else P[int(k)]
    return [pick(k) for k in (order or DEFAULT_ORDER)]


def quantize(frs, ncol=14):
    opaque = [c[:3] for f in frs for c in f.getdata() if c[3]]
    vivid = [c for c in opaque if min(c) > 220 or max(c) < 50]
    sample = Image.new('RGB', (len(opaque) + len(vivid) * 4, 1)); sample.putdata(opaque + vivid * 4)
    pal = sample.quantize(colors=ncol, method=Image.MEDIANCUT, kmeans=3)
    colours = [tuple(pal.getpalette()[i * 3:i * 3 + 3]) for i in range(ncol)]
    grids = []
    for f in frs:
        rgb = Image.new('RGB', f.size); rgb.paste(f, mask=f.split()[3])
        q = rgb.quantize(palette=pal, dither=Image.NONE)
        g = [[(1 + q.getpixel((x, y))) if f.getpixel((x, y))[3] else 0 for x in range(16)] for y in range(32)]
        # dark outline where the silhouette touches transparency (index 15)
        out = [row[:] for row in g]
        for y in range(32):
            for x in range(16):
                if g[y][x] == 0 and any(0 <= x + dx < 16 and 0 <= y + dy < 32 and g[y + dy][x + dx] not in (0, 15)
                                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = 15
        grids.append(out)
    return grids, [(112, 192, 160)] + colours + [(24, 24, 32)]   # 16 colours: 0 = transparent


def preview(grids, pal, path, scale=8):
    im = Image.new('RGB', (16 * len(grids), 32), pal[0])
    for k, g in enumerate(grids):
        for y in range(32):
            for x in range(16):
                if g[y][x]: im.putpixel((k * 16 + x, y), pal[g[y][x]])
    im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(path)
