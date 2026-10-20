# Pokémon changes from the editor's Pokémon tab ("Export Pokémon changes" -> data/kachol_lavan/pokemon_edits.json),
# written into every build: Pokémon data, names, moves, TM/HM, evolutions, Pokédex, pictures, icons, wild encounters,
# starters / gifts. FireRed (US) v1.1 table addresses (the same ones js/game.js uses).
import json, os, struct

BASE, NAMES, TM, EVO, LEARN = 0x2547F4, 0x245F50, 0x252C38, 0x2597C4, 0x25D824
DEX = 0x44E8B0
FRONT, BACK, PAL, SHINY = 0x23511C, 0x2365BC, 0x23737C, 0x23813C
ICON, ICONPAL = 0x3D3810, 0x3D3EF0
WILD = 0x3C9D28
KINDS = {'grass': (4, 12), 'water': (8, 5)}
MAP_GROUPS = 0x352718
# total length of FireRed script commands (the same table as js/pokemon.js)
SCRIPT_LEN = {0x00: 1, 0x01: 1, 0x02: 1, 0x03: 1, 0x04: 5, 0x05: 5, 0x06: 6, 0x07: 6, 0x08: 2, 0x09: 2, 0x0A: 3, 0x0B: 3, 0x0C: 1, 0x0D: 1, 0x0E: 2, 0x0F: 6,
    0x10: 3, 0x11: 6, 0x12: 6, 0x13: 6, 0x14: 3, 0x15: 9, 0x16: 5, 0x17: 5, 0x18: 5, 0x19: 5, 0x1A: 5, 0x1B: 3, 0x1C: 3, 0x1D: 6, 0x1E: 6, 0x1F: 6,
    0x20: 9, 0x21: 5, 0x22: 5, 0x23: 5, 0x24: 5, 0x25: 3, 0x26: 5, 0x27: 1, 0x28: 3, 0x29: 3, 0x2A: 3, 0x2B: 3, 0x2C: 5, 0x2D: 1, 0x2E: 1, 0x2F: 3,
    0x30: 1, 0x31: 3, 0x32: 1, 0x33: 4, 0x34: 3, 0x35: 1, 0x36: 3, 0x37: 2, 0x38: 2, 0x39: 8, 0x3A: 8, 0x3B: 8, 0x3C: 3, 0x3D: 8, 0x3E: 8, 0x3F: 8,
    0x40: 8, 0x41: 8, 0x42: 5, 0x43: 1, 0x44: 5, 0x45: 5, 0x46: 5, 0x47: 5, 0x48: 3, 0x49: 5, 0x4A: 5, 0x4B: 3, 0x4C: 3, 0x4D: 3, 0x4E: 3, 0x4F: 7,
    0x50: 9, 0x51: 3, 0x52: 5, 0x53: 3, 0x54: 5, 0x55: 3, 0x56: 5, 0x57: 7, 0x58: 5, 0x59: 5, 0x5A: 1, 0x5B: 4, 0x5D: 1, 0x5E: 1, 0x5F: 1,
    0x60: 3, 0x61: 3, 0x62: 3, 0x63: 7, 0x64: 3, 0x65: 4, 0x66: 1, 0x67: 5, 0x68: 1, 0x69: 1, 0x6A: 1, 0x6B: 1, 0x6C: 1, 0x6D: 1, 0x6E: 3, 0x6F: 5,
    0x70: 6, 0x71: 6, 0x72: 1, 0x73: 5, 0x74: 5, 0x75: 5, 0x76: 1, 0x77: 2, 0x78: 5, 0x79: 15, 0x7A: 3, 0x7B: 5, 0x7C: 3, 0x7D: 4, 0x7E: 2, 0x7F: 4,
    0x80: 4, 0x81: 4, 0x82: 4, 0x83: 4, 0x84: 4, 0x85: 6, 0x86: 5, 0x87: 5, 0x88: 5, 0x89: 3, 0x8A: 4, 0x8B: 1, 0x8C: 1, 0x8D: 1, 0x8E: 1, 0x8F: 3,
    0x90: 6, 0x91: 6, 0x92: 6, 0x93: 4, 0x94: 1, 0x95: 4, 0x96: 3, 0x97: 2, 0x98: 3, 0x99: 3, 0x9A: 2, 0x9B: 5, 0x9C: 3, 0x9D: 4, 0x9E: 3, 0x9F: 3,
    0xA0: 1, 0xA1: 4, 0xA2: 9, 0xA3: 1, 0xA4: 3, 0xA5: 1, 0xA6: 2, 0xA7: 3, 0xA8: 5, 0xA9: 4, 0xAA: 9, 0xAB: 3, 0xAC: 5, 0xAD: 5, 0xAE: 1, 0xAF: 5,
    0xB0: 5, 0xB1: 8, 0xB2: 1, 0xB3: 3, 0xB4: 3, 0xB5: 3, 0xB6: 6, 0xB7: 1, 0xB8: 5, 0xB9: 5, 0xBA: 5, 0xBB: 6, 0xBC: 6, 0xBD: 5, 0xBE: 5, 0xBF: 6,
    0xC0: 3, 0xC1: 3, 0xC2: 3, 0xC3: 2, 0xC4: 8, 0xC5: 1, 0xC6: 4, 0xC7: 2, 0xC8: 5, 0xC9: 1, 0xCA: 1, 0xCB: 1, 0xCD: 3, 0xCE: 3, 0xCF: 1,
    0xD0: 3, 0xD1: 8, 0xD2: 4, 0xD3: 3, 0xD4: 1, 0xD5: 3, 0xD6: 1, 0xD7: 8, 0xD8: 1, 0xD9: 1, 0xDA: 1, 0xDB: 5, 0xDC: 2, 0xDD: 4, 0xDE: 4, 0xDF: 5, 0xE0: 8, 0xE1: 4, 0xE2: 6}
