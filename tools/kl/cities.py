# The Israeli cities: one build function per FireRed town (same size and connections, new layout, new people and signs).
# Texts: '|' = new message box, '~' = second line (see City.text).
import citykit
from citykit import City, Autotile, Grid, cellv
from newmap import rock_rect

R = City.rects
FLOWER, BUSH, SIGN = 0x004, 0x005, 0x002

_T = {}


def tiles(orig):
    """edge rules for areas, learned from the original towns"""
    if _T: return _T
    G = lambda g, n: Grid(orig, g, n)
    water = {0x121, 0x123, 0x128, 0x12A, 0x12B, 0x12C, 0x130, 0x131}
    rocks = {0x110, 0x111, 0x118, 0x119, 0x1CB, 0x1CC, 0x1D3, 0x1D4, 0x1D9}
    sand = set(range(0xD0, 0xE6)).union({0xFE, 0xFF})
    _T['pave'] = Autotile({0x165, 0x166, 0x167, 0x16D, 0x16E, 0x16F, 0x175, 0x176, 0x177, 0x195, 0x196, 0x19D, 0x19E})
    _T['pave'].learn(G(3, 6)).learn(G(3, 1))
    _T['cobble'] = Autotile(set(range(0x1B8, 0x1CB))).learn(G(3, 2))
    _T['water'] = Autotile(water, also=rocks.union({0xDF}))
    for m in ((3, 5), (3, 8), (3, 3)): _T['water'].learn(G(*m))
    _T['sand'] = Autotile(sand - {0xD6, 0xD7, 0xDF}, also=water.union(rocks))
    for m in ((3, 3), (3, 7), (3, 8), (3, 1)): _T['sand'].learn(G(*m))
    _T['dock'] = Autotile(set(range(0x1BD, 0x1C8)).union({0x1CE}), also=water).learn(G(3, 5), (20, 26, 39, 32))
    return _T


# stamps: source map, rectangle (inclusive), door positions inside the rectangle
STAMPS = {
    'pc':      {'map': (3, 2), 'rect': (15, 21, 19, 25), 'doors': [(2, 4)]},
    'mart':    {'map': (3, 2), 'rect': (26, 15, 29, 18), 'doors': [(2, 3)]},
    'gym':     {'map': (3, 2), 'rect': (12, 12, 18, 16), 'doors': [(3, 4)]},
    # Celadon tileset
    'cel_dept':     {'map': (3, 6), 'rect': (9, 5, 17, 15), 'doors': [(2, 9), (6, 9)]},
    'cel_apt_door': {'map': (3, 6), 'rect': (36, 25, 39, 30), 'doors': [(1, 4)]},
    'cel_apt':      {'map': (3, 6), 'rect': (32, 25, 35, 29), 'doors': []},
    'cel_block':    {'map': (3, 6), 'rect': (4, 4, 8, 11), 'doors': []},
    'cel_fountain': {'map': (3, 6), 'rect': (12, 18, 14, 21), 'doors': []},
    'cel_mansion':  {'map': (3, 6), 'rect': (27, 4, 33, 12), 'doors': [(3, 7), (2, 1), (3, 0), (4, 1)]},
    'cel_corner':   {'map': (3, 6), 'rect': (31, 17, 40, 22), 'doors': [(3, 4), (8, 3)]},
    # Cerulean tileset
    'cer_house':    {'map': (3, 3), 'rect': (15, 8, 21, 11), 'doors': [(2, 3)]},
    'cer_shop':     {'map': (3, 3), 'rect': (12, 24, 15, 28), 'doors': [(1, 4), (2, 4)]},
    'cer_robbed':   {'map': (3, 3), 'rect': (28, 8, 34, 11), 'doors': [(2, 3), (3, 0), (3, 1)]},
    'cer_backdoor': {'map': (3, 3), 'rect': (8, 8, 14, 11), 'doors': [(2, 3), (2, 0)]},
    'cer_bridge':   {'map': (3, 3), 'rect': (21, 0, 25, 4), 'doors': []},
    # Vermilion tileset
    'ver_house':    {'map': (3, 5), 'rect': (8, 3, 12, 7), 'doors': [(1, 3)], 'skip': (0x001, 0x008, 0x009, 0x010, 0x011, 0x1DF)},
    'ver_house2':   {'map': (3, 5), 'rect': (18, 14, 21, 18), 'doors': [(1, 3)], 'skip': (0x001, 0x008, 0x009, 0x010, 0x011)},
    'ver_gangway':  {'map': (3, 5), 'rect': (20, 32, 26, 39), 'doors': [(2, 2), (3, 2), (4, 2)],
                     'skip': (0x12B, 0x12A, 0x12C, 0x1D9, 0x1D2, 0x1D0, 0x110, 0x111, 0x118, 0x119)},
    'ver_club':     {'map': (3, 5), 'rect': (11, 14, 15, 18), 'doors': [(1, 3)], 'skip': (0x001, 0x008, 0x009, 0x010, 0x011, 0x1DF, 0x115)},
    # Fuchsia tileset
    'fuc_pens':     {'map': (3, 7), 'rect': (5, 6, 18, 10), 'doors': []},
    'fuc_house':    {'map': (3, 7), 'rect': (13, 28, 17, 31), 'doors': [(1, 3)]},
    'fuc_gate':     {'map': (3, 7), 'rect': (22, 0, 27, 6), 'doors': [(2, 5)]},
    'fuc_yard':     {'map': (3, 7), 'rect': (31, 23, 42, 31), 'doors': [(2, 8), (7, 8), (8, 5), (8, 6)]},
    'fuc_warden':   {'map': (3, 7), 'rect': (26, 12, 31, 16), 'doors': [(2, 4)]},
    # Saffron tileset
    'saf_silph':    {'map': (3, 10), 'rect': (29, 16, 37, 30), 'doors': [(4, 14)]},
    'saf_house':    {'map': (3, 10), 'rect': (21, 10, 24, 14), 'doors': [(1, 4)]},
    'saf_house5':   {'map': (3, 10), 'rect': (41, 34, 45, 38), 'doors': [(2, 4)]},
    'saf_dojo':     {'map': (3, 10), 'rect': (37, 8, 42, 12), 'doors': [(3, 4)]},
    'saf_gym':      {'map': (3, 10), 'rect': (43, 8, 49, 12), 'doors': [(3, 4)]},
    'gate_n':       {'map': (3, 10), 'rect': (32, 0, 37, 6), 'doors': [(2, 5), (3, 5)]},
    'gate_s':       {'map': (3, 10), 'rect': (32, 46, 37, 53), 'doors': [(2, 0), (3, 0)]},
    'gate_w':       {'map': (3, 10), 'rect': (1, 24, 8, 28), 'doors': [(7, 3)]},
    'gate_e':       {'map': (3, 10), 'rect': (58, 24, 65, 28), 'doors': [(0, 3)]},
    'saf_apt':      {'map': (3, 10), 'rect': (24, 25, 28, 30), 'doors': []},
    # Cinnabar tileset
    'cin_mansion':  {'map': (3, 8), 'rect': (5, 0, 11, 4), 'doors': [(3, 3)], 'skip': (0x001, 0x008, 0x009, 0x010, 0x011, 0x0D9, 0x0DA)},
    'cin_lab':      {'map': (3, 8), 'rect': (5, 5, 11, 10), 'doors': [(3, 4)], 'skip': (0x001, 0x008, 0x009, 0x010, 0x011, 0x0D9, 0x0DA)},
    # Viridian tileset
    'vir_house':    {'map': (3, 1), 'rect': (23, 8, 28, 12), 'doors': [(2, 3)]},
    'vir_school':   {'map': (3, 1), 'rect': (23, 15, 28, 19), 'doors': [(2, 3)]},
    # Lavender tileset
    'lav_tower':    {'map': (3, 4), 'rect': (15, 0, 21, 6), 'doors': [(3, 6)]},
    'lav_dome':     {'map': (3, 28), 'rect': (15, 74, 21, 79), 'doors': [], 'skip': (0x071, 0x070, 0x068, 0x06B, 0x06D, 0x0BB)},
    'lav_house':    {'map': (3, 4), 'rect': (8, 8, 12, 11), 'doors': [(2, 3)]},
}
SAND = set(range(0xD0, 0xE6)).union({0xFE, 0xFF, 0x102, 0x104})


