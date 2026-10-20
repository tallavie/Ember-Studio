# Fits a MIDI file to the GBA's sound engine: at most 5 sampled notes at once (+ the square and wave channels).
# Each source channel goes to one layer with a new program; chords can be thinned to their top notes, one line can
# be made strictly one note at a time, and drums keep one hit per moment (kick > snare > hats > the rest).
#   python midi_for_gba.py in.mid out.mid ['{"7": [0, 40, 1, true, 120], ...}']
# The plan: source channel (0-based) -> [new channel, program, most notes at once, one line?, volume], or a list of
# those (the same notes on several layers). A channel left out of the plan is dropped. Programs 80 / 81
# are meant for the square and wave channels. Without a plan: the one below, for the "Hava Nagila" demo from mididb.com.
import json, struct, sys

PLAN = {  # source channel (0-based): (new channel, new program, keep at most N notes at once, one line?, volume)
    4: (0, 64, 1, True, 120),    # clarinet melody -> soprano sax (a clean reed sample)
    5: (1, 80, 1, True, 80),     # fiddle counter-melody -> square wave (GBA channel)
    3: (2, 81, 1, True, 64),     # accordion chords -> their top note on the wave channel
    2: (4, 4, 2, False, 76),     # piano chords -> the top two notes, electric piano (the game's "piano" has no clear pitch)
    1: (3, 33, 1, True, 50),     # bass (sampled; its sample is strong)
    9: (9, 0, 1, False, 46),     # drums: one hit at a time
}
DRUM_RANK = {35: 0, 36: 0, 38: 1, 40: 1, 37: 2, 42: 3, 44: 3, 46: 3, 39: 4}
# General MIDI drum keys -> FireRed's drum kit (0x48A130). The game's composers put their drums elsewhere: in the kit,
# GM 37/38 are a loud snare with a long tail and GM 42 is the snare again, which sounds like gunshots on every hi-hat.
# Picked by listening data (length, brightness) and what FireRed's own songs use most.
FR_DRUMS = {35: 36, 36: 36,           # kick (149 Hz, 287 ms)
            38: 40, 40: 40, 39: 40,   # snare: the short one (160 ms)
            37: 62,                   # side stick: a quiet short click (96 ms)
            42: 54, 44: 54,           # closed / pedal hi-hat: bright and short (5 kHz, 165 ms)
            46: 80, 51: 80, 53: 80,   # open hi-hat, ride: the shaker (4.5 kHz)
            49: 49, 57: 49}           # crash
GM_DRUMS = '--gm-drums' in sys.argv    # keep the General MIDI keys (another kit)

def read(path):
    u = open(path, 'rb').read(); p = [0]
    def take(n): v = u[p[0]:p[0] + n]; p[0] += n; return v
    def vlq():
        v = 0
        while True:
            b = take(1)[0]; v = (v << 7) | (b & 127)
            if not b & 128: return v
    assert take(4) == b'MThd'; hl = struct.unpack('>I', take(4))[0]; fmt, ntr, div = struct.unpack('>HHH', take(6)); take(hl - 6)
    notes, tempos, opened = [], [], {}
    for _ in range(ntr):
        assert take(4) == b'MTrk'; ln = struct.unpack('>I', take(4))[0]; end = p[0] + ln; t = 0; run = 0
        while p[0] < end:
            t += vlq(); st = u[p[0]]
            if st < 0x80: st = run
            else:
                p[0] += 1
                if st < 0xF0: run = st
            if st == 0xFF:
                ty = take(1)[0]; d = take(vlq())
                if ty == 0x51: tempos.append((t, (d[0] << 16) | (d[1] << 8) | d[2]))
                continue
            if st in (0xF0, 0xF7): take(vlq()); continue
            ch, hi = st & 15, st & 0xF0
            a = take(1)[0]; b = 0 if hi in (0xC0, 0xD0) else take(1)[0]
            if hi == 0x90 and b: opened.setdefault((ch, a), []).append((t, b))
            elif hi == 0x80 or (hi == 0x90 and not b):
                if opened.get((ch, a)): t0, v = opened[(ch, a)].pop(0); notes.append([t0, ch, a, max(1, t - t0), v])
        p[0] = end
    return div, tempos, sorted(notes)

