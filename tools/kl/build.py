# Builds "פוקימון כחול-לבן" from the Hebrew FireRed ROM.
#   python -X utf8 tools/kl/build.py
# Input : D:\GBA\FireRed_hebrew.gba (made by the editor's "Patch game" button) + the original US v1.1 ROM
# Output: D:\GBA\Pokemon_KacholLavan.gba
# Content lives in data/kachol_lavan/: names.json (global renames), text_*.json (per-string rewrites), game.json.
import json, struct, glob, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gba import Rom, tokenize, decode
import script
import zelekha_sprite
import tsedek
import forest
from newmap import rock_rect

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', 'data')
KL = os.path.join(DATA, 'kachol_lavan')
ORIG = os.environ.get('KL_ORIG', r'D:\GBA\Pokemon - Fire Red Version (U) (V1.1).gba')
SRC = os.environ.get('KL_SRC', r'D:\GBA\FireRed_hebrew.gba')
OUT = os.environ.get('KL_OUT', r'D:\GBA\Pokemon_KacholLavan.gba')
SKIP = set(os.environ.get('KL_SKIP', '').split(','))  # for testing: tsedek, pal, rocks, maps, text
TRAINERS = 0x23EB38
MAPSEC_NAMES = 0x3F1D1C  # pointers to map section names, from MAPSEC 0x58
LEARNSETS = None  # found at runtime
BOX = 208  # message box width (px)


def load_json(p): return json.load(open(p, encoding='utf-8'))


def load_pack():
    s = open(os.path.join(DATA, 'translation_BPRE1.js'), encoding='utf-8').read()
    return json.loads(s[s.index('BPRE1 = ') + 8:s.rindex(';')])


# ---------- text (same wrapping rules as js/text.js wrapText / isDialogue) ----------
PHW = {1: 42, 2: 60, 3: 60, 4: 60, 6: 42}


def width(rom, s):
    try:
        w = 0
        for b, k in tokenize(s):
            if k == 'ph': w += PHW.get(b[1], 48)
            elif k == 'char': w += rom.width(b[0]) if len(b) == 1 else (rom.width(b[2]) if b[0] == 0xFC else 8)
            elif b[0] == 0xFD: w += 48
        return w
    except Exception:
        return len(s) * 6


def en_lines(en): return [l for l in re.split(r'\\[nlp]', en.replace('\n', '')) if l]


def is_dialogue(rom, en):
    ls = en_lines(en)
    return bool(re.search(r'\\[pl]', en)) or '{FD ' in en or (len(ls) <= 2 and max([0] + [width(rom, l) for l in ls]) > 150)


def wrap_text(rom, he, en):
    if re.search(r'\\[nl]', he): return he
    ls = en_lines(en)
    if len(ls) <= 1 and '\\p' not in en and width(rom, he) <= BOX - 6: return he
    en_max = max([0] + [width(rom, l) for l in ls])
    dialogue = bool(re.search(r'\\[pl]', en)) or len(ls) <= 2
    max_w = BOX - 6 if dialogue else max(en_max, 60) + 4
    out = []
    for par in he.split('\\p'):
        words, lines, cur = re.findall(r'(?:\{[^}]*\}|[^ ])+', par.strip()), [], ''
        for w in words:
            t = cur + ' ' + w if cur else w
            if cur and width(rom, t) > max_w: lines.append(cur); cur = w
            else: cur = t
        if cur: lines.append(cur)
        out.append(''.join(l if i == 0 else ('\\l' if dialogue and i >= 2 else '\\n') + l for i, l in enumerate(lines)))
    return '\\p'.join(out)


def real_ref(u, p):
    return p % 4 == 0 or (u[p - 2] == 0x0F and u[p - 1] < 4) or u[p - 1] == 0x67 or u[p - 2] == 0x85 or u[p - 1] == 0x78 or \
        u[p - 6] == 0x5C or u[p - 10] == 0x5C or u[p - 14] == 0x5C