def post(C, i, x, y, text=None):
    """move sign event i onto a new signpost"""
    C.put(x, y, cellv(SIGN, 1)); C.move_bg(i, x, y, text)


def tel_aviv(rom, orig):
    """תל אביב (Pewter, 48x40): sea + beach + promenade in the west, Dizengoff square with the fountain,
    Bauhaus blocks ("the White City"), the museum, Lapid's gym. Celadon's tileset (modern blocks)."""
    T = tiles(orig)
    C = City(rom, orig, 3, 2, sec_from=(3, 6), seed=2)
    W, H = C.W, C.H
    C.border = [cellv(0x12B, 0, 1)] * 4                       # the sea beyond the map edge
    # sea, beach
    C.area(T['water'], R((0, 0, 3, H - 1)))
    C.area(T['sand'], R((4, 0, 7, H - 1)))
    # pine walls: north, east (exit rows 20-23), south (exit x 20-23)
    C.pines(8, 43, 0, 1, trunk=True)
    C.pines(44, 47, 0, 19, trunk=True, edge_l=range(2, 19))
    C.pines(40, 47, 24, H - 1, top=True, caps=True, edge_l=range(24, 33))
    C.pines(8, 19, 33, H - 1, top=True, caps=True)
    C.pines(24, 39, 33, H - 1, top=True, caps=True)
    # streets (light paving)
    C.area(T['pave'], R((8, 2, 10, 31),           # הטיילת
                        (8, 12, 41, 14),          # בן יהודה
                        (8, 20, W - 1, 22),       # רוטשילד (to the east exit)
                        (8, 30, 38, 31),          # אבן גבירול
                        (20, 12, 23, H - 1),      # דיזנגוף (south exit)
                        (36, 12, 38, 31),
                        (26, 3, 34, 11)))         # כיכר דיזנגוף
    # band 1: museum, Dizengoff square, a house
    C.stamp(STAMPS['cel_dept'], 11, 2, warps=[0, 1])               # מוזיאון ארץ ישראל (doors 13,11 / 17,11)
    C.stamp(STAMPS['cel_fountain'], 29, 5)
    for x, y in ((24, 3), (25, 4), (24, 5), (25, 6), (24, 7), (35, 3), (35, 5), (35, 7), (25, 9), (24, 10)): C.put(x, y, cellv(FLOWER))
    C.stamp(STAMPS['cel_apt_door'], 39, 6, warps=[4])              # house (door 40,10)
    for x, y in ((39, 3), (41, 3), (43, 4), (40, 5), (42, 5)): C.put(x, y, cellv(FLOWER))
    # band 2: gym, Pokémon center, mart
    C.stamp(STAMPS['gym'], 12, 15, warps=[2])                      # door 15,19
    C.stamp(STAMPS['pc'], 25, 15, warps=[5])                       # door 27,19
    C.stamp(STAMPS['mart'], 31, 16, warps=[3])                     # door 33,19
    for x, y in ((40, 16), (42, 16), (41, 18), (43, 18)): C.put(x, y, cellv(FLOWER))
    # band 3: the White City (Bauhaus blocks)
    C.stamp(STAMPS['cel_apt_door'], 12, 24, warps=[6])             # house (door 13,28)
    C.stamp(STAMPS['cel_apt'], 16, 24)
    for x in (24, 28, 32): C.stamp(STAMPS['cel_apt'], x, 24)
    # signs (existing sign events, moved onto signposts)
    post(C, 0, 20, 11, 'מוזיאון ארץ ישראל~היסטוריה, מאובנים, ומזגן חזק במיוחד')
    post(C, 1, 39, 19)
    post(C, 2, 11, 19)
    post(C, 3, 20, 29)
    post(C, 4, 24, 32)
    C.move_bg(5, 5, 31)                                           # hidden item, now in the sand
    # people
    C.move_obj(1, 5, 11)
    C.move_obj(2, 15, 13, mv=8)
    C.obj_script(2, 'המוזיאון מציג את כל ההיסטוריה של הארץ.|אבל שמעתי שאתמול נעלם משם מאובן...|בדיוק ביום שאנשים בחליפות אפורות הגיעו ״לספור את התערוכה״.')
    C.move_obj(3, 30, 23, mv=8)
    C.move_obj(4, 6, 23, mv=8)
    C.obj_script(4, 'החוף של תל אביב! חול, ים ומטקות.|המים עמוקים מדי. בלי פוקימון שיודע לשחות אי אפשר להיכנס.')
    C.move_obj(6, 17, 12)                                         # CUT tree in front of the museum's second door
    C.npc(6, 6, 26, 'אני המציל של החוף.|היום יש דגל שחור! הים סוער, ורק פוקימוני מים נכנסים למים.|אתה? אתה יכול לבנות ארמון בחול.')
    C.npc(3, 17, 44, 'המים מעולים!|...טוב, קצת קרים. ומלוחים. אבל מעולים!', mv=9)
    C.npc(9, 26, 19, 'אני רץ כל בוקר בטיילת, מיפו ועד הנמל.|הפוקימון שלי מעדיף לשבת בבית קפה ולחכות לי.', mv=3)
    C.npc(27, 9, 36, 'כשהייתי צעירה, הכיכר הזאת הייתה למעלה, על גשר.|עכשיו היא למטה, עם מזרקה. ככה זה בתל אביב, כל הזמן משפצים.')
    C.npc(12, 13, 49, 'אני מצוות ביורוקרטיה. אני פה לצורך... ספירת מאובנים.|יש לך טופס 17? לא? אז אל תשאל שאלות.|המנכ״ל אומר שבמערת הכרמל יש עוד הרבה מה לספור.')
    C.npc(27, 29, 17, 'קוראים לאזור הזה ״העיר הלבנה״, בגלל הבניינים הלבנים בסגנון באוהאוס.|אמא שלי אומרת שהם לא לבנים, הם ״אוף-וויט״.')
    C.npc(40, 23, 23, 'הדרך מזרחה מובילה לכביש 3 ולמערת הכרמל.|אבל קודם כדאי לנצח את לפיד. הוא לא אוהב שעוקפים אותו.')
    # the east exit: the guide sends you back until you beat Lapid (var 0x406C = 0); then Zelekha's aide brings the running shoes
    guide = citykit.Script(rom).lockall().msg('אתה מאמן, נכון?|יאיר לפיד מחפש מתמודדים חדשים! המכון שלו ברחוב רוטשילד, ממש פה.|אין טעם לצאת מהעיר בלי לנסות אותו.')         .close().move(0xFF, [0x12]).releaseall().end().write()
    aide = citykit.Script(rom).lockall().msg('{PLAYER}! טוב שתפסתי אותך. אני העוזר של פרופסור זליכה.|הפרופסור שלח לך מתנה, אחרי שהטופס עבר שלוש ועדות.')         .fanfare(0x101).msg('{PLAYER} קיבל נעלי ריצה!').setflag(0x82F)         .msg('לחץ על כפתור B כדי לרוץ. אבל רק איפה שיש מקום לרוץ!|טוב, אני חוזר למעבדה. ביי!').close()         .setvar(0x406C, 2).releaseall().end().write()
    C.coords([(44, y, 0x406C, 0, guide) for y in (20, 21, 22, 23)] + [(45, y, 0x406C, 1, aide) for y in (20, 21, 22, 23)])
    C.move_obj(5, 42, 23, mv=10)
    C.move_obj(7, 46, 23)
    C.commit()
    return C



