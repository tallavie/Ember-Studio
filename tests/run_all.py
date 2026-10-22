# Ember Studio tests (--only game replays the story-step ROMs of the last run). Needs Microsoft Edge, websocket-client (pip), mGBA (tools/mgba_nightly or the EXE's copy) and your
# own Pokémon FireRed (US) v1.1 ROM.
#   python tests/run_all.py [--rom FireRed.gba] [--only browser|steps|kl] [--lang en|he|both]
# 1. browser: tests/suite.js in a headless Edge - every tab, the game check, blocks, objects, the story and its undo,
#    a game made with the wizard (save / reopen / build), in English and in Hebrew.
# 2. steps: every step of the test game's story, up to the first gym leader, played in mGBA at full speed
#    (tests/step.lua): the step must move the story on.
# 3. exe: dist/EmberStudio.exe --selftest (when it is there).
# 4. kl: the Kachol-Lavan example project (../projects/KacholLavan) builds to the same bytes as KL_EXPECT, when both are there.
# Writes tests/out/report.md and exits with 1 when something failed.
import os, sys, json, time, shutil, subprocess, urllib.parse, zlib, argparse, glob
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(APP, 'ember')); sys.path.insert(0, HERE)
import server, tools, project
from cdp import Edge

OUT = os.path.join(HERE, 'out')
PORT, CDP_PORT = 8793, 9334
FR_CRC = '84EE4776'


def crc(path): return '%08X' % (zlib.crc32(open(path, 'rb').read()) & 0xFFFFFFFF)


def browser(rom, langs):
    rows, steps = [], []
    srv = subprocess.Popen([sys.executable, '-X', 'utf8', os.path.join(APP, 'ember', 'server.py'), str(PORT)])
    time.sleep(2)
    try:
        for lang in langs:
            edge = Edge(CDP_PORT)
            try:
                q = urllib.parse.urlencode({'testsuite': 1, 'lang': lang, 'rom': rom, 'out': OUT})
                edge.cmd('Page.navigate', url='http://127.0.0.1:%d/index.html?%s' % (PORT, q))
                done = edge.wait_for('window.__testDone ? JSON.stringify(window.__testDone) : null', timeout=1200, every=1)
                if not done: rows.append(('browser ' + lang, False, 0, 'the suite did not finish')); continue
                d = json.loads(done)
                for r in d['results']:
                    rows.append(('[%s] %s' % (lang, r['name']), r['ok'], r.get('ms', 0), r.get('msg', '')))
                    print('  %s [%s] %s  %s' % ('ok  ' if r['ok'] else 'FAIL', lang, r['name'], r.get('msg', '')[:120]))
                if d.get('steps'): steps = d['steps']
            finally:
                edge.close()
    finally:
        srv.kill()
    return rows, steps


def play_steps(steps):
    rows = []
    exe = server.find_mgba()
    if not exe: return [('steps', False, 0, 'mGBA not found')]
    body = open(os.path.join(HERE, 'step.lua'), encoding='utf8').read()
    d = os.path.join(OUT, 'steps')
    for sp in steps:
        name = sp['file'][:-4]
        res = os.path.join(d, name).replace(os.sep, '/')
        P = {'out': res, 'g': sp['g'], 'n': sp['n'], 'x': sp['x'], 'y': sp['y'], 'arrive': sp['arrive'], 'key': sp['key'], 'var': sp['stageVar'], 'expect': sp['expect']}
        for k in ('face', 'walk', 'target', 'stay', 'within'):
            if sp.get(k): P[k] = sp[k]
        if sp.get('flag'): P['flag'] = sp['flag']
        lua = os.path.join(d, name + '.lua')
        open(lua, 'w', encoding='utf8').write('P = ' + lua_table(P) + '\n' + body)
        t0 = time.time()
        for f in (res + '.txt', res + '.png'):
            if os.path.isfile(f): os.remove(f)
        tools.run_mgba(exe, lua, os.path.join(d, sp['file']), 300)
        log = open(res + '.txt', encoding='utf8').read().strip().splitlines() if os.path.isfile(res + '.txt') else ['no log']
        ok = bool(log) and log[-1].startswith('PASS')
        rows.append(('[game] %s (%s)' % (name, sp['type']), ok, int((time.time() - t0) * 1000), log[-1]))
        print('  %s [game] %s  %s' % ('ok  ' if ok else 'FAIL', name, log[-1]))
    return rows


def lua_table(v):
    if isinstance(v, dict): return '{ ' + ', '.join('%s = %s' % (k, lua_table(x)) for k, x in v.items()) + ' }'
    if isinstance(v, (list, tuple)): return '{ ' + ', '.join(lua_table(x) for x in v) + ' }'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, str): return json.dumps(v)
    return str(v)