class TextWriter:
    def __init__(self, rom, orig, pack):
        self.rom, self.orig, self.pack, self.log = rom, orig, pack, []

    def locate(self, key):
        """current offset of the string that was at `key` in the English ROM, and the pointer locations to it"""
        k = int(key, 16)
        refs = [p for p in self.orig.find_ptrs(k) if real_ref(self.orig.u8, p)]
        cur = self.rom.ptr(refs[0]) if refs else k
        return cur, [p for p in refs if self.rom.ptr(p) == cur]

    def put(self, key, he):
        en = self.pack[key][0] if key in self.pack else decode(self.orig.u8, int(key, 16))
        text = wrap_text(self.rom, he, en)
        no_align = (not re.search(r'\\p', en)) if re.search(r'\\[nl]', he) else not is_dialogue(self.rom, en)
        if re.search(r'\{FD [0-9A-F]{2}\}', he): no_align = True   # battle buffers (class, names, moves): unknown width -> no padding
        if re.search(r'\\p$', en) and not text.endswith('\\p'): text += '\\p'
        cur, refs = self.locate(key)
        data = self.rom.encode(text, align=not no_align, box=BOX)
        old = self.rom.str_len(cur)
        if len(data) > old:
            plain = self.rom.encode(text, align=False)
            if len(plain) <= old: data = plain
        if len(data) <= old:
            self.rom.write(cur, data + b'\xff' * (old - len(data)))
        else:
            if not refs: raise RuntimeError('%s: too long and no pointer to move it' % key)
            n = self.rom.write_new(data)
            for p in refs: self.rom.wptr(p, n)


def apply_renames(he, renames):
    for a, b in renames:
        if a.startswith('re:'): he = re.sub(a[3:], b, he)
        else: he = he.replace(a, b)
    return he


# ---------- Pokémon / trainers ----------
def find_learnsets(rom):
    o = rom.u8.find(bytes([0x21, 0x02, 0x2D, 0x08]))  # BULBASAUR: Tackle lv1, Growl lv4
    for p in rom.find_ptrs(o, True):
        if rom.ptr(p - 4) >= 0: return p - 4
    raise RuntimeError('learnsets not found')


def moves_at_level(rom, ls, species, level):
    p, moves = rom.ptr(ls + species * 4), []
    while rom.r16(p) != 0xFFFF:
        v = rom.r16(p); p += 2
        if (v >> 9) <= level and (v & 0x1FF) not in moves:
            moves.append(v & 0x1FF)
    moves = moves[-4:]
    return moves + [0] * (4 - len(moves))


def swap_trainer_species(rom, classes, mapping, ls):
    n = 0
    for t in range(743):
        o = TRAINERS + t * 40
        if rom.u8[o + 1] not in classes: continue
        flags, cnt, pp = rom.u8[o], rom.u8[o + 32], rom.ptr(o + 36)
        sz = 16 if flags & 1 else 8
        for i in range(cnt):
            m = pp + i * sz
            sp = rom.r16(m + 4)
            if sp in mapping:
                rom.w16(m + 4, mapping[sp]); n += 1
                if flags & 1:  # custom moves: give the new species its own level-up moves
                    mv = moves_at_level(rom, ls, mapping[sp], rom.r16(m + 2))
                    for j in range(4): rom.w16(m + 8 + j * 2, mv[j])
    return n


def patch_starters(rom, balls, starters):
    """balls: script offsets of the 3 lab balls; each sets 0x4002 (player) and 0x4003 (rival) species"""
    old2new = {int(k): v for k, v in starters.items()}
    for sc in balls:
        for o, name, args in script.disasm(rom.u8, sc, follow=False, limit=8):
            if name == 'setvar' and args[0][1] in (0x4002, 0x4003):
                v = args[1][1]
                rom.w16(args[1][2], old2new.get(v, v))


FONTS = [(0x1FF370, 64), (0x1F3170, 64), (0x20F688, 64), (0x21F9A0, 64), (0x1EAF70, 32)]
SHEKEL = ['#####.#', '#...#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#...#', '#.#####']


