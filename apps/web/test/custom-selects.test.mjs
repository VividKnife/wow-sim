import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('game and preview UI use custom selectors, never native dropdowns',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 function check(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())check(path);else if(/\.[jt]sx$/.test(entry.name))assert.doesNotMatch(readFileSync(path,'utf8'),/<(?:select|option|optgroup)\b|\bNativeSelect\b/,path);}}
 for(const folder of ['app','components','test/browser'])check(join(root,folder));
});
