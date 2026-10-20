# ROM access for the כחול-לבן build: pointers, free space, maps, events, text encoding (same rules as js/charmap.js).
import struct

HEBREW = 'אבגדהוזחטיךכלםמןנסעףפץצקרשת'
HEB_CODES = list(range(0x37, 0x50)) + [0x5E, 0x5F]


def _table():
    T = [None] * 256
    T[0] = ' '
    for i, c in enumerate('ÀÁÂÇÈÉÊËÌ'): T[0x01 + i] = c
    for i, c in enumerate('ÎÏÒÓÔŒÙÚÛÑßàá'): T[0x0B + i] = c
    for i, c in enumerate('çèéêëì'): T[0x19 + i] = c
    for i, c in enumerate('îïòóôœùúûñºª'): T[0x20 + i] = c
    T[0x2D] = '&'; T[0x2E] = '+'; T[0x35] = '='; T[0x36] = ';'; T[0x5B] = '%'; T[0x5C] = '('; T[0x5D] = ')'
    T[0x53] = '{PK}'; T[0x54] = '{MN}'; T[0x34] = '{LV}'; T[0x85] = '<'; T[0x86] = '>'
    for i in range(10): T[0xA1 + i] = str(i)
    for i, c in enumerate('!?.-·…“”‘\''): T[0xAB + i] = c
    T[0xB5] = '♂'; T[0xB6] = '♀'; T[0xB7] = '$'; T[0xB8] = ','; T[0xB9] = '×'; T[0xBA] = '/'
    for i in range(26): T[0xBB + i] = chr(65 + i); T[0xD5 + i] = chr(97 + i)
    T[0xEF] = '▶'; T[0xF0] = ':'
    for i, c in enumerate('ÄÖÜäöü'): T[0xF1 + i] = c
    for i, c in enumerate(HEBREW): T[HEB_CODES[i]] = c
    return T


T = _table()
ENC = {}
for i, s in enumerate(T):
    if s is not None and s not in ENC: ENC[s] = i
ENC.update({"'": 0xB4, '’': 0xB4, '‘': 0xB3, 'é': 0x1B, '…': 0xB0, '״': 0xB2, '׳': 0xB4, '־': 0xAE, '₪': 0xB7})
PH = {'PLAYER': 1, 'STR_VAR_1': 2, 'STR_VAR_2': 3, 'STR_VAR_3': 4, 'KUN': 5, 'RIVAL': 6, 'VERSION': 7,
      'AQUA': 8, 'MAGMA': 9, 'ARCHIE': 10, 'MAXIE': 11, 'KYOGRE': 12, 'GROUDON': 13}
PH_NAME = {v: k for k, v in PH.items()}
FC = {1: ('COLOR', 1), 2: ('HIGHLIGHT', 1), 3: ('SHADOW', 1), 4: ('COLOR_HIGHLIGHT_SHADOW', 3), 5: ('PALETTE', 1),
      6: ('FONT', 1), 7: ('RESET_FONT', 0), 8: ('PAUSE', 1), 9: ('PAUSE_UNTIL_PRESS', 0), 10: ('WAIT_SE', 0), 11: ('PLAY_BGM', 2),
      12: ('ESCAPE', 1), 13: ('SHIFT_RIGHT', 1), 14: ('SHIFT_DOWN', 1), 15: ('FILL_WINDOW', 0), 16: ('PLAY_SE', 2), 17: ('CLEAR', 1),
      18: ('SKIP', 1), 19: ('CLEAR_TO', 1), 20: ('MIN_LETTER_SPACING', 1), 21: ('JPN', 0), 22: ('ENG', 0), 23: ('PAUSE_MUSIC', 0),
      24: ('RESUME_MUSIC', 0)}
FC_ENC = {v[0]: (k, v[1]) for k, v in FC.items()}
MIRROR = {0x5C: 0x5D, 0x5D: 0x5C, 0x85: 0x86, 0x86: 0x85}


def is_heb(b): return 0x37 <= b <= 0x4F or b in (0x5E, 0x5F)


