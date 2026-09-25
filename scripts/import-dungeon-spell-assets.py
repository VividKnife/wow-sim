"""Display-only Chinese names and pinned icons for dungeon encounter spells."""
import concurrent.futures,hashlib,json,re
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
spec=spec_from_file_location('assets',Path(__file__).with_name('import-world-item-assets.py'))
assets=module_from_spec(spec);spec.loader.exec_module(assets)
ROOT=assets.ROOT;CACHE=ROOT/'.cache/dungeon-spell-assets';CACHE.mkdir(exist_ok=True)
tree=json.loads(Path('C:/workspace/wow-sim-research/icons/source-tree.json').read_text(encoding='utf-8-sig'))
paths={r['path'].lower():r for r in tree['tree'] if r['type']=='blob'}
ids=json.loads((ROOT/'.cache/dungeon-spell-scope.json').read_text())
def load(entry):
    path=CACHE/f'{entry}.json';url=f'https://nether.wowhead.com/classic/tooltip/spell/{entry}?locale=4'
    raw=path.read_bytes() if path.exists() else assets.fetch(url);tip=json.loads(raw);path.write_bytes(raw)
    icon=tip.get('icon','').lower()
    if icon.startswith('classic_') and icon+'.png' not in paths:icon=icon.removeprefix('classic_')
    row=paths.get(icon+'.png')
    if not re.fullmatch('[a-z0-9_]+',icon) or not row:raise ValueError(f'Missing pinned icon {entry}:{icon}')
    dest=ROOT/f'apps/web/public/icons/assets/{icon}.png'
    image=dest.read_bytes() if dest.exists() else assets.fetch(f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{assets.COMMIT}/ICONS/{row["path"]}')
    assert hashlib.sha1(b'blob '+str(len(image)).encode()+b'\0'+image).hexdigest()==row['sha']
    dest.write_bytes(image)
    return str(entry),{'nameZhCN':tip['name'],'icon':f'assets/{icon}.png','sourceUrl':url,'tooltipSha256':hashlib.sha256(raw).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(6) as pool:rows=list(pool.map(load,ids))
(ROOT/'packages/game-data/data/dungeon-spell-assets.json').write_text(json.dumps({'revision':assets.COMMIT,'spells':dict(rows)},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Imported',len(rows),'spell names and icons')
