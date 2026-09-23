"""Complete missing item icons using Classic identities and pinned client art.

Only display metadata is imported. ClassicDB remains authoritative for stats.
"""
import concurrent.futures
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/world-item-assets'
COMMIT='b852b560442b31579e77ef3967b3c2d594832da8'
OUT=ROOT/'packages/game-data/data/world-item-assets.json'

def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'wow-sim-reference-import/1.0'}),timeout=25) as response:return response.read()
        except Exception:
            if attempt==2:raise
            time.sleep(1)

def main():
    CACHE.mkdir(parents=True,exist_ok=True)
    tree=json.loads(Path('C:/workspace/wow-sim-research/icons/source-tree.json').read_text(encoding='utf-8-sig'))
    paths={r['path'].lower():r for r in tree['tree'] if r['type']=='blob'}
    ids=json.loads((ROOT/'.cache/world-item-asset-scope.json').read_text())
    data=json.loads(OUT.read_text(encoding='utf8')) if OUT.exists() else {'revision':COMMIT,'items':{}}
    failures=[]
    def load(entry):
        url=f'https://nether.wowhead.com/classic/tooltip/item/{entry}?locale=4'
        path=CACHE/f'{entry}.json'
        raw=path.read_bytes() if path.exists() else fetch(url)
        tooltip=json.loads(raw);icon=tooltip.get('icon','').lower()
        if not re.fullmatch('[a-z0-9_]+',icon):raise ValueError('Missing icon identity')
        path.write_bytes(raw)
        source=paths.get(icon+'.png')
        if not source:raise ValueError(f'Icon outside pinned archive: {icon}')
        dest=ROOT/f'apps/web/public/icons/assets/{icon}.png'
        image=dest.read_bytes() if dest.exists() else fetch(f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{COMMIT}/ICONS/{source["path"]}')
        if hashlib.sha1(b'blob '+str(len(image)).encode()+b'\0'+image).hexdigest()!=source['sha']:raise ValueError('Icon hash mismatch')
        dest.write_bytes(image)
        return {'icon':f'assets/{icon}.png','sourceUrl':url,'tooltipSha256':hashlib.sha256(raw).hexdigest(),'gitBlobSha1':source['sha']}
    with concurrent.futures.ThreadPoolExecutor(10) as pool:
        jobs={pool.submit(load,entry):entry for entry in ids if str(entry) not in data['items']}
        for job in concurrent.futures.as_completed(jobs):
            entry=jobs[job]
            try:data['items'][str(entry)]=job.result()
            except Exception as error:failures.append({'entry':entry,'error':str(error)})
            if len(data['items'])%50==0:
                OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
                print('Imported',len(data['items']),'failures',len(failures),flush=True)
    OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (CACHE/'failures.json').write_text(json.dumps(failures,indent=2))
    print('Done',len(data['items']),'items;',len(failures),'failures',flush=True)

if __name__=='__main__':main()
