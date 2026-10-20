# Ember Studio backend: serves the editor (the folder above this one) and a small local API for projects,
# files, dialogs, building and the emulator. Listens on 127.0.0.1 only.
#   python ember/server.py [port]
# Every /api call must carry the header "X-Ember: 1". A web page from another site cannot add that header
# without a CORS preflight, which this server never answers, so only the editor itself can use the API.
import http.server, json, os, sys, re, zlib, glob, subprocess, threading, functools, urllib.parse, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
APP = getattr(sys, '_MEIPASS', None) or os.path.dirname(HERE)       # the editor folder (index.html); inside the EXE: the unpacked bundle
sys.path.insert(0, HERE)
import project as P                                          # noqa: E402
import tools as T                                            # noqa: E402

VERSION = '0.1.0'
TEST_DIR = os.path.join(os.path.dirname(APP), 'tools', 'test')
MGBA_DIRS = [os.path.join(os.environ.get('LOCALAPPDATA', ''), 'EmberStudio', 'mgba'), os.path.join(APP, 'mgba'), os.path.join(os.path.dirname(APP), 'tools', 'mgba_nightly')]


def settings_path():
    base = os.environ.get('APPDATA') or os.path.expanduser('~')
    d = os.path.join(base, 'EmberStudio'); os.makedirs(d, exist_ok=True)
    return os.path.join(d, 'settings.json')


def load_settings():
    try: return json.load(open(settings_path(), encoding='utf8'))
    except Exception: return {'roms': {}, 'recent': []}


def save_settings(s): json.dump(s, open(settings_path(), 'w', encoding='utf8'), ensure_ascii=False, indent=1)


def find_mgba():
    for d in MGBA_DIRS:
        exe = glob.glob(os.path.join(d, '**', 'mGBA.exe'), recursive=True)
        if exe: return exe[0]
    return None


# native file dialogs: tkinter in a child process (works from any thread); the EXE window replaces this
DIALOG = r'''
import sys, json, tkinter as tk
from tkinter import filedialog
a = json.loads(sys.argv[1]); r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True)
k, t, ini = a.get('kind'), a.get('title', ''), a.get('initial') or None
ft = [(f[0], ' '.join(f[1])) for f in a.get('filters', [])] + [('All files', '*.*')]
if k == 'folder': p = filedialog.askdirectory(title=t, initialdir=ini, mustexist=False)
elif k == 'save': p = filedialog.asksaveasfilename(title=t, initialdir=ini, initialfile=a.get('name') or '', filetypes=ft, defaultextension=a.get('ext') or '')
else: p = filedialog.askopenfilename(title=t, initialdir=ini, filetypes=ft)
print(json.dumps(p or ''))
'''
dialog_hook = None                                            # set by the EXE (pywebview) to use its own dialogs


