import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('ZikaTeam : comptes Supabase gratuits sans sièges Zero Trust et droits D1',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zikateam-free-'));
 const oldFetch=globalThis.fetch;
 try{
  writeFileSync(join(dir,'zikateam.mjs'),readFileSync('server/zikateam.mjs'));
  writeFileSync(join(dir,'zikateam-login.mjs'),readFileSync('server/zikateam-login.mjs'));
  writeFileSync(join(dir,'admin-auth.mjs'),"export async function verifyAccessIdentity(){throw new Error('Cloudflare Access ne doit pas être appelé')}");
  writeFileSync(join(dir,'webpush.mjs'),"export const enc=s=>new TextEncoder().encode(s);export const b64=s=>'';export async function sendPush(){return 201}");
  const {handleZikaTeam}=await import(pathToFileURL(join(dir,'zikateam.mjs')));
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const sql of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+sql,'utf8'));
  const DB={prepare(sql){const stmt=db.prepare(sql);return {bind(...args){return {all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args),run:async()=>({meta:{changes:stmt.run(...args).changes}})}}}}};
  const env={DB,ADMIN_EMAIL:'admin@zikamansle.fr',TEAM_AUTH_PROVIDER:'supabase',TEAM_SUPABASE_URL:'https://project.supabase.co',TEAM_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_public-test',TEAM_PUSH_ENABLED:'false',BUCKET:{get:async()=>null}};
  const names={alice:'alice@zikamansle.fr',outsider:'outsider@example.org'};
  db.prepare('INSERT INTO team_members(id,name,email,active,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('10000000-0000-4000-a000-000000000001','Alice',names.alice,1,Date.now(),Date.now());
  const requests=[];
  globalThis.fetch=async (url,options)=>{
   requests.push({url:String(url),method:options?.method||'GET'});
   const respond=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
   if(String(url).endsWith('/auth/v1/otp'))return respond({});
   if(String(url).endsWith('/auth/v1/verify')){
    const data=JSON.parse(options.body);
    if(!['123456','87654321'].includes(data.token))return respond({error:'invalid'},401);
    return respond({access_token:data.email===names.outsider?'token-outsider':'token-alice',refresh_token:'refresh-alice',expires_in:3600});
   }
   if(String(url).endsWith('/auth/v1/user')){
    if(options?.headers?.Authorization==='Bearer token-admin')return respond({email:'admin@zikamansle.fr',email_confirmed_at:new Date().toISOString(),id:'user-admin'});
     if(options?.headers?.Authorization==='Bearer token-outsider')return respond({email:names.outsider,email_confirmed_at:new Date().toISOString(),id:'user-outsider'});
    return options?.headers?.Authorization==='Bearer token-alice'?respond({email:names.alice,email_confirmed_at:new Date().toISOString(),id:'user-id'}):respond({error:'not authorized'},401);
   }
   if(String(url).endsWith('/auth/v1/logout'))return respond({});
   return respond({error:'unexpected'},404);
  };
  async function invoke(path,data,cookie=''){
   const req=new Request('https://site.example'+path,{
    method:data?'POST':'GET',
    headers:{'Origin':'https://site.example','Content-Type':'application/json',...(cookie?{'Cookie':cookie}:{})},
    ...(data?{body:JSON.stringify(data)}:{})
   });
   return handleZikaTeam(req,env);
  }
  assert.equal((await invoke('/zikateam/api/auth/status')).status,200);
  assert.equal((await invoke('/zikateam/api/me')).status,403);
  assert.equal((await invoke('/zikateam/api/auth/request',{email:names.outsider})).status,200);
  assert.equal(requests.filter(x=>x.url.endsWith('/otp')).length,1,'les nouvelles adresses vérifient leur e-mail');
   assert.equal((await invoke('/zikateam/api/auth/verify',{email:names.outsider,code:'87654321'})).status,200);
   const pending=await invoke('/zikateam/api/me',undefined,'zika_team_access=token-outsider');
   assert.equal(pending.status,200);
   const pendingView=await pending.json();
   assert.equal(pendingView.pending,true,'la nouvelle personne reste en attente');
   assert.equal(pendingView.charterAccepted,false);
   assert.deepEqual(pendingView.activities,[],'aucune mission privée');
   assert.equal((await invoke('/zikateam/api/manage',undefined,'zika_team_access=token-outsider')).status,403,'aucun droit de gestion');
   assert.equal((await invoke('/zikateam/api/command',{op:'member.save',name:'Intrus',email:names.outsider},'zika_team_access=token-outsider')).status,403,'pas de self-validation');
  assert.equal((await invoke('/zikateam/api/auth/request',{email:names.alice})).status,200);
  assert.equal(requests.filter(r=>r.url.endsWith('/otp')).length,2);
  assert.equal((await invoke('/zikateam/api/auth/verify',{email:names.alice,code:'999999'})).status,401);
  assert.equal((await invoke('/zikateam/api/auth/verify',{email:names.alice,code:'1234567'})).status,400,'7 chiffres refuses');
  assert.equal((await invoke('/zikateam/api/auth/verify',{email:names.alice,code:'abcdefgh'})).status,400,'lettres refusees');
  const eight=await invoke('/zikateam/api/auth/verify',{email:names.alice,code:'87654321'});
  assert.equal(eight.status,200,'un code a 8 chiffres est valide');
  const auth=await invoke('/zikateam/api/auth/verify',{email:names.alice,code:'123456'});
  assert.equal(auth.status,200);
  const cookies=auth.headers.getSetCookie();
  assert.equal(cookies.length,2);
  assert.ok(cookies.every(c=>c.includes('HttpOnly')&&c.includes('Secure')&&c.includes('SameSite=Lax')));
  const jar=cookies.map(c=>c.split(';')[0]).join('; ');
  const me=await invoke('/zikateam/api/me',undefined,jar);
  assert.equal(me.status,200);
  const body=await me.json();assert.equal(body.member.email,names.alice);assert.equal(body.admin,false);
  assert.equal((await invoke('/zikateam/api/command',{op:'member.save',name:'Nope',email:'x@example.org'},jar)).status,403);
  const logout=await invoke('/zikateam/api/auth/logout',{},jar);
  assert.equal(logout.status,200);
  assert.ok(logout.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
  const adminCookie='zika_team_access=token-admin';
  const before=await invoke('/zikateam/api/me',undefined,adminCookie);
  assert.equal(before.status,200);
  const beforeBody=await before.json();
  assert.equal(beforeBody.admin,true);
  assert.equal(beforeBody.member,null,'un administrateur peut etre connecte sans fiche');
  const created=await invoke('/zikateam/api/command',{op:'member.save',name:'Administrateur de test',email:'admin@zikamansle.fr',active:true},adminCookie);
  assert.equal(created.status,200,'un administrateur peut creer sa propre fiche');
  const after=await invoke('/zikateam/api/me',undefined,adminCookie);
  assert.equal(after.status,200);
  const saved=(await after.json()).member;
  assert.equal(saved.name,'Administrateur de test');
  const updated=await invoke('/zikateam/api/command',{op:'member.save',id:saved.id,name:'Nom modifie',email:'admin@zikamansle.fr',active:true},adminCookie);
  assert.equal(updated.status,200,'la fiche est modifiable');
  assert.equal((await (await invoke('/zikateam/api/me',undefined,adminCookie)).json()).member.name,'Nom modifie');
  // Parcours complet d'une candidature : charte, lecture seule, approbation, droits et adhésions.
  const published=await invoke('/zikateam/api/command',{op:'charter.save',version:'2026',title:'Charte bénévoles',content:'Respect et entraide'},adminCookie);
  assert.equal(published.status,200,'la charte est publiable par l administrateur');
  assert.equal((await invoke('/zikateam/api/command',{op:'charter.accept',version:'2026',agree:true},adminCookie)).status,200);
  const outsiderCookie='zika_team_access=token-outsider';
  const waitPage=await invoke('/zikateam/api/me',undefined,outsiderCookie);
  assert.equal((await waitPage.json()).charterAccepted,false);
  assert.equal((await invoke('/zikateam/api/command',{op:'charter.accept',version:'2026',agree:true},outsiderCookie)).status,200);
  const signedPending=await invoke('/zikateam/api/me',undefined,outsiderCookie);
  assert.equal((await signedPending.json()).pending,true);
  assert.equal((await invoke('/zikateam/api/messages?channel=general',undefined,outsiderCookie)).status,200,'lecture de la discussion generale');
  assert.equal((await invoke('/zikateam/api/messages?channel=activity&id=10000000-0000-4000-a000-000000000001',undefined,outsiderCookie)).status,403,'aucun salon d activite en attente');
  assert.equal((await invoke('/zikateam/api/messages?channel=leaders',undefined,outsiderCookie)).status,403,'aucun salon responsables en attente');
  assert.equal((await invoke('/zikateam/api/command',{op:'message.send',channel:'general',body:'Intrusion'},outsiderCookie)).status,403,'publication bloquee avant approbation');
  const queue=await invoke('/zikateam/api/manage',undefined,adminCookie);
  assert.equal(queue.status,200);
  assert.ok((await queue.json()).pendingRequests.some(p=>p.email===names.outsider));
  const okReview=await invoke('/zikateam/api/command',{op:'member.review',email:names.outsider,name:'Nouvelle bénévole',approve:true,roles:['director'],secretariat:true,poleRoles:[]},adminCookie);
  assert.equal(okReview.status,200,'acceptation et designation de la fonction');
  const approved=await invoke('/zikateam/api/me',undefined,outsiderCookie);
  const approvedPage=await approved.json();
  assert.equal(approvedPage.pending,false);
  assert.equal(approvedPage.secretariat,true);
  const secretaryView=await invoke('/zikateam/api/manage',undefined,outsiderCookie);
  assert.equal(secretaryView.status,200,'secretaire autorisee a gerer annuaire et adhesions');
  const secData=await secretaryView.json();
  assert.ok(secData.contacts.some(p=>p.email===names.outsider));
  assert.equal((await invoke('/zikateam/api/command',{op:'dues.set',memberId:okReview.memberId||okReview.id,paid:true,paidOn:null,paymentMethod:'card'},outsiderCookie)).status,200,'date reglement facultative');
  assert.equal((await invoke('/zikateam/api/command',{op:'contact.set',memberId:okReview.memberId||okReview.id,phone:'0601020304',address:'10 rue des Fleurs',postalCode:'16230',city:'Mansle-les-Fontaines'},outsiderCookie)).status,200);
  const complete=await (await invoke('/zikateam/api/manage',undefined,outsiderCookie)).json();
  assert.equal(complete.dues.find(d=>d.member_id===(okReview.memberId||okReview.id)).payment_method,'card');
  assert.equal(complete.contacts.find(d=>d.member_id===(okReview.memberId||okReview.id)).phone,'0601020304');
  assert.equal((await invoke('/zikateam/api/command',{op:'dues.set',memberId:okReview.memberId||okReview.id,paid:true},jar)).status,403,'un benevole ne peut modifier les adhesions');
  db.close();
 }finally{globalThis.fetch=oldFetch;rmSync(dir,{recursive:true,force:true})}
});

test('le formulaire ZikaTeam accepte les codes a 8 chiffres',()=>{
 const ui=readFileSync('public/zikateam.js','utf8');
 assert.ok(ui.includes('pattern="[0-9]{6}|[0-9]{8}"'));
 assert.ok(ui.includes('maxlength="8"'));
 assert.ok(!ui.includes('code à six chiffres'));
});

test('l onglet Ma fiche permet de creer et modifier le profil administrateur',()=>{
 const ui=readFileSync('public/zikateam.js','utf8');
 assert.ok(ui.includes('Créer ma fiche personnelle'));
 assert.ok(ui.includes('id="teamMyProfileForm"'));
 assert.ok(ui.includes('Enregistrer ma fiche'));
 assert.ok(ui.includes("if(f.id==='teamMyProfileForm')"));
 assert.ok(ui.includes('email:state.me.email'));
});
