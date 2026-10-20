# "Hava Nagila" (traditional, public domain) for the title screen of Kachol-Lavan, as a MIDI file.
# The melody follows the published transcription (E Freygish: E F G# A B C D, 4/4), in three parts:
#   1. Hava nagila (x2)   - the "E E . G# F E" motif climbing E -> G# -> A, then "ve-nismecha" back to E
#   2. Hava neranenah (x2) - down to D and up to A
#   3. Uru achim           - long A's, the "A A C. B A C B A" runs climbing to B, the held E's, the ending on A
# Six layers, never more than five sampled notes at once (the game's mixer limit; the square and wave layers
# play on the GBA's own sound channels):
#   violin melody · square-wave second voice (chord tones under the melody) · wave-channel held chord tones ·
#   oom-pah bass · off-beat accordion chords · drums. The tempo speeds up part by part (116, 124, 132).
#   python hava_nagila.py out.mid
import struct, sys

TPQ = 96
S = TPQ // 4                         # a sixteenth: melody lengths below are in sixteenths
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'Bb': 10, 'B': 11}
def key(n): return 12 * (int(n[-1]) + 1) + NOTE[n[:-1]]

# (bar length in sixteenths, chord, melody [(note or None, sixteenths)])
P1 = [(16, 'E', [('E4', 4), ('E4', 4), (None, 2), ('G#4', 2), ('F4', 2), ('E4', 2)]),       # Ha-va na-gi-la
      (16, 'E', [('G#4', 4), ('G#4', 4), (None, 2), ('B4', 2), ('A4', 2), ('G#4', 2)]),     # ha-va na-gi-la
      (16, 'Dm', [('A4', 4), ('A4', 4), (None, 2), ('C5', 2), ('B4', 2), ('A4', 2)]),       # ha-va na-gi-la
      (16, 'E', [('G#4', 4), ('F4', 1), ('E4', 1), ('F4', 2), ('E4', 8)])]                  # ve-nis-me-cha
P2 = [(16, 'E', [('G#4', 2), ('G#4', 4), ('F4', 2), ('E4', 2), ('E4', 2), ('E4', 4)]),      # Ha-va ne-ra-ne-na
      (16, 'Dm', [('F4', 2), ('F4', 4), ('E4', 2), ('D4', 2), ('D4', 2), ('D4', 4)]),
      (16, 'Dm', [('D4', 4), ('F4', 3), ('E4', 1), ('D4', 2), ('D4', 2), ('A4', 4)]),
      (16, 'E', [('G#4', 4), ('F4', 1), ('E4', 1), ('F4', 2), ('E4', 8)])]
RUN_A = (16, 'Am', [('A4', 2), ('A4', 2), ('C5', 3), ('B4', 1), ('A4', 2), ('C5', 2), ('B4', 2), ('A4', 2)])   # u-ru a-chim be-lev sa-me-ach
RUN_B = (16, 'Dm', [('B4', 2), ('B4', 2), ('D5', 3), ('C5', 1), ('B4', 2), ('D5', 2), ('C5', 2), ('B4', 2)])
P3 = [(16, 'Am', [('A4', 8), ('A4', 8)]),                                                   # U-ru, u-ru
      (16, 'Am', [('A4', 4), ('A4', 4), ('A4', 4), ('A4', 4)]),
      RUN_A, RUN_A, RUN_B, RUN_B,
      (24, 'E!', [('B4', 2), ('B4', 2), ('E5', 8), ('E4', 2), ('E4', 2), ('E5', 8)]),       # the held E's
      (16, 'E', [(None, 2), ('E4', 2), ('E4', 2), ('E4', 2), ('C5', 2), ('B4', 2), ('A4', 2), ('G#4', 2)]),
      (16, 'Am', [('A4', 12), (None, 4)])]
FORM = [(P1, 116), (P1, None), (P2, 124), (P2, None), (P3, 132)]

CHORD = {'E': ['E', 'G#', 'B'], 'Dm': ['D', 'F', 'A'], 'Am': ['A', 'C', 'E']}
BASS = {'E': ('E2', 'B1'), 'Dm': ('D2', 'A1'), 'Am': ('A1', 'E2')}
GUITAR = {'E': ['G#3', 'B3'], 'Dm': ['F3', 'A3'], 'Am': ['C4', 'E4']}
PAD = {'E': 'G#4', 'Dm': 'F4', 'Am': 'C5'}

