"""Import the eight Classic races, both sexes and nine class presentation outfits.

Outfits are original starter garments, independent of inventory item stats.
Weapons use native hand attachment points. NPCs use their baked native outfits.
"""
import concurrent.futures
import importlib.util
import json
import re
from pathlib import Path

spec=importlib.util.spec_from_file_location('battle',Path(__file__).with_name('import-classic-battle-models.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
ROOT=b.ROOT;OUT=ROOT/'apps/web/public/characters/classic'
MANIFEST=ROOT/'packages/game-data/data/classic-characters-manifest.json'
RACES={1:[1,2,3,4,5,6,7,8],2:[1,3],3:[2,3,4,6,8],4:[1,2,3,4,5,7,8],5:[1,3,4,5,8],7:[2,6,8],8:[1,5,7,8],9:[1,2,5,7],11:[4,6]}
OUTFITS={1:[38,39,40],2:[45,44,43],3:[236,237,40],4:[49,48,40],5:[57,55],7:[6125,237,40],8:[56,55],9:[57,55],11:[6139,55]}
WEAPONS={1:25,2:36,3:37,4:2092,5:35,7:36,8:35,9:35,11:35}

def main():
    data=json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'schemaVersion':1,'copyright':'Blizzard Entertainment artwork, original Classic assets hosted by Wowhead.','appearance':'Class starter outfits; inventory transmog is not applied.','characters':{},'weapons':{}}
    source=json.loads((ROOT/'packages/game-data/data/classic-reference.json').read_text())
    items={v['entry']:v for row in source['tables']['item_template'] if (v:=dict(zip(source['schemas']['item_template'],row)))}
    def identify(item):
        raw=b.fetch(f'items/{item}.html',f'https://www.wowhead.com/classic/item={item}')
        match=re.search(rb'linksButton.dataset.displayId\s*=\s*(\d+)',raw)
        assert match,f'Missing item display: {item}'
        return item,int(match[1])
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        display_ids=dict(pool.map(identify,set(WEAPONS.values())|{i for outfit in OUTFITS.values() for i in outfit}))
    for display in {display_ids[i] for i in WEAPONS.values()}:
        if str(display) in data['weapons']:continue
        meta=b.metadata(f'item/{display}')
        fid=next(iter(meta['ModelFiles'].values()))[0]['FileDataId']
        data['weapons'][str(display)]=b.m2.convert(display,{**meta,'Model':fid,'_character':True},OUT,'/characters/classic',b.CLIPS)
        print('Weapon',display,flush=True)
        MANIFEST.write_text(json.dumps(data,indent=2)+'\n')
    def build(class_id,race,gender):
        key=f'{race}-{gender}-{class_id}'
        char_id=(race-1)*2+gender+1
        base=b.metadata(f'character/{char_id}')
        assert base['Character']['Race']==race and base['Character']['Gender']==gender
        custom=b.metadata(f'charactercustomization/{char_id}')
        hair=next((o for o in custom['Options'] if o['Id']==custom.get('HairStyleOptionId')),None)
        choices=[{'optionId':hair['Id'],'choiceId':hair['Choices'][min(1,len(hair['Choices'])-1)]['Id']}] if hair and hair['Choices'] else []
        equipment={str(items[i]['InventoryType']):display_ids[i] for i in OUTFITS[class_id]}
        meta=b.character({**base,'_character':True,'Creature':{'CreatureCustomizations':choices},'Equipment':equipment},key)
        asset=b.m2.convert(key,meta,OUT,'/characters/classic',b.CLIPS)
        asset.update({'raceId':race,'gender':'female' if gender else 'male','classId':class_id,'weaponDisplay':display_ids[WEAPONS[class_id]]})
        return key,asset
    pending=[(c,r,g) for c,races in RACES.items() for r in races for g in [0,1] if f'{r}-{g}-{c}' not in data['characters']]
    failures=[]
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        jobs={pool.submit(build,*args):args for args in pending}
        for job in concurrent.futures.as_completed(jobs):
            try:
                key,asset=job.result();data['characters'][key]=asset
                MANIFEST.write_text(json.dumps(data,indent=2)+'\n')
                print('Character',key,len(data['characters']),flush=True)
            except Exception as error:failures.append((jobs[job],str(error)));print('FAIL',jobs[job],repr(error),flush=True)
    (b.m2.CACHE/'character-import-failures.json').write_text(json.dumps(failures,indent=2))
    print('Done',len(data['characters']),'characters;',len(failures),'failures',flush=True)

if __name__=='__main__':main()
