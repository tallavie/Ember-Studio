# Builds the user guides: screenshots straight from the editor, then Markdown -> HTML -> PDF (Microsoft Edge, headless).
#   D:\GBA\.venv-ember\Scripts\python editor\docs\manual\build.py            # shots + both PDFs
#   ... build.py --pdf-only                                                    # keep the screenshots
#   ... build.py --shots he story trainers                                     # only these shots (one language)
# Needs: markdown, websocket-client (pip), Edge, and the demo projects (projects/docs_he, projects/docs_en).
import os, sys, json, time, base64, subprocess, tempfile, shutil, urllib.request, re
import markdown, markdown.extensions.toc
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'tests'))
from cdp import Edge

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
ROOT = os.path.dirname(APP)
PORT, CDP_PORT = 8792, 9333
PROJECTS = {'he': os.path.join(ROOT, 'projects', 'docs_he'), 'en': os.path.join(ROOT, 'projects', 'docs_en')}
SHOTS = ['home', 'header', 'wizard-basics', 'wizard-starters', 'wizard-gyms', 'map-editor', 'map-collision', 'map-objects', 'object-trainer',
         'object-item', 'object-blocks', 'sprite-gallery', 'world', 'world-wild', 'tiles', 'story', 'story-choice', 'story-add', 'block-palette', 'story-original', 'story-flow', 'story-place', 'scene',
         'pokemon', 'gifts', 'legends', 'trainers', 'items', 'item-icon', 'shops', 'moves', 'tms', 'text', 'hebrew', 'graphics', 'character', 'music', 'doctor', 'emulator']
TITLES = {'he': 'Ember Studio – מדריך למשתמש', 'en': 'Ember Studio – User Guide'}
OUT = {'he': os.path.join(APP, 'docs', 'Ember-Studio-Guide-he.pdf'), 'en': os.path.join(APP, 'docs', 'Ember-Studio-Guide-en.pdf')}


def shots(langs, names):
    srv = subprocess.Popen([sys.executable, '-X', 'utf8', os.path.join(APP, 'ember', 'server.py'), str(PORT)])
    time.sleep(2)
    edge = Edge()
    try:
        for lang in langs:
            d = os.path.join(HERE, 'img', lang); os.makedirs(d, exist_ok=True); missing = set()
            for name in names:
                url = 'http://127.0.0.1:%d/index.html?docshot=%s&lang=%s&project=%s' % (PORT, name, lang, urllib.request.quote(PROJECTS[lang]))
                edge.cmd('Page.navigate', url=url)
                ready = None
                for _ in range(240):
                    time.sleep(0.5)
                    try: ready = edge.eval('window.__shotReady ? JSON.stringify(window.__shotReady) : null')
                    except Exception: ready = None
                    if ready: break
                if not ready: print('  %s/%s: not ready (skipped)' % (lang, name)); continue
                info = json.loads(ready)
                missing.update(info.get('missing') or [])
                if info.get('error'): print('  %s/%s: %s' % (lang, name, info['error']))
                clip = None
                if info.get('clip'):
                    r = edge.eval('(() => { const e = document.querySelector(%s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; })()' % json.dumps(info['clip']))
                    if r and r[2] > 10: clip = {'x': max(0, r[0] - 6), 'y': max(0, r[1] - 6), 'width': min(1440, r[2] + 12), 'height': min(900, r[3] + 12), 'scale': 1}
                res = edge.cmd('Page.captureScreenshot', format='png', **({'clip': clip} if clip else {}))
                open(os.path.join(d, name + '.png'), 'wb').write(base64.b64decode(res['data']))
                print('  %s/%s' % (lang, name))
            if lang != 'en': open(os.path.join(HERE, 'missing_' + lang + '.txt'), 'w', encoding='utf8').write('\n'.join(sorted(missing)))
    finally:
        edge.close(); srv.kill()


