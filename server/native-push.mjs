import {importPKCS8,SignJWT} from 'jose';

const PROJECT='zikamansle-d0c4e';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const FCM_URL='https://fcm.googleapis.com/v1/projects/'+PROJECT+'/messages:send';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const fingerprint=async value=>{
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
const validToken=value=>typeof value==='string'&&value.length>=40&&value.length<=4096&&/^[A-Za-z0-9_:.-]+$/.test(value);

// Safe diagnosis: publish only a fixed reason code, never a JSON field value.
export function classifyFirebaseCredentials(raw){
 if(typeof raw!=='string'||!raw.trim())return {stage:'CONFIG_MISSING'};
 let credentials;
 try{credentials=JSON.parse(raw)}
 catch{return {stage:'CONFIG_JSON_SYNTAX'}}
 if(typeof credentials==='string'){
  // Some dashboards or copy/paste steps produce an extra JSON-encoded string.
  // Decode it once locally; never echo its contents to the API or logs.
  try{credentials=JSON.parse(credentials)}
  catch{return {stage:'CONFIG_DOUBLE_ENCODED'}}
 }
 if(!credentials||typeof credentials!=='object'||Array.isArray(credentials))
  return {stage:'CONFIG_NOT_OBJECT'};
 if(credentials.project_id!==PROJECT)return {stage:'CONFIG_WRONG_PROJECT'};
 if(!/^firebase-adminsdk-[^@]+@zikamansle-d0c4e\\.iam\\.gserviceaccount\\.com$/.test(credentials.client_email||''))
  return {stage:'CONFIG_WRONG_ACCOUNT'};
 if(typeof credentials.private_key!=='string'||!credentials.private_key.trim())
  return {stage:'CONFIG_NO_PRIVATE_KEY'};
 if(!/^-----BEGIN PRIVATE KEY-----\\s/.test(credentials.private_key)||!/-----END PRIVATE KEY-----\\s*$/.test(credentials.private_key))
  return {stage:'CONFIG_PRIVATE_KEY_FORMAT'};
 return {stage:'CONFIG_PARSED',credentials};
}

export async function fcmAssertion(credentials,now=Math.floor(Date.now()/1000)){
 if(!credentials||credentials.project_id!==PROJECT||
    !/^firebase-adminsdk-[^@]+@zikamansle-d0c4e\.iam\.gserviceaccount\.com$/.test(credentials.client_email||'')||
    typeof credentials.private_key!=='string')throw Error('Identité Firebase serveur invalide');
 const key=await importPKCS8(credentials.private_key,'RS256');
 return new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'})
  .setProtectedHeader({alg:'RS256',typ:'JWT'})
  .setIssuer(credentials.client_email)
  .setAudience(TOKEN_URL)
  .setIssuedAt(now)
  .setExpirationTime(now+3600)
  .sign(key);
}

export async function sendFirebaseTest(deviceToken,env,fetcher=fetch){
 const parsed=classifyFirebaseCredentials(env.FCM_SERVICE_ACCOUNT_JSON);
 if(parsed.stage!=='CONFIG_PARSED')throw Error(parsed.stage);
 let assertion;
 try{assertion=await fcmAssertion(parsed.credentials)}catch{throw Error('CONFIG_KEY_SIGNING')}
 const oauth=await fetcher(TOKEN_URL,{method:'POST',redirect:'manual',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
  signal:AbortSignal.timeout(12000)});
 if(!oauth.ok)throw Error('OAUTH_'+oauth.status);
 const {access_token:accessToken}=await oauth.json();
 if(typeof accessToken!=='string'||!accessToken)throw Error('OAUTH_INVALID');
 const message={message:{token:deviceToken,android:{priority:'HIGH'},data:{
  title:'Test ZikaMansle',
  body:'Une notification envoyée directement à votre application Android.',
  url:'https://zikamansle-app-staging.zikamansle.workers.dev/index.html#actualites',
  test:'true'
 }}};
 const result=await fetcher(FCM_URL,{method:'POST',redirect:'manual',
  headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
  body:JSON.stringify(message),signal:AbortSignal.timeout(12000)});
 // Do not leak FCM token, private key, provider payload or bearer authorization.
 return {accepted:result.status>=200&&result.status<300,code:result.status};
}

// Authenticated, read-only Firebase preflight. Never returns credentials, OAuth
// tokens, FCM device tokens or provider responses. No notification is sent.
export async function firebasePreflight(env,fetcher=fetch){
 const parsed=classifyFirebaseCredentials(env.FCM_SERVICE_ACCOUNT_JSON);
 if(parsed.stage!=='CONFIG_PARSED')return {ready:false,stage:parsed.stage};
 let assertion;
 try{assertion=await fcmAssertion(parsed.credentials)}
 catch{return {ready:false,stage:'CONFIG_KEY_SIGNING'}}
 let oauth;
 try {
  oauth=await fetcher(TOKEN_URL,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
   signal:AbortSignal.timeout(12000)});
 }catch(e){
  return {ready:false,stage:e?.name==='TimeoutError'?'OAUTH_TIMEOUT':'OAUTH_NETWORK'};
 }
 if(!oauth.ok)return {ready:false,stage:'OAUTH_'+oauth.status};
 try {
  const data=await oauth.json();
  if(typeof data?.access_token!=='string'||!data.access_token)return {ready:false,stage:'OAUTH_INVALID'};
 }catch{return {ready:false,stage:'OAUTH_INVALID'}}
 return {ready:true,stage:'OAUTH_OK'};
}

