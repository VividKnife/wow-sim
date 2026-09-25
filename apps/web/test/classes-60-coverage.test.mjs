import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classAbilities,classContentManifest,talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {supportedSpellNames,talentExecutionCoverage} from '../../../packages/game-domain/src/rules/class-support.js';

test('every exposed player ability has a declared execution registry entry',()=>{
 const missing=Object.entries(classAbilities).flatMap(([classId,rows])=>rows.filter(a=>!supportedSpellNames.has(a.name)).map(a=>`${classId}:${a.spellId}:${a.name}`));assert.deepEqual(missing,[]);
});
test('the durable coverage inventory reconciles every player row, talent and manifest reference',async()=>{
 const {createCoverage}=await import('../scripts/audit-classes60.mjs');const report=createCoverage();
 assert.deepEqual(report,JSON.parse(readFileSync(new URL('../../../docs/research/import/classes-60-coverage.json',import.meta.url),'utf8')));
 assert.equal(report.classes.reduce((n,c)=>n+c.playerAbilities.length,0),Object.values(classAbilities).flat().length);
 assert.equal(report.talents.length,432);assert.equal(report.talents.length,Object.keys(talents).length);
 assert.equal(report.manifest.entryCount,classContentManifest.entries.length);
 assert.equal(report.manifest.references.length,classContentManifest.entries.filter(e=>!['ability','talent','pet-ability'].includes(e.contentRole)).length);
 assert.ok(report.classes.every(c=>c.playerAbilities.every(a=>a.sources.length&&a.raceIds.length&&a.execution.registrySupported)));
 assert.ok(Object.values(talents).every(t=>talentExecutionCoverage(t).supported));
 assert.equal(report.claims.originalServerParity,false);
 assert.equal(report.totals.petTrainerRows,47);assert.equal(report.petTraining.trainerAbilities.length,47);
 assert.ok(report.petTraining.trainerAbilities.every(a=>a.trainerSource?.teachingSpellId&&a.petSpellId));
});
