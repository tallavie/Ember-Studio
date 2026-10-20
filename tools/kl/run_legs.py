# Runs route_test.lua in mGBA for every leg in tests/out/seams/legs.json (written by the editor: a test ROM per leg
# and the path to walk). Prints PASS / FAIL per leg; screenshots next to the ROMs.
#   python run_legs.py [name ...]
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ED, 'ember'))
import server, tools
D = os.path.join(ED, 'tests', 'out', 'seams')
body = open(os.path.join(HERE, 'route_test.lua'), encoding='utf8').read()
only = sys.argv[1:]
for s in json.load(open(os.path.join(D, 'legs.json'), encoding='utf8')):
    if only and s['name'] not in only: continue
    res = os.path.join(D, 'leg_' + s['name']).replace(os.sep, '/')
    if os.path.isfile(res + '.txt'): os.remove(res + '.txt')
    steps = ', '.join('{ %d, %d, %d, %d, "%s" }' % tuple(t) for t in s['steps'])
    open(res + '.lua', 'w', encoding='utf8').write('P = { out = "%s", g = %d, n = %d, x = %d, y = %d, steps = { %s } }\n' % (res, s['g'], s['n'], s['x'], s['y'], steps) + body)
    t0 = time.time()
    tools.run_mgba(server.find_mgba(), res + '.lua', res + '.gba', 600)
    log = open(res + '.txt', encoding='utf8').read().strip().splitlines() if os.path.isfile(res + '.txt') else ['no log']
    print('%-22s %s (%.0fs)' % (s['name'], log[-1], time.time() - t0), flush=True)
