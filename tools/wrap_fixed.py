# Wrap Hebrew for fixed windows (help panel etc.) to the English line width, using the FireRed font-2 widths.
import json, re, sys
HEBW = {'א': 6, 'ב': 6, 'ג': 5, 'ד': 6, 'ה': 6, 'ו': 3, 'ז': 4, 'ח': 6, 'ט': 6, 'י': 4, 'ך': 5, 'כ': 6, 'ל': 6, 'ם': 6, 'מ': 6, 'ן': 3, 'נ': 4, 'ס': 6, 'ע': 6, 'ף': 5, 'פ': 6, 'ץ': 6, 'צ': 6, 'ק': 6, 'ר': 6, 'ש': 6, 'ת': 6}
CODEW = {'PLAYER': 42, 'RIVAL': 42, 'STR_VAR_1': 48, 'STR_VAR_2': 48, 'STR_VAR_3': 48}
TOK = re.compile(r'\{[^}]*\}|.')
def width(s):
    w = 0
    for t in TOK.findall(s):
        if t.startswith('{'):
            n = t[1:-1]
            w += CODEW.get(n, 12 if n.startswith('F9') else 0)
        elif t in HEBW: w += HEBW[t]
        elif t in ".,:":
            w += 5
        elif t in "'":
            w += 3
        else: w += 6
    return w
ENG = {('%X' % e['o']): e['t'].replace('\n', '') for e in json.load(open('D:/GBA/editor/data/firered_he/_english.json', encoding='utf-8'))}
B = '\\'
def wrap(key, he, warn, fixw=None):
    en = ENG[key]
    paras_en = en.split(B + 'p')
    enLines = [l for l in re.split(r'\\[nlp]', en)]
    enMax = fixw or max(width(l) for l in enLines)
    useL = (B + 'l') in en
    out = []
    for par in he.split(B + 'p'):
        lines = []
        for seg in par.split('|'):
            words = re.findall(r'(?:\{[^}]*\}|[^ ])+', seg)
            cur = ''
            for wd in words:
                if not wd: continue
                t = cur + ' ' + wd if cur else wd
                if cur and width(t) > enMax: lines.append(cur); cur = wd
                else: cur = t
            lines.append(cur)
        out.append(lines)
    nEn = len(enLines); nHe = sum(len(l) for l in out)
    if nHe > nEn: warn.append('%s: %d lines > %d' % (key, nHe, nEn))
    res = []
    for lines in out:
        s = ''
        for i, l in enumerate(lines):
            s += l if i == 0 else ((B + 'l' if useL and i >= 2 else B + 'n') + l)
        res.append(s)
    return (B + 'p').join(res)
def build(src, dst):
    d = {}
    exec(open(src, encoding='utf-8').read(), {'d': d})
    warn = []
    def one(k, v):
        m = re.match(r'~(\d+)~', v)
        if m: return wrap(k, v[m.end():], warn, int(m.group(1)))
        return wrap(k, v[1:], warn) if v.startswith('~') else v
    out = {k: one(k, v) for k, v in d.items()}
    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(len(out), 'strings;', 'warnings:', warn)
if __name__ == '__main__': build(sys.argv[1], sys.argv[2])