def decode(u8, off, maxlen=4096):
    s, i = '', off
    while i < min(len(u8), off + maxlen):
        b = u8[i]; i += 1
        if b == 0xFF: return s
        if b == 0xFE: s += '\\n'
        elif b == 0xFA: s += '\\l'
        elif b == 0xFB: s += '\\p'
        elif b == 0xFD: a = u8[i]; i += 1; s += '{%s}' % PH_NAME.get(a, 'FD %02X' % a)
        elif b == 0xFC:
            c = u8[i]; i += 1
            if c not in FC: s += '{FC %02X}' % c; continue
            nm, n = FC[c]; args = ' '.join('%02X' % u8[i + k] for k in range(n)); i += n
            s += '{%s%s}' % (nm, ' ' + args if args else '')
        elif T[b] is not None: s += T[b]
        else: s += '{%02X}' % b
    return s


def tokenize(text):
    """-> list of (bytes, kind) where kind is char / nl / ctrl / ph (like js tokenize)"""
    toks, i, q = [], 0, False
    text = text.replace('\r', '').replace('\n', '\\n')
    while i < len(text):
        c = text[i]
        if c == '\\' and i + 1 < len(text) and text[i + 1] in 'nlp':
            toks.append(([{'n': 0xFE, 'l': 0xFA, 'p': 0xFB}[text[i + 1]]], 'nl')); i += 2; continue
        if c == '{':
            j = text.index('}', i)
            parts = text[i + 1:j].split(); name = parts[0].upper(); args = [int(a, 16) for a in parts[1:]]
            if name in PH: toks.append(([0xFD, PH[name]], 'ph'))
            elif name in FC_ENC:
                code, n = FC_ENC[name]; assert len(args) == n, name
                toks.append(([0xFC, code] + args, 'char' if code == 12 else 'ctrl'))
            elif name in ('FD', 'FC', 'F9', 'F8', 'F7') and args: toks.append(([int(name, 16)] + args, 'ctrl'))
            elif len(name) == 2 and all(ch in '0123456789ABCDEF' for ch in name): toks.append(([int(name, 16)], 'char'))
            elif '{%s}' % name in ENC: toks.append(([ENC['{%s}' % name]], 'char'))
            elif name == 'FD': toks.append(([0xFD] + args, 'ctrl'))
            else: raise ValueError('unknown code {%s}' % name)
            i = j + 1; continue
        if c == '"': b = 0xB2 if q else 0xB1; q = not q
        else:
            if c not in ENC: raise ValueError('char %r not in font (%s)' % (c, text))
            b = ENC[c]
        toks.append(([b], 'char')); i += 1
    return toks