CSS = '''
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #1d2230; }
h1 { font-size: 22pt; color: #b33a12; border-bottom: 3px solid #f0a050; padding-bottom: 4px; page-break-before: always; margin-top: 0; }
h2 { font-size: 15pt; color: #2a3a8a; margin-top: 18px; }
h3 { font-size: 12pt; color: #333; }
p, li { text-align: start; }
img { max-width: 100%; border: 1px solid #ccd; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
figure { margin: 10px 0 14px; text-align: center; page-break-inside: avoid; }
figcaption { font-size: 9pt; color: #666; margin-top: 4px; }
code, kbd { font-family: Consolas, monospace; background: #f1f2f6; padding: 0 4px; border-radius: 3px; font-size: 9.5pt; }
kbd { border: 1px solid #ccd; }
pre { background: #f1f2f6; padding: 8px; border-radius: 6px; direction: ltr; text-align: left; white-space: pre-wrap; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; page-break-inside: avoid; }
th, td { border: 1px solid #ccd; padding: 4px 7px; font-size: 9.5pt; text-align: start; vertical-align: top; }
th { background: #f4ecff; }
blockquote { margin: 10px 0; padding: 6px 12px; background: #fff7e6; border-inline-start: 4px solid #f0a050; border-radius: 4px; }
.cover { height: 250mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.cover img { border: none; box-shadow: none; width: 110px; }
.cover h1 { border: none; page-break-before: avoid; font-size: 34pt; color: #b33a12; margin: 10px 0 4px; }
.cover .sub { font-size: 15pt; color: #555; }
.cover .ver { margin-top: 30px; color: #888; }
.tocpage { page-break-before: always; }
.tocpage h1 { page-break-before: avoid; }
.tocpage ul { list-style: none; padding-inline-start: 0; margin: 0; }
.tocpage > .toc > ul > li { margin: 7px 0 2px; font-weight: 600; }
.tocpage li li { padding-inline-start: 18px; font-size: 9.5pt; font-weight: 400; margin: 1px 0; }
.tocpage a { color: #1d2230; text-decoration: none; }
'''


def pdf(lang):
    src = open(os.path.join(HERE, lang + '.md'), encoding='utf8').read()
    src = re.sub(r'(?m)^  (- |\d+\. )', r'    \1', src)     # Python-Markdown nests lists at 4 spaces; the sources use 2
    md = markdown.Markdown(extensions=['tables', 'toc', 'attr_list', 'sane_lists', 'md_in_html'], extension_configs={'toc': {'toc_depth': '1-2', 'slugify': markdown.extensions.toc.slugify_unicode}})
    body = md.convert(src)
    # an image alone in a paragraph becomes a figure with its alt text as the caption
    body = re.sub(r'<p><img alt="([^"]*)" src="([^"]+)"\s*/?></p>', lambda m: '<figure><img src="%s" alt="%s"><figcaption>%s</figcaption></figure>' % (m.group(2), m.group(1), m.group(1)), body)
    import server
    ver = server.VERSION
    toc_title = 'תוכן העניינים' if lang == 'he' else 'Contents'
    html = '''<!doctype html><html lang="%s" dir="%s"><head><meta charset="utf-8"><title>%s</title><style>%s</style></head><body>
<div class="cover"><img src="../../ember/icon.png"><h1>Ember Studio</h1><div class="sub">%s</div><div class="ver">%s %s</div></div>
<div class="tocpage"><h1>%s</h1>%s</div>
%s</body></html>''' % (lang, 'rtl' if lang == 'he' else 'ltr', TITLES[lang], CSS, 'מדריך למשתמש' if lang == 'he' else 'User Guide',
                       'גרסה' if lang == 'he' else 'Version', ver, toc_title, md.toc, body)
    path = os.path.join(HERE, 'guide_' + lang + '.html'); open(path, 'w', encoding='utf8').write(html)
    edge = Edge()
    try:
        edge.cmd('Page.navigate', url='file:///' + path.replace('\\', '/'))
        time.sleep(3)
        # left to right, so the page numbers read "9 / 51" in the Hebrew guide too
        foot = '<div dir="ltr" style="font-size:8px;width:100%%;text-align:center;color:#888;font-family:Segoe UI">Ember Studio · <span dir="auto">%s</span> · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' % ('מדריך למשתמש' if lang == 'he' else 'User Guide')
        res = edge.cmd('Page.printToPDF', printBackground=True, displayHeaderFooter=True, headerTemplate='<div></div>', footerTemplate=foot,
                       preferCSSPageSize=True, marginTop=0.7, marginBottom=0.8)
        os.makedirs(os.path.dirname(OUT[lang]), exist_ok=True)
        open(OUT[lang], 'wb').write(base64.b64decode(res['data']))
        print('PDF', OUT[lang])
    finally:
        edge.close()


if __name__ == '__main__':
    sys.path.insert(0, os.path.join(APP, 'ember'))
    a = sys.argv[1:]
    if '--shots' in a:
        i = a.index('--shots'); lang = a[i + 1]; names = a[i + 2:] or SHOTS
        shots([lang], names); sys.exit(0)
    if '--pdf-only' not in a: shots(['he', 'en'], SHOTS)
    for lang in ('he', 'en'):
        if os.path.isfile(os.path.join(HERE, lang + '.md')): pdf(lang)
