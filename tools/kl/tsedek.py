# New map: מגדל צדק - a crusader fortress on a rocky hill, east of Rosh HaAyin (connected to map 3.0).
# Tiles: FireRed primary + the Indigo Plateau secondary tileset (stone gate, stairs, statues, posts, paving).
import struct
import newmap
from forest import pine, pine_block
from newmap import grass, rock_rect

W, H = 24, 20
PRIM, SEC = 0x2D4B04, 0x2D4BF4          # general primary, Indigo Plateau secondary
MAPSEC = 0x9B                            # unused "SEVII ISLE 6" slot, renamed to מגדל צדק
RUINS, RUINS_MAPSEC = (2, 27), 0xBC        # Monean Chamber -> הריסות מגדל צדק
TEXTS = {
    'sign': 'מגדל צדק\\nמבצר צלבני מהמאה ה-12, על גבעה מעל מעיינות הירקון.',
    'guide': 'שלום! אני המדריך של מגדל צדק.\\pהמבצר נבנה לפני כמעט אלף שנה, כדי לשמור על הדרך לים.\\pאומרים שבלילות יש פה פוקימוני רפאים... אבל זה כנראה רק החתולים.',
    'kid': 'טיפסתי עד למעלה! משם רואים את כל ראש העין, ואפילו את תל אביב!',
}


def blocks():
    g = [[0] * W for _ in range(H)]

    def put(x, y, mt, coll=0, elev=3):
        g[y][x] = mt | coll << 10 | elev << 12

    for y in range(H):
        for x in range(W):
            put(x, y, grass(x, y))
    # pine walls around the edges (FireRed route style), entrance path on rows 9-10 of the west wall
    pine_block(put, 0, 1, 0, 8, trunk=True, edge_r=range(3, 9))
    pine_block(put, 0, 1, 12, H - 1, top=True, caps=True, edge_r=range(11, 18))
    pine_block(put, 2, W - 3, 0, 2, trunk=True)
    pine_block(put, W - 2, W - 1, 0, H - 1, edge_l=range(3, 18))
    pine_block(put, 2, W - 3, 18, H - 1, top=True)
    for x in list(range(2, 5)) + list(range(19, W - 2)):      # walkable tips above the south wall (not on the path)
        put(x, 17, 0x0E if x % 2 == 0 else 0x0F, 0)
    # stone path: entrance (rows 9-10) -> south along x 5-6 -> east along rows 16-17 to the stairs
    for y in (9, 10):
        for x in range(0, 7): put(x, y, 0x0D9)
    for y in range(11, 18):
        for x in (5, 6): put(x, y, 0x0D9)
    for y in (16, 17):
        for x in range(5, 19): put(x, y, 0x0D9)
    # rocky hill (rows 10-15) with the stairway in the middle (x 14-18)
    rock_rect(put, 8, 10, 21, 15, W, H)
    stairs = [[(0x2C9, 1), (0x2DD, 0), (0x2DE, 0), (0x2DF, 0), (0x2CA, 1)],
              [(0x2D1, 1), (0x2D5, 0), (0x2D6, 0), (0x2D7, 0), (0x2D2, 1)],
              [(0x2D9, 1), (0x2CB, 0), (0x2CC, 0), (0x2CC, 0), (0x2DA, 1)],
              [(0x2E1, 1), (0x2CD, 0), (0x2CE, 0), (0x2CF, 0), (0x2E2, 1)],
              [(0x2D1, 1), (0x2D5, 0), (0x2D6, 0), (0x2D7, 0), (0x2D2, 1)],
              [(0x2D9, 1), (0x2CB, 0), (0x2CC, 0), (0x2CC, 0), (0x2DA, 1)]]
    for j, row in enumerate(stairs):
        for i, (mt, c) in enumerate(row): put(14 + i, 10 + j, mt, c)
    # fortress courtyard on top of the hill (rows 3-9): paving, stone-post walls, statues, gate, tower
    for y in range(3, 10):
        for x in range(8, 22): put(x, y, 0x282)
    for x in range(8, 22): put(x, 3, 0x2C6 if x % 2 else 0x2C7, 1)
    for y in range(4, 10):
        put(8, y, 0x2C6, 1); put(21, y, 0x2C7, 1)
    for x in list(range(9, 14)) + list(range(19, 21)): put(x, 9, 0x2C6 if x % 2 else 0x2C7, 1)
    gate = [[(0x2A8, 1), (0x2A9, 1), (0x2AA, 0), (0x2AB, 1), (0x2AC, 1)],
            [(0x2B8, 1), (0x2B9, 1), (0x2BA, 0), (0x2BB, 1), (0x2BC, 1)]]
    for j, row in enumerate(gate):
        for i, (mt, c) in enumerate(row): put(14 + i, 8 + j, mt, c)
    for sx, sy in ((10, 4), (19, 4), (10, 6), (19, 6)):
        put(sx, sy, 0x2B6, 0); put(sx, sy + 1, 0x29F, 1)
    for i, mt in enumerate((0x2CD, 0x2CE, 0x2CE, 0x2CF)): put(14 + i, 4, mt, 1)
    for i, mt in enumerate((0x2E8, 0x2E9, 0x2EA, 0x2EB)): put(14 + i, 5, mt, 1)
    put(16, 5, 0x15B, 1, 0)                   # door into the ruins (same door tile as the Indigo Plateau building)
    return [v for row in g for v in row]


