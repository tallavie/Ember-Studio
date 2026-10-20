# Runs playthrough segments one after another, each from the previous one's saved state.
#   python run_chain.py s01 s02 s03 ...      (plans in tests/out/pt/plans/<name>.lua; the first one starts a new game
#   unless given as name@load)
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(os.path.dirname(HERE))
PY = sys.executable
prev = None
for arg in sys.argv[1:]:
    name, _, load = arg.partition('@')
    load = load or prev
    cmd = [PY, os.path.join(HERE, 'run_pt.py'), name, os.path.join(ED, 'tests', 'out', 'pt', 'plans', name + '.lua')] + ([load] if load else [])
    out = subprocess.run(cmd, capture_output=True, text=True, encoding='utf8').stdout.strip()
    last = out.splitlines()[-2] if len(out.splitlines()) > 1 else out
    print('%-6s %s' % (name, last), flush=True)
    if not last.startswith('DONE'):
        print(out); break
    prev = name
