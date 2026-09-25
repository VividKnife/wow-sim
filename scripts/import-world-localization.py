"""Import Chinese text from the same pinned ClassicDB commit, without executing SQL."""
import hashlib,json,re,urllib.request
from pathlib import Path
from classic_sql import SOURCE_COMMIT,INSERT,tuples_at

ROOT=Path(__file__).resolve().parents[1]
cache=ROOT/'.cache/source-data/world-locales';cache.mkdir(parents=True,exist_ok=True)
source=json.loads((ROOT/'packages/game-data/data/world-reference.json').read_text(encoding='utf8'))
classic=json.loads((ROOT/'packages/game-data/data/classic-reference.json').read_text(encoding='utf8'))
def ids(table):
    # Runtime catalog merges both bundles. Filtering to world-reference alone
    # silently drops translations for the original quest and item tables.
    return {r[0] for r in json.loads(source['tableData'][table])} | {r[0] for r in classic['tables'].get(table, [])}
result={'sources':[],'quests':{},'npcs':{},'items':{},'objects':{}}
checksums={'locales_quest.sql':'22799e4cdac36aacaed928803d911424e84c8ae5081db6584939b2c6d74b3233','locales_creature.sql':'6583930dc1bee7ef43eb434dcc933a909a4647f44dc1b3cc060818ce05ba1def','locales_item.sql':'e1a5f654c2bae0815470852643a790d0bdcf35b8725d2570c3e1f8b40e267f21','locales_gameobject.sql':'bbee8c3ca416b4a8818112d6b0c2ffe10b5daac3df2306496f6dcfa0f8468c27'}
for file,kind,table in [('locales_quest.sql','quests','quest_template'),('locales_creature.sql','npcs','creature_template'),('locales_item.sql','items','item_template'),('locales_gameobject.sql','objects','gameobject_template')]:
    path=cache/file
    url=f'https://raw.githubusercontent.com/cmangos/classic-db/{SOURCE_COMMIT}/locales/Chinese/{file}'
    if not path.exists():path.write_bytes(urllib.request.urlopen(url,timeout=60).read())
    raw=path.read_bytes();sql=raw.decode('utf8');wanted=ids(table)
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=checksums[file]:raise ValueError(f'Locale checksum mismatch: {file}')
    result['sources'].append({'url':url,'sha256':digest})
    for m in INSERT.finditer(sql):
        columns=re.findall(r'`([^`]+)`',m[2])
        for values in tuples_at(sql,m.end()):
            row=dict(zip(columns,values));entry=values[0]
            if entry not in wanted:continue
            if kind=='quests':
                details=row.get('Details_loc4') or ''
                if entry in (49,50,51,53):details=re.split(r'\$b\$b(?=[A-Za-z])',details,maxsplit=1)[0]
                result[kind][str(entry)]={'nameZhCN':row.get('Title_loc4'),'objectiveSummaryZhCN':row.get('Objectives_loc4'),'detailsZhCN':details.replace('$b','$B')}
            elif kind=='items':result[kind][str(entry)]={'nameZhCN':row.get('name_loc4'),'descriptionZhCN':row.get('description_loc4')}
            else:result[kind][str(entry)]={'nameZhCN':row.get('name_loc4')}
    print(file,digest,len(result[kind]))
(ROOT/'packages/game-data/data/world-localization.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