class Rom:
    def __init__(self, path):
        self.u8 = bytearray(open(path, 'rb').read())
        self.free = 0x0E3D070  # editor's relocation area start; alloc() searches for 0xFF runs from here
        self.free_end = 0xFFE000  # RTL patch lives at 0x08FFE000
        self.wcache = None

    # --- basic access ---
    def r8(self, o): return self.u8[o]
    def r16(self, o): return struct.unpack_from('<H', self.u8, o)[0]
    def r32(self, o): return struct.unpack_from('<I', self.u8, o)[0]
    def s16(self, o): return struct.unpack_from('<h', self.u8, o)[0]
    def w8(self, o, v): self.u8[o] = v & 0xFF
    def w16(self, o, v): struct.pack_into('<H', self.u8, o, v & 0xFFFF)
    def w32(self, o, v): struct.pack_into('<I', self.u8, o, v & 0xFFFFFFFF)

    def ptr(self, o):
        v = self.r32(o)
        return v - 0x08000000 if 0x08000000 <= v < 0x08000000 + len(self.u8) - 4 else -1

    def wptr(self, o, target): self.w32(o, 0x08000000 + target)
    def write(self, o, data): self.u8[o:o + len(data)] = data

    def find_ptrs(self, target, aligned=False):
        pat = struct.pack('<I', 0x08000000 + target)
        out, i = [], self.u8.find(pat)
        while i >= 0:
            if not aligned or i % 4 == 0: out.append(i)
            i = self.u8.find(pat, i + 1)
        return out

    def alloc(self, size, align=4):
        u, i = self.u8, self.free
        while i + size + 1 <= self.free_end:
            if i % align: i += align - i % align; continue
            if u[i - 1] != 0xFF: i += align; continue
            j = 0
            while j < size + 1 and u[i + j] == 0xFF: j += 1
            if j == size + 1:
                self.free = i + size + 1
                return i
            i += max(align, j + 1)
        raise RuntimeError('no free space for %d bytes' % size)

    def write_new(self, data, align=4):
        o = self.alloc(len(data), align)
        self.write(o, data)
        return o

    def save(self, path):
        open(path, 'wb').write(self.u8)

    # --- text ---
    def width(self, code, font=0x207370):  # dialogue font (id 2) width table in the Hebrew ROM
        return self.u8[font + code] if code < 256 else 8

    def str_len(self, off):
        """byte length incl. 0xFF terminator of the string at off"""
        i = off
        while self.u8[i] != 0xFF:
            b = self.u8[i]
            if b == 0xFC: i += 2 + FC.get(self.u8[i + 1], ('', 0))[1]
            elif b in (0xFD, 0xF9, 0xF8, 0xF7): i += 2
            else: i += 1
        return i - off + 1

    def text_width(self, s):
        PHW = {1: 42, 2: 60, 3: 60, 4: 60, 6: 42}
        w = 0
        for b, k in tokenize(s):
            if k == 'char': w += self.width(b[0]) if len(b) == 1 else (self.width(b[2]) if b[0] == 0xFC else 8)
            elif k == 'ph': w += PHW.get(b[1], 48)
        return w

    def wrap(self, text, box=202):
        """auto line-wrap dialogue for the 2-line message box (line1 \\n line2 \\l line3...)"""
        if '\\n' in text or '\\l' in text: return text
        out = []
        for par in text.split('\\p'):
            words, lines, cur = par.strip().split(' '), [], ''
            for w in words:
                t = cur + ' ' + w if cur else w
                if cur and self.text_width(t) > box: lines.append(cur); cur = w
                else: cur = t
            if cur: lines.append(cur)
            out.append(''.join(l if i == 0 else ('\\l' if i >= 2 else '\\n') + l for i, l in enumerate(lines)))
        return '\\p'.join(out)

    def encode(self, text, align=True, box=208):
        """bytes for the RTL engine: logical order, mirrored brackets, {SKIP} right-align on Hebrew lines"""
        toks = tokenize(text)
        heb = lambda ts: any(k == 'char' and len(b) == 1 and is_heb(b[0]) for b, k in ts)
        out = []
        if heb(toks):
            toks = [([MIRROR[b[0]]], k) if k == 'char' and len(b) == 1 and b[0] in MIRROR else (b, k) for b, k in toks]
            line = []
            for t in toks + [None]:
                if t is not None and t[1] != 'nl': line.append(t); continue
                if align and heb(line) and not (line and line[0][0][0] == 0xFC and line[0][0][1] in (0x0D, 0x12, 0x13)):
                    w = sum(self.width(b[0]) if k == 'char' and len(b) == 1 else (42 if k == 'ph' else 0) for b, k in line)
                    pad = max(0, min(255, box - w))
                    if pad: out += [0xFC, 0x12, pad]
                for b, _ in line: out += b
                if t is not None: out += t[0]
                line = []
        else:
            for b, _ in toks: out += b
        return bytes(out + [0xFF])

    def set_text(self, off, text, refs=None, align=True, wrap=True):
        """Replace the string at off (in place if it fits, else relocate and repoint refs). Returns new offset."""
        if wrap: text = self.wrap(text)
        data = self.encode(text, align)
        old = self.str_len(off)
        if len(data) > old:
            plain = self.encode(text, False)
            if len(plain) <= old: data = plain
        if len(data) <= old:
            self.write(off, data + b'\xff' * (old - len(data)))
            return off
        if refs is None: refs = self.find_ptrs(off)
        if not refs: raise RuntimeError('no pointer to relocate string at %X' % off)
        n = self.write_new(data)
        for p in refs: self.wptr(p, n)
        return n

    # --- maps ---
    MAP_GROUPS = 0x352718  # FireRed v1.1 gMapGroups

    def map_header(self, group, num):
        return self.ptr(self.ptr(self.MAP_GROUPS + group * 4) + num * 4)

    def map_events(self, hdr):
        ev = self.ptr(hdr + 4)
        E = {'obj': [], 'warp': [], 'coord': [], 'bg': []}
        for kind, cnt_o, p_o, size in (('obj', 0, 4, 24), ('warp', 1, 8, 8), ('coord', 2, 12, 16), ('bg', 3, 16, 12)):
            p = self.ptr(ev + p_o)
            for i in range(self.u8[ev + cnt_o]): E[kind].append(p + i * size)
        return E
