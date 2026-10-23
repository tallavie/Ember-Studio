// Interface language (Hebrew / English). The English text is the key: T('Save') -> 'שמירה'.
// h() (rom.js) translates its text children and title / placeholder attributes automatically, so most of the
// interface needs no code changes - only an entry in js/i18n_he.js. Missing entries stay in English.
'use strict';

const I18N = {
  // a choice kept in the browser; else Hebrew in the program (the EXE / ember/server.py on this computer) and English online
  lang: (() => { const def = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? 'he' : 'en'; try { return localStorage.getItem('ember-lang') || def; } catch (e) { return def; } })(),
  dicts: { he: {} },
  missing: new Set(),
  set(lang) {
    this.lang = lang;
    try { localStorage.setItem('ember-lang', lang); } catch (e) { /* private mode */ }
    this.apply();
  },
  apply() {
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'he' ? 'rtl' : 'ltr';
  },
  // translate static HTML (index.html): text of leaf elements and their title attributes
  translateDom(root = document.body) {
    if (this.lang === 'en') return;
    for (const el of root.querySelectorAll('button, label, span, h1, h2, h3, a, option')) {
      if (el.children.length === 0 && el.textContent.trim()) { const t = el.textContent.trim(), v = T(t); if (v !== t) el.textContent = v; }
      if (el.title) el.title = T(el.title);
    }
  },
};
function T(s) {
  if (I18N.lang === 'en' || typeof s !== 'string') return s;
  const d = I18N.dicts[I18N.lang], v = d && d[s];
  if (v != null) return v;
  const t = s.trim(); if (t !== s && d && d[t] != null) return s.replace(t, d[t]);   // 'Box width ' → the dictionary has 'Box width'
  if (/[A-Za-z]{2}/.test(s) && s.length < 300) I18N.missing.add(s);
  return s;
}
// T with {placeholders}: Tf('Saved {n} areas', { n: 3 })
function Tf(s, vars) { return T(s).replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m); }