def exe(rom):
    """the built EmberStudio.exe opens its window, loads the ROM and runs the emulator (--selftest)"""
    found = sorted(glob.glob(os.path.join(os.path.dirname(APP), 'dist', 'EmberStudio*.exe')), key=os.path.getmtime)   # EmberStudio-<version>.exe, the newest
    path = os.environ.get('EMBER_EXE') or (found[-1] if found else '')
    if not os.path.isfile(path): return [('exe', True, 0, 'skipped (no EmberStudio.exe)')]
    out = os.path.join(OUT, 'selftest.json')
    if os.path.isfile(out): os.remove(out)
    t0 = time.time()
    p = subprocess.Popen([path, '--selftest', out, '--rom', rom])
    while time.time() - t0 < 120 and not os.path.isfile(out): time.sleep(1)
    time.sleep(1); subprocess.call(['taskkill', '/PID', str(p.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)   # the onefile EXE runs a child process
    if not os.path.isfile(out): return [('exe: --selftest', False, int((time.time() - t0) * 1000), 'no result after 120 s')]
    r = json.load(open(out, encoding='utf8'))
    ok = r.get('host') and r.get('isolated') and r.get('romLoaded') and r.get('emuScreenshot') and not r.get('error')
    return [('exe: window, backend, ROM and emulator', bool(ok), int((time.time() - t0) * 1000),
             'host=%s isolated=%s rom=%s emulator=%s %s' % (r.get('host'), r.get('isolated'), r.get('romLoaded'), r.get('emuScreenshot'), r.get('error') or ''))]


def kl():
    d = os.path.join(os.path.dirname(APP), 'projects', 'KacholLavan')
    expect = os.environ.get('KL_EXPECT') or os.path.join(os.path.dirname(APP), 'Pokemon_KacholLavan.gba')
    if not os.path.isdir(d) or not os.path.isfile(expect): return [('kl', True, 0, 'skipped (no project or no expected ROM)')]
    t0 = time.time()
    r = project.build(d, server.load_settings())
    if r.get('error'): return [('kl: build from the project', False, 0, r.get('message') or r['error'])]
    a, b = crc(r['out']), crc(expect)
    return [('kl: build from the project = %s' % os.path.basename(expect), a == b, int((time.time() - t0) * 1000), '%s vs %s' % (a, b))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rom'); ap.add_argument('--only'); ap.add_argument('--lang', default='both'); ap.add_argument('--step')
    a = ap.parse_args()
    rom = a.rom or server.load_settings().get('roms', {}).get(FR_CRC)
    if not rom or not os.path.isfile(rom): sys.exit('FireRed (US) v1.1 not found: pass --rom')
    if a.only == 'game':                                   # replay the step ROMs of the last run (quick)
        rows = play_steps([s for s in json.load(open(os.path.join(OUT, 'steps', 'steps.json')))['steps'] if not a.step or s['file'].startswith(a.step)])
        print('%d tests, %d failed' % (len(rows), len([r for r in rows if not r[1]]))); sys.exit(0)
    for sub in ('qa_game_en', 'qa_game_he', 'steps'): shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
    os.makedirs(os.path.join(OUT, 'steps'), exist_ok=True)
    langs = ['en', 'he'] if a.lang == 'both' else [a.lang]
    rows, t0 = [], time.time()
    steps = []
    if a.only in (None, 'browser', 'steps'):
        print('browser tests...'); r, steps = browser(rom, langs if a.only != 'steps' else ['en']); rows += r if a.only != 'steps' else []
    if a.only in (None, 'steps'):
        print('story steps in mGBA...'); rows += play_steps(steps) if steps else [('steps', False, 0, 'no step ROMs (the English browser run makes them)')]
    if a.only in (None, 'exe'):
        print('EmberStudio.exe...'); rows += exe(rom)
    if a.only in (None, 'kl'):
        print('Kachol-Lavan...'); rows += kl()
    bad = [r for r in rows if not r[1]]
    rep = ['# Ember Studio tests', '', '%s · %d tests · %d failed · %d s' % (time.strftime('%Y-%m-%d %H:%M'), len(rows), len(bad), time.time() - t0), '',
           '| | Test | ms | Note |', '|---|---|---|---|'] + ['| %s | %s | %d | %s |' % ('✅' if ok else '❌', n, ms, (m or '').replace('|', '/')[:200]) for n, ok, ms, m in rows]
    open(os.path.join(OUT, 'report.md'), 'w', encoding='utf8').write('\n'.join(rep) + '\n')
    print('\n%d tests, %d failed  ->  %s' % (len(rows), len(bad), os.path.join(OUT, 'report.md')))
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
