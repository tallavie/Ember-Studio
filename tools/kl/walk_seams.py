# Runs walk_test.lua in mGBA for every seam in tests/out/seams/seams.json (written by the editor: one test ROM per
# seam, the player warped next to it). Prints PASS / FAIL per seam; the screenshots are next to the ROMs.
#   python walk_seams.py [--file other.json] [name ...]
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ED, 'ember'))
import server, tools

def lua_table(v):
    if isinstance(v, dict): return '{ ' + ', '.join('%s = %s' % (k, lua_table(x)) for k, x in v.items()) + ' }'
    if isinstance(v, str): return json.dumps(v)
    return str(v)

D = os.path.join(ED, 'tests', 'out', 'seams')
body = open(os.path.join(HERE, 'walk_test.lua'), encoding='utf8').read()
exe = server.find_mgba()
args = sys.argv[1:]
name = 'seams.json'
if args[:1] == ['--file']: name, args = args[1], args[2:]
seams = json.load(open(os.path.join(D, name), encoding='utf8'))
only = args
bad = 0
for s in seams:
    if only and s['name'] not in only: continue
    res = os.path.join(D, s['name']).replace(os.sep, '/')
    for f in (res + '.txt', res + '.png'):
        if os.path.isfile(f): os.remove(f)
    P = {'out': res, 'g': s['g'], 'n': s['n'], 'x': s['x'], 'y': s['y'], 'dir': s['dir'], 'eg': s['eg'], 'en': s['en']}
    lua = res + '.lua'
    open(lua, 'w', encoding='utf8').write('P = ' + lua_table(P) + '\n' + body)
    t0 = time.time()
    tools.run_mgba(exe, lua, res + '.gba', 240)
    log = open(res + '.txt', encoding='utf8').read().strip().splitlines() if os.path.isfile(res + '.txt') else ['no log']
    ok = log[-1].startswith('PASS')
    bad += not ok
    print('%s %-14s %s (%.0fs)' % ('ok  ' if ok else 'FAIL', s['name'], log[-1], time.time() - t0), flush=True)
print('failed: %d' % bad)
