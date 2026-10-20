// Core ROM access, pointers, free space, LZ77, colors and 4bpp helpers.
'use strict';

class Rom {
  constructor(buffer, name) {
    this.u8 = new Uint8Array(buffer);
    this.name = name || 'rom.gba';
    this.original = new Uint8Array(this.u8); // for IPS export / revert
    this.listeners = [];
    this.code = String.fromCharCode(...this.u8.subarray(0xAC, 0xB0));
    this.title = String.fromCharCode(...this.u8.subarray(0xA0, 0xAC)).replace(/\0/g, '');
    this.freeStart = 0;
    this.freeEnd = this.u8.length;
  }
  get size() { return this.u8.length; }
  r8(o) { return this.u8[o]; }
  r16(o) { return this.u8[o] | (this.u8[o + 1] << 8); }
  r32(o) { return (this.u8[o] | (this.u8[o + 1] << 8) | (this.u8[o + 2] << 16) | (this.u8[o + 3] << 24)) >>> 0; }
  s16(o) { const v = this.r16(o); return v & 0x8000 ? v - 0x10000 : v; }
  w8(o, v) { this.u8[o] = v & 0xFF; this.changed(); }
  w16(o, v) { this.u8[o] = v & 0xFF; this.u8[o + 1] = (v >> 8) & 0xFF; this.changed(); }
  w32(o, v) { for (let i = 0; i < 4; i++) this.u8[o + i] = (v >>> (8 * i)) & 0xFF; this.changed(); }
  write(o, arr) { this.u8.set(arr, o); this.changed(); }
  bytes(o, n) { return this.u8.subarray(o, o + n); }

  isPtrVal(v) { const hi = v >>> 24; return (hi === 8 || hi === 9) && (v & 0x1FFFFFF) < this.size; }
  ptr(o) { const v = this.r32(o); return this.isPtrVal(v) ? (v & 0x1FFFFFF) : -1; }
  wptr(o, off) { this.w32(o, (0x08000000 + off) >>> 0); }

