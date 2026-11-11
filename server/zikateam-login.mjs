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
 if(primary)return {identity:primary,setCookies:[]};
 if(!jar[refreshCookie])return {identity:null,setCookies:[]};
 const refreshed=await provider(env,'/token?grant_type=refresh_token',{
  method:'POST',body:JSON.stringify({refresh_token:jar[refreshCookie]})});
 if(!refreshed?.ok)return {identity:null,setCookies:clear()};
 const identity=await verifiedUser(env,refreshed.data.access_token);
 return {identity,setCookies:identity?issue(refreshed.data):clear()};
}
async function readBody(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return null;
 if(Number(request.headers.get('content-length')||0)>1500)return null;
 const raw=await request.text();if(raw.length>1500)return null;
 try{return JSON.parse(raw)}catch{return null}
}
async function isInvited(env,email){
 if(email===cleanEmail(env.ADMIN_EMAIL||''))return true;
 const member=await env.DB.prepare('SELECT id FROM team_members WHERE email=? AND active=1').bind(email).first();
 return Boolean(member);
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
 if(!['/zikateam/api/auth/request','/zikateam/api/auth/verify','/zikateam/api/auth/logout'].includes(path))return response({error:'Action de connexion inconnue.'},404);
 if(request.method!=='POST')return response({error:'Méthode interdite.'},405);
 if(request.headers.get('origin')!==url.origin)return response({error:'Origine non autorisée.'},403);
 if(path==='/zikateam/api/auth/logout'){
  const jar=cookies(request);
  if(jar[accessCookie])await provider(env,'/logout',{method:'POST',headers:{Authorization:'Bearer '+jar[accessCookie]}});
  return response({ok:true},200,clear());
 }
 const body=await readBody(request);if(!body)return response({error:'Contenu invalide.'},400);
 const email=cleanEmail(body.email);
 if(!validEmail(email))return response({error:'Adresse e-mail invalide.'},400);
 if(!await permitted(env,email,request,path.endsWith('/request')?'otp':'verify'))return response({error:'Trop de tentatives. Réessaie plus tard.'},429);
 const invited=await isInvited(env,email);
 if(!invited)return response({ok:true,message:'Si cette adresse est autorisée, un code peut lui être envoyé.'});
 if(path.endsWith('/request')){
  const result=await provider(env,'/otp',{method:'POST',body:JSON.stringify({email,create_user:true})});
  if(!result?.ok)return response({error:'Envoi du code indisponible. Vérifie les réglages SMTP de Supabase.'},503);
  return response({ok:true,message:'Consulte tes e-mails pour trouver le code à six chiffres.'});
 }
 const code=typeof body.code==='string'?body.code.trim():'';
 if(!/^\d{6}$/.test(code))return response({error:'Entre le code à six chiffres reçu par e-mail.'},400);
 const result=await provider(env,'/verify',{method:'POST',body:JSON.stringify({email,token:code,type:'email'})});
 if(!result?.ok)return response({error:'Code expiré ou incorrect.'},401);
 const user=await verifiedUser(env,result.data.access_token);
 if(!user||user.email!==email)return response({error:'Identité non vérifiée.'},403);
 const newCookies=issue(result.data);
 if(newCookies.length!==2)return response({error:'Session indisponible.'},503);
 return response({ok:true},200,newCookies);
}
