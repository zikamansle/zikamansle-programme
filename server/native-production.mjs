import {classifyFirebaseCredentials,fcmAssertion,firebasePreflight} from './native-push.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const TOKEN_URL='https://oauth2.googleapis.com/token';
const FCM_URL='https://fcm.googleapis.com/v1/projects/zikamansle-d0c4e/messages:send';
const HOST='app.zikamansle.fr';
const validToken=t=>typeof t==='string'&&t.length>=40&&t.length<=4096&&/^[A-Za-z0-9_:.-]+$/.test(t);
const hash=async str=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const enabled=env=>env.APP_ENV==='production'&&env.NATIVE_PUSH_ENABLED==='true'&&!!env.DB;
const ownCredential=env=>classifyFirebaseCredentials(env.FCM_SERVICE_ACCOUNT_JSON).stage==='CONFIG_PARSED';
const relayConfigured=env=>Boolean(env.FIREBASE_RELAY?.fetch&&typeof env.FCM_RELAY_TOKEN==='string'&&env.FCM_RELAY_TOKEN.length>=64);
const configured=env=>ownCredential(env)||relayConfigured(env);
const all=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results;
const one=async(db,sql,...params)=>db.prepare(sql).bind(...params).first();

let readyAt=0,readyResult=false;
export async function nativeDeliveryReady(env){
 if(!enabled(env)||!configured(env))return false;
 if(ownCredential(env))return (await firebasePreflight(env)).ready===true;
 if(Date.now()-readyAt<180000)return readyResult;
 try{
  const response=await env.FIREBASE_RELAY.fetch('https://zikamansle-app-staging.zikamansle.workers.dev/internal/native/preflight',{
   method:'GET',headers:{'X-Zika-Relay-Authorization':env.FCM_RELAY_TOKEN},signal:AbortSignal.timeout(15000)
  });
  const state=await response.json();
  readyResult=response.ok&&state?.ready===true;
 }catch{readyResult=false}
 readyAt=Date.now();
 return readyResult;
}
let cachedToken=null,expiresAt=0;
async function fcmAccess(env,fetcher=fetch){
 const parsed=classifyFirebaseCredentials(env.FCM_SERVICE_ACCOUNT_JSON);
 if(parsed.stage!=='CONFIG_PARSED')throw Error(parsed.stage);
 if(cachedToken&&Date.now()<expiresAt)return cachedToken;
 const assertion=await fcmAssertion(parsed.credentials);
 const r=await fetcher(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},redirect:'manual',
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('OAUTH_'+r.status);
 const data=await r.json();
 if(typeof data.access_token!=='string'||!data.access_token)throw Error('OAUTH_INVALID');
 cachedToken=data.access_token;
 expiresAt=Date.now()+Math.max(0,Math.min(Number(data.expires_in||3600)-120,3000))*1000;
 return cachedToken;
}
export async function sendNativeFCM(token,data,env,fetcher=fetch){
 if(!enabled(env)||!configured(env))return {accepted:false,code:503};
 if(!validToken(token))return {accepted:false,code:400};
 if(!ownCredential(env)&&relayConfigured(env)){
  // The staging Worker holds the existing service account key. Service binding
  // traffic stays inside Cloudflare, and a separate shared secret authorizes it.
  const response=await env.FIREBASE_RELAY.fetch('https://zikamansle-app-staging.zikamansle.workers.dev/internal/native/send',{
   method:'POST',headers:{'Content-Type':'application/json','X-Zika-Relay-Authorization':env.FCM_RELAY_TOKEN},
   body:JSON.stringify({token,data}),signal:AbortSignal.timeout(18000)
  });
  const result=await response.json().catch(()=>({accepted:false,code:response.status}));
  return {accepted:response.ok&&result.accepted===true,code:result.code||response.status};
 }
 const access=await fcmAccess(env,fetcher);
 const url=typeof data.url==='string'&&data.url.startsWith('/zikateam')?data.url:
  typeof data.url==='string'&&data.url.startsWith('/index.html')?data.url:'/index.html#actualites';
 const message={message:{token,android:{priority:'HIGH'},data:{
  title:String(data.title||'ZikaMansle').slice(0,80),
  body:String(data.body||'').slice(0,300),
  url:'https://'+HOST+url
 }}};
 const result=await fetcher(FCM_URL,{method:'POST',redirect:'manual',
  headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},
  body:JSON.stringify(message),signal:AbortSignal.timeout(12000)});
 return {accepted:result.ok,code:result.status};
}
export async function queueNativeNews(env,news){
 if(!enabled(env)||!news||!news.id)return 0;
 const sql=`INSERT OR IGNORE INTO native_delivery_jobs(id,source_type,source_id,device_id,member_id,reason,title,body,url,created_at)
 SELECT lower(hex(randomblob(16))),'news',?,id,NULL,'published',?,?,?,?
 FROM native_push_devices WHERE last_seen>?`;
 const result=await env.DB.prepare(sql).bind(news.id,news.title,news.body,news.url||'/index.html#actualites',Date.now(),Date.now()-90*86400000).run();
 return result.meta?.changes||0;
}
export async function queueNativeActivity(db,activity,reason,members){
 if(!activity||!['created','updated','cancelled'].includes(reason))return 0;
 let changes=0;
 for(const memberId of members){
  const prefs=await one(db,'SELECT activity_enabled,urgent_enabled FROM team_notification_preferences WHERE member_id=?',memberId);
  if((reason==='cancelled'&&prefs?.urgent_enabled===0)||(reason!=='cancelled'&&prefs?.activity_enabled===0))continue;
  const prefix=reason==='created'?'Nouvelle activité':reason==='cancelled'?'Activité annulée':'Activité modifiée';
  const r=await db.prepare(`INSERT OR IGNORE INTO native_delivery_jobs(id,source_type,source_id,device_id,member_id,reason,title,body,url,created_at)
   SELECT lower(hex(randomblob(16))),'team',?,l.device_id,l.member_id,?,?,?,?,?
   FROM native_push_links l JOIN native_push_devices d ON d.id=l.device_id
   JOIN team_members m ON m.id=l.member_id AND m.active=1 WHERE l.member_id=?`)
   .bind(activity.id,reason,'ZikaTeam · '+prefix,activity.title+' · '+new Date(activity.starts_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),'/zikateam#activites',Date.now(),memberId).run();
  changes+=r.meta?.changes||0;
 }
 return changes;
}
export async function linkNativeMember(db,memberId,token){
 if(!validToken(token)||!memberId)return false;
 const id=await hash(token);
 const device=await one(db,'SELECT id FROM native_push_devices WHERE id=? AND token=?',id,token);
 if(!device)return false;
 await db.prepare('INSERT INTO native_push_links(device_id,member_id,linked_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET member_id=excluded.member_id,linked_at=excluded.linked_at')
  .bind(id,memberId,Date.now()).run();
 return true;
}
async function memberStillAllowed(db,activity,memberId){
 if(activity.audience==='all')return true;
 if(activity.audience==='bureau'||activity.audience==='leaders'&&await one(db,'SELECT activity_id FROM team_activity_bureau_audience WHERE activity_id=?',activity.id)){
  return !!await one(db,"SELECT 1 AS ok FROM team_member_roles WHERE member_id=? AND role IN ('bureau','director') LIMIT 1",memberId);
 }
 if(activity.audience==='leaders'){
  return !!await one(db,"SELECT 1 AS ok FROM team_memberships tm JOIN team_poles p ON p.id=tm.pole_id WHERE tm.member_id=? AND tm.role='lead' AND p.archived=0 LIMIT 1",memberId);
 }
 return !!await one(db,"SELECT 1 AS ok FROM team_memberships tm JOIN team_activity_poles ap ON ap.pole_id=tm.pole_id JOIN team_poles p ON p.id=tm.pole_id WHERE tm.member_id=? AND p.archived=0 AND ap.activity_id=? LIMIT 1",memberId,activity.id);
}
export async function drainNativePush(env,maximum=25,send=sendNativeFCM){
 if(!await nativeDeliveryReady(env))return {sent:0,disabled:true};
 const db=env.DB,rows=await all(db,"SELECT * FROM native_delivery_jobs WHERE status='pending' ORDER BY created_at LIMIT ?",maximum);
 let sent=0;
 for(const job of rows){
  const claim=await db.prepare("UPDATE native_delivery_jobs SET status='sending' WHERE id=? AND status='pending'").bind(job.id).run();
  if(!claim.meta?.changes)continue;
  const device=await one(db,'SELECT token FROM native_push_devices WHERE id=?',job.device_id);
  let allowed=Boolean(device);
  if(allowed&&job.source_type==='team'){
   const activity=await one(db,'SELECT * FROM team_activities WHERE id=?',job.source_id);
   const link=await one(db,'SELECT member_id FROM native_push_links WHERE device_id=? AND member_id=?',job.device_id,job.member_id);
   const member=await one(db,'SELECT active FROM team_members WHERE id=?',job.member_id);
   const prefs=await one(db,'SELECT activity_enabled,urgent_enabled,quiet_enabled,quiet_start,quiet_end FROM team_notification_preferences WHERE member_id=?',job.member_id);
   allowed=Boolean(activity&&link&&member?.active&&
    ((job.reason==='cancelled'&&activity.status==='cancelled'&&prefs?.urgent_enabled!==0)||
    (job.reason!=='cancelled'&&activity.status==='published'&&prefs?.activity_enabled!==0))&&
    await memberStillAllowed(db,activity,job.member_id));
   if(allowed&&prefs?.quiet_enabled&&job.reason!=='cancelled'){
    const local=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false});
    const start=prefs.quiet_start||'22:00',end=prefs.quiet_end||'08:00';
    if(start<=end?(local>=start&&local<end):(local>=start||local<end)){
     await db.prepare("UPDATE native_delivery_jobs SET status='pending' WHERE id=?").bind(job.id).run();
     continue;
    }
   }
  }
  if(!allowed){await db.prepare("UPDATE native_delivery_jobs SET status='failed',code=0 WHERE id=?").bind(job.id).run();continue;}
  let code=0;
  try{const r=await send(device.token,{title:job.title,body:job.body,url:job.url},env);code=r.code||0}catch{code=0}
  const ok=code>=200&&code<300;
  await db.prepare('UPDATE native_delivery_jobs SET status=?,code=?,sent_at=? WHERE id=?').bind(ok?'sent':'failed',code,Date.now(),job.id).run();
  if(ok)sent++;
  // Invalid tokens cannot receive future broadcasts.
  if([404,410].includes(code)){await db.prepare('DELETE FROM native_push_links WHERE device_id=?').bind(job.device_id).run();await db.prepare('DELETE FROM native_push_devices WHERE id=?').bind(job.device_id).run();}
 }
 return {sent,disabled:false};
}
export async function handleNativeProduction(request,env,isAdmin){
 if(!enabled(env))return json({error:'Notifications Android indisponibles.'},503);
 const u=new URL(request.url),path=u.pathname,db=env.DB;
 if(path==='/api/native/config'&&request.method==='GET')return json({enabled:true,deliveryReady:await nativeDeliveryReady(env)});
 if(path==='/api/native/subscribe'&&request.method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>4600)return json({error:'Requête invalide'},400);
  const body=await request.text();if(body.length>4600)return json({error:'Requête trop longue'},413);
  let data;try{data=JSON.parse(body)}catch{return json({error:'Requête invalide'},400)}
  if(data.platform!=='android'||!validToken(data.token))return json({error:'Jeton invalide'},400);
  const id=await hash(data.token),time=Date.now();
  const ip=await hash((request.headers.get('cf-connecting-ip')||'unknown')+'|native-production|'+env.VAPID_PRIVATE_JWK);
  const previous=await one(db,'SELECT id FROM native_push_devices WHERE id=?',id);
  if(!previous){
   const count=await one(db,'SELECT COUNT(*) AS n FROM native_push_devices WHERE ip_hash=? AND created>?',ip,time-86400000);
   if((count?.n||0)>=12)return json({error:'Trop de demandes'},429);
  }
  await db.prepare('INSERT INTO native_push_devices(id,token,created,last_seen,ip_hash) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen')
   .bind(id,data.token,time,time,ip).run();
  return json({ok:true,deliveryReady:await nativeDeliveryReady(env)});
 }
 if(path==='/api/native/selftest'&&request.method==='POST'){
  if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>4600)
   return json({error:'Requête invalide'},400);
  const raw=await request.text();if(raw.length>4600)return json({error:'Requête invalide'},400);
  let data;try{data=JSON.parse(raw)}catch{return json({error:'Requête invalide'},400)}
  if(!validToken(data?.token))return json({error:'Jeton Firebase invalide'},400);
  const id=await hash(data.token),registered=await one(db,'SELECT id FROM native_push_devices WHERE id=? AND token=?',id,data.token);
  if(!registered)return json({error:'Réinscrivez cet appareil Android.'},403);
  if(!await nativeDeliveryReady(env))return json({error:'Connexion Firebase indisponible.'},503);
  const minute=String(Math.floor(Date.now()/60000));
  const job=crypto.randomUUID(),stamp=Date.now();
  const sql="INSERT OR IGNORE INTO native_delivery_jobs(id,source_type,source_id,device_id,member_id,reason,title,body,url,created_at) VALUES(?,'selftest',?,?,NULL,'manual',?,?,?,?)";
  const title='Test ZikaMansle',body='Notification envoyée directement à l’application Android.';
  const gate=await db.prepare(sql).bind(job,minute,id,title,body,'/index.html#actualites',stamp).run();
  if(!gate.meta?.changes)return json({error:'Attendez une minute avant un nouveau test.'},429);
  let code=0;try{const result=await sendNativeFCM(data.token,{title,body,url:'/index.html#actualites'},env);code=result.code||0}catch{code=0}
  const accepted=code>=200&&code<300;
  await db.prepare('UPDATE native_delivery_jobs SET status=?,code=?,sent_at=? WHERE id=?')
   .bind(accepted?'sent':'failed',code,Date.now(),job).run();
  return json({accepted,code},accepted?200:502);
 }
 if(path==='/api/native/unsubscribe'&&request.method==='POST'){
  const data=await request.json().catch(()=>null);
  if(!validToken(data?.token))return json({error:'Jeton invalide'},400);
  const id=await hash(data.token);
  await db.prepare('DELETE FROM native_push_links WHERE device_id=?').bind(id).run();
  await db.prepare('DELETE FROM native_push_devices WHERE id=? AND token=?').bind(id,data.token).run();
  return json({ok:true});
 }
 if(path==='/administration/api/native-status'&&request.method==='GET'){
  if(!await isAdmin(request,env))return json({error:'Accès requis'},403);
  const counts=await one(db,'SELECT COUNT(*) AS n FROM native_push_devices');
  const queued=await one(db,"SELECT COUNT(*) AS n FROM native_delivery_jobs WHERE status='pending'");
  return json({devices:counts?.n||0,queued:queued?.n||0,deliveryReady:await nativeDeliveryReady(env)});
 }
 return json({error:'Route introuvable'},404);
}

