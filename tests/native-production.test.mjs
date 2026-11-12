import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleNativeProduction,handleNativeRelay,queueNativeNews,queueNativeActivity,
 linkNativeMember,drainNativePush,sendNativeFCM} from '../server/native-production.mjs';

const token='FCM_NATIVE_TEST_'+('x'.repeat(100));
function fakeDB(){
 const sql=new DatabaseSync(':memory:');
 for(const name of ['0003_native_android_test.sql','0120_native_android_production.sql']){
  sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 }
 sql.exec(`CREATE TABLE team_members(id TEXT PRIMARY KEY,active INTEGER);
 CREATE TABLE team_activities(id TEXT PRIMARY KEY,status TEXT,audience TEXT,starts_at TEXT);
 CREATE TABLE team_notification_preferences(member_id TEXT PRIMARY KEY,activity_enabled INTEGER,urgent_enabled INTEGER,quiet_enabled INTEGER,quiet_start TEXT,quiet_end TEXT);
 CREATE TABLE team_member_roles(member_id TEXT,role TEXT);
 CREATE TABLE team_memberships(member_id TEXT,pole_id TEXT,role TEXT);
 CREATE TABLE team_poles(id TEXT,archived INTEGER);
 CREATE TABLE team_activity_poles(activity_id TEXT,pole_id TEXT);
 CREATE TABLE team_activity_bureau_audience(activity_id TEXT);`);
 const DB={prepare(query){
  let params=[];
  const bound={bind(...values){params=values;return bound},
   async first(){return sql.prepare(query).get(...params)||null},
   async all(){return {results:sql.prepare(query).all(...params)}},
   async run(){return {meta:{changes:sql.prepare(query).run(...params).changes}}}};
  return bound;
 }};
 return {sql,DB};
}
const readyEnv=DB=>({
 APP_ENV:'production',NATIVE_PUSH_ENABLED:'true',DB,VAPID_PRIVATE_JWK:'test-salt',
 FCM_RELAY_TOKEN:'f'.repeat(64),
 FIREBASE_RELAY:{fetch:async(_url,options)=>{
  assert.equal(options.headers['X-Zika-Relay-Authorization'],'f'.repeat(64));
  const message=JSON.parse(options.body);
  assert.equal(message.token,token);
  return Response.json({accepted:true,code:200});
 }}
});
function post(path,body){
 return new Request('https://app.zikamansle.fr'+path,{method:'POST',
 headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.1'},
 body:JSON.stringify(body)});
}

test('Firebase Android: inscription séparée du Web Push et état de livraison réel',async()=>{
 const {sql,DB}=fakeDB();
 const env=readyEnv(DB);
 const r=await handleNativeProduction(post('/api/native/subscribe',{token,platform:'android'}),env);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,deliveryReady:true});
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM native_push_devices').get().n,1);
 assert.equal((await handleNativeProduction(post('/api/native/subscribe',{platform:'web',token}),env)).status,400);
 assert.equal((await handleNativeProduction(post('/api/native/subscribe',{platform:'android',token}),{...env,APP_ENV:'staging'})).status,503);
 const status=await(await handleNativeProduction(new Request('https://app.zikamansle.fr/api/native/config'),env)).json();
 assert.deepEqual(status,{enabled:true,deliveryReady:true});
 assert.equal((await handleNativeProduction(new Request('https://app.zikamansle.fr/administration/api/native-status'),env,async()=>false)).status,403);
});

test('Actualités: livraison FCM native ciblée, unique même en renvoyant une annonce',async()=>{
 const {sql,DB}=fakeDB(),env=readyEnv(DB);
 await handleNativeProduction(post('/api/native/subscribe',{token,platform:'android'}),env);
 const news={id:'news-1',title:'Nouvelle du festival',body:'Concert annoncé',url:'/index.html#actualites'};
 assert.equal(await queueNativeNews(env,news),1);
 assert.equal(await queueNativeNews(env,news),0);
 const result=await drainNativePush(env);
 assert.equal(result.sent,1);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM native_delivery_jobs WHERE status='sent'").get().n,1);
 assert.equal((await drainNativePush(env)).sent,0);
});

test('ZikaTeam: abonnement lié uniquement après connexion et suppression si droit retiré',async()=>{
 const {sql,DB}=fakeDB(),env=readyEnv(DB);
 await handleNativeProduction(post('/api/native/subscribe',{token,platform:'android'}),env);
 assert.equal(await linkNativeMember(DB,'member-1','bad'),false);
 assert.equal(await linkNativeMember(DB,'member-1',token),true);
 sql.prepare('INSERT INTO team_members(id,active) VALUES(?,?)').run('member-1',1);
 sql.prepare('INSERT INTO team_activities(id,status,audience,starts_at) VALUES(?,?,?,?)').run('activity-1','published','all','2027-04-24T18:00:00.000Z');
 const meeting={id:'activity-1',title:'Réunion ZikaTeam',starts_at:'2027-04-24T18:00:00.000Z'};
 assert.equal(await queueNativeActivity(DB,meeting,'created',['member-1']),1);
 assert.equal((await drainNativePush(env)).sent,1);
 assert.equal(await queueNativeActivity(DB,meeting,'created',['member-1']),0);
 sql.prepare('UPDATE team_activities SET status=? WHERE id=?').run('cancelled','activity-1');
 await queueNativeActivity(DB,meeting,'cancelled',['member-1']);
 sql.prepare('UPDATE team_members SET active=0 WHERE id=?').run('member-1');
 assert.equal((await drainNativePush(env)).sent,0);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM native_delivery_jobs WHERE status='failed'").get().n,1);
});

test('Relais interne Firebase: toute requête sans secret partagé est interdite',async()=>{
 const request=post('/internal/native/send',{token,data:{title:'Test',body:'Test',url:'/index.html#actualites'}});
 const staging={APP_ENV:'staging',PUSH_SEND_ENABLED:'false',FCM_RELAY_TOKEN:'f'.repeat(64)};
 assert.equal((await handleNativeRelay(request,staging)).status,404);
 assert.equal((await handleNativeRelay(request,{...staging,APP_ENV:'production'})).status,404);
});

test('FCM natif : la clé privée n’est pas transmise au relais',async()=>{
 const env=readyEnv({});
 let captured;
 env.FIREBASE_RELAY.fetch=async(_url,options)=>{captured=JSON.parse(options.body);return Response.json({accepted:true,code:200})};
 assert.deepEqual(await sendNativeFCM(token,{title:'ZikaTeam',body:'Réunion',url:'/zikateam#activites'},env),{accepted:true,code:200});
 assert.deepEqual(captured,{token,data:{title:'ZikaTeam',body:'Réunion',url:'/zikateam#activites'}});
 assert.equal(JSON.stringify(captured).includes('FCM_RELAY_TOKEN'),false);
});
