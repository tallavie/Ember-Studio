# Ember Studio as a desktop program (EmberStudio.exe): the local server (server.py) on a free port and a native
# window (pywebview, Microsoft Edge WebView2) showing the editor. File dialogs use the window's own dialogs.
#   EmberStudio.exe                     the editor
#   EmberStudio.exe --run-script x.py   run a Python script with the bundled Python (custom build steps of a project)
import os, sys, threading, socket, shutil, runpy

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = getattr(sys, '_MEIPASS', None) or os.path.dirname(HERE)
sys.path.insert(0, os.path.join(BUNDLE, 'ember')); sys.path.insert(0, HERE)


def run_script(path, args):
    """a project's custom build step (python script) inside the EXE: the bundled Python runs it. Output is UTF-8
    (like python -X utf8), and an error ends the process with code 1 instead of showing a window that waits."""
    import traceback
    for s in (sys.stdout, sys.stderr):
        if s is not None and hasattr(s, 'reconfigure'): s.reconfigure(encoding='utf-8', errors='replace')
    sys.argv = [path] + args
    sys.path.insert(0, os.path.dirname(os.path.abspath(path)))
    os.chdir(os.path.dirname(os.path.abspath(path)))
    try:
        runpy.run_path(path, run_name='__main__')
    except SystemExit as e:
        os._exit(e.code if isinstance(e.code, int) else (0 if e.code is None else 1))
    except BaseException:
        if sys.stderr: traceback.print_exc(); sys.stderr.flush()
        os._exit(1)
    if sys.stdout: sys.stdout.flush()
    os._exit(0)


def install_mgba():
    """the bundled mGBA is copied to %LOCALAPPDATA%\\EmberStudio\\mgba once (it cannot run scripts from the
    unpacked bundle under %TEMP%, and copying it every start would be slow)"""
    src = os.path.join(BUNDLE, 'mgba')
    if not os.path.isdir(src): return
    dst = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'EmberStudio', 'mgba')
    stamp = os.path.join(src, 'VERSION.txt')
    have = os.path.join(dst, 'VERSION.txt')
    if os.path.isdir(dst) and os.path.isfile(have) and open(have).read() == (open(stamp).read() if os.path.isfile(stamp) else ''): return
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst)


PORT = 47821                     # always the same, so the page keeps its browser storage (language, autosave) between runs


def free_port():
    for p in (PORT, 0):
        s = socket.socket()
        try: s.bind(('127.0.0.1', p)); return s.getsockname()[1]
        except OSError: continue
        finally: s.close()


def main():
    if len(sys.argv) > 2 and sys.argv[1] == '--run-script':
        run_script(sys.argv[2], sys.argv[3:]); return
    import webview
    import server
    threading.Thread(target=install_mgba, daemon=True).start()
    port = free_port()
    ready = threading.Event()
    threading.Thread(target=server.serve, args=(port, lambda srv: ready.set()), daemon=True).start()
    ready.wait(10)
    url = 'http://127.0.0.1:%d/index.html' % port
    if '--selftest' in sys.argv:                  # EmberStudio.exe --selftest result.json [--rom game.gba]: checks the window itself
        import urllib.parse
        i = sys.argv.index('--selftest'); q = {'selftest': sys.argv[i + 1]}
        if '--rom' in sys.argv: q['rom'] = sys.argv[sys.argv.index('--rom') + 1]
        url += '?' + urllib.parse.urlencode(q)
    win = webview.create_window('Ember Studio', url, width=1440, height=900, min_size=(1000, 650), text_select=True)

    def dialog(a):
        kind = a.get('kind')
        types = tuple('%s (%s)' % (f[0], ';'.join(f[1])) for f in a.get('filters', [])) + ('All files (*.*)',)
        if kind == 'folder': r = win.create_file_dialog(webview.FOLDER_DIALOG, directory=a.get('initial') or '')
        elif kind == 'save': r = win.create_file_dialog(webview.SAVE_DIALOG, directory=a.get('initial') or '', save_filename=a.get('name') or '', file_types=types)
        else: r = win.create_file_dialog(webview.OPEN_DIALOG, directory=a.get('initial') or '', file_types=types)
        if not r: return ''
        return r[0] if isinstance(r, (list, tuple)) else r
    server.dialog_hook = dialog
    webview.start(private_mode=False, storage_path=os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'EmberStudio', 'webview'))


if __name__ == '__main__':
    main()