def under(melody_key, chord):
    """the second voice: the highest note of the chord at least a minor third under the melody"""
    pcs = [NOTE[n] for n in CHORD[chord]]
    for k in range(melody_key - 3, melody_key - 13, -1):
        if k % 12 in pcs: return k
    return melody_key - 4

def build():
    L = {k: [] for k in ('mel', 'harm', 'pad', 'bass', 'gtr', 'drum')}
    tempos, t = [], 0
    for part, tempo in FORM:
        if tempo: tempos.append((t, tempo))
        for length, chord, mel in part:
            held = chord.endswith('!'); chord = chord.rstrip('!')
            x = t
            for n, l in mel:
                if n:
                    k = key(n); d = l * S
                    L['mel'].append((x, k, d - 6, 112))
                    L['harm'].append((x, under(k, chord), d - 6, 72))
                x += l * S
            assert x - t == length * S, ('bar length', chord, (x - t) / S, length)
            bar = length * S
            L['pad'].append((t, key(PAD[chord]) - 12, bar - 8, 60))                    # one held chord tone per bar
            if held:                                                                     # the held E's: a long chord, a kick on each E
                for nn in GUITAR[chord]: L['gtr'].append((t, key(nn), bar - 8, 70))
                L['bass'].append((t, key(BASS[chord][0]), bar - 8, 100))
                for at in (4 * S, 16 * S): L['drum'].append((t + at, 36, 30, 110))
            else:
                for b in range(length // 4):                                             # beats
                    bt = t + b * TPQ
                    L['bass'].append((bt, key(BASS[chord][b % 2]), TPQ - 16, 104))       # oom (root / fifth)
                    for nn in GUITAR[chord]: L['gtr'].append((bt + TPQ // 2, key(nn), TPQ // 2 - 10, 70))   # pah
                    L['drum'].append((bt, 36 if b % 2 == 0 else 38, 24, 104 if b % 2 == 0 else 88))           # kick / snare
                    if b % 2: L['drum'].append((bt + TPQ // 2, 42, 12, 56))               # a hi-hat after the snare
            t += bar
    return t, tempos, L

def vlq(n):
    out = [n & 0x7F]; n >>= 7
    while n: out.insert(0, (n & 0x7F) | 0x80); n >>= 7
    return bytes(out)

def track(ch, prog, notes, vol, pan, tempos=(), name=''):
    ev = []
    for at, bpm in tempos: ev.append((at, 0, bytes([0xFF, 0x51, 3]) + struct.pack('>I', 60000000 // bpm)[1:]))
    if name: ev.append((0, 0, bytes([0xFF, 0x03, len(name)]) + name.encode()))
    ev.append((0, 0, bytes([0xFF, 0x06, 10]) + b'loop start'))
    if ch != 9: ev.append((0, 1, bytes([0xC0 | ch, prog])))
    ev += [(0, 1, bytes([0xB0 | ch, 7, vol])), (0, 1, bytes([0xB0 | ch, 10, pan]))]
    for at, k, d, v in notes:
        ev.append((at, 3, bytes([0x90 | ch, k, v]))); ev.append((at + d, 2, bytes([0x80 | ch, k, 0])))
    ev.sort(key=lambda e: (e[0], e[1]))
    out, last = b'', 0
    for at, _, b in ev: out += vlq(at - last) + b; last = at
    out += vlq(0) + b'\xFF\x2F\x00'
    return b'MTrk' + struct.pack('>I', len(out)) + out

def main(path):
    length, tempos, L = build()
    trs = [track(0, 40, L['mel'], 120, 64, tempos, 'Hava Nagila'),   # violin: the melody
           track(1, 80, L['harm'], 72, 44),                         # square lead: the second voice
           track(2, 81, L['pad'], 64, 84),                          # wave: held chord tones
           track(3, 33, L['bass'], 104, 64),                        # finger bass: oom
           track(4, 21, L['gtr'], 74, 78),                          # accordion: pah
           track(9, 0, L['drum'], 92, 64)]
    open(path, 'wb').write(b'MThd' + struct.pack('>IHHH', 6, 1, len(trs), TPQ) + b''.join(trs))
    print('%s: %d layers, %d bars' % (path, len(trs), length // (4 * TPQ)))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'hava_nagila.mid')