def haifa(rom, orig):
    """חיפה (Cerulean, 48x40), built from scratch: the port and the sea along the north (the bridge to כף הכרמל lands on
    the port promenade, where Avi waits), the Carmel cliffs in the west with the sealed cave, the Bahai terraces,
    Ben Gurion boulevard down to the south exits, the robbed house in the north-east with its back yard (the Bureaucracy
    thief) as the way east, Liberman's gym, the bike shop."""
    T = tiles(orig)
    C = City(rom, orig, 3, 3, seed=33)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    # the sea and the port promenade
    C.area(T['water'], R((0, 0, W - 1, 4)))
    C.stamp(STAMPS['cer_bridge'], 21, 0)                          # the bridge north (the rival comes down it)
    C.area(T['pave'], R((0, 5, 34, 8)))                           # טיילת הנמל
    # the Carmel: cliffs in the west, the sealed cave at the shore
    rock_rect(lambda x, y, mt, c: C.put(x, y, cellv(mt, c)), 0, 9, 9, 19, W, H)
    C.area(T['sand'], R((0, 13, 4, 14)))                          # the ledge path from כביש 4 to the cave
    for (dx, dy), mt in {(0, 0): 0x98, (1, 0): 0x99, (2, 0): 0x9A, (0, 1): 0xA8, (1, 1): 0xA9, (2, 1): 0xAA}.items():
        put(3 + dx, 11 + dy, mt, 0 if mt == 0xA9 else 1)
    C.move_warp(7, 4, 12)                                         # מערת הכרמל (sealed: the guard stands in front)
    C.move_obj(12, 4, 13)
    # streets
    C.area(T['pave'], R((22, 9, 24, 35),                          # שדרות בן גוריון
                        (0, 20, 21, 22),                          # west exit
                        (25, 18, W - 1, 19),                      # דרך העצמאות (east exit)
                        (12, 26, 44, 27),
                        (12, 34, 35, 36), (15, 37, 18, H - 1), (29, 37, 32, H - 1)))   # south exits
    # tree walls around the town (openings: west rows 20-22, east rows 11 / 18-19, south x 15-18 / 29-32)
    C.pines(0, 9, 23, H - 1, top=True, caps=True)
    C.pines(10, 13, 37, H - 1, top=True, caps=True); C.pines(20, 27, 37, H - 1, top=True, caps=True)
    C.pines(34, 43, 37, H - 1, top=True, caps=True)
    C.pines(44, 47, 20, H - 1, top=True, caps=True, edge_l=range(20, 37))
    C.pines(44, 47, 13, 17, trunk=True, edge_l=range(13, 17))
    # the Bahai terraces (stairs up the middle)
    for y in range(9, 19):
        for x in range(11, 21):
            if x in (15, 16): continue
            put(x, y, BUSH, 1) if y % 2 == 0 else put(x, y, FLOWER)
    C.area(T['sand'], R((15, 9, 16, 19)))
    post(C, 0, 17, 19, 'הגנים הבהאיים~תשע עשרה טרסות של פרחים, מהכרמל עד הים')
    # the robbed house and its yard: the only way to the east exit at row 11 (the thief guards it)
    C.stamp(STAMPS['cer_robbed'], 36, 12, warps=[1, 9, 10])       # front 38,15 / hole 39,12
    C.area(T['sand'], R((36, 9, W - 1, 11)))
    for x in range(35, W): put(x, 8, BUSH, 1)
    for y in range(9, 12): put(35, y, BUSH, 1)
    for x in range(43, W): put(x, 12, BUSH, 1)
    for y in range(13, 18): put(43, y, BUSH, 1)
    put(35, 12, BUSH, 1); C.c[12][36] |= 1 << 10                  # seal the yard: only through the hole in the house
    C.move_obj(2, 41, 10)                                         # the thief; the triggers above and below him
    C.move_coord(3, 41, 9); C.move_coord(4, 41, 11)
    C.move_obj(1, 39, 16)                                         # police next to the house (the map script moves him in front of the door)
    citykit.patch_xyperm(rom, 0x1664FC, 38, 16)
    # buildings
    C.stamp(STAMPS['pc'], 25, 13, warps=[3])                      # door 27,17
    for x, y in ((31, 14), (33, 15), (31, 16), (33, 17), (35, 16)): put(x, y, BUSH, 1)
    C.stamp(STAMPS['gym'], 26, 21, warps=[4])                     # door 29,25
    C.stamp(STAMPS['mart'], 34, 22, warps=[6])                    # door 36,25
    C.stamp(STAMPS['cer_shop'], 39, 21, warps=[5, 11])            # doors 40,25 / 41,25
    C.stamp(STAMPS['cer_house'], 12, 22, warps=[2])               # door 14,25
    C.stamp(STAMPS['cer_house'], 12, 30, warps=[12])              # door 14,33
    C.stamp(STAMPS['cer_backdoor'], 36, 30, warps=[0, 8])         # door 38,33, back door 38,30 into the garden
    for x in range(35, 44): put(x, 28, BUSH, 1)
    put(35, 29, BUSH, 1); put(43, 29, BUSH, 1)
    put(37, 29, FLOWER); put(42, 29, FLOWER)
    C.move_bg(4, 40, 29)                                          # hidden item in the garden
    C.stamp(STAMPS['cer_house'], 26, 30, warps=[13])              # door 28,33
    for x, y in ((10, 23), (10, 25), (19, 23), (20, 24), (19, 30), (20, 31), (44, 22), (45, 24), (46, 22), (25, 30), (11, 30)): put(x, y, BUSH, 1)
    # signs
    post(C, 1, 25, 25)
    post(C, 2, 38, 25)
    post(C, 3, 21, 33)
    post(C, 5, 20, 21) if False else None
    C.move_bg(5, 38, 23); C.move_bg(6, 38, 24); C.move_bg(7, 43, 24)
    C.put(25, 9, cellv(SIGN, 1)); C.move_bg(0, 25, 9, 'חיפה~עיר הנמל, הכרמל והגנים הבהאיים')
    # people
    C.move_obj(3, 20, 27)                                         # CUT hint
    C.move_obj(4, 9, 21)
    C.move_obj(5, 31, 27); C.move_obj(6, 32, 27)                  # the Slowbro trainer
    citykit.patch_xyperm(rom, 0x166503, 31, 27); citykit.patch_xyperm(rom, 0x16650A, 32, 27)
    C.move_obj(7, 33, 19)
    C.move_obj(9, 16, 19)                                         # CUT tree at the foot of the terraces
    C.move_obj(11, 16, 35)
    C.npc(10, 6, 48, 'זה הנמל של חיפה. מכאן יוצאות האוניות לכל העולם.|הגשר מוביל לכף הכרמל. שם תמיד יש מאמנים שמחכים לקרב.')
    C.npc(30, 7, 49, 'אני מצוות ביורוקרטיה. אני רק בודק את... רישיונות הדייג.|יש לך רישיון לפוקימון מים? לא? רשמתי.', mv=9)
    C.npc(23, 15, 33, 'אני הגנן של הגנים הבהאיים.|כל בוקר אני גוזם את השיחים בדיוק באותו הגובה. עם סרגל.')
    C.npc(18, 21, 32, 'בחיפה עובדים, בירושלים מתפללים, ובתל אביב מבלים.|אני? אני גר בחיפה ועובד בתל אביב. אז אני בעיקר בפקקים.', mv=2)
    C.npc(37, 19, 17, 'שמעת? גנבו מהבית הזה דיסק! הגנב ברח לחצר מאחורה.|אומרים שהוא מצוות ביורוקרטיה. הוא השאיר טופס ״אישור כניסה״.')
    C.npc(30, 35, 27, 'ליברמן מהמכון מאמן פוקימוני פלדה.|הוא אומר שהם כמוהו: לא מתכופפים, ולא מחייכים בתמונות.')
    C.commit()
    return C


