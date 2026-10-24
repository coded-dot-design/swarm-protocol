import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {modules,normalize} from '../scripts/migration-baseline.mjs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/runtime-reviewed-baseline.json',import.meta.url)));
for(const name of modules) test(`Reviewed runtime ${baseline.version} fingerprint: ${name}`,()=>{
 const source=readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(normalize(source,'ts')).digest('hex'),baseline.modules[name]);
});