def glyph_px(rom, base, code, size):
    cols, g = size // 32, base + code * size
    px = [[0] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(8 * cols):
            o = g + ((y >> 3) * cols + (x >> 3)) * 16 + (y & 7) * 2
            b = rom.u8[o + 1] if (x & 7) < 4 else rom.u8[o]
            px[y][x] = (b >> (6 - 2 * (x & 3))) & 3
    return px


def put_glyph(rom, base, code, size, px):
    cols, g = size // 32, base + code * size
    out = bytearray(size)
    for y in range(16):
        for x in range(8 * cols):
            o = ((y >> 3) * cols + (x >> 3)) * 16 + (y & 7) * 2 + (1 if (x & 7) < 4 else 0)
            out[o] |= (px[y][x] & 3) << (6 - 2 * (x & 3))
    rom.write(g, out)


def draw_shekel(rom):
    """replace the Pokédollar glyph (0xB7, typed as $ or ₪) with ₪ in every font: 1 = text, 2 = shadow"""
    for base, size in FONTS:
        px = glyph_px(rom, base, 0xB7, size)
        rows = [y for y in range(16) if 1 in px[y][:8]]
        bg = px[rows[0]][7] if px[rows[0]][7] in (0, 3) else 3
        bottom = rows[-1] - 1 if size == 64 else rows[-1]
        for y in range(16):
            for x in range(8):
                if px[y][x] in (1, 2): px[y][x] = bg
        top = bottom - len(SHEKEL) + 1
        for dy, row in enumerate(SHEKEL):
            for dx, ch in enumerate(row):
                if ch != '#': continue
                for sx, sy in ((1, 0), (0, 1), (1, 1)):
                    if px[top + dy + sy][dx + sx] != 1: px[top + dy + sy][dx + sx] = 2
                px[top + dy][dx] = 1
        put_glyph(rom, base, 0xB7, size, px)


def set_party(rom, t, mons):
    """mons: [[level, species, [4 moves]]] - same count as the original party, custom moves"""
    o = TRAINERS + t * 40
    flags, cnt, pp = rom.u8[o], rom.u8[o + 32], rom.ptr(o + 36)
    assert cnt == len(mons), ('trainer %d has %d Pokémon' % (t, cnt))
    sz = 16 if flags & 1 else 8
    for i, (lv, sp, mv) in enumerate(mons):
        m = pp + i * sz
        rom.w16(m + 2, lv); rom.w16(m + 4, sp)
        if flags & 1:                          # custom moves: given, or the species' own level-up moves
            mv = mv or moves_at_level(rom, find_learnsets(rom), sp, lv)
            for j in range(4): rom.w16(m + 8 + j * 2, mv[j] if j < len(mv) else 0)


def main():
    orig, rom, pack = Rom(ORIG), Rom(SRC), load_pack()
    game = load_json(os.path.join(KL, 'game.json'))
    renames = load_json(os.path.join(KL, 'names.json'))['renames']
    overrides = {}
    for f in sorted(glob.glob(os.path.join(KL, 'text_*.json'))):
        for k, v in load_json(f).items():
            if not k.startswith('_'): overrides[k.upper()] = v

    # 1. text: per-string rewrites first, then global renames on everything
    tw, changed = TextWriter(rom, orig, pack), 0
    skip = [(int(a, 16), int(b, 16)) for a, b in game['text_skip_ranges']]
    keys = set(pack) | set(overrides)
    for key in sorted(keys, key=lambda k: int(k, 16)):
        if any(a <= int(key, 16) < b for a, b in skip) and key not in overrides: continue
        base = pack[key][1] if key in pack else None
        he = apply_renames(overrides.get(key, base), renames)
        battle = he is not None and re.search(r'\{FD [0-9A-F]{2}\}', he)
        if he is None or (he == base and not battle): continue
        tw.put(key, he); changed += 1
    print('text: %d strings rewritten' % changed)

    # trainer names (fixed 12 bytes in the trainer table)
    tn = 0
    for t in range(743):
        o = TRAINERS + t * 40 + 4
        old = decode(rom.u8, o, 12)
        new = game['trainer_names'].get(old) or apply_renames(old, renames)
        if new != old:
            data = rom.encode(new, align=False)
            if len(data) <= 12:
                rom.write(o, data + b'\x00' * (12 - len(data))); tn += 1
            else: print('trainer name too long:', new)
    for t, ov in game.get('trainer_overrides', {}).items():      # per-trainer name / battle picture
        o = TRAINERS + int(t) * 40
        if 'name' in ov:
            data = rom.encode(ov['name'], align=False)
            rom.write(o + 4, data + bytes(12 - len(data)))
        if 'pic' in ov: rom.u8[o + 3] = ov['pic']
        if 'class' in ov: rom.u8[o + 1] = ov['class']
    for g_, m_, x_, y_, gfx in game.get('object_gfx', []):     # sprite of a person on a map
        for ob in rom.map_events(rom.map_header(g_, m_))['obj']:
            if rom.s16(ob + 4) == x_ and rom.s16(ob + 6) == y_: rom.u8[ob + 1] = gfx
    print('trainer names: %d renamed' % tn)
    for cls, name in game.get('trainer_classes', {}).items():     # trainer class names ("LEADER" -> "מנהיג מכון")
        data = rom.encode(name, align=False)
        assert len(data) <= 13, name
        rom.write(0x23E5C8 + int(cls) * 13, data + bytes([0xFF]) * (13 - len(data)))

    # map section names (region map / location popup)
    for sec, name in game['mapsec_names'].items():
        p = MAPSEC_NAMES + (int(sec, 16) - 0x58) * 4
        rom.set_text(rom.ptr(p), name, refs=[p], align=False, wrap=False)
    for t, mons in game['trainer_parties'].items():
        set_party(rom, int(t), mons)
    draw_shekel(rom)
    print('map names, %d trainer parties, ₪ glyph' % len(game['trainer_parties']))

    for cp in game.get('code_patches', []):                       # small ASM patches
        rom.write(int(cp['addr'], 16), bytes.fromhex(cp['bytes']))

    # 2. starters + rival
    patch_starters(rom, [int(x, 16) for x in game['starter_ball_scripts']], game['starters'])
    ls = find_learnsets(rom)
    n = swap_trainer_species(rom, set(game['rival_classes']), {int(k): v for k, v in game['rival_species'].items()}, ls)
    print('starters patched, rival: %d Pokémon swapped' % n)
    import lab                                                   # four Poké Balls in Zelekha's lab
    lab.build(rom, lambda k: tw.locate('%X' % k)[0])
    for ev in game.get('evolution_patches', []):                  # e.g. Haunter evolves by level instead of trade
        o = 0x2597C4 + ev['species'] * 40 + ev['slot'] * 8
        rom.write(o, struct.pack('<HHH', ev['method'], ev['param'], ev['target']))
    print('lab: 4 starters; evolution patches:', len(game.get('evolution_patches', [])))
    import hatikva                                               # the opening with the professor plays התקווה
    hatikva.build(rom)
    print('music: התקווה in the opening (song 292)')
    import yemenite                                              # Rosh HaAyin: Yemenite-step style town music
    yemenite.build(rom); print('music: Rosh HaAyin town theme (song 300)')
    import songs                                                 # songs exported from the editor's Music tab
    done = songs.apply_all(rom, os.path.join(KL, 'songs'))
    if done: print('music: songs from the editor:', done)
    import title                                                 # Hebrew "פוקימון" logo on the title screen
    print('title logo: %d tiles' % title.build(rom, os.path.join(KL, 'title_logo.png'), game.get('title_subtitle')))
    print('title scene: %d hero tiles' % title.build_scene(rom, os.path.join(KL, 'title_hero.webp')))

    # Rosh HaAyin grows west (before the block edits, which use the new coordinates)
    forest.widen_pallet(rom)

    # 3. map block edits
    for key, ed in load_json(os.path.join(KL, 'maps.json')).items():
        if key.startswith('_'): continue
        g, m = map(int, key.split('.'))
        lay = rom.ptr(rom.map_header(g, m)); w, blocks = rom.r32(lay), rom.ptr(lay + 12)
        cells = [(x, y, mt, c) for x0, y0, x1, y1, mt, c in ed.get('fill', []) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
        h = rom.r32(lay + 4)
        for r in ([] if 'rocks' in SKIP else ed.get('rocks', [])):
            rock_rect(lambda x, y, mt, c: cells.append((x, y, mt, c)), *r, w, h)
        for x, y, mt, c in cells + [tuple(v) for v in ed.get('set', [])]:
            o = blocks + (y * w + x) * 2
            elev = (rom.r16(o) >> 12) or 3
            rom.w16(o, (elev << 12) | (c << 10) | mt)
    print('maps edited')

    # the cities: new layouts, people and signs (tools/kl/cities.py)
    import cities
    for fn in cities.ALL:
        if fn.__name__ not in SKIP: fn(rom, orig)
    print('cities rebuilt:', ', '.join(f.__name__ for f in cities.ALL))

    # new map: מגדל צדק, east of Rosh HaAyin
    num = -1 if 'tsedek' in SKIP else tsedek.build(rom, lambda t: rom.encode(rom.wrap(t), align=True))
    print('new map 3.%d: מגדל צדק' % num)
    num = forest.build(rom, lambda t: rom.encode(rom.wrap(t), align=True))
    print('new map 3.%d: יער ראש העין (+ wild Ekans/Poochyena, entrance blocked until you have a Pokémon)' % num)

    import mapedits                                              # changes from the editor's World view (maps_edit/*.json)
    done = mapedits.apply_all(rom, os.path.join(KL, 'maps_edit'))
    if done: print('world edits from the editor:', ', '.join(done))

    # 4. Prof. Zelekha sprites
    sheet = os.path.join(KL, 'zelekha_ref_full.png')       # reference sheet -> NPC frames
    if 'pal' not in SKIP:
        if os.path.exists(sheet):
            pass                                          # handled with the other characters (step 5)
        else:
            zelekha_sprite.apply_v2(rom, orig)
    zelekha_sprite.apply_pic(rom)
    zelekha_sprite.apply_intro8(rom)
    ref = os.path.join(KL, 'zelekha_ref.png')          # reference art -> intro picture (overrides the edit above)
    if os.path.exists(ref):
        import ref_to_intro
        crop = game.get('zelekha_ref_crop')
        grid, colours = ref_to_intro.convert(ref, tuple(crop) if crop else None)
        if game.get('intro_touch'): grid = ref_to_intro.touch(grid, colours, game['intro_touch'])
        ref_to_intro.apply(rom, grid, colours)
        print('intro picture from', ref)
    print('Zelekha overworld sprite drawn')

    # 5. characters from reference sheets (battle picture + overworld sprite in a shared NPC palette)
    import characters, ref_to_ow
    done = []
    made = {}
    for key, spec in game.get('portraits', {}).items():          # battle pictures from existing art (until a sheet exists)
        c = game['characters'][key]
        if os.path.exists(os.path.join(KL, 'characters', c.get('sheet', key + '.png'))): continue
        made[key] = characters.portrait(rom, spec)
    for key, (g_, pal_) in made.items():                          # written after all reads (bases may be other leaders' slots)
        characters.write_portrait(rom, game['characters'][key]['pic'], g_, pal_)
    for key, c in game.get('characters', {}).items():
        sheet = os.path.join(KL, 'characters', c.get('sheet', key + '.png'))
        if not os.path.exists(sheet): continue
        import ref_to_intro
        ref_to_intro.ISLANDS = bool(c.get('bg_islands'))
        if c.get('art_only'):                                     # a single full-body drawing, no pixel poses
            from PIL import Image as _I
            art, poses = (0, 0) + _I.open(sheet).size, None
        elif c.get('art_box'):                                    # hand-picked boxes for busy sheets
            art, poses = tuple(c['art_box']), [tuple(b) for b in c['pose_boxes']]
        else:
            art, poses = characters.detect(sheet)
        if 'pic' in c: characters.write_trainer_pic(rom, c['pic'], *characters.trainer_pic(sheet, art))
        if 'gfx' in c:
            if poses:
                ref_to_ow.BOXES = poses
                frs = ref_to_ow.frames(sheet, c.get('ow_order'))
            else:                                                 # front view from the drawing, in every direction
                front = ref_to_ow.shrink(characters.cutout(sheet, art))
                frs = [front] * 9
            tag, slot, grids = characters.fit_shared(rom, frs)
            characters.write_ow_shared(rom, c['gfx'], grids, tag, slot)
        done.append(key)
    print('battle pictures from existing art:', ', '.join(made) or '-')
    print('characters from reference sheets:', ', '.join(done) or '-')

    if os.environ.get('KL_TEST_TRAINER'):                   # test only: "trainer:gfx" waits in the player's room, gives a lv50 Seedot and battles
        import newmap, struct as st
        parts = [int(v) for v in os.environ['KL_TEST_TRAINER'].split(':')]
        t, gfx = parts[0], parts[1]
        lvl = parts[2] if len(parts) > 2 else 50
        txt = rom.write_new(rom.encode('!', align=False))
        sc = rom.write_new(bytes([0x6A, 0x5A, 0x29, 0x28, 0x08, 0x79]) + st.pack('<HBHIIB', 298, lvl, 0, 0, 0, 0) +
                           (bytes([0x5C, 0x03]) + st.pack('<HHI', t, 0, 0x08000000 + txt) if t else bytes([0x44]) + st.pack('<HH', 68, 1)) +
                           bytes([0x6C, 0x02]))       # t = 0: no battle, give a Rare Candy (item 68) instead
        room = rom.map_header(4, 1)
        tmpl = rom.map_events(rom.map_header(3, 0))['obj'][0]
        old = rom.ptr(room + 4)
        ev = newmap.add_events(rom, objects=[(7, 6, gfx, 8, sc)], signs=[], template_obj=tmpl)
        evd = bytearray(rom.u8[ev:ev + 20]); oldd = rom.u8[old:old + 20]
        evd[1] = oldd[1]; evd[8:12] = oldd[8:12]; evd[3] = oldd[3]; evd[16:20] = oldd[16:20]   # keep the room's warps and signs
        rom.write(ev, bytes(evd))
        rom.wptr(room + 4, ev)
    if os.environ.get('KL_TEST_WARP'):                      # test only: the house door leads to "g.n:warp"
        gn, wi = os.environ['KL_TEST_WARP'].split(':'); tg, tn = map(int, gn.split('.'))
        for o in rom.map_events(rom.map_header(4, 0))['warp']:
            if rom.u8[o + 7] == 3 and rom.u8[o + 6] == 0: rom.u8[o + 5], rom.u8[o + 6], rom.u8[o + 7] = int(wi), tn, tg
    if os.environ.get('KL_TEST_GFX'):                       # test only: the woman in Rosh HaAyin wears this sprite
        rom.u8[rom.map_events(rom.map_header(3, 0))['obj'][0] + 1] = int(os.environ['KL_TEST_GFX'])
    import pokeedits                                             # the editor's Pokémon tab (pokemon_edits.json)
    done = pokeedits.apply(rom, os.path.join(KL, 'pokemon_edits.json'))
    if done: print('pokemon edits from the editor: %d Pokémon, %d wild areas, %d gifts' % done)
    done = mapedits.apply_patches(rom, os.path.join(KL, 'maps_edit'))      # world view edits (format 2), last
    if done: print('world edits from the editor (exact):', ', '.join(done))
    rom.save(OUT)
    print('saved', OUT)


if __name__ == '__main__':
    main()
