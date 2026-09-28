"""Import Classic zhCN aura tooltips, separate from cast/ability descriptions.

Run from the repository root. Responses are cached for resumable imports.
"""
import concurrent.futures
import html
import json
from pathlib import Path
import re
import subprocess
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'docs/research/import/buff-tooltips'
OUTPUT = ROOT / 'packages/game-data/data/buff-tooltips-zhCN.json'
QUERY = """
import {spells,classAbilities,talents,items} from './packages/game-domain/src/rules/catalog.js';
const ids=new Set(Object.values(classAbilities).flat().map(a=>a.spellId));
for(const t of Object.values(talents))for(const e of t.rankEffects)ids.add(e.spellId);
for(const item of Object.values(items))for(let n=1;n<=5;n++)if(item['spellid_'+n]>0)ids.add(item['spellid_'+n]);
for(const id of ids)for(let n=1;n<=3;n++){const trigger=spells[id]?.['EffectTriggerSpell'+n];if(trigger)ids.add(trigger);}
console.log(JSON.stringify([...ids].filter(id=>[1,2,3].some(n=>[6,27,35,65].includes(spells[id]?.['Effect'+n]))).sort((a,b)=>a-b)));
"""

def plain(value):
    value = re.sub(r'<br\s*/?>', '\n', value, flags=re.I)
    return html.unescape(re.sub(r'<[^>]+>', '', value)).replace('\u200b', '').strip()


def fetch(spell_id):
    path = CACHE / f'{spell_id}.json'
    url = f'https://nether.wowhead.com/classic/tooltip/spell/{spell_id}?locale=4'
    if path.exists():
        response = json.loads(path.read_text())
    else:
        try:
            with urllib.request.urlopen(url, timeout=30) as result:
                response = json.load(result)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            response = {'error': 404}
        path.write_text(json.dumps(response, ensure_ascii=False) + '\n')
    buff = response.get('buff', '')
    tables = re.findall(r'<table>(.*?)</table>', buff, re.S)
    if len(tables) < 2:
        return spell_id, None
    # The last table is the aura body; duration is rendered from the live clock.
    body = re.sub(r'<span class="q">.*?</span>', '', tables[-1], flags=re.S)
    description = plain(body)
    if not description:
        return spell_id, None
    dispel = re.search(r'<th[^>]*>(.*?)</th>', buff, re.S)
    return spell_id, {'description': description, 'dispel': plain(dispel[1]) if dispel else ''}


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    ids = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', QUERY], cwd=ROOT))
    rows, errors = {}, []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(fetch, spell_id): spell_id for spell_id in ids}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                spell_id, entry = future.result()
                if entry:
                    rows[str(spell_id)] = entry
            except Exception as error:
                errors.append((futures[future], str(error)))
            if index % 200 == 0:
                print(f'{index}/{len(ids)} fetched; {len(rows)} aura descriptions', flush=True)
    if errors:
        raise RuntimeError(f'Rerun to retry failed requests: {errors}')
    OUTPUT.write_text(json.dumps({'source': 'https://nether.wowhead.com/classic/tooltip/spell/{id}?locale=4', 'spells': dict(sorted(rows.items(), key=lambda row: int(row[0])))}, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote {len(rows)} aura descriptions', flush=True)

if __name__ == '__main__':
    main()
