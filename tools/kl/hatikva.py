# "התקווה" (Hatikvah, D minor) for the opening with the professor (song 292, NEW_GAME_INTRO), arranged for the song's own
# orchestral voicegroup: strings (48) melody, trumpet (56) on the second half, French horns (60) chords,
# square-wave bass (81, as in the original track), timpani (47), drum kit (0) and a soft square-wave pulse (80).
# Melody: public domain (Samuel Cohen, 1888, after "La Mantovana").
import music
from music import Track, key

E, Q, DQ, H = 12, 24, 36, 48
BAR = 96
A1 = [('D4', E), ('E4', E), ('F4', E), ('G4', E), ('A4', Q), ('A4', Q)]
A2 = [('Bb4', E), ('A4', E), ('Bb4', E), ('D5', E), ('A4', H)]
A3 = [('G4', Q), ('G4', E), ('G4', E), ('F4', Q), ('F4', Q)]
A4a = [('E4', E), ('D4', E), ('E4', E), ('F4', E), ('D4', DQ), ('A3', E)]
A4b = [('E4', E), ('D4', E), ('E4', E), ('F4', E), ('D4', H)]
B1 = [('D4', Q), ('D5', Q), ('D5', Q), ('D5', Q)]
B2 = [('C5', E), ('D5', E), ('C5', E), ('Bb4', E), ('A4', H)]
C1 = [('C5', Q), ('C5', E), ('C5', E), ('F4', Q), ('F4', Q)]
C2 = [('G4', E), ('A4', E), ('Bb4', E), ('C5', E), ('A4', Q), ('G4', E), ('F4', E)]
C3 = [('G4', Q), ('G4', Q), ('F4', Q), ('F4', E), ('F4', E)]
MELODY = [A1, A2, A3, A4a, A1, A2, A3, A4b, B1, B2, B1, B2, C1, C2, C3, A4b, C1, C2, C3, A4b]
# two chords per bar (root, chord tones)
CH = {'Dm': ('D', ['D', 'F', 'A']), 'Gm': ('G', ['G', 'Bb', 'D']), 'C': ('C', ['C', 'E', 'G']), 'F': ('F', ['F', 'A', 'C']),
      'A7': ('A', ['A', 'C#', 'E', 'G']), 'A': ('A', ['A', 'C#', 'E']), 'Bb': ('Bb', ['Bb', 'D', 'F'])}
HARM = [('Dm', 'Dm'), ('Gm', 'Dm'), ('C', 'F'), ('A7', 'Dm'), ('Dm', 'Dm'), ('Gm', 'Dm'), ('C', 'F'), ('A7', 'Dm'),
        ('Dm', 'Dm'), ('C', 'F'), ('Dm', 'Gm'), ('C', 'A'), ('F', 'Dm'), ('Gm', 'Dm'), ('Bb', 'Dm'), ('A7', 'Dm'),
        ('F', 'Dm'), ('Gm', 'Dm'), ('Bb', 'Dm'), ('A7', 'Dm')]
INTRO = 1                                   # one bar: timpani roll on D, held D minor chord
TEMPO = 36                                  # 72 quarter notes per minute (value = bpm / 2)


def tones_below(chord, top, n):
    """the n highest chord tones strictly at least a minor third below `top`"""
    names = CH[chord][1]
    out, k = [], top - 3
    while len(out) < n and k > 30:
        if any(k % 12 == music.NOTE[x] for x in names): out.append(k)
        k -= 1
    return out


def build(rom):
    up = 12                                                   # strings / trumpet one octave higher (bright, like the original)
    mel = Track(48, vol=96, pan=64)
    tpt = Track(56, vol=70, pan=80)
    horn = Track(60, vol=62, pan=44)
    bass = Track(81, vol=60, pan=64)
    timp = Track(47, vol=90, pan=52)
    drum = Track(0, vol=70, pan=64)
    pulse = Track(80, vol=34, pan=90)
    t0 = INTRO * BAR
    # intro: timpani roll, chord swell
    for i in range(0, BAR - 12, 6): timp.note(i, 'D3', 6, 50 + i // 3)
    timp.note(BAR - 12, 'A2', 12, 110)
    for k in ('D4', 'F4', 'A4'): horn.note(0, k, BAR, 70)
    bass.note(0, 'D3', BAR, 90)
    drum.note(0, 49, 48, 70)                                  # cymbal
    for b, bar in enumerate(MELODY):
        t = t0 + b * BAR
        tt = t
        loud = b >= 8
        for n, d in bar:
            mel.note(tt, key(n) + up, d, 112 if loud else 100)
            if loud: tpt.note(tt, key(n) + up, d, 100)
            tt += d
        for h, chord in enumerate(HARM[b]):
            th = t + h * H
            root = CH[chord][0]
            # horns: two chord tones under the melody note at that moment
            top = key(next(n for n, d, s in _starts(bar) if s >= h * H))
            for k in tones_below(chord, top, 2): horn.note(th, k, H, 80 if loud else 66)
            # bass: root on the beat, fifth on the off-beat quarter
            r = 36 + music.NOTE[root]
            if r < 40: r += 12
            bass.note(th, r, Q, 100); bass.note(th + Q, r + 7 if chord != 'A7' else r + 12, Q, 80)
            # soft pulse: broken chord in eighths
            names = CH[chord][1]
            ks = sorted(60 + music.NOTE[x] for x in names)
            for j in range(4): pulse.note(th + j * E, ks[j % len(ks)], E, 60)
        # timpani on phrase starts, cymbals at the big moments
        if b % 4 == 0: timp.note(t, 'D3' if HARM[b][0] in ('Dm', 'Bb', 'Gm') else 'A2', Q, 115)
        if HARM[b][1] == 'Dm' and b % 4 == 3: timp.note(t + H, 'D3', Q, 105)
        if b in (8, 12, 16): drum.note(t, 49, 48, 90)
        if loud:
            drum.note(t + Q, 40, 6, 60); drum.note(t + 3 * Q, 40, 6, 60)
    end = t0 + len(MELODY) * BAR
    for i in range(0, Q, 6): timp.note(end - Q + i, 'D3', 6, 70 + i * 2)   # roll back into the loop
    tracks = [mel, tpt, horn, bass, timp, drum, pulse]
    return music.write_song(rom, 292, tracks, end, TEMPO)


def _starts(bar):
    s = 0
    for n, d in bar:
        yield n, d, s
        s += d
