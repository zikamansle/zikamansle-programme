import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const NAME='zikamansle-app-staging';
export async function bootstrap(env,fetcher=fetch){
 if(!env.CLOUDFLARE_API_TOKEN)throw Error('Secret GitHub CLOUDFLARE_API_TOKEN absent.');
 async function api(path,method='GET',body){
  const r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await r.json();
  if(!r.ok||data.success!==true){const e=Error('Cloudflare '+method+' '+path.replace(/\/accounts\/[a-f0-9]{32}/i,'/accounts/[compte]')+' : HTTP '+r.status+' ; codes '+(data.errors||[]).map(x=>Number(x.code)).join(',')+'. Vérifier les droits du jeton et l’activation du service dans Cloudflare.');e.status=r.status;throw e;}
  return data;
 }
 let account=env.CLOUDFLARE_ACCOUNT_ID;
 if(!account){
  const d=await api('/accounts?per_page=50');
  if(d.result?.length!==1||(d.result_info?.total_count??1)>1)throw Error('Compte ambigu : enregistrer CLOUDFLARE_ACCOUNT_ID dans les secrets GitHub.');
  account=d.result[0].id;
 }
 if(!/^[a-f0-9]{32}$/i.test(account))throw Error('Compte Cloudflare invalide.');
 const root='/accounts/'+account;
 // Never enroll in billing or change an existing service plan.
 let bucket;
 try{bucket=(await api(root+'/r2/buckets/'+NAME)).result;}catch(e){if(e.status!==404)throw e;}
 if(!bucket)bucket=(await api(root+'/r2/buckets','POST',{name:NAME,locationHint:'weur',storageClass:'Standard'})).result;
 if(bucket?.name!==NAME)throw Error('Le bucket retourné ne correspond pas au stockage de test.');
 const listed=await api(root+'/d1/database?name='+NAME+'&per_page=100');
 const databases=(listed.result||[]).filter(x=>x.name===NAME);
 if(databases.length>1)throw Error('Plusieurs bases de test correspondent. Aucune modification effectuée.');
 let db=databases[0];
 if(!db)db=(await api(root+'/d1/database','POST',{name:NAME,primary_location_hint:'weur'})).result;
 if(db?.name!==NAME||!db.uuid||!/^[a-f0-9-]{36}$/i.test(db.uuid))throw Error('Identifiant de base de test invalide.');
 if(env.ZIKA_D1_DATABASE_ID&&env.ZIKA_D1_DATABASE_ID!==db.uuid)throw Error('La base configurée ne correspond pas à la base de test.');
 return {CLOUDFLARE_ACCOUNT_ID:account,ZIKA_D1_DATABASE_ID:db.uuid};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(!process.env.GITHUB_ENV)throw Error('Ce script doit être exécuté dans GitHub Actions.');
  const values=await bootstrap(process.env);
  for(const [k,v] of Object.entries(values))appendFileSync(process.env.GITHUB_ENV,k+'='+v+'\n');
  console.log('Compte identifié ; base et stockage de test prêts. Aucun DNS ni abonnement de service modifié.');
 }catch(e){console.error(e.message);process.exit(1);}
}