def build(rom, text_writer_encode):
    """creates the map in group 3 and links it east of Rosh HaAyin (3.0). Returns the new map number."""
    border = [0x1C | 1 << 10 | 3 << 12, 0x1D | 1 << 10 | 3 << 12, 0x14 | 1 << 10 | 3 << 12, 0x15 | 1 << 10 | 3 << 12]
    lay, lay_id = newmap.add_layout(rom, W, H, blocks(), PRIM, SEC, border)
    txt = {k: rom.write_new(text_writer_encode(v)) for k, v in TEXTS.items()}
    pallet = rom.map_header(3, 0)
    tmpl = rom.map_events(pallet)['obj'][0]                                # the woman in Rosh HaAyin, as a template
    ev = newmap.add_events(rom,
                           objects=[(7, 12, 0x11, 2, newmap.msgbox_script(rom, txt['guide'], 2)),
                                    (12, 6, 0x0C, 2, newmap.msgbox_script(rom, txt['kid'], 2))],
                           signs=[(3, 8, newmap.msgbox_script(rom, txt['sign'], 3))],
                           template_obj=tmpl,
                           warps=[(16, 5, 0, 0, RUINS[0], RUINS[1])])
    # the ruins interior: Tanoby's Monean Chamber (Sevii is cut); its exit now leads back to the door
    ew = rom.map_events(rom.map_header(*RUINS))['warp'][0]
    rom.u8[ew + 5], rom.u8[ew + 6], rom.u8[ew + 7] = 0, 0, 3   # dest warp 0, map num set below, group 3
    rom.u8[rom.map_header(*RUINS) + 20] = RUINS_MAPSEC
    scripts = rom.write_new(b'\x00')
    route1 = rom.map_header(3, 19)
    hdr = bytearray(rom.u8[route1:route1 + 28])
    struct.pack_into('<IIII', hdr, 0, 0x08000000 + lay, 0x08000000 + ev, 0x08000000 + scripts, 0)
    struct.pack_into('<H', hdr, 18, lay_id)
    hdr[20] = MAPSEC
    h = rom.write_new(bytes(hdr))
    num = newmap.add_to_group(rom, 3, h)
    rom.u8[ew + 6] = num
    newmap.add_connection(rom, h, 'left', 0, 3, 0)
    import os
    if 'conn' not in os.environ.get('KL_SKIP', ''): newmap.add_connection(rom, pallet, 'right', 0, 3, num)
    return num