def ashdod(rom, orig):
    """אשדוד (Vermilion, 48x40), built from scratch: the sea and the beach in the west, the harbour along the south with a
    wooden quay and the pier to the ship's gangway, Gantz's gym on its own little quay behind the CUT tree, a construction
    site of a new quarter, the fan club, Ha-Atsmaut boulevard to the east exit. Vermilion's tileset."""
    T = tiles(orig)
    C = City(rom, orig, 3, 5, seed=55)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    C.border = [cellv(0x12B, 0, 1)] * 4
    C.area(T['water'], R((0, 0, 5, H - 1), (6, 29, W - 1, H - 1)))                     # the sea, the harbour
    C.area(T['sand'], R((6, 0, 8, 28)))                                                # the beach
    for rx, ry in ((2, 6), (1, 15), (3, 23), (12, 35), (16, 37), (33, 35), (40, 33), (44, 37)):
        put(rx, ry, 0x110, 1); put(rx + 1, ry, 0x111, 1); put(rx, ry + 1, 0x118, 1); put(rx + 1, ry + 1, 0x119, 1)
    # the ship's gangway at the end of the pier (the ticket check is scripted for these cells)
    C.stamp(STAMPS['ver_gangway'], 20, 32, warps=[0, 1, 2])
    C.area(T['dock'], R((9, 27, 29, 28), (22, 29, 24, 31)), ctx=R((22, 32, 24, 32)))  # הרציף + the pier
    # north edge, streets
    C.pines(9, 21, 0, 3, trunk=True); C.pines(25, 47, 0, 3, trunk=True)
    C.area(T['pave'], R((22, 0, 24, 26),          # שדרות מנחם בגין (north exit -> harbour)
                        (9, 0, 10, 26),           # beach promenade
                        (9, 11, 46, 12),          # רחוב הרצל
                        (9, 18, W - 1, 20),       # שדרות העצמאות (east exit)
                        (42, 21, 43, 28)))
    C.pines(44, 47, 4, 17, trunk=True, edge_l=range(4, 17))
    # north band: Pokémon center, houses, fan club, the construction site
    C.stamp(STAMPS['pc'], 11, 6, warps=[4])                       # door 13,10
    C.stamp(STAMPS['ver_house'], 16, 6, warps=[3])                # door 17,9
    C.stamp(STAMPS['ver_club'], 26, 6, warps=[5])                 # door 27,9
    C.stamp(STAMPS['ver_house2'], 32, 6, warps=[6])               # door 33,9
    C.area(T['sand'], R((37, 5, 43, 10)))                         # רובע 17 - under construction
    C.move_obj(3, 39, 7); C.move_obj(4, 41, 8)
    # middle band: mart, houses
    C.stamp(STAMPS['mart'], 12, 14, warps=[7])                    # door 14,17
    C.stamp(STAMPS['ver_house'], 26, 13, warps=[])
    C.stamp(STAMPS['ver_house2'], 32, 13, warps=[])
    for x, y in ((17, 14), (19, 15), (17, 16), (19, 17), (38, 14), (40, 15), (38, 16), (40, 17), (42, 14)): put(x, y, BUSH, 1)
    # Gantz's gym on its own quay, reached only through the CUT tree
    C.stamp(STAMPS['gym'], 33, 22, warps=[9])                     # door 36,26
    C.area(T['dock'], R((31, 27, 41, 28)))
    for x in range(30, 42): put(x, 21, BUSH, 1)
    for y in range(22, 27):
        for x in (30, 31, 32, 40, 41): put(x, y, BUSH, 1)
    put(30, 28, BUSH, 1)
    C.move_obj(7, 30, 27)                                         # the CUT tree
    C.stamp(STAMPS['ver_house2'], 44, 23, warps=[8])              # house by the water (door 45,26)
    for x, y in ((12, 22), (14, 24), (16, 22), (18, 24), (20, 22), (26, 23), (28, 25)): put(x, y, BUSH, 1)
    for x, y in ((13, 23), (15, 25), (17, 23), (19, 25), (27, 22)): put(x, y, FLOWER)
    # signs
    post(C, 0, 21, 4, 'אשדוד~עיר הנמל, החולות והרבעים')
    post(C, 1, 25, 9)
    post(C, 2, 29, 26)
    post(C, 3, 25, 26, 'נמל אשדוד~הנמל הגדול בדרום. אונייה בנמל!')
    post(C, 4, 46, 21)
    C.move_bg(5, 40, 9)                                           # hidden item in the construction site
    # people
    C.move_obj(1, 15, 12)
    C.move_obj(2, 26, 15) if False else C.move_obj(2, 18, 21)
    C.move_obj(5, 26, 27)                                         # sailor on the quay
    C.move_obj(8, 23, 13)                                         # Zelekha's aide
    C.npc(7, 14, 29, 'חוף הקשתות של אשדוד! יש פה גלים מצוינים.|אבל בלי פוקימון מים, אתה יכול רק להסתכל עליהם.')
    C.npc(15, 27, 48, 'אני עובד בנמל כבר שלושים שנה.|כל מכולה צריכה חותמת. ועכשיו צוות ביורוקרטיה דורש שלוש חותמות!|האונייה בנמל מחכה כבר שבוע לאישור. רק מי שיש לו כרטיס עולה.', mv=8)
    C.npc(38, 10, 47, 'כאן בונים שכונה חדשה. רובע 17!|באשדוד כל כמה שנים בונים עוד רובע. מספרים, לא שמות. ככה לא מתבלבלים.')
    C.npc(29, 29 - 1, 24, 'גנץ, המנהיג של המכון, מאמן פוקימוני חשמל.|המכון שלו מוסתר מאחורי עץ. אומרים שזה מטעמי ביטחון.', mv=9) if False else         C.npc(28, 27, 24, 'גנץ, המנהיג של המכון, מאמן פוקימוני חשמל.|המכון שלו על רציף משלו, מאחורי עץ. אומרים שזה מטעמי ביטחון.', mv=9)
    C.commit()
    return C


