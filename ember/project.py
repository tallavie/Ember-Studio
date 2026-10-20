# Ember Studio projects: a folder with project.json + the editor's changes, built into a ROM.
#
#   MyGame/
#     project.json        name, language, the base ROM (by CRC - the ROM itself is never stored), build steps
#     rom/patch.bin       every byte the editor changed, relative to out/stage.gba (exact)
#     data/*.json         the same changes as data (Pokémon, world edits…): rebuilt on a changed stage
#     out/stage.gba       base ROM after the custom build steps (what the editor compares against)
#     out/game.gba        the finished game
#
# Build: base ROM -> custom steps (python scripts, e.g. the Kachol-Lavan pipeline) = stage
#        -> if rom/patch.bin was made on exactly this stage: stage + patch (the editor's exact state)
#        -> otherwise: stage + data layers (and the editor replays the rest when it opens the project)
import json, os, sys, struct, zlib, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
APP = getattr(sys, '_MEIPASS', None) or os.path.dirname(HERE)
KL_TOOLS = os.path.join(APP, 'tools', 'kl')
FORMAT = 'ember-project-1'
MAGIC = b'EMBP'


def crc(data): return '%08X' % (zlib.crc32(data) & 0xFFFFFFFF)


def load(d):
    pj = json.load(open(os.path.join(d, 'project.json'), encoding='utf8'))
    if pj.get('format') != FORMAT: raise ValueError('not an Ember Studio project: ' + d)
    return pj


# ---------- patch.bin: "EMBP", u32 version 1, u32 stage CRC, u32 final size, then records (u32 offset, u32 length, bytes) ----------
def read_patch(path):
    if not os.path.isfile(path): return None
    b = open(path, 'rb').read()
    if b[:4] != MAGIC: raise ValueError('bad patch file ' + path)
    ver, stage_crc, size = struct.unpack_from('<III', b, 4)
    recs, p = [], 16
    while p < len(b):
        off, n = struct.unpack_from('<II', b, p); recs.append((off, b[p + 8:p + 8 + n])); p += 8 + n
    return {'stage_crc': '%08X' % stage_crc, 'size': size, 'records': recs}


def apply_patch(data, patch):
    out = bytearray(data)
    if patch['size'] > len(out): out += b'\xFF' * (patch['size'] - len(out))
    for off, chunk in patch['records']: out[off:off + len(chunk)] = chunk
    return out


def run_step(step, data, d, log):
    out_dir = os.path.join(d, 'out')
    if step.get('type') == 'rom':                             # use a ROM file as the stage
        return bytearray(open(os.path.join(d, step['path']), 'rb').read())
    if step.get('type') != 'python': raise ValueError('unknown build step ' + str(step))
    src, dst = os.path.join(out_dir, 'step_in.gba'), os.path.join(out_dir, 'step_out.gba')
    open(src, 'wb').write(data)
    if os.path.exists(dst): os.remove(dst)
    script = step['script'] if os.path.isabs(step['script']) else os.path.normpath(os.path.join(d, step['script']))
    env = dict(os.environ, EMBER_IN=src, EMBER_OUT=dst, EMBER_PROJECT=d, PYTHONUTF8='1', **{k: str(v) for k, v in step.get('env', {}).items()})
    env = {k: v.replace('{OUT}', dst).replace('{IN}', src).replace('{PROJECT}', d) for k, v in env.items()}
    cmd = [sys.executable, '--run-script', script] if getattr(sys, 'frozen', False) else [sys.executable, '-X', 'utf8', script]
    r = subprocess.run(cmd, cwd=os.path.dirname(script), env=env, capture_output=True, text=True, encoding='utf8', errors='replace')
    log.append('$ ' + os.path.basename(script) + '\n' + r.stdout[-6000:] + (r.stderr[-4000:] if r.returncode else ''))
    if r.returncode or not os.path.isfile(dst): raise RuntimeError('build step failed: ' + os.path.basename(script) + '\n' + r.stderr[-3000:])
    return bytearray(open(dst, 'rb').read())


