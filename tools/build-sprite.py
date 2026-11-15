#!/usr/bin/env python3
"""يبني سبرايت أيقونات Lucide (ISC) ويحقنه داخل index.html بين علامتي sprite.

الاستخدام: python3 tools/build-sprite.py /path/to/node_modules/lucide-static/icons
(npm i lucide-static)  — الأيقونات مضمّنة في الصفحة فتعمل أوفلاين وبلا طلبات.
للاستخدام في الواجهة: <svg class="i"><use href="#i-NAME"/></svg>  أو Utils.icon('NAME')
"""
import re, sys, os

NAMES = """search x share-2 compass navigation layers route car locate-fixed map-pin tent droplet
triangle-alert flag check circle-check circle-alert volume-2 volume-x arrow-left-right undo-2 arrow-up
arrow-up-right arrow-up-left arrow-down-right arrow-down-left arrow-left arrow-right refresh-cw merge
mountain moon building-2 satellite trees cloud-download trash-2 eye download upload link-2 bookmark
pause play square info signpost sun sprout folder-open map flag-triangle-right save map-pinned
corner-up-right ban clipboard-check""".split()

src = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
symbols = []
for n in NAMES:
    svg = open(os.path.join(src, n + '.svg')).read()
    inner = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    inner = re.sub(r'\s+', ' ', inner).strip()
    symbols.append(f'<symbol id="i-{n}" viewBox="0 0 24 24">{inner}</symbol>')

sprite = (
    '<!-- sprite:start — أيقونات Lucide (ISC) — مُولَّد بـ tools/build-sprite.py -->\n'
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n'
    + '\n'.join(symbols)
    + '\n</svg>\n<!-- sprite:end -->'
)
p = os.path.join(root, 'index.html')
html = open(p).read()
if '<!-- sprite:start' in html:
    html = re.sub(r'<!-- sprite:start.*?<!-- sprite:end -->', lambda m: sprite, html, flags=re.S)
else:
    html = html.replace('<body class="h-dvh w-full overflow-hidden">', '<body class="h-dvh w-full overflow-hidden">\n    ' + sprite, 1)
open(p, 'w').write(html)
print('✓', len(NAMES), 'icons')