  find(pat, start = 0, align = 1) {
    const u = this.u8, n = pat.length, first = pat[0];
    for (let i = start; i <= u.length - n; i++) {
      if (u[i] !== first || (align > 1 && i % align)) continue;
      let ok = true;
      for (let j = 1; j < n; j++) if (u[i + j] !== pat[j]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }
  findAll(pat, max = 100, align = 1) {
    const r = []; let i = this.find(pat, 0, align);
    while (i !== -1 && r.length < max) { r.push(i); i = this.find(pat, i + 1, align); }
    return r;
  }
  // Every location (any alignment) holding a pointer to target.
  findPointers(target, aligned = false) {
    const v = (0x08000000 + target) >>> 0;
    const b0 = v & 0xFF, b1 = (v >> 8) & 0xFF, b2 = (v >> 16) & 0xFF, b3 = v >>> 24;
    const u = this.u8, r = [];
    for (let i = 0; i <= u.length - 4; i += aligned ? 4 : 1)
      if (u[i] === b0 && u[i + 1] === b1 && u[i + 2] === b2 && u[i + 3] === b3) r.push(i);
    return r;
  }
  // Find `size` bytes of 0xFF in the free area. The byte before the run must be 0xFF too,
  // so we never overwrite the terminator of a string that ends right before free space.
  alloc(size, align = 4) {
    const u = this.u8, end = Math.min(this.freeEnd, u.length);
    // continue after the previous allocation (falls back to a full scan if nothing fits there)
    if (this._hint && this._hint > this.freeStart) {
      const saved = this.freeStart; this.freeStart = this._hint; this._hint = 0;
      try { const o = this.alloc(size, align); this.freeStart = saved; this._hint = o + size + 1; return o; }
      catch (e) { this.freeStart = saved; }
    }
    let i = this.freeStart;
    while (i + size <= end) {
      if (i % align) { i += align - (i % align); continue; }
      if (u[i - 1] !== 0xFF) { i += align; continue; }
      let j = 0;
      while (j < size && u[i + j] === 0xFF) j++;
      if (j === size) {
        // keep one guard 0xFF after the block
        if (i + size < end && u[i + size] === 0xFF) return i;
      }
      i += Math.max(align, j + 1);
    }
    throw new Error('No free space for ' + size + ' bytes. Expand the ROM or free some space.');
  }
  // Write data somewhere free, return the offset.
  writeNew(data, align = 4) { const o = this.alloc(data.length, align); this.write(o, data); this._hint = o + data.length + 1; return o; }
  // Write data in place if it fits in oldLen bytes, else elsewhere and repoint `ptrLocs`.
  replaceData(oldOff, oldLen, data, ptrLocs, fillOld = false) {
    if (data.length <= oldLen) {
      this.write(oldOff, data);
      for (let i = data.length; i < oldLen; i++) this.u8[i + oldOff] = 0xFF;
      this.changed();
      return oldOff;
    }
    const n = this.writeNew(data);
    for (const p of ptrLocs) this.wptr(p, n);
    if (fillOld) for (let i = 0; i < oldLen; i++) this.u8[oldOff + i] = 0xFF;
    return n;
  }
  onChange(fn) { this.listeners.push(fn); }
  changed() { this.dirty = true; for (const f of this.listeners) f(); }

  // IPS patch of all differences vs. the originally loaded ROM (only for ROMs <= 16MB).
  makeIPS() {
    const a = this.original, b = this.u8, out = [0x50, 0x41, 0x54, 0x43, 0x48];
    if (b.length > 0x1000000) throw new Error('IPS only supports ROMs up to 16MB');
    let i = 0;
    while (i < b.length) {
      if (i < a.length && a[i] === b[i]) { i++; continue; }
      let start = i; if (start === 0x454F46) start--; // avoid "EOF" offset
      let end = i + 1;
      while (end < b.length && end - start < 0xFFFF && (end >= a.length || a[end] !== b[end])) end++;
      out.push((start >> 16) & 0xFF, (start >> 8) & 0xFF, start & 0xFF, ((end - start) >> 8) & 0xFF, (end - start) & 0xFF);
      for (let k = start; k < end; k++) out.push(b[k]);
      i = end;
    }
    out.push(0x45, 0x4F, 0x46);
    return new Uint8Array(out);
  }
}

// ---------- LZ77 (GBA BIOS type 0x10) ----------
const LZ = {
  // Returns {data, srcLen} or null if invalid.
  decompress(u8, off, maxOut = 0x40000) {
    if (u8[off] !== 0x10) return null;
    const size = u8[off + 1] | (u8[off + 2] << 8) | (u8[off + 3] << 16);
    if (size === 0 || size > maxOut) return null;
    const out = new Uint8Array(size);
    let src = off + 4, dst = 0;
    while (dst < size) {
      if (src >= u8.length) return null;
      const flags = u8[src++];
      for (let b = 0; b < 8 && dst < size; b++) {
        if (flags & (0x80 >> b)) {
          if (src + 1 >= u8.length) return null;
          const b1 = u8[src++], b2 = u8[src++];
          const len = (b1 >> 4) + 3, disp = (((b1 & 0xF) << 8) | b2) + 1;
          if (disp > dst) return null;
          for (let k = 0; k < len && dst < size; k++, dst++) out[dst] = out[dst - disp];
        } else {
          if (src >= u8.length) return null;
          out[dst++] = u8[src++];
        }
      }
    }
    return { data: out, srcLen: src - off };
  },
  // VRAM-safe compression (no displacement of 1).
  compress(data) {
    const out = [0x10, data.length & 0xFF, (data.length >> 8) & 0xFF, (data.length >> 16) & 0xFF];
    let pos = 0;
    while (pos < data.length) {
      const flagPos = out.length; out.push(0); let flags = 0;
      for (let b = 0; b < 8 && pos < data.length; b++) {
        let bestLen = 0, bestDisp = 0;
        const maxDisp = Math.min(pos, 0x1000);
        for (let disp = 2; disp <= maxDisp; disp++) {
          let len = 0;
          while (len < 18 && pos + len < data.length && data[pos + len] === data[pos - disp + len]) len++;
          if (len > bestLen) { bestLen = len; bestDisp = disp; if (len === 18) break; }
        }
        if (bestLen >= 3) {
          flags |= 0x80 >> b;
          const d = bestDisp - 1;
          out.push(((bestLen - 3) << 4) | (d >> 8), d & 0xFF);
          pos += bestLen;
        } else out.push(data[pos++]);
      }
      out[flagPos] = flags;
    }
    while (out.length % 4) out.push(0);
    return new Uint8Array(out);
  },
};

// ---------- Colors / palettes / tiles ----------
const Gfx = {
  toRGB(c) { return [(c & 31) << 3 | (c & 31) >> 2, ((c >> 5) & 31) << 3 | ((c >> 5) & 31) >> 2, ((c >> 10) & 31) << 3 | ((c >> 10) & 31) >> 2]; },
  fromRGB(r, g, b) { return (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10); },
  hex(c) { const [r, g, b] = Gfx.toRGB(c); return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); },
  fromHex(h) { const n = parseInt(h.slice(1), 16); return Gfx.fromRGB(n >> 16, (n >> 8) & 255, n & 255); },
  readPal(u8, off, n = 16) { const p = []; for (let i = 0; i < n; i++) p.push((u8[off + i * 2] | (u8[off + i * 2 + 1] << 8)) & 0x7FFF); return p; },
  palBytes(pal) { const b = new Uint8Array(pal.length * 2); pal.forEach((c, i) => { b[i * 2] = c & 0xFF; b[i * 2 + 1] = c >> 8; }); return b; },
  grayPal() { const p = []; for (let i = 0; i < 16; i++) { const v = 31 - Math.round(i * 31 / 15); p.push(v | (v << 5) | (v << 10)); } return p; },
  // 4bpp tile data -> pixel index array (w x h), tiles laid out row-major, w in pixels
  tilesToPixels(data, w, h) {
    const px = new Uint8Array(w * h), tw = w >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = (y >> 3) * tw + (x >> 3), o = t * 32 + (y & 7) * 4 + ((x & 7) >> 1);
      const b = data[o] || 0;
      px[y * w + x] = (x & 1) ? b >> 4 : b & 15;
    }
    return px;
  },
  pixelsToTiles(px, w, h) {
    const out = new Uint8Array(w * h / 2), tw = w >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = (y >> 3) * tw + (x >> 3), o = t * 32 + (y & 7) * 4 + ((x & 7) >> 1);
      out[o] |= (x & 1) ? (px[y * w + x] & 15) << 4 : px[y * w + x] & 15;
    }
    return out;
  },
  // draw indexed pixels to an ImageData
  toImageData(px, w, h, pal, transparent0 = false) {
    const img = new ImageData(w, h), rgb = pal.map(Gfx.toRGB);
    for (let i = 0; i < w * h; i++) {
      const c = rgb[px[i]] || [255, 0, 255];
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = transparent0 && px[i] === 0 ? 0 : 255;
    }
    return img;
  },
};