def layers():
    """(source channel, layer) pairs: a source channel can feed several layers (a melody doubled by a square wave)"""
    for ch, v in PLAN.items():
        for lay in (v if isinstance(v[0], (list, tuple)) else [v]): yield ch, tuple(lay)

def fit(notes):
    out = []
    for ch, (nch, prog, most, line, vol) in layers():
        mine = [n for n in notes if n[1] == ch]
        if ch == 9:                                   # drums: the most important hit of each moment
            by_t = {}
            for n in mine: by_t.setdefault(n[0], []).append(n)
            for t, hits in sorted(by_t.items()):
                h = min(hits, key=lambda n: DRUM_RANK.get(n[2], 9))
                k = h[2] if GM_DRUMS else FR_DRUMS.get(h[2])
                if k is None: continue                  # a drum the kit has nothing for
                v = h[4] if k in (36, 40) else int(h[4] * 0.75)   # hats and clicks softer than kick / snare
                out.append([t, nch, k, min(h[3], 40), v])
            continue
        by_t = {}
        for n in mine: by_t.setdefault(n[0], []).append(n)
        kept = []
        for t, chord in sorted(by_t.items()):
            kept += sorted(chord, key=lambda n: -n[2])[:most]          # the highest notes of the chord
        kept.sort()
        if line:                                        # one note at a time: a note ends where the next one starts
            for i, n in enumerate(kept[:-1]):
                n[3] = max(1, min(n[3], kept[i + 1][0] - n[0] - 4))
        else:                                           # chords: they end before the next chord
            starts = sorted(set(n[0] for n in kept))
            nxt = {s: (starts[i + 1] if i + 1 < len(starts) else s + 10 ** 6) for i, s in enumerate(starts)}
            for n in kept: n[3] = max(1, min(n[3], nxt[n[0]] - n[0] - 4))
        out += [[n[0], nch, n[2], n[3], n[4]] for n in kept]
    return sorted(out)

def vlq(n):
    o = [n & 0x7F]; n >>= 7
    while n: o.insert(0, (n & 0x7F) | 0x80); n >>= 7
    return bytes(o)

def write(path, div, tempos, notes):
    trs = []
    for ch, (nch, prog, most, line, vol) in layers():
        ev = [(0, 0, bytes([0xFF, 0x06, 10]) + b'loop start')]
        if nch == 0: ev += [(t, 0, bytes([0xFF, 0x51, 3]) + struct.pack('>I', us)[1:]) for t, us in tempos]
        if nch != 9: ev.append((0, 1, bytes([0xC0 | nch, prog])))
        ev += [(0, 1, bytes([0xB0 | nch, 7, vol])), (0, 1, bytes([0xB0 | nch, 10, 64]))]
        for t, c, k, d, v in notes:
            if c == nch: ev += [(t, 3, bytes([0x90 | c, k, v])), (t + d, 2, bytes([0x80 | c, k, 0]))]
        ev.sort(key=lambda e: (e[0], e[1]))
        data, last = b'', 0
        for t, _, b in ev: data += vlq(t - last) + b; last = t
        data += vlq(0) + b'\xFF\x2F\x00'
        trs.append(b'MTrk' + struct.pack('>I', len(data)) + data)
    open(path, 'wb').write(b'MThd' + struct.pack('>IHHH', 6, 1, len(trs), div) + b''.join(trs))

if __name__ == '__main__':
    sys.argv = [a for a in sys.argv if a != '--gm-drums']
    if len(sys.argv) > 3: PLAN = {int(k): v for k, v in json.loads(sys.argv[3]).items()}
    div, tempos, notes = read(sys.argv[1])
    out = fit(notes)
    write(sys.argv[2], div, tempos, out)
    print('%d notes -> %d notes in %d layers' % (len(notes), len(out), len(list(layers()))))