def nazareth(rom, orig):
    """נצרת (Celadon, 60x40), built from scratch: the old market (sand lanes, stalls) and the market hall in the west, the
    Basilica of the Annunciation on its plaza in the middle, Mary's Well and the Pokémon center in the east, Mount
    Precipice (rocks) with Haddad's walled gym garden behind a CUT tree in the south-west, the Bureaucracy game hall,
    houses, an olive grove with a hidden garden."""
    T = tiles(orig)
    C = City(rom, orig, 3, 6, seed=66)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    # tree walls (exits: west rows 22-24, east rows 12-15)
    C.pines(0, W - 1, 0, 1, trunk=True)
    C.pines(0, 1, 2, 21, trunk=True); C.pines(0, 1, 26, H - 1, top=True, caps=True)
    C.pines(58, 59, 2, 11, trunk=True); C.pines(58, 59, 17, H - 1, top=True, caps=True)
    C.pines(2, 57, 38, H - 1, top=True, caps=True)
    # streets
    C.area(T['pave'], R((0, 22, 40, 24),          # פאולוס השישי (west exit)
                        (38, 12, W - 1, 14),      # דרך הבשורה (east exit)
                        (37, 12, 38, 36),         # north-south
                        (21, 14, 37, 16),         # the basilica's plaza
                        (22, 34, 57, 35)))        # south lane
    C.area(T['sand'], R((12, 3, 13, 21), (16, 3, 17, 21), (12, 8, 19, 9), (12, 15, 19, 16), (2, 15, 11, 16),   # the market lanes
                        (27, 2, 31, 4),           # path behind the basilica (its back door)
                        (41, 3, 49, 9),           # Mary's Well square
                        (21, 26, 22, 36)))
    # the market
    C.stamp(STAMPS['cel_dept'], 2, 3, warps=[1, 2])               # השוק העירוני (doors 4,12 / 8,12)
    for x, y in ((14, 4), (14, 6), (18, 4), (18, 6), (14, 11), (14, 13), (18, 11), (18, 13), (14, 18), (18, 18), (14, 20), (18, 20)):
        put(x, y, BUSH, 1)                                        # stalls (olive trees between the lanes)
    for x, y in ((15, 5), (19, 5), (15, 12), (19, 12), (15, 19), (19, 19), (3, 17), (6, 17), (9, 17)): put(x, y, FLOWER)
    C.stamp(STAMPS['cel_apt'], 3, 17) if False else None
    # the basilica, Mary's well, the Pokémon center
    C.stamp(STAMPS['cel_mansion'], 26, 5, warps=[3, 10, 11, 12])  # בזיליקת הבשורה (door 29,12, back 28,6 / 29,5 / 30,6)
    for x, y in ((22, 5), (24, 7), (22, 9), (24, 11), (34, 5), (35, 7), (34, 9), (35, 11)): put(x, y, BUSH, 1)
    C.stamp(STAMPS['cel_fountain'], 44, 4)                        # מעיין מרים
    C.stamp(STAMPS['pc'], 51, 4, warps=[4])                       # door 53,8
    for x, y in ((41, 3), (49, 3), (41, 9), (49, 9)): put(x, y, FLOWER)
    # olive grove with a hidden garden (CUT tree)
    for x in range(40, 58, 3):
        for y in (17, 20, 23):
            if not (50 <= x <= 56 and 17 <= y <= 23): put(x, y, BUSH, 1)
    for x in range(50, 58): put(x, 16, BUSH, 1); put(x, 25, BUSH, 1)
    for y in range(17, 25): put(50, y, BUSH, 1)
    put(50, 20, 0x001); C.move_obj(10, 50, 20)                    # the CUT tree in the gap
    C.move_obj(14, 54, 21)                                        # the item in the garden
    for x, y in ((52, 18), (55, 19), (53, 23), (56, 22)): put(x, y, FLOWER)
    # Mount Precipice and Haddad's walled gym garden (CUT tree)
    rock_rect(lambda x, y, mt, c: C.put(x, y, cellv(mt, c)), 2, 26, 11, 36, W, H)    # הר הקפיצה
    C.stamp(STAMPS['gym'], 13, 28, warps=[6])                     # door 16,32
    for x in range(12, 21): put(x, 27, BUSH, 1); put(x, 35, BUSH, 1)
    for y in range(28, 35): put(12, y, BUSH, 1); put(20, y, BUSH, 1)
    put(20, 33, 0x001); C.move_obj(11, 20, 33)                    # CUT tree: the only way in
    for x, y in ((14, 34), (18, 34), (13, 33), (19, 33)): put(x, y, FLOWER)
    # the game hall, houses
    C.stamp(STAMPS['cel_corner'], 24, 27, warps=[0, 5])           # אולם המשחקים (door 27,31), prizes (32,30)
    for x, w in ((41, 7), (47, 8), (53, 9)): C.stamp(STAMPS['cel_apt_door'], x, 28, warps=[w])   # doors 42,32 / 48,32 / 54,32
    for x, y in ((23, 18), (26, 19), (29, 18), (32, 19), (35, 18), (24, 21), (34, 21)): put(x, y, BUSH, 1)
    # signs
    post(C, 0, 33, 33)
    post(C, 1, 34, 33)
    post(C, 2, 23, 33)
    post(C, 3, 36, 21, 'נצרת~עיר הבשורה, השוק והכנאפה')
    post(C, 4, 25, 13, 'בזיליקת הבשורה~הכנסייה הגדולה במזרח התיכון')
    post(C, 5, 39, 15)
    post(C, 6, 10, 13, 'השוק העירוני של נצרת~תבלינים, קפה וממתקים')
    post(C, 7, 21, 32)
    C.put(42, 10, cellv(SIGN, 1)); C.sign(42, 10, 'מעיין מרים~לפי המסורת, כאן התגלה המלאך גבריאל.')
    C.put(12, 25, cellv(SIGN, 1)); C.sign(12, 25, 'הר הקפיצה~נוף לכל עמק יזרעאל. לא לקפוץ!')
    # people
    C.move_obj(1, 36, 31)               # Bureaucracy guards at the game hall
    C.move_obj(8, 23, 31)
    C.move_obj(2, 45, 14); C.move_obj(3, 44, 14)
    C.move_obj(4, 13, 10)
    C.move_obj(5, 6, 20)
    C.move_obj(6, 30, 33)
    C.move_obj(7, 46, 10)
    C.move_obj(9, 16, 37) if False else C.move_obj(9, 15, 34)
    C.move_obj(12, 30, 17)
    C.move_obj(15, 39, 31)
    C.npc(45, 9, 24, 'המים במעיין מרים זורמים כבר אלפי שנים.|אנשים באים מכל העולם רק כדי לראות אותם.|הפוקימונים שלי באים רק כדי לשתות.')
    C.npc(13, 14, 28, 'בוא, בוא! כנאפה חמה! הכי טובה בנצרת!|...פוקימון? לא, אין לי פוקימונים למכירה. רק כנאפה.', mv=8)
    C.npc(17, 9, 23, 'בשוק של נצרת אפשר ללכת לאיבוד בין הסמטאות.|אבל זה בסדר. תמיד יש מישהו שיזמין אותך לקפה.')
    C.npc(29, 15, 17, 'הכנסייה הזאת בנויה מעל מערה עתיקה.|אמא שלי אומרת שבפנים צריך לדבר בשקט. אז אני מדבר איתך פה בחוץ.')
    C.npc(22, 25, 26, 'יוסף חדד, המנהיג של המכון, תמיד מדבר על דו-קיום.|המכון שלו בגינה מאחורי הר הקפיצה. הכניסה חסומה בעץ, צריך לחתוך אותו.')
    C.npc(35, 26, 49, 'אולם המשחקים הזה שייך לצוות ביורוקרטיה. כל ההכנסות הולכות ל... קרן מיוחדת.|אל תשאל איזו קרן.', mv=8)
    C.commit()
    return C


