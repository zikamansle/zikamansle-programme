import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateVapidPair,isStagingConfig,secretNames} from '../scripts/staging-push-setup.mjs';
import {readFileSync} from 'node:fs';

test('isolated staging VAPID keys form a usable P-256 signing pair',async()=>{
 const a=generateVapidPair(),b=generateVapidPair();
 assert.notEqual(a.VAPID_PUBLIC_KEY,b.VAPID_PUBLIC_KEY);
 assert.equal(Buffer.from(a.VAPID_PUBLIC_KEY,'base64url').length,65);
 const privateKey=await crypto.subtle.importKey('jwk',JSON.parse(a.VAPID_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const publicKey=await crypto.subtle.importKey('raw',Buffer.from(a.VAPID_PUBLIC_KEY,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 const message=new TextEncoder().encode('ZikaMansle staging only');
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,message);
 assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,sig,message));
});
test('initializer refuses any production-like configuration and secret listing ambiguities',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert(isStagingConfig(config));
 assert.equal(isStagingConfig({...config,name:'zikamansle-prod'}),false);
 assert.equal(isStagingConfig({...config,routes:['app.zikamansle.fr/*']}),false);
 assert.equal(isStagingConfig({...config,vars:{...config.vars,PUSH_SEND_ENABLED:'true'}}),false);
 assert.equal(isStagingConfig({...config,vars:{...config.vars,VAPID_PUBLIC_KEY:'public'}}),false);
 assert.deepEqual([...secretNames('[{"name":"ADMIN_EMAIL","type":"secret_text"}]')],['ADMIN_EMAIL']);
 assert.throws(()=>secretNames('invalid output'),/liste|Format|Unexpected|SyntaxError/i);
});
