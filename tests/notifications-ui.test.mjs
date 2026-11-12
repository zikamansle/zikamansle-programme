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
 assert.ok(js.includes('id="pushRemoteTest"'));
 assert.ok(js.includes("testButton.onclick=async()=>"));
 assert.ok(js.includes('await remoteTest(message=>'));
 assert.ok(js.includes("action==='selftest'" ) === false);
 assert.ok(js.includes("yes.onclick=()=>change('enable')"));
 assert.ok(js.includes("no.onclick=()=>change('disable')"));
});

test('push 403/404/410 : réabonnement automatique avec la clé VAPID de cette origine',()=>{
 assert.match(js,/\[403,404,410\]\.includes\(result\.code\)/);
 assert.match(js,/await renewSubscription\(sub\)/);
 assert.match(js,/await existing\.unsubscribe\(\)/);
 assert.match(js,/await reg\.pushManager\.subscribe\(\{userVisibleOnly:true,applicationServerKey:key\}\)/);
 assert.match(js,/await api\('subscribe',\{subscription:replacement\.toJSON\(\)\}\)/);
 assert.match(js,/result=await api\('selftest',\{subscription\}\)/);
 assert.match(js,/if\(!result\.accepted\)\{/);
});
