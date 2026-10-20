# Converts a reference picture of a character (cartoon art with dark outlines on a light background)
# into the professor's intro picture: 64x96, 8bpp, palette indices 97-127 (31 colours).
#   python tools/kl/ref_to_intro.py <reference.png> [crop x0,y0,x1,y1] [--preview out.png]
# The build uses it automatically when data/kachol_lavan/zelekha_ref.png exists (see build.py).
import sys, os
from collections import deque
from PIL import Image, ImageFilter

W, H = 64, 96
FIRST, NCOL = 97, 31          # palette slots we own in the intro BG palette (96 = transparent / backdrop)


ISLANDS = False   # per character: also clear enclosed background areas (set by build.py from game.json 'bg_islands')


def remove_background(img, tol=60):
    """flood-fill from the borders through light, low-contrast pixels; the art's dark outlines stop the fill"""
    img = img.convert('RGBA')
    orig = img.copy()
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    def light(c):  # background: near-white, pale blue / lavender panels, soft and purple shadows (gray hair stays)
        r, g, b = c[:3]
        return (c[3] < 40 or min(r, g, b) > 228 or (min(r, g, b) > 170 and b - r > 18) or (min(r, g, b) > 130 and b - r > 25)
                or (min(r, g, b) > 212 and b - g > 6) or (b > 170 and g < 150 and r < b - 30))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or seen[y * w + x]: continue
        seen[y * w + x] = 1
        c = px[x, y]
        if not light(c): continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # enclosed background islands (e.g. between the legs): same tint as the border colour, not neutral white
    if not ISLANDS: return keep_main(img)
    border = [im_c for im_c in (orig.getpixel((x, 0)) for x in range(0, w, 7))]
    br = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] and ((abs(c[0] - br[0]) + abs(c[1] - br[1]) + abs(c[2] - br[2]) < 20 and c[2] - c[1] >= 6)
                         or (c[2] > 190 and c[2] - c[1] > 30 and 140 < c[0] < c[2])):   # light purple shadow rings
                px[x, y] = (0, 0, 0, 0)
    return keep_main(img)


def keep_main(img):
    """drop specks: keep connected opaque areas that are at least 4% of the biggest one"""
    w, h = img.size
    px = img.load()
    comp = [0] * (w * h)
    sizes = [0]
    for sy in range(h):
        for sx in range(w):
            if px[sx, sy][3] == 0 or comp[sy * w + sx]: continue
            cid = len(sizes); sizes.append(0)
            st = [(sx, sy)]; comp[sy * w + sx] = cid
            while st:
                x, y = st.pop(); sizes[cid] += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not comp[ny * w + nx] and px[nx, ny][3]:
                        comp[ny * w + nx] = cid; st.append((nx, ny))
    big = max(sizes)
    for y in range(h):
        for x in range(w):
            c = comp[y * w + x]
            if c and sizes[c] < big * 0.04: px[x, y] = (0, 0, 0, 0)
    return img


def deepen_grays(img):
    """light neutral grays (silver/gray hair) read as background on the pale battle screen: darken them a bit"""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 42 and 140 < (r + g + b) / 3 < 228 and r - b < 40:
                px[x, y] = (int(r * 0.8), int(g * 0.8), int(b * 0.8), a)
    return img


