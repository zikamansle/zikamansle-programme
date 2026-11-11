import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {jwtVerify,importSPKI} from 'jose';
import {handleNative,sendFirebaseTest,firebasePreflight,classifyFirebaseCredentials} from '../server/native-push.mjs';

const ROOT='https://zikamansle-app-staging.zikamansle.workers.dev';
const token='FCM_TEST_'+('a'.repeat(100));
const allowed=async()=>true;
function env(){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0000_deep_liz_osborn.sql','0003_native_android_test.sql'])
  sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
 const prepare=query=>{
  let params=[];
  const call={
   bind(...args){params=args;return call},
   async first(){return sql.prepare(query).get(...params)||null},
   async all(){return {results:sql.prepare(query).all(...params)}},
   async run(){return {meta:sql.prepare(query).run(...params)}}
  };
  return call;
 };
 return {APP_ENV:'staging',PUSH_SEND_ENABLED:'false',VAPID_PRIVATE_JWK:'mock-test-salt',DB:{prepare}};
}
function request(path,body,origin=ROOT){
 return new Request(ROOT+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
}
test('native Firebase subscriber is isolated from Web Push and cannot register invalid tokens',async()=>{
 const e=env();
 assert.equal((await handleNative(request('/api/native/subscribe',{token:'bad',platform:'android'}),e,allowed)).status,400);
 assert.equal((await handleNative(request('/api/native/subscribe',{token,platform:'android'}),{...e,APP_ENV:'production'},allowed)).status,503);
 assert.equal((await handleNative(request('/api/native/subscribe',{token,platform:'android'}),e,allowed)).status,200);
 assert.equal((await handleNative(request('/api/native/subscribe',{token,platform:'android'}),e,allowed)).status,200);
 const unauth=await handleNative(request('/administration/api/native-status'),e,async()=>false);
 assert.equal(unauth.status,403);
 const state=await(await handleNative(request('/administration/api/native-status'),e,allowed)).json();
 assert.deepEqual(state,{devices:1,sendingConfigured:false,testingOnly:true});
 assert.equal((await handleNative(request('/administration/api/native-test',{}),e,allowed)).status,503);
});
test('FCM staging test is single-device, admin-only, same-origin and rate-limited',async()=>{
 const e=env();e.FCM_SERVICE_ACCOUNT_JSON='not-used-by-mock';
 assert.equal((await handleNative(request('/administration/api/native-test',{}),e,async()=>false)).status,403);
 assert.equal((await handleNative(request('/administration/api/native-test',{},'https://evil.test'),e,allowed)).status,403);
 assert.equal((await handleNative(request('/administration/api/native-test',{}),e,allowed)).status,409);
 await handleNative(request('/api/native/subscribe',{token,platform:'android'}),e,allowed);
 let sent=0;
 const send=async t=>{assert.equal(t,token);sent++;return {accepted:true,code:200}};
 const r=await handleNative(request('/administration/api/native-test',{}),e,allowed,send);
 assert.deepEqual(await r.json(),{accepted:true,code:200});assert.equal(sent,1);
 assert.equal((await handleNative(request('/administration/api/native-test',{}),e,allowed,send)).status,429);
 assert.equal(sent,1);
 await handleNative(request('/api/native/subscribe',{token:token+'b',platform:'android'}),e,allowed);
 assert.equal((await handleNative(request('/administration/api/native-test',{}),e,allowed,send)).status,409);
});
test('Firebase test OAuth request uses the requested project and does not broadcast',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const credentials={project_id:'zikamansle-d0c4e',client_email:'firebase-adminsdk-test@zikamansle-d0c4e.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
 const publicJWK=await importSPKI(publicKey.export({type:'spki',format:'pem'}),'RS256');
 const urls=[];
 const response=await sendFirebaseTest(token,{FCM_SERVICE_ACCOUNT_JSON:JSON.stringify(credentials)},async(url,options)=>{
  urls.push(url);
  assert.equal(options.redirect,'manual');
  if(url==='https://oauth2.googleapis.com/token'){
   const p=new URLSearchParams(options.body);
   const {payload}=await jwtVerify(p.get('assertion'),publicJWK,{issuer:credentials.client_email,audience:url});
   assert.equal(payload.scope,'https://www.googleapis.com/auth/firebase.messaging');
   return Response.json({access_token:'test-only-access-token'});
  }
  assert.equal(url,'https://fcm.googleapis.com/v1/projects/zikamansle-d0c4e/messages:send');
  assert.equal(options.headers.Authorization,'Bearer test-only-access-token');
  const msg=JSON.parse(options.body);
  assert.equal(msg.message.token,token);
  assert.equal(msg.message.android.priority,'HIGH');
  assert.equal(msg.message.data.test,'true');
  assert.equal(msg.message.topic,undefined);
  return Response.json({name:'projects/zikamansle-d0c4e/messages/mock'});
 });
 assert.deepEqual(response,{accepted:true,code:200});
 assert.equal(urls.length,2);
});

test('Firebase diagnostic does not send notifications and exposes only safe states',async()=>{
 const e=env();
 assert.deepEqual(await firebasePreflight(e),{ready:false,stage:'CONFIG_MISSING'});
 e.FCM_SERVICE_ACCOUNT_JSON='{invalid json';
 assert.deepEqual(await firebasePreflight(e),{ready:false,stage:'CONFIG_JSON_SYNTAX'});
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 e.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({
  project_id:'zikamansle-d0c4e',
  client_email:'firebase-adminsdk-fbsvc@zikamansle-d0c4e.iam.gserviceaccount.com',
  private_key:privateKey.export({type:'pkcs8',format:'pem'})
 });
 const urls=[];
 const preflight=await firebasePreflight(e,async(url)=>{
  urls.push(url);return Response.json({access_token:'mock-oauth-token'});
 });
 assert.deepEqual(preflight,{ready:true,stage:'OAUTH_OK'});
 assert.deepEqual(urls,['https://oauth2.googleapis.com/token']);
 const denied=await firebasePreflight(e,async()=>new Response(null,{status:403}));
 assert.deepEqual(denied,{ready:false,stage:'OAUTH_403'});
});

test('Classify Firebase credentials without logging any private data',()=>{
 const base={project_id:'zikamansle-d0c4e',client_email:'firebase-adminsdk-fbsvc@zikamansle-d0c4e.iam.gserviceaccount.com',
  private_key:'-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----\n'};
 const stage=x=>classifyFirebaseCredentials(x).stage;
 assert.equal(stage('{garbled'), 'CONFIG_JSON_SYNTAX');
 assert.equal(stage('{}'), 'CONFIG_WRONG_PROJECT');
 assert.equal(stage(JSON.stringify({...base,project_id:'another-project'})), 'CONFIG_WRONG_PROJECT');
 assert.equal(stage(JSON.stringify({...base,client_email:'wrong@example.com'})), 'CONFIG_WRONG_ACCOUNT');
 assert.equal(stage(JSON.stringify({...base,private_key:''})), 'CONFIG_NO_PRIVATE_KEY');
 assert.equal(stage(JSON.stringify({...base,private_key:'not a private key'})), 'CONFIG_PRIVATE_KEY_FORMAT');
 assert.equal(stage(JSON.stringify(base)), 'CONFIG_PARSED');
 assert.equal(stage(JSON.stringify(JSON.stringify(base))), 'CONFIG_PARSED');
});
