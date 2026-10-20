# The town map of Kachol-Lavan in the shape of Israel: which cells of the game's 22x15 region grid are land, lakes,
# towns and roads. Real coordinates (lat/lon), with the centre stretched so that Tel Aviv, Ra'anana and Rosh HaAyin
# (15 km apart) each get a cell: rows follow anchors, columns are linear.
#   python israel_map.py out.json
import json, sys

W, H = 22, 15
# the outline as on an Israeli road map (Golan, Judea and Samaria, Gaza: no inner borders), clockwise from Rosh HaNikra
OUTLINE = [(33.09, 35.10), (33.10, 35.30), (33.12, 35.50), (33.28, 35.58), (33.33, 35.80), (33.20, 35.86), (32.95, 35.85), (32.70, 35.78),
           (32.68, 35.58), (32.40, 35.56), (31.95, 35.54), (31.76, 35.56), (31.50, 35.50), (31.10, 35.46), (30.60, 35.20), (30.00, 35.06),
           (29.56, 35.00), (29.49, 34.90), (30.00, 34.68), (30.60, 34.52), (31.22, 34.27), (31.50, 34.45), (31.80, 34.63), (32.08, 34.75),
           (32.33, 34.84), (32.50, 34.88), (32.75, 34.95), (32.83, 34.98), (32.85, 35.06), (32.93, 35.07)]
LAKES = {'Kinneret': [(32.88, 35.57), (32.70, 35.59)], 'Dead Sea': [(31.75, 35.50), (31.50, 35.48), (31.25, 35.46), (31.05, 35.44)]}
ANCHORS = [(33.36, -1.6), (32.79, 2.4),     # the north goes up into the two picture rows above the grid (visible, not selectable)
           (32.50, 3.4), (32.18, 4.4), (32.08, 5.4), (31.78, 6.4), (31.25, 8.4), (30.80, 10.2), (30.60, 11.2), (29.48, 14.8)]
def row_of(lat):
    for (a, ra), (b, rb) in zip(ANCHORS, ANCHORS[1:]):
        if b <= lat <= a: return ra + (a - lat) / (a - b) * (rb - ra)
    # beyond the anchors (Lebanon above, the Gulf of Eilat below): go on with the slope of the nearest segment
    (a, ra), (b, rb) = (ANCHORS[0], ANCHORS[1]) if lat > ANCHORS[0][0] else (ANCHORS[-2], ANCHORS[-1])
    return ra + (a - lat) / (a - b) * (rb - ra)
def lat_of(row):
    for (a, ra), (b, rb) in zip(ANCHORS, ANCHORS[1:]):
        if ra <= row <= rb: return a - (row - ra) / (rb - ra) * (a - b)
    return ANCHORS[-1][0]
