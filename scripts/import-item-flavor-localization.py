"""Fetch Chinese item flavor text for runtime items that still have English text."""
import concurrent.futures
import hashlib
import html
import json
import re
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'packages/game-data/data/item-flavor-localization.json'
HAN = re.compile(r'[\u3400-\u9fff]')
FLAVOR = re.compile(r'<span class="q">&quot;(.*?)&quot;</span>')
ids = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {items} from './packages/game-domain/src/rules/catalog.js'; console.log(JSON.stringify(Object.values(items).filter(i=>i.description&&!/[\\u3400-\\u9fff]/.test(i.description)).map(i=>i.entry)))",
], cwd=ROOT))
world = json.loads((ROOT / 'packages/game-data/data/world-localization.json').read_text())['items']
ids = [entry for entry in ids if not HAN.search(world.get(str(entry), {}).get('descriptionZhCN') or '')]

def fetch(entry):
    url = f'https://nether.wowhead.com/classic/tooltip/item/{entry}?locale=4'
    raw = urllib.request.urlopen(url, timeout=25).read()
    tooltip = json.loads(raw)['tooltip']
    matches = FLAVOR.findall(tooltip)
    value = html.unescape(matches[-1]) if matches else ''
    return entry, {'descriptionZhCN': value, 'sourceURL': url, 'responseSha256': hashlib.sha256(raw).hexdigest()} if HAN.search(value) else None

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    result = {str(entry): value for entry, value in pool.map(fetch, ids) if value}
OUTPUT.write_text(json.dumps({'items': result}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Chinese item flavor text: {len(result)} items')
