"""Import Classic MC identity evidence and convert native skinned models to local GLB.

Run with Python + Pillow. Raw downloads are cached under .cache; the shipped
manifest records their SHA-256 hashes. No runtime CDN or proprietary viewer.
"""
import concurrent.futures
import hashlib
import io
import json
import math
import re
import struct
import time
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/molten-core-models'
OUT = ROOT / 'apps/web/public/creatures/molten-core'
CDN = 'https://wow.zamimg.com/modelviewer/classic/'
ENTRIES = [12118,11982,12259,12057,12056,12264,12098,11988,12018,11502,
           11658,11659,11671,11673,11669,12101,11665,11668,11661,11662,12076,
           12119,12099,11672,11663,11664,12143]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(path, url=None):
    target = CACHE / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(url or CDN + path, headers={'User-Agent':'wow-sim-asset-import/1.0'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    data=response.read()
                target.write_bytes(data)
                break
            except Exception:
                if attempt==2:raise
                time.sleep(attempt+1)
    return target.read_bytes()


def unpack(data, offset, fmt):
    return struct.unpack_from('<'+fmt, data, offset)


def chunks(data):
    result, offset = {}, 0
    while offset + 8 <= len(data):
        tag, size = unpack(data, offset, '4sI')
        assert offset + 8 + size <= len(data), 'Invalid chunk length'
        result[tag.decode()] = data[offset+8:offset+8+size]
        offset += size + 8
    return result


def array(data, offset, stride):
    count, start = unpack(data, offset, 'II')
    assert start + count * stride <= len(data), 'Invalid array bounds'
    return [start+i*stride for i in range(count)]


def xyz(v):
    return [v[0],v[2],-v[1]]


def identify(entry):
    url = f'https://www.wowhead.com/classic/npc={entry}'
    raw = fetch(f'pages/{entry}.html', url)
    match = re.search(rb'linksButton.dataset.displayId\s*=\s*(\d+)', raw)
    assert match, f'No confirmed Classic display ID for {entry}'
    display = int(match[1])
    meta = json.loads(fetch(f'meta/npc/{display}.json'))
    return str(entry), {'displayId':display,'modelId':meta['Model'],'identitySource':url,
                        'identitySha256':digest(raw)}, meta


class GLB:
    def __init__(self):
        self.binary = bytearray()
        self.doc = {'asset':{'version':'2.0','generator':'wow-sim Classic M2 importer'},
                    'scene':0,'scenes':[{'nodes':[0]}], 'nodes':[{'name':'Model','children':[]}],
                    'buffers':[], 'bufferViews':[], 'accessors':[], 'meshes':[],
                    'skins':[], 'materials':[], 'textures':[], 'images':[],
                    'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],
                    'animations':[]}

    def view(self, data):
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        i = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer':0,'byteOffset':len(self.binary),'byteLength':len(data)})
        self.binary.extend(data)
        return i

    def accessor(self, values, kind, component=5126, bounds=False):
        widths = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
        n = widths[kind]
        flat = values if n == 1 else [x for v in values for x in v]
        assert flat and all(math.isfinite(v) for v in flat)
        data = struct.pack('<'+{5126:'f',5123:'H'}[component]*len(flat),*flat)
        record = {'bufferView':self.view(data),'componentType':component,'count':len(flat)//n,'type':kind}
        if bounds:
            record['min'] = [min(flat[i::n]) for i in range(n)]
            record['max'] = [max(flat[i::n]) for i in range(n)]
        self.doc['accessors'].append(record)
        return len(self.doc['accessors'])-1

    def write(self, path):
        if not self.doc['animations']:del self.doc['animations']
        for node in self.doc['nodes']:
            if node.get('children')==[]:del node['children']
        for mesh in self.doc['meshes']:
            for primitive in mesh['primitives']:
                for index in primitive['attributes'].values():
                    self.doc['bufferViews'][self.doc['accessors'][index]['bufferView']]['target']=34962
                self.doc['bufferViews'][self.doc['accessors'][primitive['indices']]['bufferView']]['target']=34963
        self.doc['buffers'] = [{'byteLength':len(self.binary)}]
        data = json.dumps(self.doc,separators=(',',':')).encode()
        data += b' ' * (-len(data)%4)
        self.binary.extend(b'\0' * (-len(self.binary)%4))
        result = struct.pack('<III',0x46546c67,2,28+len(data)+len(self.binary))
        result += struct.pack('<I4s',len(data),b'JSON')+data
        result += struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary
        path.write_bytes(result)
        return digest(result)


def convert(display, meta, out=None, url_root='/creatures/molten-core', animation_ids=None):
    out = out or OUT
    out.mkdir(parents=True, exist_ok=True)
    evidence = []
    def resource(path):
        data = fetch(path)
        evidence.append({'url':CDN+path,'sha256':digest(data),'bytes':len(data)})
        return data
    if not meta.get('_character'):
        resource(f'meta/npc/{display}.json')
    portrait=b''
    if out==OUT:
        portrait=resource(f'webthumbs/npc/{display&255}/{display}.webp')
        (out/f'{display}.webp').write_bytes(portrait)
    parts = chunks(resource(f"m2/{meta['Model']}.m2"))
    m = parts['MD21']
    assert m[:4] == b'MD20'
    sequence_data,bone_data,attachment_data=m,m,m
    sequence_header,bone_header,attachment_header,loop_header=28,44,240,20
    if parts.get('SKID'):
        skeleton_id=unpack(parts['SKID'],0,'I')[0]
        skeleton=chunks(resource(f'skel/{skeleton_id}.skel'))
        seen={skeleton_id}
        while skeleton.get('SKPD'):
            parent_id=unpack(skeleton['SKPD'],8,'I')[0]
            if not parent_id:break
            assert parent_id not in seen,'Skeleton parent cycle'
            seen.add(parent_id)
            parent=chunks(resource(f'skel/{parent_id}.skel'))
            skeleton={**parent,**{k:v for k,v in skeleton.items() if k!='SKPD'}}
        sequence_data=skeleton['SKS1'];sequence_header=8;loop_header=0
        bone_data=skeleton['SKB1'];bone_header=0
        attachment_data=skeleton.get('SKA1',b'\0'*8);attachment_header=0
        if 'AFID' in skeleton:parts['AFID']=skeleton['AFID']
    skin_id = unpack(parts['SFID'],0,'I')[0]
    skin = resource(f'skin/{skin_id}.skin')
    assert skin[:4] == b'SKIN'
    seq = []
    for p in array(sequence_data,sequence_header,64):
        anim, variation, duration, speed, flags = unpack(sequence_data,p,'HHIfI')
        seq.append({'id':anim,'variation':variation,'duration':duration,'flags':flags,'alias':unpack(sequence_data,p+62,'H')[0]})
    global_loops = [unpack(sequence_data,p,'I')[0] for p in array(sequence_data,loop_header,4)]
    bone_offsets = array(bone_data,bone_header,88)
    bones = [{'parent':unpack(bone_data,p+8,'h')[0],'pivot':xyz(unpack(bone_data,p+76,'fff')),'offset':p} for p in bone_offsets]
    glb = GLB()
    for i,bone in enumerate(bones):
        parent = bone['parent']
        assert parent < len(bones) and parent != i
        base = bones[parent]['pivot'] if parent >= 0 else [0,0,0]
        bone['local'] = [v-base[j] for j,v in enumerate(bone['pivot'])]
        glb.doc['nodes'].append({'name':f'bone_{i}','translation':bone['local'],'children':[]})
    for i,bone in enumerate(bones):
        glb.doc['nodes'][bone['parent']+1 if bone['parent']>=0 else 0]['children'].append(i+1)
    for p in array(attachment_data,attachment_header,40):
        attachment,bone=unpack(attachment_data,p,'IH')
        if bone>=len(bones):continue
        position=xyz(unpack(attachment_data,p+8,'fff'))
        index=len(glb.doc['nodes'])
        glb.doc['nodes'].append({'name':f'attachment_{attachment}','translation':[v-bones[bone]['pivot'][i] for i,v in enumerate(position)]})
        glb.doc['nodes'][bone+1]['children'].append(index)
    matrices = [[1,0,0,0,0,1,0,0,0,0,1,0,-b['pivot'][0],-b['pivot'][1],-b['pivot'][2],1] for b in bones]
    glb.doc['skins'].append({'joints':list(range(1,len(bones)+1)),'inverseBindMatrices':glb.accessor(matrices,'MAT4')})
    positions,normals,uv,joints,weights = [],[],[],[],[]
    for p in array(m,60,48):
        positions.append(xyz(unpack(m,p,'fff')))
        normals.append(xyz(unpack(m,p+20,'fff')))
        uv.append(list(unpack(m,p+32,'ff')))
        w = unpack(m,p+12,'BBBB'); j = unpack(m,p+16,'BBBB')
        assert sum(w)>0 and all(x<len(bones) for x in j)
        joints.append(j); weights.append([x/sum(w) for x in w])
    vertex_map = [unpack(skin,p,'H')[0] for p in array(skin,4,2)]
    indices = [vertex_map[unpack(skin,p,'H')[0]] for p in array(skin,12,2)]
    # Some Classic unlit surfaces have zero normals. Recover their face normals
    # so the portable glTF remains valid under both lit and unlit renderers.
    accumulated=[[0.,0.,0.] for _ in positions]
    for a,b,c in zip(indices[::3],indices[1::3],indices[2::3]):
        u=[positions[b][j]-positions[a][j] for j in range(3)]
        v=[positions[c][j]-positions[a][j] for j in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        for index in [a,b,c]:
            for j in range(3):accumulated[index][j]+=normal[j]
    for i,normal in enumerate(normals):
        if sum(x*x for x in normal)<1e-12:normal=accumulated[i]
        length=math.sqrt(sum(x*x for x in normal))
        normals[i]=[x/length for x in normal] if length>1e-9 else [0,1,0]
    attrs = {name:glb.accessor(values,kind,component,bound) for name,values,kind,component,bound in [
        ('POSITION',positions,'VEC3',5126,True),('NORMAL',normals,'VEC3',5126,False),
        ('TEXCOORD_0',uv,'VEC2',5126,False),('JOINTS_0',joints,'VEC4',5123,False),('WEIGHTS_0',weights,'VEC4',5126,False)]}
    txids = unpack(parts['TXID'],0,'I'*(len(parts['TXID'])//4))
    lookup = [unpack(m,p,'H')[0] for p in array(m,128,2)]
    sections = array(skin,28,48)
    batches = []
    for p in array(skin,36,24):
        section, mat, layer, count, combo = [unpack(skin,p+i,'H')[0] for i in [4,10,12,14,16]]
        if layer:continue
        if '_geosets' in meta and unpack(skin,sections[section],'H')[0] not in meta['_geosets']:continue
        batches.append((section,mat,combo))
    used={lookup[combo] for _,_,combo in batches}
    texture_indices = []
    for i,p in enumerate(array(m,80,16)):
        if i not in used:
            texture_indices.append(None)
            continue
        kind = unpack(m,p,'I')[0]
        texture_id = (meta.get('Textures') or {}).get(str(kind)) if kind else txids[i]
        if not texture_id and kind in meta.get('_emptyTextureSlots',[]):
            texture_indices.append(None)
            continue
        assert texture_id, f'Unresolved texture {display}:{kind}'
        raw = Path(texture_id).read_bytes() if isinstance(texture_id,str) and Path(texture_id).is_file() else resource(f'textures/{texture_id}.webp')
        im = Image.open(io.BytesIO(raw)).convert('RGBA'); encoded = io.BytesIO(); im.save(encoded,format='PNG')
        glb.doc['images'].append({'bufferView':glb.view(encoded.getvalue()),'mimeType':'image/png','name':str(texture_id)})
        texture_indices.append(len(glb.doc['textures']))
        glb.doc['textures'].append({'source':len(glb.doc['images'])-1,'sampler':0})
    lookup = [unpack(m,p,'H')[0] for p in array(m,128,2)]
    materials = [unpack(m,p,'HH') for p in array(m,112,4)]
    sections = array(skin,28,48)
    primitives = []
    for section,mat,combo in batches:
        sp = sections[section]
        start,n = unpack(skin,sp+8,'HH');start += unpack(skin,sp+2,'H')[0]<<16
        if not n: continue
        flags,blend = materials[mat]
        texture_slot=lookup[combo]
        if texture_indices[texture_slot] is None:continue
        texture_kind=unpack(m,array(m,80,16)[texture_slot],'I')[0]
        material = {'name':f'material_{section}_{mat}','extras':{'classicGeoset':unpack(skin,sp,'H')[0],'classicTextureType':texture_kind,'classicBlend':blend},'pbrMetallicRoughness':{
            'baseColorTexture':{'index':texture_indices[lookup[combo]]},'metallicFactor':0,'roughnessFactor':1},
            'doubleSided':bool(flags&4),'alphaMode':'OPAQUE' if blend==0 else 'MASK' if blend==1 else 'BLEND'}
        if blend==1:material['alphaCutoff']=.5
        if flags&1:
            material['extensions']={'KHR_materials_unlit':{}}
            glb.doc['extensionsUsed']=['KHR_materials_unlit']
        glb.doc['materials'].append(material)
        primitives.append({'attributes':attrs,'indices':glb.accessor(indices[start:start+n],'SCALAR',5123),
                           'material':len(glb.doc['materials'])-1})
    glb.doc['meshes'].append({'name':f'classic_display_{display}','primitives':primitives})
    glb.doc['scenes'][0]['nodes'].append(len(glb.doc['nodes']))
    glb.doc['nodes'].append({'name':'Body','mesh':0,'skin':0})
    afid = {}
    for p in range(0,len(parts.get('AFID',b'')),8):
        aid,var,fid=unpack(parts['AFID'],p,'HHI');afid[(aid,var)]=fid
    external = {}
    def track(p, index, kind):
        interp,glob,nt,ot,nv,ov = unpack(bone_data,p,'HHIIII')
        slot = 0 if glob != 65535 else index
        if slot>=nt or slot>=nv:return [],[],interp
        n,ts = unpack(bone_data,ot+slot*8,'II'); vn,vs=unpack(bone_data,ov+slot*8,'II')
        assert n==vn
        if not n:return [],[],interp
        data=bone_data
        if glob==65535 and not seq[index]['flags']&32:
            if index not in external:
                key=(seq[index]['id'],seq[index]['variation']);fid=afid.get(key)
                assert fid, f'Missing external animation {key}'
                raw=resource(f'anim/{fid}.anim')
                external[index]=chunks(raw)['AFM2'] if raw[:4]==b'AFM2' else raw
            data=external[index]
        times=[v/1000 for v in unpack(data,ts,'I'*n)]
        values=[]
        for k in range(n):
            if kind=='rotation':
                q=[(x-32767)/32768 for x in unpack(data,vs+k*8,'HHHH')]
                length=math.sqrt(sum(x*x for x in q));values.append([q[0]/length,q[2]/length,-q[1]/length,q[3]/length])
            else:
                v=unpack(data,vs+k*12,'fff');values.append(xyz(v) if kind=='translation' else [v[0],v[2],v[1]])
        return times,values,interp
    clips=[]
    for index,animation in enumerate(seq):
        if animation['variation']!=0:continue
        if animation_ids is not None and animation['id'] not in animation_ids:continue
        actual=index;seen=set()
        while seq[actual]['flags']&64:
            assert actual not in seen;seen.add(actual);actual=seq[actual]['alias']
        clip={'name':f"anim_{animation['id']}",'samplers':[],'channels':[]}
        for bi,bone in enumerate(bones):
            for kind,offset in [('translation',16),('rotation',36),('scale',56)]:
                times,values,interp=track(bone['offset']+offset,actual,kind)
                if not times:continue
                assert interp<=1, 'Spline animation requires resampling'
                if kind=='translation':values=[[v[j]+bone['local'][j] for j in range(3)] for v in values]
                pairs=sorted(dict(zip(times,map(tuple,values))).items())
                times=[v[0] for v in pairs];values=[v[1] for v in pairs]
                clip['samplers'].append({'input':glb.accessor(times,'SCALAR',bounds=True),
                    'output':glb.accessor(values,'VEC4' if kind=='rotation' else 'VEC3'),
                    'interpolation':'STEP' if interp==0 else 'LINEAR'})
                clip['channels'].append({'sampler':len(clip['samplers'])-1,'target':{'node':bi+1,'path':kind}})
        if clip['channels']:
            glb.doc['animations'].append(clip);clips.append(animation['id'])
    assert primitives and (meta.get('Item') or meta.get('_staticModel') or clips and 0 in clips)
    path=out/f'{display}.glb'
    sha=glb.write(path)
    height=max(v[1] for v in positions)-min(v[1] for v in positions)
    return {'displayId':display,'modelId':meta['Model'],'path':f'{url_root}/{display}.glb',
            'sha256':sha,'bytes':path.stat().st_size,'vertices':len(positions),'bones':len(bones),
            'height':height,'minY':min(v[1] for v in positions),'animations':clips,
            'portrait':f'/creatures/molten-core/{display}.webp','portraitSha256':digest(portrait),'sources':evidence}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        identities=list(pool.map(identify,ENTRIES))
    entries={entry:record for entry,record,meta in identities}
    metas={record['displayId']:meta for _,record,meta in identities}
    models={}
    for display,meta in metas.items():
        models[str(display)]=convert(display,meta)
        print(display,models[str(display)]['vertices'],'vertices',models[str(display)]['animations'],flush=True)
    result={'schemaVersion':1,'copyright':'Blizzard Entertainment. Classic assets hosted by Wowhead.',
            'entries':entries,'models':models}
    (ROOT/'packages/game-data/data/molten-core-models-manifest.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('Imported',len(entries),'creatures /',len(models),'models')


if __name__=='__main__':main()
