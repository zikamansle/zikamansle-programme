import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createECDH,hkdfSync,createDecipheriv,randomBytes} from 'node:crypto';
import {encrypt,authorization,validEndpoint,safePath,un64,b64} from '../server/webpush.mjs';
import {handle as handleAPI} from '../server/push-api.mjs';
// Unit isolation: real JWT authorization is exercised separately in auth.test.mjs.
const handle=(req,env)=>handleAPI(req,env,async r=>r.headers.get('x-test-admin')==='owner');
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateKey=await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey=b64(await crypto.subtle.exportKey('raw',pair.publicKey));
const ec=createECDH('prime256v1');ec.generateKeys();const auth=randomBytes(16);
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:ec.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}};
test('encrypted payload can be decrypted independently using Node RFC8291 primitives',async()=>{
 const payload={id:'123',title:'Une annonce 🎉',body:'Festival ZikaMansle',url:'/index.html#programme'};
 const raw=Buffer.from(await encrypt(sub,payload));assert.equal(raw.readUInt32BE(16),4096);assert.equal(raw[20],65);
 const secret=ec.computeSecret(raw.subarray(21,86)),salt=raw.subarray(0,16);
 const ikm=hkdfSync('sha256',secret,auth,Buffer.concat([Buffer.from('WebPush: info\0'),ec.getPublicKey(),raw.subarray(21,86)]),32);
 const key=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16),iv=hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12);
 const decipher=createDecipheriv('aes-128-gcm',key,iv);decipher.setAuthTag(raw.subarray(-16));const clear=Buffer.concat([decipher.update(raw.subarray(86,-16)),decipher.final()]);assert.equal(clear.at(-1),2);assert.deepEqual(JSON.parse(clear.subarray(0,-1)),payload);
});
test('VAPID JWT signature verifies and targets the push provider',async()=>{
 const header=await authorization(sub.endpoint,privateKey,publicKey),jwt=header.match(/t=([^,]+)/)[1],parts=jwt.split('.');assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://fcm.googleapis.com');assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,un64(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.'))));
});
test('reject SSRF endpoints and external notification navigation',()=>{
 for(const u of ['http://fcm.googleapis.com/','https://localhost','https://fcm.googleapis.com.attacker.test','https://fcm.googleapis.com:9000/','https://x@fcm.googleapis.com'])assert.equal(validEndpoint(u),false,u);
 for(const u of ['//evil.test','/\\evil.test','https://evil.test','javascript:alert(1)'])assert.equal(safePath(u),false,u);
 assert(safePath('/index.html#programme'));
});
function environment(){const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const prepare=query=>{let args=[];const o={bind(...a){args=a;return o},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:sql.prepare(query).run(...args)}}};return o};return {DB:{prepare,async batch(list){sql.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}},VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_JWK:JSON.stringify(privateKey),ADMIN_EMAIL:'owner@example.test',PUSH_SEND_ENABLED:'true'} }
function request(action,data,who){return new Request('https://festival.test/api/push/'+action,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json',Origin:'https://festival.test'}:{}),...(who?{'x-test-admin':who,'x-test-email':who==='owner'?'owner@example.test':'other@example.test'}:{})},body:data?JSON.stringify(data):undefined})}
test('admin isolation, subscription lifecycle, idempotent broadcast and delivery',async()=>{
 const env=environment();assert.equal((await handle(request('admin'),env)).status,403);assert.equal((await handle(request('admin',null,'intruder'),env)).status,403);
 assert.equal((await handle(request('admin',null,'owner'),env)).status,200);
 assert.equal((await handle(request('subscribe',{subscription:sub}),env)).status,200);
 const draft={id:crypto.randomUUID(),title:'Annonce',body:'Bonjour',url:'/index.html#actualites'};
 assert.equal((await handle(request('create',draft),env)).status,403);
 const badOrigin=request('create',draft,'owner');badOrigin.headers.set('origin','https://evil.test');assert.equal((await handle(badOrigin,env)).status,403);
 for(let i=0;i<2;i++)assert.equal((await handle(request('create',draft,'owner'),env)).status,200);
 const feed=await (await handle(request('news'),env)).json();assert.equal(feed.items.length,1);
 const original=globalThis.fetch;let sent=0;globalThis.fetch=async(url,options)=>{sent++;assert.equal(options.redirect,'manual');assert.equal(options.headers['Content-Encoding'],'aes128gcm');return new Response(null,{status:201})};
 try{await handle(request('send',{id:draft.id},'owner'),env);await handle(request('send',{id:draft.id},'owner'),env);assert.equal(sent,1)}finally{globalThis.fetch=original}
 assert.equal((await handle(request('receipt',{id:draft.id,subscription:{...sub,keys:{...sub.keys,auth:randomBytes(16).toString('base64url')}},displayed:true}),env)).status,403);
 await handle(request('receipt',{id:draft.id,subscription:sub,displayed:true}),env);
 const stats=await(await handle(request('admin',null,'owner'),env)).json();assert.equal(stats.history[0].accepted,1);assert.equal(stats.history[0].received,1);assert.equal(stats.history[0].displayed,1);
 const testDraft={...draft,id:crypto.randomUUID(),test:true,subscription:sub};await handle(request('create',testDraft,'owner'),env);assert.equal((await(await handle(request('news'),env)).json()).items.length,1);
 await handle(request('unsubscribe',{subscription:sub}),env);assert.equal((await(await handle(request('admin',null,'owner'),env)).json()).subscribers,0);
});
test('service worker displays an incoming push and acknowledges only its own subscription',async()=>{
 const {runInNewContext}=await import('node:vm');const handlers={},calls=[];let pending;
 const self={location:{href:'https://festival.test/sw.js',origin:'https://festival.test'},addEventListener:(name,fn)=>handlers[name]=fn,registration:{pushManager:{getSubscription:async()=>({toJSON:()=>sub})},showNotification:async(title,options)=>calls.push({title,options})}};
 runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,AbortSignal,fetch:async(url,options)=>{calls.push({url,data:JSON.parse(options.body)});return new Response('{}')}});
 handlers.push({data:{json:()=>({id:'test-id',title:'Test',body:'Bonjour',url:'https://evil.test'})},waitUntil:p=>pending=p});await pending;
 assert.equal(calls[0].options.data.url,'https://festival.test/index.html#actualites');assert.equal(calls[1].url,'/api/push/receipt');assert.equal(calls[1].data.displayed,true);assert.equal(calls[1].data.subscription.endpoint,sub.endpoint);
});
test('remote self-test is private, rate limited and confirms an authenticated receipt',async()=>{
 const env=environment();await handle(request('subscribe',{subscription:sub}),env);
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:201})};
 try{
  const bad={...sub,keys:{...sub.keys,auth:randomBytes(16).toString('base64url')}};
  assert.equal((await handle(request('selftest',{subscription:bad}),env)).status,403);
  const result=await(await handle(request('selftest',{subscription:sub}),env)).json();assert.equal(result.accepted,true);assert.equal(calls,1);
  assert.equal((await handle(request('selftest',{subscription:sub}),env)).status,429);
  assert.equal((await(await handle(request('news'),env)).json()).items.length,0);
  await handle(request('receipt',{id:result.id,subscription:sub,displayed:true}),env);
  const status=await(await handle(request('test-status',{id:result.id,subscription:sub}),env)).json();assert(status.received);assert.equal(status.displayed,1);
  assert.equal((await handle(request('test-status',{id:result.id,subscription:bad}),env)).status,403);
 }finally{globalThis.fetch=original}
});
test('push failures distinguish signing and network errors without exposing secrets',async()=>{
 const {sendPush}=await import('../server/webpush.mjs');
 await assert.rejects(sendPush(sub,{title:'Test'},{VAPID_PRIVATE_JWK:'invalid secret',VAPID_PUBLIC_KEY:publicKey}),e=>e.stage==='signature'&&!e.message.includes('invalid secret'));
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new TypeError('private endpoint')};
 try{await assert.rejects(sendPush(sub,{title:'Test'},environment()),e=>e.stage==='network'&&e.kind==='TypeError'&&!e.message.includes('private endpoint'))}finally{globalThis.fetch=original}
});
test('response cleanup failure does not turn an accepted push into a failure',async()=>{
 const {sendPush}=await import('../server/webpush.mjs');const original=globalThis.fetch;
 globalThis.fetch=async()=>({status:201,body:{cancel:async()=>{throw Error('closed stream')}}});
 try{assert.equal(await sendPush(sub,{title:'Test'},environment()),201)}finally{globalThis.fetch=original}
});

