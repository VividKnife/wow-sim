"""Import unmodified Classic buff sounds; verify original Vanilla filenames."""
import hashlib,json,pathlib,re,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[3]
EVIDENCE=ROOT/'docs/research/import/buff-sounds'
SELECTION={'buff-spirit':(23028,568735),'buff-protection':(27681,568491),'buff-blessing':(25898,568274),'buff-thorns':(467,569022)}
def fetch(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read()
def main():
 EVIDENCE.mkdir(exist_ok=True)
 paths=(ROOT/'docs/research/import/combat-sounds/vanilla-sound-paths.csv').read_text(encoding='utf-8-sig').splitlines()
 rows=[]
 for cue,(spell,fileid) in SELECTION.items():
  page=EVIDENCE/f'spell-{spell}.html'
  if not page.exists():page.write_bytes(fetch(f'https://www.wowhead.com/classic/spell={spell}'))
  candidates=[json.loads(m.group()) for m in re.finditer(r'\{"id":\d+,"title":"[^"]+","url":"[^"]+","type":"(?:\\.|[^"])*"\}',page.read_text())]
  source=next(s for s in candidates if s['id']==fileid)
  original=next(p for p in paths if p.lower().endswith('\\'+source['title'].lower()+'.wav'))
  data=fetch(source['url']);assert data[:4]==b'OggS'
  (ROOT/f'apps/web/public/sounds/{cue}.ogg').write_bytes(data)
  rows.append(dict(cue=cue,spellId=spell,fileDataId=fileid,title=source['title'],url=source['url'],vanillaPath=original,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data),sourcePage=f'https://www.wowhead.com/classic/spell={spell}',sourcePageSha256=hashlib.sha256(page.read_bytes()).hexdigest(),transformation='none'))
 (EVIDENCE/'manifest.json').write_text(json.dumps({'sounds':rows,'caveat':'Classic-served OGG; Vanilla filenames verified, not original-client byte certification.'},ensure_ascii=False,indent=2)+'\n')
 print('Imported',len(rows),'buff sounds')
if __name__=='__main__':main()
