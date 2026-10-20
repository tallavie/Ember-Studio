# A headless Microsoft Edge driven over the DevTools protocol (websocket-client). Used by tests/run_all.py and docs/manual/build.py.
import os, json, time, subprocess, tempfile, shutil, urllib.request
import websocket

EDGE = next((p for p in [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'] if os.path.isfile(p)),
            r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')


class Edge:
    def __init__(self, port=9333, width=1440, height=900):
        self.prof = tempfile.mkdtemp(prefix='edge_docs_')
        self.p = subprocess.Popen([EDGE, '--headless=new', '--remote-debugging-port=%d' % port, '--user-data-dir=' + self.prof, '--no-first-run',
                                   '--window-size=%d,%d' % (width, height), '--hide-scrollbars', '--mute-audio', 'about:blank'])
        tabs = []
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % port)); break
            except Exception: time.sleep(0.5)
        page = [t for t in tabs if t.get('type') == 'page'][0]
        self.ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=600, suppress_origin=True)
        self.n = 0
        self.cmd('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=False)

    def cmd(self, method, **params):
        self.n += 1; mid = self.n
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == mid:
                if 'error' in m: raise RuntimeError('%s: %s' % (method, m['error']))
                return m.get('result', {})

    def eval(self, js):
        r = self.cmd('Runtime.evaluate', expression=js, returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')

    def wait_for(self, js, timeout=600, every=0.5):
        """poll a JS expression until it is truthy -> its value (None on timeout)"""
        end = time.time() + timeout
        while time.time() < end:
            time.sleep(every)
            try: v = self.eval(js)
            except Exception: v = None
            if v: return v
        return None

    def close(self):
        try: self.ws.close()
        except Exception: pass
        self.p.kill(); time.sleep(1); shutil.rmtree(self.prof, ignore_errors=True)
