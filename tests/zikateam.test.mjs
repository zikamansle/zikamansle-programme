import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Real SQL migrations and the real ZikaTeam implementation. Only JWT and network
// push are test doubles: cryptographic Access tests live in admin-auth tests.
test('ZikaTeam : rôles, convocations ciblées, charte, réponses, tâches et pointage',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zika-team-'));
 try{
  writeFileSync(join(dir,'zikateam.mjs'),readFileSync('server/zikateam.mjs'));
  writeFileSync(join(dir,'admin-auth.mjs'),"export async function verifyAccessIdentity(token,env){return token&&env.ACCESS_AUD==='team-test'?{email:token.toLowerCase()}:null}");
  writeFileSync(join(dir,'webpush.mjs'),"export const enc=s=>new TextEncoder().encode(s); export const b64=b=>Buffer.from(b).toString('base64url'); export async function sendPush(){return 201}");
  const {handleZikaTeam,drainTeamPush,scheduleTeamReminders}=await import(pathToFileURL(join(dir,'zikateam.mjs')));
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  // Rejouer toutes les migrations, comme le test historique et le Worker D1.
  const {readdirSync}=await import('node:fs');
  for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
   db.exec(readFileSync('drizzle/'+name,'utf8'));
  }
  const DB={prepare(q){const stmt=db.prepare(q);return {bind(...args){return {all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args),run:async()=>({meta:{changes:stmt.run(...args).changes}})}}}}};
  const env={DB,TEAM_ACCESS_AUD:'team-test',ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ADMIN_EMAIL:'admin@example.org',TEAM_PUSH_ENABLED:'false',BUCKET:{get:async()=>null}};
  async function invoke(email,path,data){
   const req=new Request('https://example.org'+path,{method:data?'POST':'GET',headers:{'Cf-Access-Jwt-Assertion':email,origin:'https://example.org','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
   const r=await handleZikaTeam(req,env);
   let payload;try{payload=await r.json()}catch{payload={}};
   return {status:r.status,payload};
  }
  const api=(email,op)=>invoke(email,'/zikateam/api/command',op);
  async function okay(email,op){const r=await api(email,op);assert.equal(r.status,200,JSON.stringify(r.payload));return r.payload;}
  const A='admin@example.org',L='lead@example.org',B='volunteer@example.org',O='other@example.org';
  assert.equal((await invoke('', '/zikateam/api/me')).status,403);
  assert.equal((await invoke(B,'/zikateam/api/me')).status,403);
  const lead=(await okay(A,{op:'member.save',name:'Responsable',email:L})).id;
  const member=(await okay(A,{op:'member.save',name:'Bénévole',email:B})).id;
  const other=(await okay(A,{op:'member.save',name:'Autre bénévole',email:O})).id;
  const pole=(await okay(A,{op:'pole.save',name:'ZikaVillage'})).id;
  const outsidePole=(await okay(A,{op:'pole.save',name:'Logistique'})).id;
  await okay(A,{op:'assignment.set',memberId:lead,poleId:pole,role:'lead'});
  await okay(A,{op:'assignment.set',memberId:member,poleId:pole,role:'member'});
  await okay(A,{op:'assignment.set',memberId:other,poleId:outsidePole,role:'member'});
  assert.equal((await invoke(L,'/zikateam/api/manage')).payload.poles.length,1);
  assert.equal((await api(L,{op:'assignment.set',memberId:member,poleId:outsidePole,role:'member'})).status,403);
  assert.equal((await api(L,{op:'assignment.set',memberId:member,poleId:pole,role:'lead'})).status,403);
  assert.equal((await api(B,{op:'pole.save',name:'Accès interdit'})).status,403);
  assert.equal((await api(L,{op:'activity.save',kind:'meeting',title:'Tous',audience:'all',starts_at:'2027-04-24T09:00:00.000Z',ends_at:'2027-04-24T10:00:00.000Z',status:'published'})).status,403);
  const act=await okay(L,{op:'activity.save',kind:'meeting',title:'Réunion ZikaVillage',agenda:'Ordre du jour',audience:'poles',poles:[pole],starts_at:'2027-04-24T09:00:00.000Z',ends_at:'2027-04-24T10:00:00.000Z',status:'published'});
  assert.equal(act.invitedMembers,2);
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities.length,1);
  assert.equal((await invoke(O,'/zikateam/api/me')).payload.activities.length,0);
  assert.equal((await api(O,{op:'activity.rsvp',activityId:act.id,answer:'yes'})).status,403);
  await okay(A,{op:'charter.save',version:'1',title:'Charte',content:'Respect et engagement'});
  assert.equal((await api(B,{op:'activity.rsvp',activityId:act.id,answer:'yes'})).status,409);
  await okay(B,{op:'charter.accept',version:'1'});
  await okay(B,{op:'activity.rsvp',activityId:act.id,answer:'yes'});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities[0].my_response,'yes');
  assert.equal((await api(A,{op:'charter.save',version:'1',title:'Charte',content:'Texte modifié'})).status,409);
  const task=await okay(L,{op:'task.save',activityId:act.id,title:'Installer les barnums',assigned_to:member,status:'todo'});
  assert.equal((await api(O,{op:'task.status',id:task.id,status:'done'})).status,409);
  await okay(B,{op:'task.status',id:task.id,status:'done'});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities[0].tasks[0].status,'done');
  assert.equal((await api(L,{op:'checkin.set',activityId:act.id,memberId:other,present:true})).status,403);
  await okay(L,{op:'checkin.set',activityId:act.id,memberId:member,present:true});
  assert.equal((await invoke(L,'/zikateam/api/manage')).payload.activities[0].attendance.filter(m=>m.checked_in_at).length,1);
  const shift=await okay(L,{op:'shift.save',activityId:act.id,starts_at:'2027-04-24T09:00:00.000Z',ends_at:'2027-04-24T10:00:00.000Z',capacity:1,label:'Montage'});
  await okay(B,{op:'shift.signup',shiftId:shift.id});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities[0].my_shifts.length,1);
  await okay(A,{op:'pole.archive',id:pole});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities.length,0);
  assert.deepEqual(await drainTeamPush(env),{sent:0,disabled:true});
  assert.deepEqual(await scheduleTeamReminders(env),{sent:0,disabled:true});
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
