# Builds dist/EmberStudio-<version>.exe (one file) with PyInstaller, then signs it.
#   D:\GBA\.venv-ember\Scripts\python ember\build_exe.py [--no-mgba] [--no-sign]
# The EXE holds the editor (index.html, js, css, lib, data), the Python backend (ember/*.py), the ROM tools
# (tools/kl/*.py, run by the bundled Python), mGBA (copied to %LOCALAPPDATA%\EmberStudio\mgba on first start) and
# the icon. Every module the tools import is bundled too (found by reading their import lines).
import ast, os, sys, glob, subprocess, shutil, sysconfig

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
ROOT = os.path.dirname(APP)
MGBA = sorted(glob.glob(os.path.join(ROOT, 'tools', 'mgba_nightly', 'mGBA-*')))
SEP = ';' if os.name == 'nt' else ':'
DIST = os.environ.get('EMBER_DIST') or os.path.join(ROOT, 'dist')   # another folder when dist\EmberStudio.exe is running


def imports_of(paths):
    """top-level module names imported by these Python files (stdlib + installed ones get bundled)"""
    local = {os.path.splitext(os.path.basename(p))[0] for p in paths}
    mods = set()
    for p in paths:
        try: tree = ast.parse(open(p, encoding='utf8').read())
        except SyntaxError: continue
        for n in ast.walk(tree):
            if isinstance(n, ast.Import): mods.update(a.name for a in n.names)
            elif isinstance(n, ast.ImportFrom) and n.module and not n.level: mods.add(n.module)
    out = set()
    for m in mods:
        top = m.split('.')[0]
        if top in local: continue
        try: __import__(m); out.add(m)
        except Exception: pass
    return sorted(out)


def public_data(stage):
    """data/ without what is not ours to publish (the same as .gitignore): FireRed's English text and the author's own game"""
    dst = os.path.join(stage, 'data')
    shutil.copytree(os.path.join(APP, 'data'), dst, ignore=shutil.ignore_patterns('_english.json', 'kachol_lavan'))
    return dst


def main():
    no_mgba, no_sign = '--no-mgba' in sys.argv, '--no-sign' in sys.argv
    stage = os.path.join(ROOT, 'build_exe'); shutil.rmtree(stage, ignore_errors=True); os.makedirs(stage)
    # mGBA, with a version stamp (the EXE reinstalls it only when the stamp changes)
    datas = [(os.path.join(APP, 'index.html'), '.'), (os.path.join(APP, 'css'), 'css'), (os.path.join(APP, 'js'), 'js'),
             (os.path.join(APP, 'lib'), 'lib'), (public_data(stage), 'data'),
             (os.path.join(APP, 'tools', 'kl', '*.py'), os.path.join('tools', 'kl')), (os.path.join(HERE, '*.py'), 'ember'),
             (os.path.join(HERE, 'icon.png'), 'ember')]
    if glob.glob(os.path.join(APP, 'docs', '*.pdf')): datas.append((os.path.join(APP, 'docs', '*.pdf'), 'docs'))   # the user guides (❓ Guide)
    if MGBA and not no_mgba:
        src = MGBA[-1]; dst = os.path.join(stage, 'mgba')
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns('README*.html', 'library.sqlite3', 'CHANGES.txt'))
        open(os.path.join(dst, 'VERSION.txt'), 'w').write(os.path.basename(src))
        datas.append((dst, 'mgba'))
    py = glob.glob(os.path.join(APP, 'tools', 'kl', '*.py')) + glob.glob(os.path.join(HERE, '*.py'))
    hidden = imports_of(py) + ['webview', 'webview.platforms.edgechromium', 'clr', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont', 'PIL.ImageFilter']
    args = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--onefile', '--windowed', '--name', exe_name(),
            '--icon', os.path.join(HERE, 'icon.ico'), '--distpath', DIST, '--workpath', os.path.join(stage, 'work'),
            '--specpath', stage, '--collect-submodules', 'PIL', '--paths', HERE, '--paths', os.path.join(APP, 'tools', 'kl'),
            '--version-file', write_version(stage)]
    for src, dst in datas: args += ['--add-data', src + SEP + dst]
    for m in hidden: args += ['--hidden-import', m]
    args.append(os.path.join(HERE, 'app.py'))
    print('PyInstaller with %d data folders, %d hidden imports' % (len(datas), len(hidden)))
    subprocess.check_call(args)
    exe = os.path.join(DIST, exe_name() + '.exe')
    print('built', exe, '%.1f MB' % (os.path.getsize(exe) / 1048576))
    if not no_sign:
        subprocess.call(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.join(ROOT, 'tools', 'signing', 'sign.ps1'), exe])


def exe_name(): return 'EmberStudio-' + server.VERSION        # the version in the file name: EmberStudio-0.4.0.exe


def write_version(stage):
    import server
    v = server.VERSION.split('.') + ['0'] * 4
    t = tuple(int(x) for x in v[:4])
    p = os.path.join(stage, 'version.txt')
    open(p, 'w', encoding='utf8').write('''VSVersionInfo(
  ffi=FixedFileInfo(filevers=%r, prodvers=%r, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[StringFileInfo([StringTable('040904B0', [StringStruct('CompanyName', 'Ember Studio (open source)'),
    StringStruct('FileDescription', 'Ember Studio - Pokemon FireRed game editor'), StringStruct('FileVersion', '%s'),
    StringStruct('InternalName', 'EmberStudio'), StringStruct('LegalCopyright', 'GPL-3.0'), StringStruct('OriginalFilename', exe_name() + '.exe'),
    StringStruct('ProductName', 'Ember Studio'), StringStruct('ProductVersion', '%s')])]), VarFileInfo([VarStruct('Translation', [1033, 1200])])])
''' % (t, t, server.VERSION, server.VERSION))
    return p


if __name__ == '__main__':
    sys.path.insert(0, HERE)
    main()
