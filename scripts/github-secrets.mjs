import {spawnSync} from 'node:child_process';
const values={};
for(const key of ['ADMIN_EMAIL','VAPID_PRIVATE_JWK'])if(process.env[key])values[key]=process.env[key];
if(Object.keys(values).length){
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk'],{input:JSON.stringify(values),stdio:['pipe','ignore','ignore'],env:process.env});
 if(r.error||r.status!==0){console.error('Transmission des secrets échouée. Vérifier les permissions du jeton Cloudflare.');process.exit(1);}
 console.log('Secrets transmis à Cloudflare sans affichage de leurs valeurs.');
}else console.log('Aucun secret applicatif fourni ; administration et push non opérationnels.');