/**
 * Private Firebase relay for the official Android app (never browser push).
 * The staging secret never leaves its Worker.
 * Both a Cloudflare Worker service binding and a 256-bit shared secret are
 * required by the production sender. Public requests cannot send FCM messages.
 */
export async function handleNativeRelay(request,env){
 if(env.APP_ENV!=='staging'||env.PUSH_SEND_ENABLED!=='false'||
    typeof env.FCM_RELAY_TOKEN!=='string'||env.FCM_RELAY_TOKEN.length<64||
    request.headers.get('X-Zika-Relay-Authorization')!==env.FCM_RELAY_TOKEN)
  return json({error:'Route introuvable'},404);
 if(request.method==='GET'&&new URL(request.url).pathname==='/internal/native/preflight'){
  return json(await firebasePreflight(env));
 }
 if(request.method!=='POST'||new URL(request.url).pathname!=='/internal/native/send')
  return json({error:'Route introuvable'},404);
 if(!request.headers.get('Content-Type')?.startsWith('application/json')||
    Number(request.headers.get('Content-Length')||0)>5500)return json({error:'Requête invalide'},400);
 const raw=await request.text();if(raw.length>5500)return json({error:'Requête invalide'},400);
 let body;try{body=JSON.parse(raw)}catch{return json({error:'Requête invalide'},400)}
 if(!validToken(body?.token)||typeof body?.data?.title!=='string'||
    typeof body?.data?.body!=='string'||typeof body?.data?.url!=='string'||
    body.data.title.length>80||body.data.body.length>300||
    !(body.data.url==='/zikateam'||body.data.url.startsWith('/zikateam#')||
      body.data.url.startsWith('/zikateam?')||body.data.url==='/index.html'||
      body.data.url.startsWith('/index.html#')||body.data.url.startsWith('/index.html?')))
  return json({error:'Message invalide'},400);
 // Only uses the credential already installed in the staging Worker.
 const sendEnv={...env,APP_ENV:'production',NATIVE_PUSH_ENABLED:'true',FIREBASE_RELAY:null,FCM_RELAY_TOKEN:null};
 try{
  const result=await sendNativeFCM(body.token,body.data,sendEnv);
  return json(result,result.accepted?200:502);
 }catch{
  return json({accepted:false,code:502},502);
 }
}
