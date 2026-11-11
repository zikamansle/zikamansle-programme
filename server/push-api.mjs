import {isAdmin} from './admin-auth.mjs';
import {enc,b64,un64,validEndpoint,safePath,sendPush} from './webpush.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const hash=async s=>b64(await crypto.subtle.digest('SHA-256',enc(s)));
export async function handle(req,env,authorize=isAdmin){
 try{
 const action=new URL(req.url).pathname.split('/').pop(),db=env.DB;
 if(!db)return json({error:'Le service de notifications est temporairement indisponible.'},503);
 if(action==='selftest'&&env.PUSH_TEST_ENABLED!=='true'&&env.PUSH_SEND_ENABLED!=='true')return json({error:'Tests de notifications désactivés dans cet environnement.'},503);
 if(['subscribe','config','send','selftest'].includes(action)&&(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_JWK))return json({error:'Clés push non configurées.'},503);
 if(req.method==='GET'){
  if(action==='media'){
   const id=new URL(req.url).searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id||'')||!env.BUCKET)return json({error:'Média introuvable'},404);
   const object=await env.BUCKET.get('push/'+id);if(!object)return json({error:'Média introuvable'},404);
   return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
  }
  if(action==='config')return json({publicKey:env.VAPID_PUBLIC_KEY});
  if(action==='news')return json({items:(await db.prepare('SELECT id,title,body,url,created,media FROM push_notifications WHERE test=0 AND archived=0 ORDER BY created DESC LIMIT 50').all()).results});
  if(action==='admin'){
   if(!await authorize(req,env))return json({error:'Connectez-vous avec le compte administrateur du festival.'},403);
   const count=await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first();
   const history=await db.prepare('SELECT n.*, (SELECT COUNT(*) FROM push_deliveries d WHERE d.message=n.id AND d.received IS NOT NULL) received, (SELECT COUNT(*) FROM push_deliveries d WHERE d.message=n.id AND d.displayed=1) displayed, (SELECT COUNT(*) FROM push_deliveries d WHERE d.message=n.id AND d.status=\'pending\') pending, (SELECT COUNT(*) FROM push_deliveries d WHERE d.message=n.id AND d.status=\'accepted\') accepted,(SELECT COUNT(*) FROM push_deliveries d WHERE d.message=n.id AND d.status IN (\'failed\',\'sending\')) failed FROM push_notifications n WHERE n.archived=0 ORDER BY created DESC LIMIT 30').all();
   return json({subscribers:count.n,history:history.results});
  }return json({error:'Introuvable'},404);
 }
 if(req.method!=='POST')return json({error:'Méthode refusée'},405);
 if(action==='upload'){
  if(req.headers.get('origin')!==new URL(req.url).origin||!await authorize(req,env))return json({error:'Accès administrateur requis.'},403);
  if(!env.BUCKET)return json({error:'Stockage indisponible'},503);
  const type=req.headers.get('content-type');if(!['image/png','image/jpeg','image/webp','image/gif','video/mp4','application/pdf'].includes(type))return json({error:'Formats acceptés : JPG, PNG, WebP, GIF, MP4 et PDF.'},400);
  const limit=8*1024*1024;if(Number(req.headers.get('content-length')||0)>limit)return json({error:'Le média doit peser moins de 8 Mo.'},413);
  const reader=req.body?.getReader();if(!reader)return json({error:'Fichier vide'},400);let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return json({error:'Le média doit peser moins de 8 Mo.'},413)}chunks.push(value)}
  if(!size)return json({error:'Fichier vide'},400);
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  const id=crypto.randomUUID();await env.BUCKET.put('push/'+id,bytes,{httpMetadata:{contentType:type}});
  return json({url:'/api/push/media?id='+id,type});
 }
 if(req.headers.get('origin')!==new URL(req.url).origin||!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'Requête refusée'},403);
 if(Number(req.headers.get('content-length')||0)>12000)return json({error:'Requête trop longue'},413);
 const raw=await req.text();if(raw.length>12000)return json({error:'Requête trop longue'},413);
 let data;try{data=JSON.parse(raw)}catch{return json({error:'Requête invalide'},400)}
 if(['subscribe','unsubscribe','receipt','selftest','test-status'].includes(action)){
  const s=data.subscription;
  if(!s||!validEndpoint(s.endpoint)||typeof s.keys?.p256dh!=='string'||typeof s.keys?.auth!=='string'||un64(s.keys.p256dh).length!==65||un64(s.keys.auth).length!==16)return json({error:'Abonnement invalide'},400);
  const id=await hash(s.endpoint);
  if(action==='selftest'||action==='test-status'){
   const registered=await db.prepare('SELECT auth,p256dh FROM push_subscriptions WHERE id=?').bind(id).first();
   if(!registered||registered.auth!==s.keys.auth||registered.p256dh!==s.keys.p256dh)return json({error:'Réactivez les notifications sur cet appareil.'},403);
   if(action==='test-status'){
    const state=await db.prepare('SELECT status,code,received,displayed FROM push_deliveries WHERE message=? AND subscription=?').bind(String(data.id||''),id).first();
    return state?json(state):json({error:'Test introuvable'},404);
   }
   const now=Date.now();
   const gate=await db.prepare("INSERT INTO push_config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(push_config.value AS INTEGER)<?").bind('selftest:'+id,String(now),now-60000).run();
   if(!gate.meta.changes)return json({error:'Attendez une minute entre deux tests.'},429);
   const message=crypto.randomUUID(),payload={id:message,title:'Test push ZikaMansle',body:'Ce message a été envoyé à distance par le serveur du festival.',url:'/index.html#actualites'};
   await db.batch([db.prepare('INSERT INTO push_notifications(id,title,body,url,created,test) VALUES(?,?,?,?,?,1)').bind(message,payload.title,payload.body,payload.url,now),db.prepare("INSERT INTO push_deliveries(message,subscription,status) VALUES(?,?,'sending')").bind(message,id)]);
   let code=0,failure=null;try{code=await sendPush(s,payload,env)}catch(e){failure={stage:e.stage||'unknown',kind:e.kind||'Error'}}
   const accepted=code>=200&&code<300;
   await db.prepare('UPDATE push_deliveries SET status=?,code=? WHERE message=? AND subscription=?').bind(accepted?'accepted':'failed',code,message,id).run();
   console.info(JSON.stringify({event:'push-selftest',id:message,provider:new URL(s.endpoint).hostname,code,failure}));
   return json({id:message,accepted,code,failure});
  }
  if(action==='receipt'){
   const registered=await db.prepare('SELECT auth FROM push_subscriptions WHERE id=?').bind(id).first();
   if(!registered||registered.auth!==s.keys.auth)return json({error:'Abonnement non reconnu'},403);
   await db.prepare('UPDATE push_deliveries SET received=?,displayed=? WHERE message=? AND subscription=?').bind(Date.now(),data.displayed===true?1:0,String(data.id||''),id).run();return json({ok:true});
  }
  if(action==='unsubscribe'){await db.prepare('DELETE FROM push_subscriptions WHERE id=? AND auth=?').bind(id,s.keys.auth).run();return json({ok:true})}
  await crypto.subtle.importKey('raw',un64(s.keys.p256dh),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const old=await db.prepare('SELECT id FROM push_subscriptions WHERE id=?').bind(id).first();
  if(!old){
   const ip=await hash((req.headers.get('cf-connecting-ip')||'unknown')+env.VAPID_PRIVATE_JWK);
   const count=await db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE ip=? AND created>?').bind(ip,Date.now()-86400000).first();
   if(count.n>=30)return json({error:'Trop de demandes. Réessayez demain.'},429);
   await db.prepare('INSERT INTO push_subscriptions(id,endpoint,p256dh,auth,created,ip) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth').bind(id,s.endpoint,s.keys.p256dh,s.keys.auth,Date.now(),ip).run();
  }else{await db.prepare('UPDATE push_subscriptions SET p256dh=?,auth=? WHERE id=?').bind(s.keys.p256dh,s.keys.auth,id).run()}return json({ok:true});
 }
 if(!await authorize(req,env))return json({error:'Accès administrateur requis.'},403);
 if(action==='clear-history'){
  await db.prepare('UPDATE push_notifications SET archived=1 WHERE archived=0').run();return json({ok:true});
 }
 if(action==='create'){
  const {id,title,body,url,test,subscription,media}=data;
  if(media){if(!/^\/api\/push\/media\?id=[a-f0-9-]{36}$/.test(media.url||'')||!env.BUCKET)return json({error:'Média invalide'},400);const object=await env.BUCKET.head('push/'+media.url.split('=')[1]);if(!object||object.httpMetadata?.contentType!==media.type)return json({error:'Média introuvable'},400)}
  if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||typeof title!=='string'||!title.trim()||title.length>80||typeof body!=='string'||!body.trim()||body.length>300||!safePath(url))return json({error:'Vérifiez le titre (80 caractères), le texte (300) et le lien interne.'},400);
  const exists=await db.prepare('SELECT id FROM push_notifications WHERE id=?').bind(id).first();if(exists)return json({id});
  let target;if(test){target=await hash(subscription?.endpoint||'');const s=await db.prepare('SELECT auth FROM push_subscriptions WHERE id=?').bind(target).first();if(!s||s.auth!==subscription?.keys?.auth)return json({error:'Activez les notifications sur cet appareil avant le test.'},400)}
  await db.batch([
   db.prepare('INSERT INTO push_notifications(id,title,body,url,created,test,media) VALUES(?,?,?,?,?,?,?)').bind(id,title.trim(),body.trim(),media?'/index.html#actualites':url,Date.now(),test?1:0,media?JSON.stringify({url:media.url,type:media.type}):null),
   target?db.prepare('INSERT INTO push_deliveries(message,subscription) VALUES(?,?)').bind(id,target):db.prepare('INSERT INTO push_deliveries(message,subscription) SELECT ?,id FROM push_subscriptions').bind(id)
  ]);return json({id});
 }
 if(action==='send'){
  const n=await db.prepare('SELECT * FROM push_notifications WHERE id=? AND archived=0').bind(data.id||'').first();if(!n)return json({error:'Message introuvable'},404);
  // On staging, only a single-device, verified test draft can be sent. Never broadcast.
  if(env.PUSH_SEND_ENABLED!=='true'&&!(env.PUSH_TEST_ENABLED==='true'&&n.test===1))return json({error:'Envoi général désactivé en version de test.'},503);
  const rows=(await db.prepare("SELECT d.subscription,s.endpoint,s.p256dh,s.auth FROM push_deliveries d LEFT JOIN push_subscriptions s ON s.id=d.subscription WHERE d.message=? AND d.status='pending' LIMIT 15").bind(n.id).all()).results;
  await Promise.all(rows.map(async s=>{
   const claim=await db.prepare("UPDATE push_deliveries SET status='sending' WHERE message=? AND subscription=? AND status='pending'").bind(n.id,s.subscription).run();if(!claim.meta.changes)return;
   let code=410;try{if(s.endpoint)code=await sendPush({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},{id:n.id,title:n.test?'[TEST] '+n.title:n.title,body:n.body,url:n.url,...(n.media&&JSON.parse(n.media).type.startsWith('image/')?{image:JSON.parse(n.media).url}:{})},env)}catch{code=0}
   await db.prepare('UPDATE push_deliveries SET status=?,code=? WHERE message=? AND subscription=?').bind(code>=200&&code<300?'accepted':'failed',code,n.id,s.subscription).run();
   if(code===404||code===410)await db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(s.subscription).run();
  }));
  const pending=await db.prepare("SELECT COUNT(*) n FROM push_deliveries WHERE message=? AND status='pending'").bind(n.id).first();return json({pending:pending.n});
 }
 return json({error:'Introuvable'},404);
 }catch{return json({error:'Impossible de terminer cette opération. Réessayez.'},500)}
}
