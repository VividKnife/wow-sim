import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {dirname,extname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const forbiddenNames=new Set(['engine.js','catalog.js','profession-data.js','client-content.js','client-snapshot.ts','server-response.js']);
const sourceExtensions=['.ts','.tsx','.js','.jsx','.mts','.mjs'];
async function resolveLocal(file,specifier){
 if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))return null;
 const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(file),specifier);
 const candidates=[base,...(!extname(base)?sourceExtensions.flatMap(ext=>[base+ext,resolve(base,'index'+ext)]):[])];
 for(const candidate of candidates)try{if((await stat(candidate)).isFile())return candidate;}catch{}
 throw new Error('Unresolved client import '+specifier+' from '+file);
}
async function importClosure(entry){
 const seen=new Set(),pending=[entry];
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  if(!sourceExtensions.includes(extname(file)))continue;
  const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true),imports=[];
  function visit(node){
   if((ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly||ts.isExportDeclaration(node)&&!node.isTypeOnly)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
   if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0]))imports.push(node.arguments[0].text);
   ts.forEachChild(node,visit);
  }
  visit(source);
  for(const specifier of imports){const target=await resolveLocal(file,specifier);if(target)pending.push(target);}
 }
 return [...seen].map(file=>relative(root,file).replaceAll('\\','/'));
}
for(const entry of ['app/game.tsx','lib/game-response.js'])test('browser import closure stays outside authoritative modules: '+entry,async()=>{
 const closure=await importClosure(resolve(root,entry));
 for(const path of closure){assert.equal(path.includes('packages/game-domain/'),false,path+' reached from '+entry);assert.equal(forbiddenNames.has(path.split('/').at(-1)),false,path+' reached from '+entry);}
 if(entry==='app/game.tsx'){assert.ok(closure.includes('app/battle.tsx'));assert.ok(closure.includes('lib/battle-renderer.ts'));assert.ok(closure.some(path=>path.startsWith('components/ui/')));}
});
