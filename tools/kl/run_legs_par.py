# Like run_legs.py, but several legs at once (each mGBA in its own folder). python run_legs_par.py [workers] [name ...]
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ED, 'ember'))
import server, tools
D = os.path.join(ED, 'tests', 'out', 'seams')
body = open(os.path.join(HERE, 'route_test.lua'), encoding='utf8').read()
workers = int(sys.argv[1]) if len(sys.argv) > 1 else 4
only = sys.argv[2:]
legs = [s for s in json.load(open(os.path.join(D, 'legs.json'), encoding='utf8')) if not only or s['name'] in only]
def run(s):
    res = os.path.join(D, 'leg_' + s['name']).replace(os.sep, '/')
    if os.path.isfile(res + '.txt'): os.remove(res + '.txt')
    steps = ', '.join('{ %d, %d, %d, %d, "%s" }' % tuple(t) for t in s['steps'])
    open(res + '.lua', 'w', encoding='utf8').write('P = { out = "%s", g = %d, n = %d, x = %d, y = %d, steps = { %s } }\n' % (res, s['g'], s['n'], s['x'], s['y'], steps) + body)
    t0 = time.time()
    tools.run_mgba(server.find_mgba(), res + '.lua', res + '.gba', 900)
    log = open(res + '.txt', encoding='utf8').read().strip().splitlines() if os.path.isfile(res + '.txt') else ['no log']
    return '%-22s %s (%.0fs)' % (s['name'], log[-1], time.time() - t0)
with ThreadPoolExecutor(workers) as ex:
    for line in ex.map(run, legs): print(line, flush=True)