def col_of(lon): return 3.2 + (lon - 34.2) / 0.18           # narrower than true scale x1.6 would be wider; still readable
def lon_of(col): return 34.2 + (col - 3.2) * 0.18
def inside(lat, lon, poly):
    c = False
    for (y1, x1), (y2, x2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c
def cell(lat, lon): return [int(col_of(lon)), max(0, int(row_of(lat)))]

# the 11 cities, and the other places of the story (sections of the town map); id = the game's map section
PLACES = [  # (key, Hebrew, lat, lon, kind)
    ('rosh_haayin', 'ראש העין', 32.095, 34.957, 'city'), ('ashdod', 'אשדוד', 31.80, 34.65, 'city'), ('beer_sheva', 'באר שבע', 31.25, 34.79, 'city'),
    ('eilat', 'אילת', 29.56, 34.95, 'city'), ('dead_sea', 'ים המלח', 31.45, 35.38, 'city'), ('tiberias', 'טבריה', 32.79, 35.53, 'city'),
    ('nazareth', 'נצרת', 32.62, 35.30, 'city'), ('haifa', 'חיפה', 32.79, 34.99, 'city'), ('raanana', 'רעננה', 32.18, 34.87, 'city'),
    ('tel_aviv', 'תל אביב', 32.08, 34.78, 'city'), ('jerusalem', 'ירושלים', 31.77, 35.21, 'city'),
    ('masada', 'מצדה', 31.31, 35.35, 'place'), ('hula', 'שמורת החולה', 33.08, 35.61, 'place'), ('carmel', 'מערת הכרמל', 32.70, 35.10, 'place'),
    ('yarkon', 'פארק הירקון', 32.10, 34.84, 'place'), ('ramon', 'מכתש רמון', 30.60, 34.80, 'place'), ('shaar_hagai', 'שער הגיא', 31.82, 35.03, 'place'),
    ('migdal_tzedek', 'מגדל צדק', 32.10, 34.98, 'place'),
    # after the game (the seven islands)
    ('kinneret', 'הכנרת והר ארבל', 32.85, 35.50, 'post'), ('upper_galilee', 'הגליל העליון', 33.02, 35.38, 'post'), ('golan', 'רמת הגולן', 33.00, 35.75, 'post'),
    ('hermon', 'החרמון', 33.30, 35.78, 'post'), ('caesarea', 'קיסריה', 32.50, 34.89, 'post'), ('beit_shean', 'בית שאן', 32.50, 35.50, 'post'),
    ('ein_avdat', 'עין עבדת', 30.82, 34.77, 'post')]
# roads in the order of the game (south first, then north); each is a list of places it joins
ROADS = [('כביש 4', ['rosh_haayin', 'ashdod']), ('כביש 40 צפון', ['ashdod', 'beer_sheva']), ('כביש 40', ['beer_sheva', 'ein_avdat', 'ramon', 'eilat']),
         ('כביש 90 ערבה', ['eilat', 'masada', 'dead_sea']), ('בקעת הירדן', ['dead_sea', 'beit_shean', 'tiberias']), ('כביש 77', ['tiberias', 'nazareth']),
         ('כביש 75', ['nazareth', 'haifa']), ('כביש החוף', ['haifa', 'caesarea', 'raanana']), ('כביש 4 מרכז', ['raanana', 'tel_aviv']),
         ('כביש 1', ['rosh_haayin', 'shaar_hagai', 'jerusalem']), ('כביש 5', ['tel_aviv', 'rosh_haayin']), ('כביש 75 כרמל', ['haifa', 'carmel']), ('כביש 90 צפון', ['tiberias', 'hula'])]

# hand placement where the real coordinates crowd one cell (the centre, the Kinneret) - (col, row) on the 22x15 grid
PLACE_AT = {'hermon': (12, 0), 'golan': (12, 1), 'hula': (11, 1), 'upper_galilee': (9, 1), 'kinneret': (10, 2), 'tiberias': (10, 3),
            'haifa': (7, 2), 'carmel': (8, 3), 'caesarea': (7, 3), 'nazareth': (9, 3), 'beit_shean': (10, 4),
            'raanana': (6, 4), 'tel_aviv': (6, 5), 'rosh_haayin': (7, 5), 'ashdod': (5, 6), 'shaar_hagai': (7, 6), 'jerusalem': (8, 6),
            'dead_sea': (9, 7), 'masada': (9, 8), 'beer_sheva': (6, 8), 'ein_avdat': (6, 10), 'ramon': (6, 11), 'eilat': (7, 14)}
# places inside a city share its cell (on the town map they are the same spot)
SHARE = {'yarkon': 'rosh_haayin', 'migdal_tzedek': 'rosh_haayin'}

def main(out):
    land = [[inside(lat_of(y + 0.5), lon_of(x + 0.5), OUTLINE) for x in range(W)] for y in range(H)]
    pos, used = {}, {}
    lakes = {(11, 2), (11, 3), (10, 6), (10, 7), (10, 8)}               # the Kinneret east of Tiberias, the Dead Sea east of Masada
    for key, he, lat, lon, kind in sorted(PLACES, key=lambda p: p[0] in SHARE):
        if key in SHARE: pos[key] = list(pos[SHARE[key]]); continue
        x, y = PLACE_AT.get(key) or cell(lat, lon)
        while (x, y) in used or (x, y) in lakes:              # two places in one cell: the later one moves to a free neighbour
            for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1), (1, 1), (-1, 1)):
                if (x + dx, y + dy) not in used and (x + dx, y + dy) not in lakes: x, y = x + dx, y + dy; break
            else: break
        used[(x, y)] = key; pos[key] = [x, y]; land[y][x] = True
    for x, y in lakes: land[y][x] = True                       # lakes sit inside the land
    roads = []
    for name, stops in ROADS:
        cells = []
        for a, b in zip(stops, stops[1:]):
            (x0, y0), (x1, y1) = pos[a], pos[b]
            n = 8 * max(abs(x1 - x0), abs(y1 - y0), 1)            # the cells under the straight line the picture draws
            for i in range(1, n):
                x, y = int(x0 + 0.5 + (x1 - x0) * i / n), int(y0 + 0.5 + (y1 - y0) * i / n)
                if (x, y) not in used and (x, y) not in lakes and [x, y] not in cells: cells.append([x, y]); land[y][x] = True
        roads.append({'name': name, 'stops': stops, 'cells': cells})
    json.dump({'w': W, 'h': H, 'land': [[1 if v else 0 for v in r] for r in land], 'lakes': sorted([list(c) for c in lakes]),
               'places': [{'key': k, 'he': he, 'kind': kind, 'cell': pos[k], 'lat': lat, 'lon': lon} for k, he, lat, lon, kind in PLACES],
               'roads': roads, 'share': SHARE}, open(out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    kind = {pos[k]: kd for k, _, _, _, kd in PLACES} if False else {tuple(pos[k]): kd for k, _, _, _, kd in PLACES}
    road_cells = {tuple(c) for r in roads for c in r['cells']}
    for y in range(H):
        print(''.join('~' if (x, y) in lakes else 'O' if kind.get((x, y)) == 'city' else 'o' if (x, y) in kind else '=' if (x, y) in road_cells else '#' if land[y][x] else '.' for x in range(W)))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'israel_map.json')
