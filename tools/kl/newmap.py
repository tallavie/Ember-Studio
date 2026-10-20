# Adding brand-new maps to FireRed: layout + layout-table entry, map header in a map group,
# connections (both ways), events (people / signs) and simple scripts.
import struct

LAYOUTS = 0x34EBFC        # gMapLayouts (pointer table, layout id = index + 1)
CONN_DIR = {'down': 1, 'up': 2, 'left': 3, 'right': 4}


def tree_blocks(w, h, open_cells=()):
    """grid of FireRed tree metatiles (primary): even rows 1C/1D, odd rows 14/15"""
    return [[(0x1C if x % 2 == 0 else 0x1D) if y % 2 == 0 else (0x14 if x % 2 == 0 else 0x15) for x in range(w)] for y in range(h)]


def grass(x, y): return (0x08 if x % 2 == 0 else 0x09) if y % 2 == 0 else (0x10 if x % 2 == 0 else 0x11)


ROCK = {('t', 'l'): 0x68, ('t', ''): 0x69, ('t', 'r'): 0x6A, ('', 'l'): 0x70, ('', ''): 0x71, ('', 'r'): 0x72,
        ('b', 'l'): 0x78, ('b', ''): 0x79, ('b', 'r'): 0x7A}


def rock_rect(put, x0, y0, x1, y1, w, h):
    """rocky hill (primary tiles). Sides that touch the map border stay open (no edge)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            v = 't' if y == y0 and y0 > 0 else 'b' if y == y1 and y1 < h - 1 else ''
            hz = 'l' if x == x0 and x0 > 0 else 'r' if x == x1 and x1 < w - 1 else ''
            put(x, y, ROCK[(v, hz)], 1)


def is_layout(rom, o):
    return o >= 0 and 0 < rom.r32(o) <= 0x200 and 0 < rom.r32(o + 4) <= 0x200 and all(rom.ptr(o + k) >= 0 for k in (8, 12, 16, 20))


def group_maps(rom):
    """[(group, num, header)] for every real map, using the packed group arrays' bounds"""
    starts = [rom.ptr(rom.MAP_GROUPS + g * 4) for g in range(43)]
    srt = sorted(set(starts))
    out = []
    for g, gp in enumerate(starts):
        nxt = min([s for s in srt if s > gp] + [gp + 800])
        n = 0
        while gp + n * 4 < nxt:
            h = rom.ptr(gp + n * 4)
            if h < 0 or rom.ptr(h) < 0: break
            out.append((g, n, h)); n += 1
    return out


def layout_count(rom):
    """number of entries in gMapLayouts = highest layout id used by any map (ids are 1-based; the table has NULL gaps)"""
    return max(rom.r16(h + 18) for _, _, h in group_maps(rom))


def add_layout(rom, w, h, blocks, prim, sec, border):
    """blocks: list of u16 (metatile | coll<<10 | elev<<12). Returns (layout offset, layout id)."""
    b = rom.write_new(b''.join(struct.pack('<H', v) for v in blocks))
    bd = rom.write_new(b''.join(struct.pack('<H', v) for v in border))
    lay = rom.write_new(struct.pack('<IIIIIIBBH', w, h, 0x08000000 + bd, 0x08000000 + b, 0x08000000 + prim, 0x08000000 + sec, 2, 2, 0))
    # grow the layout table by one entry (copy to free space and repoint every reference)
    global LAYOUTS
    n = layout_count(rom)
    table = bytes(rom.u8[LAYOUTS:LAYOUTS + n * 4]) + struct.pack('<I', 0x08000000 + lay)
    new = rom.write_new(table)
    for p in rom.find_ptrs(LAYOUTS, True): rom.wptr(p, new)
    LAYOUTS = new
    return lay, n + 1


def add_to_group(rom, group, header):
    gp = rom.ptr(rom.MAP_GROUPS + group * 4)
    starts = sorted(set(rom.ptr(rom.MAP_GROUPS + g * 4) for g in range(43)))
    nxt = min([s for s in starts if s > gp] + [gp + 800])   # group arrays are packed one after another
    n = 0
    while gp + n * 4 < nxt:
        h = rom.ptr(gp + n * 4)
        if h < 0 or rom.ptr(h) < 0: break
        n += 1
    arr = bytes(rom.u8[gp:gp + n * 4]) + struct.pack('<I', 0x08000000 + header)
    rom.wptr(rom.MAP_GROUPS + group * 4, rom.write_new(arr))
    return n  # map number of the new map


def add_connection(rom, header, direction, offset, group, num):
    con = rom.ptr(header + 12)
    items = []
    if con >= 0:
        cnt, cp = rom.r32(con), rom.ptr(con + 4)
        items = [bytes(rom.u8[cp + i * 12:cp + i * 12 + 12]) for i in range(cnt)]
    items.append(struct.pack('<IiBBH', CONN_DIR[direction], offset, group, num, 0))
    cp = rom.write_new(b''.join(items))
    rom.wptr(header + 12, rom.write_new(struct.pack('<II', len(items), 0x08000000 + cp)))


def msgbox_script(rom, text_off, std):
    """loadword 0, text; callstd std; end  (std 2 = NPC, 3 = sign)"""
    return rom.write_new(bytes([0x0F, 0x00]) + struct.pack('<I', 0x08000000 + text_off) + bytes([0x09, std, 0x02]))


def add_events(rom, objects, signs, template_obj, warps=()):
    """objects: [(x, y, gfx, movement, script)], signs: [(x, y, script)], warps: [(x, y, elevation, dest_warp, group, num)]"""
    ob = b''
    for i, (x, y, gfx, mv, sc) in enumerate(objects):
        t = bytearray(rom.u8[template_obj:template_obj + 24])
        t[0] = i + 1; t[1] = gfx
        struct.pack_into('<hh', t, 4, x, y)
        t[9] = mv
        struct.pack_into('<HHH', t, 10, 0x11, 0, 0)
        struct.pack_into('<IHH', t, 16, 0x08000000 + sc, 0, 0)
        ob += bytes(t)
    bg = b''.join(struct.pack('<hhBBHI', x, y, 0, 0, 0, 0x08000000 + sc) for x, y, sc in signs)
    wp = b''.join(struct.pack('<hhBBBB', x, y, e, dw, num, grp) for x, y, e, dw, grp, num in warps)
    pw = rom.write_new(wp) if wp else 0
    po = rom.write_new(ob) if ob else 0
    pb = rom.write_new(bg) if bg else 0
    p = lambda o: 0x08000000 + o if o else 0
    return rom.write_new(struct.pack('<BBBBIIII', len(objects), len(warps), 0, len(signs), p(po), p(pw), 0, p(pb)))
