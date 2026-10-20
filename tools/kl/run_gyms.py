# Runs gym_test.lua for every gym in tests/out/seams/gyms.json (a realistic team next to each leader).
#   python run_gyms.py [workers]
import json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ED, 'ember'))
import server, tools
D = os.path.join(ED, 'tests', 'out', 'seams')
body = open(os.path.join(HERE, 'gym_test.lua'), encoding='utf8').read()
gyms = json.load(open(os.path.join(D, 'gyms.json'), encoding='utf8'))
def run(s):
    res = os.path.join(D, 'gym%d' % s['k']).replace(os.sep, '/')
    if os.path.isfile(res + '.txt'): os.remove(res + '.txt')
    open(res + '.lua', 'w', encoding='utf8').write('P = { out = "%s", g = %d, n = %d, x = %d, y = %d, face = "UP", badge = %d, frames = %d }\n' % (res, s['g'], s['n'], s['x'], s['y'], s['badge'], 60 * 60 * 12) + body)
    t0 = time.time()
    tools.run_mgba(server.find_mgba(), res + '.lua', res + '.gba', 900)
    log = open(res + '.txt', encoding='utf8').read().strip() if os.path.isfile(res + '.txt') else 'no log'
    return 'gym %d: %s (%.0fs)' % (s['k'], log, time.time() - t0)
with ThreadPoolExecutor(int(sys.argv[1]) if len(sys.argv) > 1 else 4) as ex:
    for line in ex.map(run, gyms): print(line, flush=True)
