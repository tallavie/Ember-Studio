# New songs for the M4A (Sappy) sound engine: notes -> track bytes -> song header, replacing an entry in the song table.
# Timing: 24 ticks per quarter note. Voices come from an existing voicegroup (instrument numbers as used by the game).
import struct

SONG_TABLE = 0x4A332C
LEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
       28, 30, 32, 36, 40, 42, 44, 48, 52, 54, 56, 60, 64, 66, 68, 72, 76, 78, 80, 84, 88, 90, 92, 96]
NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}
NOTE.update({'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10})


def key(name):
    """'D4' -> MIDI 62, 'Bb3' -> 58"""
    n, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[n]


def waits(t):
    out = []
    while t > 0:
        step = max(l for l in LEN if l <= t)
        out.append(0x80 + LEN.index(step)); t -= step
    return out


def notes_bytes(dur):
    """a note longer than 96 ticks: TIE ... EOT is not needed here; split is done by the caller"""
    return 0xCF + LEN.index(dur)


class Track:
    def __init__(self, voice, vol=100, pan=64, keysh=0):
        self.voice, self.vol, self.pan, self.keysh = voice, vol, pan, keysh
        self.ev = []            # (time, order, bytes)

    def note(self, t, k, dur, vel=100):
        k = key(k) if isinstance(k, str) else k
        while dur > 0:          # long notes: split into allowed lengths, re-struck softly
            d = max(l for l in LEN if l <= dur)
            self.ev.append((t, 1, bytes([0xCF + LEN.index(d), k, vel])))
            t += d; dur -= d; vel = max(1, vel * 3 // 4)
        return self

    def cmd(self, t, *bs):
        self.ev.append((t, 0, bytes(bs))); return self

    def build(self, length, tempo=None, loop_t=0):
        """-> (head, body, offset in body of the loop point loop_t)"""
        head = bytes([0xBC, self.keysh]) + (bytes([0xBB, tempo]) if tempo else b'') + bytes([0xBD, self.voice, 0xBE, self.vol, 0xBF, self.pan])
        body, now, loop_at = bytearray(), 0, None
        evs = sorted(self.ev, key=lambda e: (e[0], e[1]))
        if loop_t: evs.append((loop_t, -1, None)); evs.sort(key=lambda e: (e[0], e[1]))
        for t, o, b in evs:
            body += bytes(waits(t - now)); now = t
            if o == -1: loop_at = len(body); continue
            body += b
        body += bytes(waits(length - now))
        return head, bytes(body), loop_at or 0


def write_song(rom, index, tracks, length, tempo, priority=None, reverb=None, voicegroup=None, loop_t=0):
    """tracks: [Track]; the song loops forever (GOTO to loop_t ticks into each track's body)"""
    old = rom.ptr(SONG_TABLE + index * 8)
    vg = voicegroup if voicegroup is not None else rom.ptr(old + 4)
    ptrs = []
    for i, tr in enumerate(tracks):
        head, body, at = tr.build(length, tempo if i == 0 else None, loop_t)
        size = len(head) + len(body) + 6
        o = rom.alloc(size)
        loop = o + len(head) + at
        data = head + body + bytes([0xB2]) + struct.pack('<I', 0x08000000 + loop) + bytes([0xB1])
        rom.write(o, data)
        ptrs.append(o)
    hdr = bytes([len(tracks), 0, rom.u8[old + 2] if priority is None else priority, rom.u8[old + 3] if reverb is None else reverb])
    hdr += struct.pack('<I', 0x08000000 + vg) + b''.join(struct.pack('<I', 0x08000000 + p) for p in ptrs)
    h = rom.write_new(hdr)
    rom.wptr(SONG_TABLE + index * 8, h)
    return h


def make_voicegroup(rom, base, slots):
    """a new voicegroup: a copy of `base` with some slots replaced; slots = {slot: (voicegroup, slot) or 12 bytes}"""
    vg = bytearray(rom.u8[base:base + 128 * 12])
    for s, src in slots.items():
        e = bytes(src) if isinstance(src, (bytes, bytearray)) else rom.u8[src[0] + src[1] * 12:src[0] + src[1] * 12 + 12]
        vg[s * 12:s * 12 + 12] = e
    return rom.write_new(bytes(vg))


def song_voicegroup(rom, index):
    return rom.ptr(rom.ptr(SONG_TABLE + index * 8) + 4)
