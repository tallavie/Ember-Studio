# Draws the Ember Studio icon (a flame on a dark rounded square) -> ember/icon.ico and ember/icon.png
from PIL import Image, ImageDraw, ImageFilter
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def flame(size):
    s = size * 4                                           # draw big, scale down (smooth edges)
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s // 5, fill=(28, 24, 40, 255))
    def blob(cx, cy, w, h, col):
        pts = []
        import math
        for k in range(64):
            t = k / 64 * 2 * math.pi
            x = math.sin(t) * w * (0.55 + 0.45 * math.cos(t / 2) ** 2)
            y = -math.cos(t) * h
            if y < 0: x *= (1 + y / h) ** 0.9 + 0.05            # pointed top
            pts.append((cx + x, cy + y))
        d.polygon(pts, fill=col)
    blob(s * 0.5, s * 0.6, s * 0.30, s * 0.40, (232, 72, 28, 255))
    blob(s * 0.5, s * 0.66, s * 0.21, s * 0.29, (250, 150, 30, 255))
    blob(s * 0.5, s * 0.72, s * 0.12, s * 0.17, (255, 232, 120, 255))
    return im.filter(ImageFilter.GaussianBlur(s / 300)).resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    big = flame(256)
    big.save(os.path.join(HERE, 'icon.png'))
    big.save(os.path.join(HERE, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('icon written')
