// The online version (GitHub Pages): the emulator needs a cross-origin isolated page (SharedArrayBuffer), and
// GitHub Pages cannot send the headers for it. This service worker adds them to every response of the editor's own
// folder. The EXE and ember/server.py send the headers themselves, so there it is never registered.
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  e.respondWith(fetch(req).then(res => {
    if (res.status === 0) return res;                       // an opaque response: nothing to add
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
