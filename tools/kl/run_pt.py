# Runs one playthrough segment: python run_pt.py name plan.lua [load_state]   (ROM: tests/out/pt/pt.gba)
# The plan file holds 'plan = { ... }'. Saves tests/out/pt/<name>.ss1 when the plan is done.
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ED, 'ember'))
import server, tools
D = os.path.join(ED, 'tests', 'out', 'pt').replace(os.sep, '/')
name, planf = sys.argv[1], sys.argv[2]
load = sys.argv[3] if len(sys.argv) > 3 else None
body = open(os.path.join(HERE, 'playthrough.lua'), encoding='utf8').read()
plan = open(planf, encoding='utf8').read()
out = D + '/' + name
for ext in ('.txt',):
    if os.path.isfile(out + ext): os.remove(out + ext)
head = 'P = { out = "%s", save = "%s.ss1"%s, shot = %s }\n' % (out, out, (', load = "%s/%s.ss1"' % (D, load)) if load else '', os.environ.get('PT_SHOT', '3600'))
open(out + '.lua', 'w', encoding='utf8').write(head + plan + '\nP.plan = plan\nP.poke = poke\n' + body)
t0 = time.time()
tools.run_mgba(server.find_mgba(), out + '.lua', D + '/' + os.environ.get('PT_ROM', 'pt.gba'), int(os.environ.get('PT_TIMEOUT', '900')))
print(open(out + '.txt', encoding='utf8').read() if os.path.isfile(out + '.txt') else 'no log', '(%.0fs)' % (time.time() - t0))
