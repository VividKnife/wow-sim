"""Import Classic ranged weapons and additive native animation packs.

Presentation-only assets live outside the simulation content manifest. Shared
bodies/skins stay unchanged; only hunters load four extra animation clips.
"""
import concurrent.futures
import copy
import importlib.util
import json
import subprocess
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('characters',Path(__file__).with_name('import-classic-character-appearances.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
MANIFEST=c.ROOT/'packages/game-data/visuals/classic-ranged-manifest.json'

def animation_pack(asset,target):
    raw=target.read_bytes()
    size=c.b.m2.unpack(raw,12,'I')[0];doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
    out=c.b.m2.GLB();out.doc['nodes']=copy.deepcopy(doc['nodes'])
    for node in out.doc['nodes']:
        node.pop('mesh',None);node.pop('skin',None)
    out.doc['scenes']=doc['scenes'];out.doc.pop('skins',None)
    accessors={}
    def accessor(index):
        if index in accessors:return accessors[index]
        record=copy.deepcopy(doc['accessors'][index]);view=doc['bufferViews'][record['bufferView']]
        start=view.get('byteOffset',0);record['bufferView']=out.view(binary[start:start+view['byteLength']])
        result=len(out.doc['accessors']);out.doc['accessors'].append(record);accessors[index]=result
        return result
    out.doc['animations']=[]
    for animation in doc['animations']:
        if animation['name']=='anim_0':continue
        animation=copy.deepcopy(animation)
        for sampler in animation['samplers']:
            sampler['input']=accessor(sampler['input']);sampler['output']=accessor(sampler['output'])
        out.doc['animations'].append(animation)
    for key in ['meshes','materials','textures','images','samplers']:
        out.doc.pop(key,None)
    sha=out.write(target)
    return {key:value for key,value in asset.items() if key in ['modelId','path','sources']}|{'sha256':sha,'bytes':target.stat().st_size,'animations':[29,46,48,49]}

def main():
    base=json.loads(c.MANIFEST.read_text())
    lookup=subprocess.check_output(['node','--input-type=module','-e',"import {items} from './packages/game-domain/src/rules/catalog.js'; console.log(JSON.stringify(Object.fromEntries(Object.values(items).filter(i=>i.class===2&&[2,3,18].includes(i.subclass)).map(i=>[i.entry,({2:'bow',3:'rifle',18:'crossbow'})[i.subclass]]))))"],cwd=c.ROOT,text=True)
    data={'copyright':base['copyright'],'itemStyles':json.loads(lookup),'models':{},'items':{},'gear':{},'bodies':{}}
    for style,item,point in [('bow',2504,0),('rifle',2508,1),('crossbow',15807,1)]:
        key,evidence=c.identify(item);data['items'][key]=evidence
        meta=c.b.metadata(f"item/{evidence['displayId']}")
        res=meta['ComponentModels']['0'];model=meta['ModelFiles'][str(res)][0]['FileDataId']
        asset=c.b.m2.convert('ranged-'+style,{**meta,'Model':model,'_character':True},c.OUT,c.URL,set())
        data['gear'][style]=asset
        data['models'][style]={'point':point,'src':asset['path'],'mode':'ranged','itemId':item}
    transparent=c.b.m2.CACHE/'composites/transparent.png';transparent.parent.mkdir(parents=True,exist_ok=True);Image.new('RGBA',(1,1)).save(transparent)
    def body(key):
        model=base['bodies'][key]['modelId'];name='ranged-animations-'+key
        meta={'Model':model,'_character':True,'Textures':{str(k):str(transparent) for k in [1,2,6,8]}}
        asset=c.b.m2.convert(name,meta,c.OUT,c.URL,{0,29,46,48,49})
        assert all(id in asset['animations'] for id in [29,46,48,49])
        result=animation_pack(asset,c.OUT/(name+'.glb'))
        print('Animations',key,result['bytes'],flush=True)
        return key,result
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        data['bodies']=dict(pool.map(body,[f'{race}-{gender}' for race in [2,3,4,6,8] for gender in [0,1]]))
    MANIFEST.parent.mkdir(exist_ok=True);MANIFEST.write_text(json.dumps(data,indent=2)+'\n')
    print('Imported ranged appearances and',len(data['itemStyles']),'item styles')

if __name__=='__main__':main()
