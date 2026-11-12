import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../public/notifications.js',import.meta.url),'utf8');

test('Actualités et notifications : JavaScript complet et syntaxiquement valide',()=>{
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'public/notifications.js'}));
 assert.ok(js.includes('window.zikaNewsHTML='));
 assert.ok(js.includes('window.zikaLoadNews='));
 assert.ok(js.includes('id="newsList"'));
 assert.ok(js.includes('id="pushEnable"'));
 assert.ok(js.includes('id="pushDisable"'));
 assert.ok(js.includes("yes.onclick=()=>change('enable')"));
 assert.ok(js.includes("no.onclick=()=>change('disable')"));
});
