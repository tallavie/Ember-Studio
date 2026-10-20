# Rosh HaAyin's town music (song 300, was Pallet Town): an original tune in the style of the Yemenite-step
# Israeli folk dances: E Hijaz scale (E F G# A B C D), darbuka in maqsum rhythm (doum-tek), off-beat accordion.
# The engine mixes only 5 sampled voices, so the bass and half of the off-beat chords are on the square / wave channels.
import music
from music import Track, key

SONG = 300
BASE_VG = 0x49625C                  # orchestral voicegroup (drum kit in slot 0, square waves 80/81, wave 87)
OBOE, FLUTE, ACCORDION = 68, 73, 21
SQ1, SQ2, WAVE = 80, 81, 87
DOUM, TEK, KA, TAMB, CLAP, TRI = 64, 60, 61, 54, 39, 81    # low conga, high bongo, low bongo, tambourine, clap, triangle
S, E, Q, DQ, H = 6, 12, 24, 36, 48
BAR = 96
TEMPO = 64                          # 128 quarter notes per minute

A1 = [('B4', E), ('C5', S), ('B4', S), ('A4', E), ('G#4', E), ('A4', Q), ('B4', Q)]
A2 = [('C5', E), ('B4', E), ('A4', E), ('G#4', E), ('F4', E), ('G#4', E), ('E4', Q)]
A3 = [('E4', E), ('F4', E), ('G#4', E), ('A4', E), ('B4', Q), ('C5', E), ('B4', E)]
A4 = [('A4', S), ('B4', S), ('A4', E), ('G#4', E), ('F4', E), ('E4', H)]
A6 = [('C5', E), ('D5', E), ('C5', E), ('B4', E), ('A4', E), ('B4', E), ('C5', Q)]
A7 = [('D5', E), ('C5', E), ('B4', E), ('A4', E), ('G#4', E), ('A4', E), ('B4', Q)]
A8 = [('A4', S), ('G#4', S), ('F4', E), ('G#4', E), ('F4', E), ('E4', H)]
B1 = [('E5', Q), ('E5', E), ('D5', E), ('C5', E), ('D5', E), ('E5', Q)]
B2 = [('F5', E), ('E5', E), ('D5', E), ('C5', E), ('B4', Q), ('B4', Q)]
B3 = [('D5', Q), ('D5', E), ('C5', E), ('B4', E), ('C5', E), ('D5', Q)]
B4 = [('E5', E), ('D5', E), ('C5', E), ('B4', E), ('A4', H)]
B6 = [('F5', E), ('E5', E), ('D5', E), ('C5', E), ('B4', E), ('C5', E), ('D5', Q)]
B7 = [('C5', E), ('B4', E), ('A4', E), ('B4', E), ('C5', E), ('B4', E), ('A4', E), ('G#4', E)]
PART_A = [A1, A2, A3, A4, A1, A6, A7, A8]
PART_B = [B1, B2, B3, B4, B1, B6, B7, A8]
HARM_A = [('E', 'E'), ('Dm', 'E'), ('E', 'Am'), ('Dm', 'E'), ('E', 'E'), ('Am', 'Am'), ('Dm', 'E'), ('Dm', 'E')]
HARM_B = [('Am', 'Am'), ('Dm', 'E'), ('Dm', 'Dm'), ('Am', 'Am'), ('Am', 'Am'), ('Dm', 'Dm'), ('Am', 'E'), ('Dm', 'E')]
CH = {'E': ('E', ['E', 'G#', 'B']), 'Am': ('A', ['A', 'C', 'E']), 'Dm': ('D', ['D', 'F', 'A'])}
INTRO = 2
# song order after the intro: A (oboe alone), A (oboe + flute an octave up), B, B (with claps)
SECTIONS = [(PART_A, HARM_A, 0), (PART_A, HARM_A, 1), (PART_B, HARM_B, 1), (PART_B, HARM_B, 2)]


def _tone(name, lo):
    """the chord tone `name` at or above MIDI key lo"""
    k = lo
    while k % 12 != music.NOTE[name]: k += 1
    return k


def darbuka(dr, t, fill=False, claps=False):
    """one bar of maqsum: D T . T D . T . (eighths), soft 'ka' sixteenths, tambourine on the beats"""
    for pos, (n, v) in {0: (DOUM, 120), 12: (TEK, 100), 36: (TEK, 100), 48: (DOUM, 115), 72: (TEK, 105)}.items():
        dr.note(t + pos, n, S, v)
    for pos in (18, 42, 66, 90):
        dr.note(t + pos, KA, S, 55)
    for b in range(4):
        dr.note(t + b * Q, TAMB, S, 70 if b % 2 else 50)
    if claps:
        dr.note(t + Q, CLAP, S, 80); dr.note(t + 3 * Q, CLAP, S, 80)
    if fill:                                                   # run of teks into the next phrase
        for i, pos in enumerate(range(72, 96, 6)): dr.note(t + pos, TEK if i % 2 else KA, S, 80 + i * 10)


def build(rom):
    vg = music.make_voicegroup(rom, BASE_VG, {
        ACCORDION: (music.song_voicegroup(rom, 297), ACCORDION),
        OBOE: bytes.fromhex('003c00009c9f4a08ffbc67a5'),            # song 290's oboe, with an instant attack
        FLUTE: (music.song_voicegroup(rom, 256), FLUTE),
    })
    oboe = Track(OBOE, vol=100, pan=60)
    flute = Track(FLUTE, vol=72, pan=76)
    acc = Track(ACCORDION, vol=62, pan=44)
    stab = Track(SQ2, vol=34, pan=84)
    bass = Track(WAVE, vol=80, pan=64)
    dr = Track(0, vol=96, pan=64)
    for tr, depth in ((oboe, 3), (flute, 2)):                  # a little vibrato on the winds
        tr.cmd(0, 0xC2, 44).cmd(0, 0xC4, depth)
    # intro: darbuka alone, then the accordion joins
    darbuka(dr, 0); darbuka(dr, BAR, fill=True)
    for pos in range(E, BAR, Q):
        acc.note(BAR + pos, 'G#4', S, 80); stab.note(BAR + pos, 'B4', S, 80)
    bass.note(BAR, 'E2', Q, 110); bass.note(BAR + 2 * Q, 'E2', Q, 100)
    t = INTRO * BAR
    for part, harm, layer in SECTIONS:
        for b, bar in enumerate(part):
            tt = t
            for n, d in bar:
                oboe.note(tt, n, d, 110 if layer else 100)
                if layer: flute.note(tt, key(n) + 12, d, 96)
                tt += d
            for h, chord in enumerate(harm[b]):
                th = t + h * H
                root, tones = CH[chord]
                top, mid = _tone(tones[2], 64), _tone(tones[1], 59)
                for pos in (E, E + Q):                         # off-beat "pah" on the & of each beat
                    acc.note(th + pos, mid, S, 84); stab.note(th + pos, top, S, 76)
                r = _tone(root, 40)                            # bass on the doums: beat 1 (root), beat 3 (root / fifth)
                bass.note(th, r, E + S, 115)
                bass.note(th + Q + E, r if h == 0 else r + 7, S, 90)
            darbuka(dr, t, fill=(b % 4 == 3), claps=(layer == 2))
            if layer == 2 and b % 4 == 0: dr.note(t, TRI, Q, 70)
            t += BAR
    tracks = [oboe, flute, acc, stab, bass, dr]
    return music.write_song(rom, SONG, tracks, t, TEMPO, voicegroup=vg, loop_t=INTRO * BAR)