def apply_layers(stage_path, d, log):
    """the data layers (used when patch.bin does not fit the stage)"""
    sys.path.insert(0, KL_TOOLS)
    from gba import Rom
    rom = Rom(stage_path)
    p = os.path.join(d, 'data', 'pokemon_edits.json')
    if os.path.isfile(p):
        import pokeedits
        r = pokeedits.apply(rom, p)
        if r: log.append('Pokémon data: %d Pokémon, %d wild areas, %d gifts' % r)
    return bytearray(rom.u8)


def fingerprint(pj, d, base_crc):
    """changes when the base ROM, the steps, a step's script folder or a step's "watch" folders change"""
    import hashlib
    h = hashlib.sha1((base_crc + json.dumps(pj.get('steps', []), sort_keys=True)).encode())
    for step in pj.get('steps', []):
        dirs = []
        if step.get('type') == 'python':
            sc = step['script'] if os.path.isabs(step['script']) else os.path.join(d, step['script'])
            dirs.append(os.path.dirname(os.path.normpath(sc)))
        elif step.get('type') == 'rom': dirs.append(os.path.join(d, step['path']))
        dirs += [w if os.path.isabs(w) else os.path.normpath(os.path.join(d, w)) for w in step.get('watch', [])]
        for top in dirs:
            if os.path.isfile(top):
                st = os.stat(top); h.update(('%s%d%d' % (top, st.st_mtime_ns, st.st_size)).encode()); continue
            for root, ds, fs in os.walk(top):
                ds[:] = sorted(x for x in ds if x not in ('__pycache__', '.git'))
                for f in sorted(fs):
                    st = os.stat(os.path.join(root, f)); h.update(('%s%d%d' % (f, st.st_mtime_ns, st.st_size)).encode())
    return h.hexdigest()


def build(d, settings, use_patch=True):
    """-> {ok, stage, out, log, patch: 'applied' | 'none' | 'skipped', base_crc} or {error, ...}"""
    pj = load(d); log = []
    base_crc = pj['base']['crc32']
    base = settings.get('roms', {}).get(base_crc)
    if not base or not os.path.isfile(base):
        return {'error': 'base_missing', 'crc': base_crc, 'hint': pj['base'].get('file', '')}
    out_dir = os.path.join(d, 'out'); os.makedirs(out_dir, exist_ok=True)
    data = bytearray(open(base, 'rb').read())
    if crc(data) != base_crc: return {'error': 'base_changed', 'crc': base_crc}
    stage, cache = os.path.join(out_dir, 'stage.gba'), os.path.join(out_dir, 'stage.json')
    fp = fingerprint(pj, d, base_crc) if pj.get('steps') else None
    cached = fp and os.path.isfile(stage) and os.path.isfile(cache) and json.load(open(cache)).get('fp') == fp
    if cached:
        data = bytearray(open(stage, 'rb').read()); log.append('custom build steps: nothing changed, using the last result')
    else:
        try:
            for step in pj.get('steps', []): data = run_step(step, data, d, log)
        except Exception as e:
            return {'error': 'step_failed', 'message': str(e), 'log': '\n'.join(log)}
        open(stage, 'wb').write(data)
        if fp: json.dump({'fp': fp}, open(cache, 'w'))
    stage_crc = crc(data)
    patch = read_patch(os.path.join(d, 'rom', 'patch.bin')) if use_patch else None
    if patch and patch['stage_crc'] == stage_crc:
        final, state = apply_patch(data, patch), 'applied'
        log.append('editor changes: %d areas' % len(patch['records']))
    else:
        final = apply_layers(stage, d, log)
        state = 'skipped' if patch else 'none'
        if patch: log.append('the custom build changed, so the exact editor changes were not applied - data layers were used instead')
    out = os.path.join(out_dir, 'game.gba'); open(out, 'wb').write(final)
    return {'ok': True, 'stage': stage, 'out': out, 'stage_crc': stage_crc, 'patch': state, 'log': '\n'.join(log), 'name': pj.get('name', '')}


if __name__ == '__main__':                                   # python ember/project.py <project folder>
    import server
    r = build(sys.argv[1], server.load_settings())
    print(json.dumps({k: v for k, v in r.items() if k != 'log'}, ensure_ascii=False, indent=1)); print(r.get('log', ''))