def dialog(args):
    if dialog_hook: return dialog_hook(args)
    out = subprocess.run([sys.executable, '-c', DIALOG, json.dumps(args)], capture_output=True, text=True, timeout=600)
    return json.loads(out.stdout.strip() or '""')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=APP, **k)

    def log_message(self, fmt, *args):
        if os.environ.get('EMBER_LOG'): super().log_message(fmt, *args)

    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{'.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript'})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # cross-origin isolation: the emulator (lib/mgba, WebAssembly with threads) needs SharedArrayBuffer
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

    # ----- helpers -----
    def body(self): return self.rfile.read(int(self.headers.get('Content-Length', 0) or 0))
    def json_in(self): return json.loads(self.body() or b'{}')

    def reply(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf8')
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def bytes_out(self, data):
        self.send_response(200); self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def allowed(self):
        if self.client_address[0] != '127.0.0.1': self.send_error(403); return False
        if self.path.startswith('/api/') and self.headers.get('X-Ember') != '1': self.send_error(403, 'missing X-Ember header'); return False
        return True

    def q(self):
        u = urllib.parse.urlparse(self.path)
        return u.path, {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}

    def do_OPTIONS(self): self.send_error(403)

    # ----- GET -----
    def do_GET(self):
        if not self.path.startswith('/api/'): return super().do_GET()
        if not self.allowed(): return
        path, q = self.q()
        try:
            if path == '/api/info':
                return self.reply({'app': 'Ember Studio', 'version': VERSION, 'mgba': bool(find_mgba()), 'exe': bool(getattr(sys, 'frozen', False)), 'projects': os.path.join(os.path.expanduser('~'), 'Documents', 'Ember Studio'), 'temp': T.temp_dir()})
            if path == '/api/settings': return self.reply(load_settings())
            if path == '/api/file':
                p = q['path']
                if not os.path.isfile(p): return self.reply({'error': 'not found: ' + p}, 404)
                return self.bytes_out(open(p, 'rb').read())
            if path == '/api/list':
                p = q['path']
                if not os.path.isdir(p): return self.reply({'error': 'not a folder: ' + p}, 404)
                return self.reply([{'name': n, 'dir': os.path.isdir(os.path.join(p, n))} for n in sorted(os.listdir(p))])
            if path == '/api/exists': return self.reply({'file': os.path.isfile(q['path']), 'dir': os.path.isdir(q['path'])})
            if path == '/api/rom/find':                       # the base ROM with this CRC, if it was registered before
                p = load_settings().get('roms', {}).get(q['crc'])
                return self.reply({'path': p if p and os.path.isfile(p) else None})
            return self.reply({'error': 'unknown ' + path}, 404)
        except Exception as e:
            traceback.print_exc(); return self.reply({'error': str(e)}, 500)

    # ----- PUT: write a file -----
    def do_PUT(self):
        if not self.allowed(): return
        m = re.fullmatch(r'/__test/([\w.\-]+)', self.path)
        if m:                                                # automated tests (dev only)
            os.makedirs(TEST_DIR, exist_ok=True)
            open(os.path.join(TEST_DIR, m.group(1)), 'wb').write(self.body())
            self.send_response(204); self.end_headers(); return
        path, q = self.q()
        if path != '/api/file': return self.send_error(404)
        p = q['path']; os.makedirs(os.path.dirname(os.path.abspath(p)), exist_ok=True)
        data = self.body(); tmp = p + '.tmp'
        open(tmp, 'wb').write(data); os.replace(tmp, p)       # never leaves a half-written file
        self.reply({'ok': True, 'size': len(data)})

    # ----- POST: actions -----
    def do_POST(self):
        if not self.allowed(): return
        path, q = self.q()
        try:
            if path in ('/__mgba', '/api/mgba'):              # save the ROM and open it in mGBA
                exe = find_mgba()
                if not exe: return self.reply({'error': 'mGBA not found'}, 500)
                rom = os.path.join(TEST_DIR if os.path.isdir(TEST_DIR) else os.environ.get('TEMP', '.'), 'editor_test.gba')
                open(rom, 'wb').write(self.body())
                subprocess.Popen([exe, rom]); self.send_response(204); self.end_headers(); return
            if path == '/api/dialog': return self.reply({'path': dialog(self.json_in())})
            if path == '/api/settings':
                s = load_settings(); s.update(self.json_in()); save_settings(s); return self.reply(s)
            if path == '/api/rom/register':                   # remember where a base ROM is (by CRC)
                p = self.json_in()['path']; data = open(p, 'rb').read()
                crc = '%08X' % (zlib.crc32(data) & 0xFFFFFFFF)
                s = load_settings(); s.setdefault('roms', {})[crc] = p; save_settings(s)
                return self.reply({'crc': crc, 'size': len(data), 'code': data[0xAC:0xB0].decode('latin1'), 'title': data[0xA0:0xAC].decode('latin1').strip('\0')})
            if path == '/api/project/build':                 # base ROM -> custom steps -> data layers -> patch layer
                a = self.json_in()
                return self.reply(P.build(a['dir'], load_settings(), use_patch=a.get('patch', True)))
            if path == '/api/tools/title':                    # title screen (Python + PIL, tools/kl/title.py)
                a = self.json_in()
                return self.reply(T.title(a['in'], a['out'], a.get('logo'), a.get('subtitle'), a.get('hero'), a.get('background', 'keep')))
            if path == '/api/tools/screenshot':               # run the ROM in mGBA, screenshot at a frame
                a = self.json_in()
                return self.reply({'png': T.screenshot(a['rom'], a.get('frame', 900), a.get('presses', []), find_mgba())})
            if path == '/api/tools/startstate':               # "play from here": intro at full speed -> save state at the spot
                a = self.json_in()
                return self.reply({'state': T.startstate(a['rom'], a['g'], a['n'], a['x'], a['y'], find_mgba())})
            if path == '/api/guide':                          # open the user guide PDF in the system viewer
                lang = 'he' if self.json_in().get('lang') == 'he' else 'en'
                pdf = os.path.join(APP, 'docs', 'Ember-Studio-Guide-%s.pdf' % lang)
                if not os.path.isfile(pdf): return self.reply({'error': 'The guide is not here: ' + pdf}, 404)
                os.startfile(pdf); return self.reply({'ok': True, 'path': pdf})
            if path == '/api/project/recent':
                p = self.json_in()['dir']; s = load_settings(); r = [x for x in s.get('recent', []) if x != p]
                s['recent'] = [p] + r[:9]; save_settings(s); return self.reply(s['recent'])
            return self.reply({'error': 'unknown ' + path}, 404)
        except Exception as e:
            traceback.print_exc(); return self.reply({'error': str(e)}, 500)


def serve(port=8765, ready=None):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    if ready: ready(srv)
    srv.serve_forever()


if __name__ == '__main__':
    serve(int(sys.argv[1]) if len(sys.argv) > 1 else 8765)
