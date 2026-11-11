// Connexion gratuite ZikaTeam : comptes Supabase Auth, codes e-mail, session HttpOnly.
// Aucune clef secrète Supabase n'est utilisée dans le navigateur ni dans ce Worker.
// Les droits restent toujours déterminés par les tables D1 team_members / team_staff_roles.
const accessCookie='zika_team_access',refreshCookie='zika_team_refresh';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const response=(data,status=200,extra=[])=>{
 const h=new Headers({...headers,'Content-Type':'application/json; charset=utf-8'});
 for(const value of extra)h.append('Set-Cookie',value);
 return new Response(JSON.stringify(data),{status,headers:h});
};
const cleanEmail=e=>typeof e==='string'?e.trim().toLowerCase():'';
const validEmail=e=>e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const configured=env=>/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.TEAM_SUPABASE_URL||'')&&
 /^sb_publishable_[\w-]+$/.test(env.TEAM_SUPABASE_PUBLISHABLE_KEY||'');
const cookies=request=>{
 const result={};
 for(const c of (request.headers.get('cookie')||'').split(';')){
  const pos=c.indexOf('=');if(pos<0)continue;
  const k=c.slice(0,pos).trim();if(k!==accessCookie&&k!==refreshCookie)continue;
  try{result[k]=decodeURIComponent(c.slice(pos+1).trim())}catch{}
 }
 return result;
};
const cookie=(key,value,maxAge)=>key+'='+encodeURIComponent(value)+'; Path=/zikateam; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax';
const clear=()=>[cookie(accessCookie,'',0),cookie(refreshCookie,'',0)];
const issue=tokens=>{
 const ttl=Math.max(0,Math.min(3600,Number(tokens.expires_in)||3600));
 if(!tokens.access_token||!tokens.refresh_token)return [];
 return [cookie(accessCookie,tokens.access_token,ttl),cookie(refreshCookie,tokens.refresh_token,30*86400)];
};
async function provider(env,path,init={}){
 if(!configured(env))return null;
 try{
  const res=await fetch(env.TEAM_SUPABASE_URL+'/auth/v1'+path,{
   ...init,headers:{apikey:env.TEAM_SUPABASE_PUBLISHABLE_KEY,
    ...(init.body?{'Content-Type':'application/json'}:{}),...init.headers},
   signal:AbortSignal.timeout(9000)
  });
  let data={};try{data=await res.json()}catch{}
  return {ok:res.ok,status:res.status,data};
 }catch{return {ok:false,status:503,data:{}}}
}
async function verifiedUser(env,token){
 if(!token)return null;
 const result=await provider(env,'/user',{headers:{Authorization:'Bearer '+token}});
 if(!result?.ok)return null;
 const user=result.data;
 if(!validEmail(cleanEmail(user.email))||(!user.email_confirmed_at&&!user.confirmed_at))return null;
 return {email:cleanEmail(user.email),sub:user.id};
}
export async function getTeamSupabaseIdentity(request,env){
 const jar=cookies(request);
 if(!configured(env))return {identity:null,setCookies:[]};
 const primary=await verifiedUser(env,jar[accessCookie]);
 if(primary)return {identity:primary,setCookies:[],token:jar[accessCookie]};
 if(!jar[refreshCookie])return {identity:null,setCookies:[]};
 const refreshed=await provider(env,'/token?grant_type=refresh_token',{
  method:'POST',body:JSON.stringify({refresh_token:jar[refreshCookie]})});
 if(!refreshed?.ok)return {identity:null,setCookies:clear()};
 const identity=await verifiedUser(env,refreshed.data.access_token);
 return {identity,setCookies:identity?issue(refreshed.data):clear(),token:identity?refreshed.data.access_token:null};
}
async function readBody(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return null;
 if(Number(request.headers.get('content-length')||0)>1500)return null;
 const raw=await request.text();if(raw.length>1500)return null;
 try{return JSON.parse(raw)}catch{return null}
}
async function joinRequest(env,email,name,inviteCode=''){
 const code=typeof inviteCode==='string'?inviteCode.trim().toUpperCase():'';
 if(code){
  if(!/^[0-9A-F]{16}$/.test(code))return {status:'invalid-invitation'};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
  const codeHash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
  const invitation=await env.DB.prepare('SELECT id,name FROM team_invitations WHERE email=? AND code_hash=? AND revoked_at IS NULL AND used_at IS NULL AND expires_at>?').bind(email,codeHash,Date.now()).first();
  if(!invitation)return {status:'invalid-invitation'};
  // Réserver le code après validation de l'e-mail par Supabase.
  await env.DB.prepare('UPDATE team_invitations SET used_at=? WHERE id=? AND used_at IS NULL').bind(Date.now(),invitation.id).run();
  if(!name||name.length<2)name=invitation.name;
 }
 // Après vérification du code : inscription provisoire, jamais d'accès automatique à l'équipe.
 if(email===cleanEmail(env.ADMIN_EMAIL||''))return {status:'admin'};
 const existing=await env.DB.prepare('SELECT id,active FROM team_members WHERE email=?').bind(email).first();
 const prior=await env.DB.prepare('SELECT status FROM team_join_requests WHERE email=?').bind(email).first();
 if(existing?.active===1)return {status:'approved'};
 if(prior?.status==='rejected')return {status:'rejected'};
 if(existing&&!prior)return {status:'disabled'};
 const now=Date.now(),label=typeof name==='string'&&name.trim().length>=2?name.trim().slice(0,110):email.split('@')[0];
 if(!existing){
  await env.DB.prepare('INSERT OR IGNORE INTO team_members(id,name,email,active,created_at,updated_at) VALUES(?,?,?,0,?,?)').bind(crypto.randomUUID(),label,email,now,now).run();
 }
 if(!prior){
  await env.DB.prepare("INSERT OR IGNORE INTO team_join_requests(email,name,status,requested_at) VALUES(?,?,'pending',?)").bind(email,label,now).run();
 }
 return {status:'pending'};
}
async function networkHash(request){
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
 return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function permitted(env,email,request,action){
 const ip=await networkHash(request),now=Date.now(),db=env.DB;
 await db.prepare('DELETE FROM team_auth_attempts WHERE created_at<?').bind(now-24*3600000).run();
 const lastHour=now-3600000;
 const emailCount=await db.prepare('SELECT COUNT(*) n,MAX(created_at) last FROM team_auth_attempts WHERE email=? AND action=? AND created_at>?').bind(email,action,lastHour).first();
 const ipCount=await db.prepare('SELECT COUNT(*) n FROM team_auth_attempts WHERE ip_hash=? AND action=? AND created_at>?').bind(ip,action,lastHour).first();
 if(Number(emailCount?.n||0)>=(action==='otp'?4:12)||Number(ipCount?.n||0)>=(action==='otp'?25:100))return false;
 if(action==='otp'&&Number(emailCount?.last||0)>now-65000)return false;
 await db.prepare('INSERT INTO team_auth_attempts (id,email,ip_hash,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),email,ip,action,now).run();
 return true;
}
export async function handleTeamLogin(request,env){
 if(!env.DB||!configured(env))return response({error:'Connexion gratuite ZikaTeam non configurée.'},503);
 const url=new URL(request.url),path=url.pathname;
 if(path==='/zikateam/api/auth/status'&&request.method==='GET')return response({ready:true,provider:'Supabase'});
 if(!['/zikateam/api/auth/request','/zikateam/api/auth/verify','/zikateam/api/auth/logout','/zikateam/api/auth/password','/zikateam/api/auth/set-password'].includes(path))return response({error:'Action de connexion inconnue.'},404);
 if(request.method!=='POST')return response({error:'Méthode interdite.'},405);
 if(request.headers.get('origin')!==url.origin)return response({error:'Origine non autorisée.'},403);
 if(path==='/zikateam/api/auth/logout'){
  const jar=cookies(request);
  if(jar[accessCookie])await provider(env,'/logout',{method:'POST',headers:{Authorization:'Bearer '+jar[accessCookie]}});
  return response({ok:true},200,clear());
 }
 if(path==='/zikateam/api/auth/set-password'){
  const body=await readBody(request);
  const password=body?.password;
  if(typeof password!=='string'||password.length<12||password.length>128||!/[a-zA-ZÀ-ÿ]/u.test(password)||!/[0-9]/.test(password))
   return response({error:'Choisis un mot de passe de 12 caractères minimum, avec des lettres et des chiffres.'},400);
  const session=await getTeamSupabaseIdentity(request,env);
  if(!session.identity||!session.token)return response({error:'Vérifie ton identité avec le code reçu par e-mail avant de définir le mot de passe.'},401);
  const userEmail=session.identity.email;
  if(password.toLowerCase().includes(userEmail.split('@')[0])&&userEmail.split('@')[0].length>=4)return response({error:'Le mot de passe ne doit pas contenir ton adresse e-mail.'},400);
  const member=await env.DB.prepare('SELECT active FROM team_members WHERE email=?').bind(userEmail).first();
  const join=await env.DB.prepare('SELECT status FROM team_join_requests WHERE email=?').bind(userEmail).first();
  const authorized=userEmail===cleanEmail(env.ADMIN_EMAIL||'')||member?.active===1||(member?.active===0&&join?.status==='pending');
  if(!authorized)return response({error:'Ce compte ne peut pas accéder à ZikaTeam.'},403);
  if(!await permitted(env,userEmail,request,'verify'))return response({error:'Trop de tentatives. Réessaie plus tard.'},429);
  const changed=await provider(env,'/user',{method:'PUT',body:JSON.stringify({password}),headers:{Authorization:'Bearer '+session.token}});
  if(!changed?.ok)return response({error:changed?.status===422?'Ce mot de passe ne respecte pas les critères de sécurité. Choisis-en un autre.':'Impossible d’enregistrer le mot de passe. Réessaie après une nouvelle vérification par e-mail.'},changed?.status===422?422:503);
  await env.DB.prepare('INSERT INTO team_auth_password_setup(email,set_at) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET set_at=excluded.set_at').bind(userEmail,Date.now()).run();
  return response({ok:true,message:'Ton mot de passe est enregistré. Tu pourras maintenant te connecter sans code e-mail.'},200,session.setCookies||[]);
 }
 const body=await readBody(request);if(!body)return response({error:'Contenu invalide.'},400);
 const email=cleanEmail(body.email);
 if(!validEmail(email))return response({error:'Adresse e-mail invalide.'},400);
 const action=path.endsWith('/request')?'otp':'verify';
 if(!await permitted(env,email,request,action))return response({error:'Trop de tentatives. Réessaie plus tard.'},429);
 if(path==='/zikateam/api/auth/password'){
  if(typeof body.password!=='string'||body.password.length>128||!body.password)return response({error:'Mot de passe invalide.'},400);
  const authenticated=await provider(env,'/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:body.password})});
  if(!authenticated?.ok)return response({error:'Adresse e-mail ou mot de passe incorrect. Tu peux retrouver ton accès avec un code e-mail.'},401);
  const verified=await verifiedUser(env,authenticated.data.access_token);
  if(!verified||verified.email!==email)return response({error:'Identité non vérifiée.'},403);
  const registered=await env.DB.prepare('SELECT set_at FROM team_auth_password_setup WHERE email=?').bind(email).first();
  const member=await env.DB.prepare('SELECT active FROM team_members WHERE email=?').bind(email).first();
  const join=await env.DB.prepare('SELECT status FROM team_join_requests WHERE email=?').bind(email).first();
  if(!registered||!(email===cleanEmail(env.ADMIN_EMAIL||'')||member?.active===1||member?.active===0&&join?.status==='pending'))
   return response({error:'Ce compte n’est pas autorisé. Pour une première connexion, utilise le code reçu par e-mail.'},403);
  const sessionCookies=issue(authenticated.data);
  if(sessionCookies.length!==2)return response({error:'Session indisponible.'},503);
  return response({ok:true},200,sessionCookies);
 }
 if(path.endsWith('/request')){
  const result=await provider(env,'/otp',{method:'POST',body:JSON.stringify({email,create_user:true})});
  if(!result?.ok)return response({error:'Envoi du code indisponible. Vérifie les réglages SMTP de Supabase.'},503);
  return response({ok:true,message:'Consulte tes e-mails pour trouver le code de connexion.'});
 }
 const code=typeof body.code==='string'?body.code.trim():'';
 if(!/^(?:\d{6}|\d{8})$/.test(code))return response({error:'Entre le code numérique à 6 ou 8 chiffres reçu par e-mail.'},400);
 const result=await provider(env,'/verify',{method:'POST',body:JSON.stringify({email,token:code,type:'email'})});
 if(!result?.ok)return response({error:'Code expiré ou incorrect.'},401);
 const user=await verifiedUser(env,result.data.access_token);
 if(!user||user.email!==email)return response({error:'Identité non vérifiée.'},403);
 const enrollment=await joinRequest(env,email,body.name,body.inviteCode);
 if(enrollment.status==='invalid-invitation')return response({error:'Code d’invitation invalide, expiré ou déjà utilisé. Demande un nouveau code à l’administration.'},403);
 if(enrollment.status==='rejected')return response({error:'Cette demande d’inscription n’a pas été retenue. Contacte l’association.'},403);
 if(enrollment.status==='disabled')return response({error:'Ce compte est désactivé. Contacte l’association.'},403);
 const newCookies=issue(result.data);
 if(newCookies.length!==2)return response({error:'Session indisponible.'},503);
 return response({ok:true,enrollment:enrollment.status,needsPassword:true},200,newCookies);
}