def tiberias(rom, orig):
    """טבריה (Fuchsia, 48x40), built from scratch: the Sea of Galilee fills the south-east, the lakeside promenade runs
    from the west exit to the east exit, the beach, the old houses with the fishermen's pond yard, the gate to שמורת
    החולה in the north, the petting zoo, the warden's house, the hot springs, Deri's gym."""
    T = tiles(orig)
    C = City(rom, orig, 3, 7, seed=77)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    # tree walls (exits: west rows 18-20, east rows 20-22, south x 19-28)
    C.pines(0, 23, 0, 2, trunk=True); C.pines(30, W - 1, 0, 2, trunk=True)
    C.pines(0, 1, 3, 17, trunk=True); C.pines(0, 1, 22, H - 1, top=True, caps=True)
    C.pines(46, 47, 3, 19, trunk=True)
    C.pines(2, 17, 38, H - 1, top=True, caps=True)
    # the lake and the beach
    C.area(T['water'], R((31, 25, W - 1, H - 1), (35, 24, W - 1, 24)))                # הכנרת
    C.area(T['sand'], R((27, 23, 30, H - 1), (31, 23, 34, 24), (35, 23, W - 1, 23),    # the beach
                        (0, 18, 3, 22), (2, 20, W - 1, 22),                            # the promenade (west exit -> east exit)
                        (22, 23, 26, H - 1),                                           # down to the south exit
                        (25, 7, 26, 19), (4, 11, 24, 11), (10, 17, 24, 17)))
    for rx, ry in ((37, 28), (42, 33), (35, 36)): put(rx, ry, 0x110, 1, ) if False else None
    # north: the gate to the reserve, the petting zoo, the warden, the mart, the old houses with the pond yard
    C.stamp(STAMPS['fuc_gate'], 24, 0, warps=[0])                 # שמורת החולה (door 26,5)
    C.stamp(STAMPS['fuc_pens'], 4, 4)                             # פינת הליטוף
    C.move_obj(9, 7, 6); C.move_obj(10, 15, 7); C.move_obj(2, 13, 7); C.move_obj(3, 16, 6); C.move_obj(5, 14, 6)
    C.move_obj(7, 6, 7)
    C.stamp(STAMPS['fuc_warden'], 11, 12, warps=[3])              # door 13,16
    C.stamp(STAMPS['mart'], 5, 13, warps=[2])                     # door 7,16
    C.stamp(STAMPS['fuc_yard'], 32, 6, warps=[1, 7, 8, 9])        # doors 34,14 / 39,14, back door 40,11
    for x, y in ((19, 13), (21, 14), (19, 15), (23, 13), (28, 8), (29, 11), (28, 14), (30, 17), (44, 6), (44, 10)): put(x, y, BUSH, 1)
    for x, y in ((20, 12), (22, 15), (29, 9), (29, 15)): put(x, y, FLOWER)
    # south-west: gym, Pokémon center, houses, the hot springs
    C.stamp(STAMPS['gym'], 3, 24, warps=[4])                      # door 6,28
    C.stamp(STAMPS['pc'], 14, 23, warps=[6])                      # door 16,27
    C.stamp(STAMPS['fuc_house'], 10, 30, warps=[5])               # door 11,33
    C.stamp(STAMPS['fuc_house'], 16, 30, warps=[10])              # door 17,33
    C.area(T['sand'], R((2, 29, 21, 29), (2, 34, 21, 35)), ctx=R((22, 23, 26, H - 1)))
    C.area(T['water'], R((3, 31, 7, 33)))                         # חמי טבריה
    for x in range(2, 9): put(x, 30, BUSH, 1)
    put(2, 31, BUSH, 1); put(2, 32, BUSH, 1); put(2, 33, BUSH, 1); put(8, 31, BUSH, 1); put(8, 33, BUSH, 1)
    for x, y in ((11, 24), (12, 26), (19, 24), (20, 26), (9, 36), (12, 37), (19, 36)): put(x, y, BUSH, 1)
    # signs
    post(C, 0, 21, 19, 'טבריה~עיר הכנרת והמעיינות החמים')
    post(C, 1, 27, 6)
    post(C, 2, 2, 28)
    post(C, 3, 31, 14)
    post(C, 4, 30, 19, 'הכנרת~אגם המים המתוקים הגדול בארץ. נא לא לשאוב!')
    post(C, 5, 38, 19, 'מד מפלס הכנרת~המצב היום: ״כמעט בסדר״')
    post(C, 6, 44, 19, 'הטיילת של טבריה~דגים, מוזיקה ושקיעות')
    post(C, 7, 18, 9) if False else C.move_bg(7, 17, 10)
    C.move_bg(8, 10, 10)
    C.move_bg(9, 9, 31, 'חמי טבריה~מעיינות חמים כבר אלפיים שנה. אסור לפוקימוני אש להיכנס!')
    post(C, 10, 23, 5)
    C.move_bg(11, 37, 9)                                          # hidden item in the pond yard
    # people
    C.move_obj(1, 33, 21)
    C.move_obj(4, 20, 9)
    C.obj_script(4, 'החיות בפינת הליטוף נורא חמודות.|אבל השומר אומר שאסור להאכיל אותן בפיתות.')
    C.move_obj(6, 9, 17); C.move_obj(8, 41, 21)
    C.move_obj(11, 28, 11); C.move_obj(12, 20, 16); C.move_obj(13, 24, 12); C.move_obj(14, 9, 29)
    C.move_obj(15, 8, 12); C.move_obj(16, 25, 21)
    C.npc(36, 22, 48, 'אני דייג בכנרת כבר ארבעים שנה.|פעם תפסתי פה מגיקארפ באורך של שני מטרים!|...טוב, אולי מטר. טוב, חצי. אבל הוא היה כבד!')
    C.npc(43, 21, 30, 'הדרך מזרחה עולה לרמת הגולן.|ומי שרוצה להגיע לשמורת החולה, השער בצפון העיר.')
    C.npc(19, 21, 23, 'שמעת? בשמורת החולה חיים פוקימונים שאין בשום מקום אחר.|ויש גם עגורים. הרבה עגורים.')
    C.npc(10, 34, 33, 'במים החמים האלה רחצו כבר רומאים.|אני בא לפה בשביל הברכיים.')
    C.commit()
    return C


def raanana(rom, orig):
    """רעננה (Saffron, 66x55), built from scratch: a green town among citrus orchards. Ahuza street, park Ra'anana with
    its lake, "מגדל הטפסים" (the Bureaucracy HQ, Silph's tower), Regev's gym and the dojo, the four gatehouses at new
    places on the edges (they are primary tiles; their insides lead to the routes)."""
    T = tiles(orig)
    C = City(rom, orig, 3, 10, seed=1010)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    # thick tree walls, gatehouses
    C.pines(0, W - 1, 0, 2, trunk=True)
    C.pines(0, W - 1, 52, H - 1, top=True, caps=True)
    C.pines(0, 1, 3, 51, trunk=True); C.pines(64, 65, 3, 51, trunk=True)
    C.stamp(STAMPS['gate_n'], 12, 0, warps=[9, 13])               # doors 14,5 / 15,5
    C.stamp(STAMPS['gate_s'], 46, 46, warps=[11, 12])             # doors 48,46 / 49,46
    C.stamp(STAMPS['gate_w'], 0, 36, warps=[8])                   # door 7,39
    C.stamp(STAMPS['gate_e'], 58, 12, warps=[10])                 # door 58,15
    C.pines(2, 11, 3, 6, trunk=True); C.pines(18, 63, 3, 4, trunk=True)
    C.pines(2, 9, 40, 51, top=True, caps=True) if False else None
    # streets
    C.area(T['pave'], R((13, 7, 16, 22),          # from the north gate
                        (3, 20, 62, 22),          # רחוב אחוזה
                        (40, 14, 57, 16), (40, 14, 42, 45),       # to the east gate; north-south
                        (8, 38, 42, 40),          # to the west gate
                        (47, 23, 50, 45),         # to the south gate
                        (3, 29, 39, 30), (51, 28, 62, 29), (51, 36, 62, 37)))
    # park Ra'anana
    C.area(T['water'], R((4, 10, 10, 16)))
    C.area(T['pave'], R((3, 8, 11, 8), (3, 17, 11, 18), (3, 8, 3, 18), (11, 8, 12, 18)))
    for x, y in ((5, 9), (8, 9), (5, 18) if False else (2, 12), (6, 19), (9, 19)): put(x, y, BUSH, 1)
    for x, y in ((4, 9), (7, 9), (10, 9), (4, 17) if False else (4, 19), (8, 19)): put(x, y, FLOWER)
    # the tower and its garden
    C.stamp(STAMPS['saf_silph'], 28, 4, warps=[0])                # מגדל הטפסים (door 32,18)
    for x, y in ((19, 6), (21, 8), (19, 10), (21, 12), (19, 14), (21, 16), (24, 7), (24, 11), (24, 15), (38, 6), (38, 10), (38, 14), (26, 18), (37, 18)):
        put(x, y, BUSH, 1)
    for x, y in ((20, 7), (22, 9), (20, 11), (22, 13), (20, 15), (23, 17), (39, 8), (39, 12)): put(x, y, FLOWER)
    C.move_obj(6, 33, 19); citykit.patch_xyperm(rom, 0x1673EA, 32, 19)   # the tower's guard
    # citrus orchards (north-east, south-west)
    for x in range(44, 63, 2):
        for y in range(6, 13, 2): put(x, y, BUSH, 1)
    for x in range(10, 40, 2):
        for y in range(42, 51, 2): put(x, y, BUSH, 1)
    C.area(T['sand'], R((10, 46, 39, 46), (24, 41, 25, 51)), ctx=R((8, 38, 42, 40)))
    # gym, dojo, houses
    C.stamp(STAMPS['saf_gym'], 4, 24, warps=[3])                  # door 7,28
    C.stamp(STAMPS['saf_dojo'], 12, 24, warps=[2])                # door 15,28
    C.stamp(STAMPS['saf_house'], 21, 24, warps=[1])               # door 22,28
    C.stamp(STAMPS['saf_house'], 27, 24, warps=[4])               # door 28,28
    C.stamp(STAMPS['saf_house'], 33, 24, warps=[14])              # fan club (door 34,28)
    for x, y in ((19, 25), (19, 27), (26, 25), (32, 26), (38, 25)): put(x, y, FLOWER)
    for x in range(4, 39, 4): put(x, 33, BUSH, 1); put(x + 2, 35, BUSH, 1)
    # south-east: mart, Pokémon center, Mr. Psychic, apartments
    C.stamp(STAMPS['mart'], 52, 24, warps=[5])                    # door 54,27
    C.stamp(STAMPS['pc'], 57, 23, warps=[6])                      # door 59,27
    C.stamp(STAMPS['saf_house5'], 52, 31, warps=[7])              # door 54,35
    C.stamp(STAMPS['saf_apt'], 57, 30)
    for x in (51, 57): C.stamp(STAMPS['saf_apt'], x, 39)
    for x, y in ((44, 25), (44, 29), (44, 33), (44, 37), (44, 41), (45, 27), (45, 35), (45, 43)): put(x, y, BUSH, 1)
    # signs
    post(C, 0, 17, 19, 'רעננה~עיר ירוקה, שקטה ומסודרת')
    post(C, 1, 11, 28)
    post(C, 2, 12, 19, 'פארק רעננה~האגם, הברווזים והפוקימונים. נא לאסוף אחרי הפוקימון!')
    post(C, 3, 43, 23)
    post(C, 4, 27, 19)
    post(C, 5, 56, 35)
    post(C, 6, 3, 28)
    post(C, 7, 51, 35)
    post(C, 8, 37, 28)
    # people (the Bureaucracy guards stand in front of the doors until the tower is freed)
    C.move_obj(1, 22, 29); C.move_obj(3, 7, 29); C.move_obj(4, 28, 29)
    C.move_obj(2, 30, 21); C.move_obj(5, 6, 18) if False else C.move_obj(5, 15, 39)
    C.move_obj(7, 45, 31); C.move_obj(8, 55, 15)
    C.move_obj(9, 49, 33); C.move_obj(10, 20, 21); C.move_obj(11, 35, 21); C.move_obj(12, 52, 21); C.move_obj(13, 53, 21)
    C.move_obj(14, 30, 39); C.move_obj(15, 34, 30)
    C.npc(9, 17, 23, 'פארק רעננה הוא הפארק הכי יפה בשרון!|בשבת יש פה יותר עגלות תינוק מפוקימונים.')
    C.npc(45, 13, 18, 'פעם כל רעננה הייתה פרדסים. עכשיו נשארו רק אלה.|והמגדל הזה... לא נראה לי שמישהו שם עובד. רק ממלאים טפסים.', mv=8)
    C.npc(25, 31, 26, 'מירי רגב, מנהיגת המכון, אוהבת פוקימונים על-טבעיים.|היא אומרת שהם יודעים מה הקהל רוצה לפני שהקהל יודע.')
    C.npc(31, 21, 49, 'מגדל הטפסים סגור לקהל! רק עם אישור כניסה, טופס 17, ותור לפני שלושה חודשים.', mv=8)
    C.commit()
    return C