export async function handleNative(request,env,authorize,send=sendFirebaseTest) {
 if(env.APP_ENV!=='staging'||env.PUSH_SEND_ENABLED!=='false'||!env.DB)
  return json({error:'Ce service est réservé à la version de validation.'},503);
 const path=new URL(request.url).pathname;
 if(path==='/api/native/subscribe') {
  if(request.method!=='POST')return json({error:'Méthode refusée'},405);
  if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>4600)
   return json({error:'Requête invalide'},400);
  const raw=await request.text();
  if(raw.length>4600)return json({error:'Requête invalide'},400);
  let data;try{data=JSON.parse(raw)}catch{return json({error:'Requête invalide'},400)}
  if(data?.platform!=='android'||!validToken(data.token))return json({error:'Jeton Android invalide'},400);
  const id=await fingerprint(data.token);
  const ip=await fingerprint((request.headers.get('cf-connecting-ip')||'unknown')+'|'+(env.VAPID_PRIVATE_JWK||'native-test'));
  const existing=await env.DB.prepare('SELECT id FROM native_push_devices WHERE id=?').bind(id).first();
  const now=Date.now();
  if(!existing) {
   const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM native_push_devices WHERE ip_hash=? AND created>?')
    .bind(ip,now-86400000).first();
   if((count?.n||0)>=5)return json({error:'Trop de demandes depuis cet appareil.'},429);
  }
  await env.DB.prepare('INSERT INTO native_push_devices(id,token,created,last_seen,ip_hash) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen')
   .bind(id,data.token,now,now,ip).run();
  return json({ok:true});
 }
 if(!await authorize(request,env))return json({error:'Accès administrateur requis'},403);
 if(path==='/administration/api/native-diagnostics'&&request.method==='GET') {
  // This endpoint checks signing and OAuth authorization only; it cannot send a push.
  return json(await firebasePreflight(env));
 }
 if(path==='/administration/api/native-status'&&request.method==='GET') {
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM native_push_devices').first();
  return json({devices:count?.n||0,sendingConfigured:!!env.FCM_SERVICE_ACCOUNT_JSON,testingOnly:true});
 }
 if(path==='/administration/api/native-test'&&request.method==='POST') {
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origine refusée'},403);
  if(!env.FCM_SERVICE_ACCOUNT_JSON)return json({error:'Clé Firebase serveur encore absente.'},503);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM native_push_devices').first();
  if(count?.n!==1)return json({error:'Le test exige exactement un appareil Android enregistré.'},409);
  const row=await env.DB.prepare('SELECT id,token FROM native_push_devices LIMIT 1').first();
  if(!row)return json({error:'Aucun appareil enregistré'},409);
  const now=Date.now();
  const gate=await env.DB.prepare("INSERT INTO push_config(key,value) VALUES('native-selftest',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(push_config.value AS INTEGER)<?")
    .bind(String(now),now-60000).run();
  if(!gate.meta.changes)return json({error:'Attendez une minute entre deux tests.'},429);
  try{
   const result=await send(row.token,env);
   return json({accepted:result.accepted,code:result.code});
  }catch(e){
   return json({error:'Le serveur Firebase a refusé le test.',stage:/^(CONFIG_|OAUTH_)/.test(e.message)?e.message:'FCM_ERROR'},502);
  }
 }
 return json({error:'Route introuvable'},404);
}
