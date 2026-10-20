# Map changes made in the editor's World view ("Export map changes" -> world_edits.json) -> written at build time,
# after the cities and new maps are built, so the work survives rebuilds. Files: data/kachol_lavan/maps_edit/*.json
import glob, json, os, struct
import newmap


def _shared(rom, hdr):
    lid = rom.r16(hdr + 18)
    return len({h for _, _, h in newmap.group_maps(rom) if rom.r16(h + 18) == lid}) > 1      # distinct headers (a moved group array leaves a copy)


def apply_map(rom, m):
    hdr = rom.map_header(m['group'], m['num'])
    w, h = m['width'], m['height']
    if (w + 15) * (h + 14) > 0x2800: raise ValueError('%s: map too big for the game' % m.get('name'))
    blocks = rom.write_new(b''.join(struct.pack('<H', v) for v in m['blocks']))
    border = rom.write_new(b''.join(struct.pack('<H', v) for v in m['border']))
    lay = bytearray(rom.u8[rom.ptr(hdr):rom.ptr(hdr) + 28])
    struct.pack_into('<IIII', lay, 0, w, h, 0x08000000 + border, 0x08000000 + blocks)
    lay[24], lay[25] = m['border_w'], m['border_h']
    nl = rom.write_new(bytes(lay))
    rom.wptr(hdr, nl)
    if _shared(rom, hdr):                                    # its own layout id (grow the table by one entry)
        n = newmap.layout_count(rom)
        table = bytes(rom.u8[newmap.LAYOUTS:newmap.LAYOUTS + n * 4]) + struct.pack('<I', 0x08000000 + nl)
        new = rom.write_new(table)
        for p in rom.find_ptrs(newmap.LAYOUTS, True): rom.wptr(p, new)
        newmap.LAYOUTS = new
        rom.w16(hdr + 18, n + 1)
    else:
        rom.wptr(newmap.LAYOUTS + (rom.r16(hdr + 18) - 1) * 4, nl)
    # event positions, by index (skipped if the build now has a different number of them)
    E = rom.map_events(hdr)
    for kind, off in (('obj', 4), ('warp', 0), ('coord', 0), ('bg', 0)):
        xy = m['events'].get(kind, [])
        if len(xy) != len(E[kind]):
            print('  world edits: %s %s: %d %s in the file, %d in the build - positions not applied' % (m.get('name'), kind, len(xy), kind, len(E[kind])))
            continue
        for o, (x, y) in zip(E[kind], xy): struct.pack_into('<hh', rom.u8, o + off, x, y)
    # connections
    cs = m['connections']
    if cs:
        lst = rom.write_new(b''.join(struct.pack('<IiBBH', d, off, g, n, 0) for d, off, g, n in cs))
        rom.wptr(hdr + 12, rom.write_new(struct.pack('<II', len(cs), 0x08000000 + lst)))
    else:
        struct.pack_into('<I', rom.u8, hdr + 12, 0)


def apply_all(rom, folder):
    """format 1 (per-map snapshot), applied after the cities are built"""
    done = []
    for path in sorted(glob.glob(os.path.join(folder, '*.json'))):
        j = json.load(open(path, encoding='utf8'))
        if j.get('format') != 'kl-world-1': continue
        for m in j['maps']:
            apply_map(rom, m); done.append('%d.%d' % (m['group'], m['num']))
    return done


def apply_patches(rom, folder):
    """format 2 (the editor's exact byte changes), applied at the very end of the build - only if the ROM built so far
    is byte-for-byte the one the editor loaded. Otherwise nothing is applied: open the new ROM in the editor,
    World view -> Import edits (the edits are replayed on it) -> Export map changes, and build again."""
    import zlib
    done = []
    for path in sorted(glob.glob(os.path.join(folder, '*.json'))):
        j = json.load(open(path, encoding='utf8'))
        if j.get('format') != 'kl-world-2': continue
        crc = zlib.crc32(bytes(rom.u8)) & 0xFFFFFFFF
        if crc != j['base_crc'] or len(rom.u8) != j['base_size']:
            print('  world edits %s: SKIPPED - the build changed since the edits were made (crc %08X, edits made on %08X).' % (os.path.basename(path), crc, j['base_crc']))
            print('    Open the new ROM in the editor, World view -> Import edits (replays them) -> Export map changes, then build again.')
            continue
        if j['size'] > len(rom.u8): rom.u8.extend(bytes([0xFF]) * (j['size'] - len(rom.u8)))
        for off, hx in j['patches']: rom.u8[off:off + len(hx) // 2] = bytes.fromhex(hx)
        done.append('%s (%d edits)' % (os.path.basename(path), len(j.get('ops', []))))
    return done
