"""Extract the pinned ClassicDB 1.12 MC loot graph and original item records.

Loot chances/attributes come exclusively from the checksummed SQL archive.
Classic (not SoD) tooltips supply localized display text and set descriptions.
"""
import concurrent.futures, hashlib, html, json, re, urllib.request
from pathlib import Path
from classic_sql import read_sql, SOURCE_COMMIT, SOURCE_SHA256, INSERT, tuples_at

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/molten-core-loot'
CACHE.mkdir(parents=True, exist_ok=True)
BOSSES = {'lucifron':12118,'magmadar':11982,'gehennas':12259,'garr':12057,'baron-geddon':12056,'shazzrah':12264,'sulfuron':12098,'golemagg':11988,'ragnaros':11502}
TRASH = {11658,11659,11671,11673,11669,12101,11665,11668,11661,11662,12076}
_, tables = read_sql(ROOT / '.cache/source-data/ClassicDB_1_12_1_z2815.sql.gz', {'creature_template','creature_loot_template','gameobject_loot_template','reference_loot_template','item_template','spell_template','conditions'})
creatures = {r['Entry']:r for r in tables['creature_template']}
loot_ids = {entry:creatures[entry]['LootId'] for entry in set(BOSSES.values()) | TRASH}
selected = {'creature_loot_template':[r for r in tables['creature_loot_template'] if r['entry'] in loot_ids.values()], 'gameobject_loot_template':[r for r in tables['gameobject_loot_template'] if r['entry']==16719]}
refs, item_ids = set(), set()
queue = sum(selected.values(), [])[:]
while queue:
    row = queue.pop()
    if row['mincountOrRef'] > 0: item_ids.add(row['item'])
    elif -row['mincountOrRef'] not in refs:
        ref = -row['mincountOrRef']; refs.add(ref)
        queue.extend(r for r in tables['reference_loot_template'] if r['entry']==ref)
selected['reference_loot_template'] = [r for r in tables['reference_loot_template'] if r['entry'] in refs]
all_items = {r['entry']:r for r in tables['item_template']}
# Include complete sets for their tooltip piece lists, even when T2 pieces drop in BWL.
set_ids = {all_items[i]['itemset'] for i in item_ids if all_items[i]['itemset']}
item_ids.update(r['entry'] for r in all_items.values() if r['itemset'] in set_ids)
selected['item_template'] = [all_items[i] for i in sorted(item_ids)]
assets, sets = {}, {}
locale_sql = (ROOT / '.cache/source-data/world-locales/locales_item.sql').read_text(encoding='utf8')
assert hashlib.sha256(locale_sql.encode()).hexdigest() == 'e1a5f654c2bae0815470852643a790d0bdcf35b8725d2570c3e1f8b40e267f21'
for match in INSERT.finditer(locale_sql):
    columns = re.findall(r'`([^`]+)`', match[2])
    for values in tuples_at(locale_sql, match.end()):
        row = dict(zip(columns, values))
        if values[0] in item_ids: assets[str(values[0])] = {'nameZhCN':row.get('name_loc4')}

def clean(text): return html.unescape(re.sub('<[^>]*>', '', text)).replace('\x08','').strip()
def tooltip(entry):
    url = f'https://nether.wowhead.com/classic/tooltip/item/{entry}?locale=4'
    path = CACHE / f'{entry}.json'
    if not path.exists(): path.write_bytes(urllib.request.urlopen(url, timeout=30).read())
    raw = path.read_bytes(); data = json.loads(raw); tip = data['tooltip']
    result = {'nameZhCN':data['name'],'icon':data['icon'],'sourceUrl':url,'sha256':hashlib.sha256(raw).hexdigest()}
    result['effects'] = {spell:clean(text) for spell,text in re.findall(r'<!--useEffect:0:\d+--><a[^>]*spell=(\d+)[^>]*>(.*?)</a>', tip)}
    match = re.search(r'item-set=(\d+)[^>]*>(.*?)</a>', tip)
    item_set = None
    if match:
        item_set = {'id':int(match[1]), 'name':clean(match[2]), 'pieces':[int(i) for i in re.findall(r'<!--si(\d+)(?::\d+)?-->', tip)], 'bonuses':[{'count':int(n),'spellId':int(spell),'text':clean(text)} for n,spell,text in re.findall(r'\((\d+)\)[^<]*<a[^>]*spell=(\d+)[^>]*>(.*?)</a>',tip)]}
        assert item_set['pieces'] and item_set['bonuses'], f'Incomplete set {entry}'
    return entry, result, item_set