def to_pixel_art(img, w=W, h=H, margin_bottom=4):
    bbox = img.getbbox()
    img = img.crop(bbox)
    scale = min((w - 2) / img.width, (h - margin_bottom - 2) / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    from PIL import ImageEnhance
    small = img.resize((nw * 4, nh * 4), Image.LANCZOS).resize((nw, nh), Image.BOX)
    a = small.split()[3]
    rgb = small.convert('RGB')
    rgb = ImageEnhance.Contrast(rgb).enhance(1.15)
    rgb = ImageEnhance.Color(rgb).enhance(1.25)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1, percent=80, threshold=2))
    small = rgb.convert('RGBA'); small.putalpha(a)
    small = deepen_grays(small)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.paste(small, ((w - nw) // 2, h - margin_bottom - nh), small)
    # hard alpha
    px = canvas.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
    return canvas


def quantize(canvas, ncol=NCOL - 1):
    """palette: ncol colours from the art + 1 dark outline colour"""
    rgb = Image.new('RGB', canvas.size, (0, 0, 0))
    rgb.paste(canvas, mask=canvas.split()[3])
    opaque = [canvas.getpixel((x, y))[:3] for y in range(canvas.height) for x in range(canvas.width) if canvas.getpixel((x, y))[3]]
    ys = [y for y in range(canvas.height) if any(canvas.getpixel((x, y))[3] for x in range(canvas.width))]
    head_end = ys[0] + (ys[-1] - ys[0]) // 4 if ys else 0           # the face matters most: weight the top quarter x4
    opaque += [canvas.getpixel((x, y))[:3] for y in range(ys[0] if ys else 0, head_end) for x in range(canvas.width) if canvas.getpixel((x, y))[3]] * 3
    # make sure small but important colours (Poké Ball red, eye whites, darks) win a palette slot
    vivid = [c for c in opaque if (c[0] > 150 and c[1] < 100 and c[2] < 110) or min(c) > 225 or max(c) < 45]
    reds = [c for c in opaque if c[0] > 150 and c[1] < 100 and c[2] < 110]
    sample = Image.new('RGB', (len(opaque) + len(vivid) * 6 + len(reds) * 10, 1)); sample.putdata(opaque + vivid * 6 + reds * 10)
    pal_img = sample.quantize(colors=ncol, method=Image.MEDIANCUT, kmeans=3)
    pal = pal_img.getpalette()[:ncol * 3]
    colours = [tuple(pal[i * 3:i * 3 + 3]) for i in range(ncol)]
    q = rgb.quantize(palette=pal_img, dither=Image.NONE)
    out = [[0] * canvas.width for _ in range(canvas.height)]
    for y in range(canvas.height):
        for x in range(canvas.width):
            if canvas.getpixel((x, y))[3]: out[y][x] = 1 + q.getpixel((x, y))
    # 1px outline around the silhouette (pixel-art look), colour index = ncol + 1
    OUT = ncol + 1
    grid = [row[:] for row in out]
    for y in range(canvas.height):
        for x in range(canvas.width):
            if out[y][x] == 0 and any(0 <= x + dx < canvas.width and 0 <= y + dy < canvas.height and out[y + dy][x + dx] not in (0, OUT)
                                      for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                grid[y][x] = OUT
    colours.append((24, 24, 32))
    return grid, colours


def convert(path, crop=None):
    img = Image.open(path)
    if crop: img = img.crop(crop)
    img = remove_background(img)
    canvas = to_pixel_art(img)
    return quantize(canvas)


def touch(grid, colours, spec):
    tc = tuple(spec['color'])
    k = 1 + min(range(len(colours)), key=lambda i: sum((a - b) ** 2 for a, b in zip(colours[i], tc)))
    for x0, y0, x1, y1 in spec.get('rects', []):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if (y in (y0, y1) or x in (x0, x1)) and grid[y][x]: grid[y][x] = k
                elif 'lens' in spec and grid[y][x] and sum(colours[grid[y][x] - 1]) > 240:   # light lens, keep the dark pupil
                    lc = tuple(spec['lens'])
                    grid[y][x] = 1 + min(range(len(colours)), key=lambda i: sum((a - b) ** 2 for a, b in zip(colours[i], lc)))
    for x, y in spec.get('pixels', []): grid[y][x] = k
    return grid


def preview(grid, colours, path, scale=4, bg=(224, 240, 232)):
    im = Image.new('RGB', (len(grid[0]), len(grid)), bg)
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c: im.putpixel((x, y), colours[c - 1])
    im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(path)


def apply(rom, grid, colours):
    """write into the ROM: tiles (8bpp, LZ, VRAM-safe) + palette slots 97..127"""
    from zelekha_sprite import INTRO8_GFX, INTRO8_PAL, lz77_compress, rgb555
    out = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            c = grid[y][x]
            out[((y // 8) * 8 + x // 8) * 64 + (y % 8) * 8 + x % 8] = FIRST - 1 + c if c else 0
    ref = 0x13137C                      # the pointer the intro code loads the picture from
    rom.wptr(ref, rom.write_new(lz77_compress(bytes(out))))
    for i, (r, g, b) in enumerate(colours):
        rom.w16(INTRO8_PAL + (FIRST - 96 + i) * 2, rgb555(r, g, b))


if __name__ == '__main__':
    argv = sys.argv[1:]
    if '--preview' in argv: i = argv.index('--preview'); out = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    else: out = 'intro_preview.png'
    args = argv
    crop = tuple(int(v) for v in args[1].split(',')) if len(args) > 1 else None
    grid, colours = convert(args[0], crop)
    preview(grid, colours, out)
    print('colours', len(colours), 'preview', out)