// ---------- small DOM helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  const tr = typeof T === 'function' ? T : x => x;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if ((k === 'title' || k === 'placeholder') && typeof v === 'string') e.setAttribute(k, tr(v));
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(typeof k === 'string' && tag !== 'textarea' && tag !== 'pre' && tag !== 'code' ? tr(k) : k));
  return e;
}
const hex = (n, d = 6) => '0x' + n.toString(16).toUpperCase().padStart(d, '0');
function toast(msg, kind = 'ok') {
  const t = h('div', { class: 'toast ' + kind }, msg);
  $('#toasts').append(t); setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
}
// a yes / no question in the page (the browser's own confirm() is blocked in embedded windows, e.g. the EXE)
// -> Promise<boolean>. opts: { ok, cancel, danger }
function ask(msg, opts = {}) {
  const tr = typeof T === 'function' ? T : x => x;
  return new Promise(res => {
    const done = v => { back.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    const okb = h('button', { class: opts.danger ? 'danger' : 'primary', onclick: () => done(true) }, opts.ok || tr('Yes'));
    const back = h('div', { class: 'modal-back ask-back', onclick: e => { if (e.target === back) done(false); } },
      h('div', { class: 'panel modal ask' }, h('p', { dir: 'auto' }, msg), h('div', { class: 'row ask-btns' }, okb, h('button', { onclick: () => done(false) }, opts.cancel || tr('Cancel')))));
    document.body.append(back); document.addEventListener('keydown', key, true); okb.focus();
  });
}
function download(data, name, type = 'application/octet-stream') {
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
function parseNum(s) { s = String(s).trim(); return /^0x/i.test(s) ? parseInt(s, 16) : parseInt(s, 10); }
function makeSelect(options, value, onchange) {
  const s = h('select', { onchange: () => onchange && onchange(+s.value) });
  options.forEach((label, i) => s.append(h('option', { value: i }, i + ': ' + (typeof T === 'function' ? T(label) : label))));
  s.value = value; return s;
}
