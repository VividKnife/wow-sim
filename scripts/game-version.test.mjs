import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,chmodSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gameVersion,syncGameVersionIndex} from './game-version.mjs';

function checkout(t){
 const root=mkdtempSync(join(tmpdir(),'wow-version-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
 const node=file=>execFileSync(process.execPath,[file],{cwd:root,encoding:'utf8',stdio:'pipe'});
 mkdirSync(join(root,'scripts'));mkdirSync(join(root,'.githooks'));
 for(const name of ['game-version.mjs','install-git-hooks.mjs'])copyFileSync(new URL(name,import.meta.url),join(root,'scripts',name));
 for(const hook of ['pre-commit','post-commit','pre-push']){
  copyFileSync(new URL('../.githooks/'+hook,import.meta.url),join(root,'.githooks',hook));chmodSync(join(root,'.githooks',hook),0o755);
 }
 git('init');git('config','user.name','Version Test');git('config','user.email','version@example.test');git('config','commit.gpgSign','false');
 return {root,git,node};
}
test('minute version uses Beijing time regardless of machine timezone, including midnight and year rollover',()=>{
 assert.deepEqual(gameVersion(new Date('2026-09-30T16:03:59.999Z')),{version:'2026.10.01-0003',updatedAt:'2026-09-30T16:03:00.000Z',timeZone:'Asia/Shanghai'});
 assert.equal(gameVersion(new Date('2026-12-31T16:00:00Z')).version,'2027.01.01-0000');
 assert.throws(()=>gameVersion(new Date(NaN)),/Invalid/);
});
test('installed hook stamps actual commits and preserves unrelated staged/unstaged changes in partial commits',t=>{
 const {root,git,node}=checkout(t);
 node('scripts/install-git-hooks.mjs');assert.equal(git('config','--get','core.hooksPath'),'.githooks');
 writeFileSync(join(root,'chosen.txt'),'initial');writeFileSync(join(root,'other.txt'),'initial');
 git('add','.');git('commit','-m','initial');
 const stamp=JSON.parse(git('show','HEAD:game-version.json'));
 assert.deepEqual(stamp,gameVersion(new Date(stamp.updatedAt)));
 assert.equal(git('status','--porcelain'),'');
 // Make the committed/index version older than the next commit without a
 // minute-long sleep. Otherwise same-minute commits conceal index drift.
 writeFileSync(join(root,'game-version.json'),JSON.stringify(gameVersion(new Date('2020-01-01T00:00:00Z'))));
 git('add','game-version.json');git('-c','core.hooksPath=.disabled-hooks','commit','--amend','--no-edit');
 writeFileSync(join(root,'chosen.txt'),'chosen change');writeFileSync(join(root,'other.txt'),'staged other');git('add','other.txt');
 writeFileSync(join(root,'other.txt'),'unstaged other');
 writeFileSync(join(root,'game-version.json'),JSON.stringify(gameVersion(new Date('2020-01-01T00:00:00Z'))));
 git('commit','--only','chosen.txt','-m','partial commit');
 assert.notEqual(JSON.parse(git('show','HEAD:game-version.json')).version,'2020.01.01-0800');
 assert.equal(git('show','HEAD:other.txt'),'initial');assert.equal(git('show',':other.txt'),'staged other');
 assert.equal(readFileSync(join(root,'other.txt'),'utf8'),'unstaged other');
 assert.equal(git('show',':game-version.json'),git('show','HEAD:game-version.json'));
 assert.equal(git('status','--porcelain','--','game-version.json'),'');
 assert.equal(git('rev-list','--count','HEAD'),'2','hook must not create another commit');
 const manuallyChanged=JSON.stringify(gameVersion(new Date('2021-01-01T00:00:00Z')));
 writeFileSync(join(root,'game-version.json'),manuallyChanged);syncGameVersionIndex(root);
 assert.equal(git('show',':game-version.json'),git('show','HEAD:game-version.json'));
 assert.equal(readFileSync(join(root,'game-version.json'),'utf8'),manuallyChanged,'post hook must not stage a newer working edit');
});
test('installer does not overwrite a different hook setup',t=>{
 const {git,node}=checkout(t);git('config','core.hooksPath','custom-hooks');
 assert.throws(()=>node('scripts/install-git-hooks.mjs'),/Existing core.hooksPath/);
 assert.equal(git('config','--get','core.hooksPath'),'custom-hooks');
});
test('installer is a no-op in a Git-free container/source archive',t=>{
 const {root,node}=checkout(t);rmSync(join(root,'.git'),{recursive:true});
 assert.doesNotThrow(()=>node('scripts/install-git-hooks.mjs'));
});