def eilat(rom, orig):
    """אילת (Cinnabar, 24x20), built from scratch: a sandy town on the Red Sea, the red mountains, the old hotel (the
    burnt mansion), the underwater observatory (the lab) at the water, coral reefs, Bennett's gym with its locked door."""
    T = tiles(orig)
    C = City(rom, orig, 3, 8, seed=88)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    C.area(T['water'], R((0, 0, 4, H - 1), (5, 17, W - 1, H - 1), (21, 0, W - 1, 16), (5, 0, 5, 2), (12, 0, 20, 1)))
    C.area(T['sand'], R((6, 0, 11, 16), (5, 3, 5, 16), (12, 2, 20, 16)))
    for rx, ry in ((1, 2), (2, 9), (1, 14), (8, 18), (14, 18), (19, 17), (22, 4), (22, 11), (15, 0)):
        put(rx, ry, 0x110, 1); put(rx + 1, ry, 0x111, 1)
    rock_rect(lambda x, y, mt, c: C.put(x, y, cellv(mt, c)), 11, 2, 13, 6, W, H)   # הרי אילת
    C.stamp(STAMPS['gym'], 14, 3, warps=[1])                      # door 17,7
    C.move_coord(0, 17, 8)                                        # "the door is locked"
    C.stamp(STAMPS['cin_mansion'], 4, 3, warps=[0])               # המלון הישן (door 7,6)
    C.stamp(STAMPS['cin_lab'], 4, 11, warps=[2])                  # המצפה התת-ימי (door 7,15)
    C.stamp(STAMPS['pc'], 11, 10, warps=[3])                      # door 13,14
    C.stamp(STAMPS['mart'], 17, 11, warps=[4])                    # door 19,14
    for x, y in ((10, 8), (20, 9), (5, 9), (20, 16)): put(x, y, BUSH, 1)   # palms
    r21 = Grid(rom, 3, 40)                                        # כביש 21: the islet's last row now meets our beach (its edge tiles used the old roof palette)
    for x in range(6, 11): rom.w16(rom.ptr(r21.lay + 12) + (39 * r21.W + x) * 2, cellv(0x115))
    # Bill and the ferry (after the league) walk to the Pokémon center
    for at, (x, y) in ((0x166F89, (14, 15)), (0x166F94, (24, 15)), (0x166FAF, (16, 15)), (0x166FBA, (24, 15)), (0x166FC2, (24, 9)), (0x166FCA, (19, 9))):
        citykit.patch_xyperm(rom, at, x, y)
    C.move_obj(3, 20, 15); C.move_obj(4, 20, 8)
    post(C, 0, 10, 15, 'אילת~עיר הדקלים, האלמוגים והשמש')
    C.move_bg(1, 8, 15, 'המצפה התת-ימי של אילת~מעבדה למחקר פוקימוני ים ומאובנים')
    C.move_bg(3, 9, 15, 'המצפה התת-ימי של אילת~מעבדה למחקר פוקימוני ים ומאובנים')
    post(C, 2, 13, 7)
    C.move_obj(1, 10, 10)
    C.move_obj(2, 19, 16)
    C.npc(18, 16, 30, 'אילת! בלי מע״מ, עם הרבה שמש.|תשים כובע. אפילו הצ׳רמנדר שלי מזיע פה.')
    C.npc(9, 8, 47, 'אני מטפס על הרי אילת כל בוקר.|מלמעלה רואים ארבע מדינות! טוב, שלוש וחצי.')
    C.npc(6, 16, 43, 'השונית של אילת מלאה באלמוגים ובפוקימוני מים.|אבל אסור לגעת! זה שמורת טבע.', mv=9)
    C.commit()
    return C


