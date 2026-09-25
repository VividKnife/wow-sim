"""Fill quest prose absent from the pinned SQL and Questie localization sources."""
import concurrent.futures
import hashlib
import html
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'packages/game-data/data/quest-tooltip-localization.json'
HAN = re.compile(r'[\u3400-\u9fff]')
BODY = re.compile(r'<table><tr><td><br\s*/?>(.*?)</td></tr></table>', re.DOTALL)
TAG = re.compile(r'<[^>]+>')
world = json.loads((ROOT / 'packages/game-data/data/world-localization.json').read_text())['quests']
questie = json.loads((ROOT / 'packages/game-data/data/quest-localization-supplement.json').read_text())['quests']
reference = json.loads((ROOT / 'packages/game-data/data/world-reference.json').read_text())
classic = json.loads((ROOT / 'packages/game-data/data/classic-reference.json').read_text())
ids = {row[0] for row in json.loads(reference['tableData']['quest_template'])}
ids.update(row[0] for row in classic['tables']['quest_template'])
missing = [entry for entry in sorted(ids) if any(not HAN.search((world.get(str(entry), {}).get(field) or '') + (questie.get(str(entry), {}).get(field) or '')) for field in ('objectiveSummaryZhCN', 'detailsZhCN'))]

def fetch(entry):
    url = f'https://nether.wowhead.com/classic/tooltip/quest/{entry}?locale=4'
    try:
        raw = urllib.request.urlopen(url, timeout=25).read()
        match = BODY.search(json.loads(raw).get('tooltip', ''))
        if not match:
            return entry, None
        fragment = re.split(r'<span[^>]*>Requirements:</span>', match[1], maxsplit=1)[0]
        fragment = re.sub(r'<br\s*/?>', '\n', fragment)
        text = html.unescape(TAG.sub('', fragment)).strip()
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = text.replace('<name>', '$N').replace('<class>', '$C').replace('<race>', '$R')
        if not HAN.search(text):
            return entry, None
        fields = {}
        for field in ('objectiveSummaryZhCN', 'detailsZhCN'):
            if not HAN.search((world.get(str(entry), {}).get(field) or '') + (questie.get(str(entry), {}).get(field) or '')):
                fields[field] = text
        return entry, {**fields, 'sourceURL': url, 'responseSha256': hashlib.sha256(raw).hexdigest()}
    except (OSError, ValueError):
        return entry, None

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    result = {str(entry): value for entry, value in pool.map(fetch, missing) if value}
OUTPUT.write_text(json.dumps({'quests': result}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'Quest tooltips: {len(result)} of {len(missing)} missing records filled')
