# Draws the neutral example character used in the guide (docs/manual/assets/hero.png): a young trainer, 64x64 pixel art, x4.
from PIL import Image, ImageDraw
import os

S = 64
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
SKIN, SKIN_D = (247, 200, 160), (214, 160, 120)
HAIR = (90, 52, 30)
CAP, CAP_D = (225, 70, 40), (170, 40, 25)
JACKET, JACKET_D = (40, 110, 200), (25, 70, 140)
SHIRT = (245, 245, 240)
PANTS, PANTS_D = (60, 60, 80), (40, 40, 55)
SHOE = (230, 230, 230)
BAG = (240, 170, 40)
OUT = (25, 25, 35)

def rect(x0, y0, x1, y1, c): d.rectangle([x0, y0, x1, y1], fill=c, outline=OUT)

# legs and shoes
rect(24, 44, 30, 57, PANTS); rect(33, 44, 39, 57, PANTS)
d.line([30, 46, 30, 56], fill=PANTS_D)
rect(22, 57, 30, 61, SHOE); rect(33, 57, 41, 61, SHOE)
# body
rect(20, 27, 43, 45, JACKET)
rect(29, 28, 34, 44, SHIRT)
d.line([31, 28, 31, 44], fill=JACKET_D)
rect(14, 28, 20, 42, JACKET); rect(43, 28, 49, 42, JACKET)       # arms
rect(14, 42, 19, 46, SKIN); rect(44, 42, 49, 46, SKIN)           # hands
d.line([21, 27, 28, 44], fill=BAG); d.line([22, 27, 29, 44], fill=BAG)   # bag strap
# head
rect(22, 9, 41, 27, SKIN)
d.rectangle([23, 24, 40, 26], fill=SKIN_D)
rect(21, 12, 24, 22, HAIR); rect(39, 12, 42, 22, HAIR)
d.rectangle([26, 17, 28, 20], fill=OUT); d.rectangle([35, 17, 37, 20], fill=OUT)   # eyes
d.point([27, 17], fill=(255, 255, 255)); d.point([36, 17], fill=(255, 255, 255))
d.line([29, 23, 34, 23], fill=(170, 80, 70))                                      # smile
# cap
rect(20, 4, 43, 12, CAP)
rect(18, 11, 47, 14, CAP_D)
d.rectangle([29, 6, 34, 9], fill=(255, 255, 255))

im = im.resize((S * 4, S * 4), Image.NEAREST)
im.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hero.png'))
print('ok')