test('push redirects are not followed and are not counted as accepted',async()=>{
 const env=environment();await handle(request('subscribe',{subscription:sub}),env);
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:307,headers:{Location:'https://example.invalid'}})};
 try{const result=await(await handle(request('selftest',{subscription:sub}),env)).json();assert.equal(result.accepted,false);assert.equal(result.code,307);assert.equal(calls,1)}finally{globalThis.fetch=original}
});
test('admin media upload, attachment and history clearing preserve subscribers',async()=>{
 const env=environment(),objects=new Map();env.BUCKET={async put(k,bytes,options){objects.set(k,{body:bytes,...options})},async get(k){return objects.get(k)},async head(k){return objects.get(k)}};
 const upload=new Request('https://festival.test/api/push/upload',{method:'POST',headers:{Origin:'https://festival.test','Content-Type':'image/png','x-test-admin':'owner','x-test-email':'owner@example.test'},body:new Uint8Array([137,80,78,71])});
 assert.equal((await handle(new Request(upload.clone(),{headers:{Origin:'https://festival.test','Content-Type':'image/png'}}),env)).status,403);
 const response=await handle(upload,env);assert.equal(response.status,200);const media=await response.json();
 assert.equal((await handle(new Request('https://festival.test'+media.url),env)).headers.get('content-type'),'image/png');
 await handle(request('subscribe',{subscription:sub}),env);
 const draft={id:crypto.randomUUID(),title:'Avec image',body:'Annonce',url:'/index.html#programme',media};
 assert.equal((await handle(request('create',draft,'owner'),env)).status,200);
 const news=await(await handle(request('news'),env)).json();assert.equal(news.items.length,1);assert.deepEqual(JSON.parse(news.items[0].media),media);assert.equal(news.items[0].url,'/index.html#actualites');
 assert.equal((await handle(request('clear-history',{}),env)).status,403);
 assert.equal((await handle(request('clear-history',{},'owner'),env)).status,200);
 assert.equal((await(await handle(request('news'),env)).json()).items.length,0);
 const state=await(await handle(request('admin',null,'owner'),env)).json();assert.equal(state.history.length,0);assert.equal(state.subscribers,1);
 assert.equal((await handle(request('send',{id:draft.id},'owner'),env)).status,404);
});