def beersheba(rom, orig):
    """באר שבע (Viridian, 48x40), built from scratch: the capital of the Negev in the desert. A narrow pass between two hills
    leads north (the old man who hasn't had his coffee blocks it, later shows how to catch), the old city streets, the
    university (the trainer school), Abraham's Well, Tel Be'er Sheva, the Bedouin market, Sara's locked gym."""
    T = tiles(orig)
    C = City(rom, orig, 3, 1, seed=111)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    rocks = lambda *r: rock_rect(lambda x, y, mt, c: C.put(x, y, cellv(mt, c)), *r, W, H)
    C.area(T['sand'], R((2, 3, 44, 36)))                          # the desert town
    # tree walls (exits: north x 19-23, south x 22-25, west rows 17-19)
    C.pines(0, 18, 0, 2, trunk=True); C.pines(24, W - 1, 0, 2, trunk=True)
    C.pines(0, 1, 3, 16, trunk=True); C.pines(0, 1, 20, H - 1, top=True, caps=True)
    C.pines(45, 47, 3, H - 1, trunk=False) if False else C.pines(46, 47, 3, H - 1)
    C.pines(2, 21, 37, H - 1, top=True, caps=True); C.pines(26, 45, 37, H - 1, top=True, caps=True)
    # the pass north between two hills, with the old man
    rocks(2, 3, 19, 10); rocks(23, 3, 45, 10)
    C.area(T['pave'], R((19, 0, 23, 2), (20, 3, 22, 16),          # דרך חברון (north exit)
                        (0, 17, 44, 19),          # שדרות רגר (west exit)
                        (21, 20, 23, 30), (22, 31, 25, H - 1),    # south exit
                        (3, 27, 44, 28)))
    C.move_obj(4, 21, 6)                                          # the old man: standing (tutorial) / lying on the road
    citykit.patch_xyperm(rom, 0x16598C, 21, 6); citykit.patch_xyperm(rom, 0x16599D, 21, 9)
    c0 = rom.map_events(rom.map_header(3, 1))['coord']
    sc = {i: rom.ptr(o + 12) for i, o in enumerate(c0)}
    C.coords([(20, 9, 0x4051, 0, sc[0]), (22, 9, 0x4051, 0, sc[0]),     # "private property!" - pushed back
              (36 + 1, 16, 0x405A, 0, sc[1]),                           # the gym's locked door
              (20, 6, 0x4051, 1, sc[2]), (22, 6, 0x4051, 1, sc[3])])    # the catching demo
    # north-west: the grove (CUT tree, item) and a house
    C.stamp(STAMPS['vir_house'], 12, 11, warps=[1])               # door 14,14
    for x in range(3, 11): put(x, 11, BUSH, 1); put(x, 16, BUSH, 1)
    for y in range(12, 16): put(3, y, BUSH, 1); put(10, y, BUSH, 1)
    put(10, 14, 0x0D4); C.move_obj(8, 10, 14); C.move_obj(9, 5, 13)   # CUT tree, the item behind it
    for x, y in ((5, 15), (7, 12), (8, 14)): put(x, y, BUSH, 1)
    # north-east: Sara's gym (locked), the man who waits for her
    C.stamp(STAMPS['gym'], 34, 11, warps=[2])                     # door 37,15
    C.move_obj(3, 35, 16)
    for x, y in ((25, 12), (28, 13), (31, 12), (42, 12), (43, 14), (26, 15), (30, 15)): put(x, y, BUSH, 1)
    # the middle: Abraham's well, the market, the university, Pokémon center, mart
    C.area(T['water'], R((6, 21, 9, 24)))                         # באר אברהם
    for x, y in ((5, 20), (10, 20), (5, 25), (10, 25)): put(x, y, BUSH, 1)
    for x in range(13, 20, 2): put(x, 21, FLOWER); put(x, 23, BUSH, 1); put(x + 1, 25, FLOWER)
    C.stamp(STAMPS['vir_school'], 24, 20, warps=[3])              # אוניברסיטת בן גוריון (door 26,23)
    C.stamp(STAMPS['pc'], 31, 21, warps=[0])                      # door 33,25
    C.stamp(STAMPS['mart'], 38, 22, warps=[4])                    # door 40,25
    # south: the sleeping man's garden (CUT tree), Tel Be'er Sheva
    for x in range(3, 11): put(x, 30, BUSH, 1); put(x, 35, BUSH, 1)
    for y in range(31, 35): put(3, y, BUSH, 1); put(10, y, BUSH, 1)
    put(10, 32, 0x0D4); C.move_obj(2, 10, 32); C.move_obj(1, 6, 33)
    rocks(29, 30, 40, 35)                                         # תל באר שבע
    for x, y in ((14, 31), (17, 33), (13, 34), (27, 32), (42, 31), (43, 34)): put(x, y, BUSH, 1)
    # signs
    post(C, 0, 24, 1) if False else post(C, 0, 19, 12)
    post(C, 1, 33, 15)
    post(C, 2, 20, 33)
    post(C, 3, 23, 16, 'באר שבע~בירת הנגב')
    C.move_bg(4, 37, 15)                                          # sign on the gym's door
    C.put(11, 22, cellv(SIGN, 1)); C.sign(11, 22, 'באר אברהם~כאן, לפי המסורת, חפר אברהם אבינו באר.')
    C.put(28, 31, cellv(SIGN, 1)); C.sign(28, 31, 'תל באר שבע~עיר עתיקה מימי המקרא. אסור לחפור בלי אישור!')
    C.put(14, 20, cellv(SIGN, 1)); C.sign(14, 20, 'השוק הבדואי~כל יום חמישי. היום יום שלישי.')
    # people
    C.move_obj(5, 23, 12)
    C.move_obj(6, 16, 26); C.move_obj(7, 30, 18)
    C.npc(25, 26, 47, 'אני חוקר באוניברסיטת בן גוריון.|אנחנו מגדלים פוקימונים שחיים במדבר עם כוס מים אחת בשבוע. כמוני בתקופת מבחנים.')
    C.npc(8, 26, 36, 'הבאר של אברהם עדיין מלאה מים?|פעם כל הנגב היה מגיע לכאן לשתות. היום יש מזגן.')
    C.npc(16, 22, 28, 'בוא לשוק הבדואי! יש קפה עם הל, תמרים ושטיחים.|...היום סגור? אז בוא ביום חמישי.', mv=8)
    C.commit()
    return C



def dead_sea(rom, orig):
    """ים המלח (Lavender, 24x20), built from scratch: Masada - the tower on its rock in the west, the Dead Sea with salt
    rocks in the south-west, the hotels of Ein Bokek in the east."""
    T = tiles(orig)
    C = City(rom, orig, 3, 4, seed=444)
    W, H = C.W, C.H
    put = lambda x, y, mt, c=0: C.put(x, y, cellv(mt, c))
    rock_rect(lambda x, y, mt, c: C.put(x, y, cellv(mt, c)), 0, 0, 9, 8, W, H)
    rock_rect(lambda x, y, mt, c: C.put(x, y, cellv(mt, c)), 0, 0, 1, 8, W, H)
    C.stamp(STAMPS['lav_dome'], 2, 0)                             # מצדה: the tower's top (as on כביש 10) and body
    C.stamp(STAMPS['lav_tower'], 2, 6, warps=[0])                 # door 5,12
    C.area(T['water'], R((0, 15, 9, H - 1)))                      # ים המלח
    for rx, ry in ((2, 16), (6, 18), (1, 18)): put(rx, ry, 0x110, 1); put(rx + 1, ry, 0x111, 1)
    C.area(T['sand'], R((0, 9, 1, 14), (0, 13, 12, 14), (10, 0, 12, 12), (10, 13, 13, H - 1),
                        (12, 6, W - 1, 7), (14, 12, W - 1, 13)))
    C.pines(22, 23, 8, 11, trunk=True) if False else None
    C.stamp(STAMPS['pc'], 13, 1, warps=[1])                       # door 15,5
    C.stamp(STAMPS['lav_house'], 18, 2, warps=[2])                # door 20,5
    C.stamp(STAMPS['mart'], 14, 8, warps=[5])                     # door 16,11
    C.stamp(STAMPS['lav_house'], 18, 8, warps=[3])                # door 20,11
    C.stamp(STAMPS['lav_house'], 16, 14, warps=[4])               # door 18,17
    C.area(T['sand'], R((15, 18, W - 1, 19)), ctx=R((14, 12, W - 1, 13), (10, 12, 13, H - 1)))
    for x, y in ((12, 1), (12, 3), (22, 15), (23, 17), (14, 16)): put(x, y, BUSH, 1)
    r10 = Grid(rom, 3, 28)                                        # כביש 10: the old tower top above the map becomes rock
    for y in range(72, 80):
        for x in range(15, 22):
            v = cellv(0x001) if y < 74 else cellv(0x069 if y == 74 else 0x071, 1)
            rom.w16(rom.ptr(r10.lay + 12) + (y * r10.W + x) * 2, v)
    post(C, 1, 12, 12, 'ים המלח~הנקודה הנמוכה בעולם. גם המצב רוח של הפוקימונים כאן נמוך')
    post(C, 2, 5, 11) if False else post(C, 2, 9, 12, 'מצדה~המבצר על ההר. אומרים שבלילה רוחות מסתובבות בפסגה')
    post(C, 3, 22, 11)
    post(C, 0, 17, 6) if False else post(C, 0, 12, 5)
    C.move_obj(1, 11, 14)
    C.move_obj(2, 17, 12)
    C.move_obj(3, 11, 4)
    C.npc(4, 14, 30, 'במים של ים המלח אי אפשר לטבוע! אתה פשוט צף.|רק אל תיתן למים להיכנס לעיניים.')
    C.npc(20, 13, 33, 'אני מוכר בוץ מים המלח. טוב לעור!|הפוקימונים שלי מתלוננים שזה מלוכלך. מה הם מבינים בטיפוח?')
    C.commit()
    return C


ALL = [tel_aviv, haifa, ashdod, dead_sea, nazareth, tiberias, raanana, eilat, beersheba]