TRAINER_LEN = [14, 18, 18, 10, 18, 14, 22, 18, 22, 14]


def _species(rom, sp, d):
    b = bytes.fromhex
    if 'base' in d: rom.write(BASE + sp * 28, b(d['base']))
    if 'name' in d: rom.write(NAMES + sp * 11, b(d['name']))
    if 'tm' in d: rom.write(TM + sp * 8, b(d['tm']))
    if 'evo' in d: rom.write(EVO + sp * 40, b(d['evo']))
    if d.get('learnset'): rom.wptr(LEARN + sp * 4, rom.write_new(b(d['learnset'])))
    if 'dex' in d:
        e = DEX + d['dex']['nat'] * 36
        rom.write(e, b(d['dex']['head'])[:16])
        if d['dex']['desc']: rom.wptr(e + 16, rom.write_new(b(d['dex']['desc'])))
    for k, t in (('front', FRONT), ('back', BACK), ('pal', PAL), ('shiny', SHINY)):
        if d.get(k): rom.wptr(t + sp * 8, rom.write_new(b(d[k])))
    if d.get('icon'): rom.wptr(ICON + sp * 4, rom.write_new(b(d['icon'])))
    if 'iconPal' in d: rom.u8[ICONPAL + sp] = d['iconPal']


def _wild_headers(rom, table):
    out = []
    for p in range(table, table + 20 * 600, 20):
        if rom.u8[p] == 0xFF and rom.u8[p + 1] == 0xFF: break
        out.append((rom.u8[p], rom.u8[p + 1], p))
    return out


def _wild(rom, key, entry, state):
    g, n = map(int, key.split('.'))
    hs = _wild_headers(rom, state['table'])
    hd = next((p for hg, hn, p in hs if hg == g and hn == n), None)
    if hd is None:                                                      # a new entry in the wild table (moved)
        t = state['table']
        arr = bytes(rom.u8[t:t + len(hs) * 20]) + bytes([g, n]) + bytes(18) + bytes(rom.u8[t + len(hs) * 20:t + len(hs) * 20 + 20])
        nt = rom.write_new(arr)
        for p in rom.find_ptrs(t, True): rom.wptr(p, nt)
        state['table'] = nt; hd = nt + len(hs) * 20
    for kind, (off, cnt) in KINDS.items():
        w = entry.get(kind)
        if not w: struct.pack_into('<I', rom.u8, hd + off, 0); continue
        mons = b''.join(struct.pack('<BBH', a, c, s) for a, c, s in w['slots'])
        rom.wptr(hd + off, rom.write_new(bytes([w['rate'], 0, 0, 0]) + struct.pack('<I', 0x08000000 + rom.write_new(mons))))


