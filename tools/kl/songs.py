# Songs exported from the editor's Music tab ("Export .song.json") -> written into the ROM at build time,
# so editor work survives rebuilds. One file per song in data/kachol_lavan/songs/ (format kl-song-1).
import base64, glob, json, os, struct
import music

LEN = music.LEN
HELD = 1 << 29


def encode_track(tr, length):
    """same encoding as the editor (js/music.js encodeTrack): -> (bytes, loop offset or None, goto offset or None)"""
    items = []
    for e in tr['events']:
        t = e[0]
        if e[1] == 'cmd':
            if t <= length: items.append((t, 1, bytes([e[2]] + e[3:])))
            continue
        if t >= length: continue
        k, v, d = e[1] & 127, max(1, min(127, e[2])), max(1, e[3])
        if d >= HELD: items.append((t, 2, bytes([0xCF, k, v]))); continue
        if d in LEN: items.append((t, 2, bytes([0xCF + LEN.index(d), k, v]))); continue
        gate = [x for x in LEN if x > 0 and 1 <= d - x <= 3] if d < 96 else []
        if gate: items.append((t, 2, bytes([0xCF + LEN.index(gate[-1]), k, v, d - gate[-1]]))); continue
        items.append((t, 2, bytes([0xCF, k, v])))
        items.append((min(t + d, length), 0, bytes([0xCE, k])))
    loop = tr.get('loopTick')
    if loop is not None and loop < length: items.append((loop, -1, b''))
    items.sort(key=lambda x: (x[0], x[1]))
    out, now, loop_at = bytearray(), 0, None
    for t, order, b in items:
        out += bytes(music.waits(t - now)); now = t
        if order == -1: loop_at = len(out); continue
        out += b
    out += bytes(music.waits(length - now))
    goto_at = None
    if loop_at is not None: goto_at = len(out) + 1; out += b'\xB2\0\0\0\0'
    out += b'\xB1'
    return out, loop_at, goto_at


def apply(rom, path):
    j = json.load(open(path, encoding='utf8'))
    assert j.get('format') == 'kl-song-1', path
    sample_at = {}
    for sid, s in (j.get('samples') or {}).items():
        pcm = base64.b64decode(s['pcm'])
        last = pcm[s.get('loopStart') or 0] if s.get('looped') else 0
        sample_at[sid] = rom.write_new(struct.pack('<IIII', 0x40000000 if s.get('looped') else 0, round(s['rate'] * 1024), s.get('loopStart') or 0, len(pcm)) + pcm + bytes([last]))
    vg = bytearray()
    for x in j['voicegroup']:
        if isinstance(x, str): vg += bytes.fromhex(x)
        else:
            e = bytearray.fromhex(x['entry']); struct.pack_into('<I', e, 4, 0x08000000 + sample_at[x['sample']]); vg += e
    vg_off = rom.write_new(bytes(vg))
    length = max(t['endTick'] for t in j['tracks'])
    ptrs = []
    for tr in j['tracks']:
        data, loop_at, goto_at = encode_track(tr, tr['endTick'] or length)
        o = rom.alloc(len(data))
        if goto_at is not None: struct.pack_into('<I', data, goto_at, 0x08000000 + o + loop_at)
        rom.write(o, bytes(data)); ptrs.append(o)
    hdr = bytes([len(ptrs), 0, j['priority'] & 255, j['reverb'] & 255]) + struct.pack('<I', 0x08000000 + vg_off) + b''.join(struct.pack('<I', 0x08000000 + p) for p in ptrs)
    rom.wptr(music.SONG_TABLE + j['index'] * 8, rom.write_new(hdr))
    return j['index']


def apply_all(rom, folder):
    return [apply(rom, p) for p in sorted(glob.glob(os.path.join(folder, '*.song.json')))]
