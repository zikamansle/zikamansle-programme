// One-time staging-only Web Push initialization. No private key is logged or committed.
import {generateKeyPairSync} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const WORKER='zikamansle-app-staging';

export function generateVapidPair(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const pub=publicKey.export({format:'jwk'});
 const priv=privateKey.export({format:'jwk'});
 if(!pub.x||!pub.y||!priv.d)throw Error('Impossible de créer la paire VAPID.');
 const raw=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]);
 if(raw.length!==65)throw Error('Clé VAPID publique invalide.');
 return {VAPID_PUBLIC_KEY:raw.toString('base64url'),VAPID_PRIVATE_JWK:JSON.stringify(priv)};
}
function wrangler(args,env,input){
 return spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--name',WORKER],{
  env,encoding:'utf8',input,stdio:['pipe','pipe','pipe'],maxBuffer:1_000_000
 });
}
export function secretNames(output){
 const start=output.indexOf('['),end=output.lastIndexOf(']');
 if(start<0||end<start)throw Error('La liste des secrets Cloudflare ne peut pas être vérifiée.');
 const items=JSON.parse(output.slice(start,end+1));
 if(!Array.isArray(items))throw Error('Format inattendu de la liste des secrets.');
 return new Set(items.map(s=>s.name).filter(s=>typeof s==='string'));
}
export function isStagingConfig(c){
 return c.name===WORKER&&c.workers_dev===true&&!c.routes&&!c.route&&c.vars?.APP_ENV==='staging'&&c.vars?.PUSH_SEND_ENABLED==='false'&&c.vars?.PUSH_TEST_ENABLED==='true'&&!('VAPID_PUBLIC_KEY' in c.vars);
}
export function setup(env){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/migration/application-autonome'||!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)
  throw Error('Initialisation VAPID autorisée uniquement par GitHub sur la branche de test.');
 if(!isStagingConfig(JSON.parse(readFileSync('wrangler.jsonc','utf8'))))
  throw Error('Configuration Cloudflare de test incorrecte : secrets non modifiés.');
 const list=wrangler(['secret','list'],env);
 if(list.error||list.status!==0)throw Error('Lecture des noms de secrets Cloudflare impossible : aucune clé créée.');
 const names=secretNames(list.stdout);
 const present=['VAPID_PUBLIC_KEY','VAPID_PRIVATE_JWK'].filter(k=>names.has(k));
 if(present.length===2){console.log('La paire VAPID de test existe déjà : aucune rotation.');return}
 if(present.length!==0)throw Error('Clés VAPID de test partiellement configurées. Aucune rotation automatique.');
 // Secrets are sent only through Wrangler stdin; never sent to GitHub or stdout.
 const keys=generateVapidPair();
 const saved=wrangler(['secret','bulk'],env,JSON.stringify(keys));
 if(saved.error||saved.status!==0)throw Error('Enregistrement sécurisé des clés VAPID de test échoué.');
 console.log('Paire VAPID de test créée uniquement dans Cloudflare ; aucune clé privée affichée.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{setup(process.env)}catch(e){console.error(e.message);process.exitCode=1}
}