def _gift_scan(rom):
    """the same scan as the editor (js/pokemon.js Gifts.scan): {(group, num, index): offset}"""
    out, seen_at = {}, set()

    def walk(start, visit, seen, depth):
        if start < 0 or start in seen or depth > 5: return
        seen.add(start)
        p, end = start, start + 900
        while p < end and p < len(rom.u8) - 24:
            op = rom.u8[p]
            if op in (0x79, 0xB6): visit(p)
            if op in (0x02, 0x03): return
            if op in (0x04, 0x05):
                walk(rom.ptr(p + 1), visit, seen, depth + 1)
                if op == 0x05: return
            if op in (0x06, 0x07): walk(rom.ptr(p + 2), visit, seen, depth + 1)
            n = (TRAINER_LEN[rom.u8[p + 1]] if rom.u8[p + 1] < len(TRAINER_LEN) else 0) if op == 0x5C else SCRIPT_LEN.get(op, 0)
            if not n: return
            p += n

    # map list like the editor's: a header listed in two groups (a moved group array leaves a copy) belongs where its index is lower
    maps = []
    for g in range(43):
        gp, n = rom.ptr(MAP_GROUPS + g * 4), 0
        while gp >= 0 and n < 256:
            hp = rom.ptr(gp + n * 4)
            if hp < 0 or rom.ptr(hp) < 0: break
            maps.append((g, n, hp)); n += 1
    home = {}
    for g, n, hp in maps:
        if hp not in home or n < home[hp][1]: home[hp] = (g, n)
    cut = {}
    for g, n, hp in maps:
        if home[hp][0] != g: cut[g] = min(cut.get(g, 999), n)
    for g, n, hp in maps:
        if n >= cut.get(g, 999): continue
        if True:
            scripts = []
            ev = rom.ptr(hp + 4)
            if ev >= 0:
                no, nc, nb = rom.u8[ev], rom.u8[ev + 2], rom.u8[ev + 3]
                po, pc, pb = rom.ptr(ev + 4), rom.ptr(ev + 12), rom.ptr(ev + 16)
                if po >= 0: scripts += [rom.ptr(po + i * 24 + 16) for i in range(no)]
                if pc >= 0: scripts += [rom.ptr(pc + i * 16 + 12) for i in range(nc)]
                if pb >= 0: scripts += [rom.ptr(pb + i * 12 + 8) for i in range(nb) if rom.u8[pb + i * 12 + 5] < 5]
            ms = rom.ptr(hp + 8)
            if ms >= 0:
                i = 0
                while i < 10 and rom.u8[ms + i * 5]:
                    if rom.u8[ms + i * 5] in (1, 3, 5, 7): scripts.append(rom.ptr(ms + i * 5 + 1))
                    i += 1
            k = [0]

            def visit(at, g=g, n=n, k=k):
                sp, lv = rom.r16(at + 1), rom.u8[at + 3]
                if at in seen_at or not (0 < sp < 412) or not (1 <= lv <= 100): return
                seen_at.add(at); out[(g, n, k[0])] = at; k[0] += 1
            for s in scripts: walk(s, visit, set(), 0)
    return out


def _gift(rom, scan, x):
    at = scan.get((x['g'], x['n'], x['idx']))
    if at is None: print('  pokemon edits: gift %d.%d #%d not found in this build' % (x['g'], x['n'], x['idx'])); return
    old = rom.r16(at + 1)
    for p in range(max(0, at - 160), at + 120):
        op = rom.u8[p]
        if op in (0x75, 0x79, 0xB6) and rom.r16(p + 1) == old: rom.w16(p + 1, x['species'])
        elif op == 0x7D and rom.r16(p + 2) == old: rom.w16(p + 2, x['species'])
        elif op == 0x16 and rom.r16(p + 3) == old and rom.r16(p + 1) >= 0x4000: rom.w16(p + 3, x['species'])
    rom.u8[at + 3] = x['level']


def apply(rom, path):
    if not os.path.exists(path): return None
    j = json.load(open(path, encoding='utf8'))
    assert j.get('format') == 'kl-pokemon-1', path
    for sp, d in j.get('species', {}).items(): _species(rom, int(sp), d)
    state = {'table': WILD}
    for key, entry in j.get('wild', {}).items(): _wild(rom, key, entry, state)
    if j.get('gifts'):
        scan = _gift_scan(rom)
        for x in j['gifts']: _gift(rom, scan, x)
    return len(j.get('species', {})), len(j.get('wild', {})), len(j.get('gifts', []))
