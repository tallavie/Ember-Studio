// The local Ember Studio backend (ember/server.py, or the EXE): files, dialogs, settings, building and mGBA.
// When the editor is opened without it (a plain static server), Host.ok is false and the editor works on ROM files only.
'use strict';

const Host = {
  ok: false, info: null,
  async init() {
    try { const r = await fetch('/api/info', { headers: { 'X-Ember': '1' }, cache: 'no-store' }); if (r.ok) { this.info = await r.json(); this.ok = true; } }
    catch (e) { this.ok = false; }
    return this.ok;
  },
  async call(method, path, body, raw) {
    const opt = { method, headers: { 'X-Ember': '1' }, cache: 'no-store' };
    if (body !== undefined) { opt.body = raw ? body : JSON.stringify(body); if (!raw) opt.headers['Content-Type'] = 'application/json'; }
    const r = await fetch(path, opt);
    if (!r.ok) { let m = r.status + ''; try { m = (await r.json()).error || m; } catch (e) { /* not json */ } throw new Error(m); }
    return r;
  },
  async json(method, path, body, raw) { return (await this.call(method, path, body, raw)).json(); },
  q: p => encodeURIComponent(p),
  async readFile(p) { return new Uint8Array(await (await this.call('GET', '/api/file?path=' + this.q(p))).arrayBuffer()); },
  async readText(p) { return new TextDecoder().decode(await this.readFile(p)); },
  async readJSON(p) { return JSON.parse(await this.readText(p)); },
  async writeFile(p, data) { return this.json('PUT', '/api/file?path=' + this.q(p), typeof data === 'string' ? new TextEncoder().encode(data) : data, true); },
  writeJSON(p, obj) { return this.writeFile(p, JSON.stringify(obj, null, 1)); },
  async exists(p) { return this.json('GET', '/api/exists?path=' + this.q(p)); },
  list(p) { return this.json('GET', '/api/list?path=' + this.q(p)); },
  // kind: 'folder' | 'open' | 'save'; filters: [['GBA ROM', ['*.gba']]]
  async dialog(kind, title, opts = {}) { return (await this.json('POST', '/api/dialog', Object.assign({ kind, title }, opts))).path || ''; },
  settings() { return this.json('GET', '/api/settings'); },
  saveSettings(s) { return this.json('POST', '/api/settings', s); },
  registerRom(path) { return this.json('POST', '/api/rom/register', { path }); },
  async findRom(crc) { return (await this.json('GET', '/api/rom/find?crc=' + crc)).path; },
  build(dir, patch = true) { return this.json('POST', '/api/project/build', { dir, patch }); },
  addRecent(dir) { return this.json('POST', '/api/project/recent', { dir }); },
};
const joinPath = (...a) => a.filter(Boolean).join('\\').replace(/[\\/]+/g, '\\');