display_ids = {i for i in item_ids if all_items[i]['Quality']>=4}
display_ids.update(next(i for i in item_ids if all_items[i]['itemset']==s) for s in set_ids)
display_ids.update({16665,18703,18564,18563,17204,17010,17011,17012,11382})
with concurrent.futures.ThreadPoolExecutor(10) as pool:
    for entry, result, item_set in pool.map(tooltip, sorted(display_ids)):
        assets.setdefault(str(entry), {}).update(result)
        if item_set: sets[str(item_set['id'])] = item_set
spell_ids = {r[f'spellid_{n}'] for r in selected['item_template'] for n in range(1,6) if r[f'spellid_{n}']>0}
spell_ids.update(b['spellId'] for s in sets.values() for b in s['bonuses'])
spells = {r['Id']:r for r in tables['spell_template']}
while True:
    before = len(spell_ids)
    for i in list(spell_ids):
        if i in spells: spell_ids.update(spells[i][f'EffectTriggerSpell{n}'] for n in range(1,4) if spells[i][f'EffectTriggerSpell{n}'])
    if len(spell_ids)==before: break
selected['spell_template'] = [spells[i] for i in sorted(spell_ids) if i in spells]
conditions = {r['condition_id'] for table in selected.values() for r in table if r.get('condition_id')}
selected['conditions'] = [r for r in tables['conditions'] if r['condition_entry'] in conditions]
result = {'sourceCommit':SOURCE_COMMIT,'sourceSha256':SOURCE_SHA256,'version':'Classic 1.12','bossSources':{**{k:{'table':'creature_loot_template','entry':loot_ids[v]} for k,v in BOSSES.items()},'majordomo':{'table':'gameobject_loot_template','entry':16719}}, 'creatureLootIds':loot_ids,'tables':selected,'assets':assets,'sets':sets}
# Use the project's pinned icon archive, never a random equipment placeholder.
icon_commit = 'b852b560442b31579e77ef3967b3c2d594832da8'
tree_path = CACHE / 'icon-tree.json'
if not tree_path.exists():
    tree_path.write_bytes(urllib.request.urlopen(f'https://api.github.com/repos/Gethe/wow-ui-textures/git/trees/{icon_commit}?recursive=1',timeout=30).read())
icon_paths = {r['path'].lower():r for r in json.loads(tree_path.read_bytes())['tree'] if r['type']=='blob'}
def import_icon(icon):
    source = icon_paths['icons/'+icon+'.png']
    dest = ROOT / f'apps/web/public/icons/assets/{icon}.png'
    if not dest.exists(): dest.write_bytes(urllib.request.urlopen(f'https://raw.githubusercontent.com/Gethe/wow-ui-textures/{icon_commit}/{source["path"]}',timeout=30).read())
    image = dest.read_bytes()
    assert hashlib.sha1(b'blob '+str(len(image)).encode()+b'\0'+image).hexdigest()==source['sha']
with concurrent.futures.ThreadPoolExecutor(10) as pool:
    list(pool.map(import_icon, sorted({a['icon'] for a in assets.values() if a.get('icon')})))
result['iconSourceCommit'] = icon_commit
(ROOT / 'packages/game-data/data/molten-core-loot.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
print({k:len(v) for k,v in selected.items()}, 'sets',len(sets), flush=True)
