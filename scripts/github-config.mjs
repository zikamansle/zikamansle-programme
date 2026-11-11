import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function configure(source,env) {
  for(const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','ZIKA_D1_DATABASE_ID'])
    if(!env[name])throw Error('Paramètre GitHub manquant : '+name);
  if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID))throw Error('Identifiant de compte Cloudflare invalide');
  if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(env.ZIKA_D1_DATABASE_ID)||/^0+-0+-0+-0+-0+$/.test(env.ZIKA_D1_DATABASE_ID))throw Error('Identifiant D1 invalide');
  if(source.name!=='zikamansle-app-staging'||source.routes||source.route||source.env)throw Error('Déploiement limité au Worker de test, sans route ni environnement supplémentaire');
  const c=structuredClone(source);
  c.account_id=env.CLOUDFLARE_ACCOUNT_ID;
  c.d1_databases=[{binding:'DB',database_name:'zikamansle-app-staging',database_id:env.ZIKA_D1_DATABASE_ID,migrations_dir:'drizzle'}];
  c.r2_buckets=[{binding:'BUCKET',bucket_name:'zikamansle-app-staging'}];
  c.workers_dev=true;c.preview_urls=false;
  c.vars={...c.vars,APP_ENV:'staging',PUSH_SEND_ENABLED:'false'};
  for(const key of ['ACCESS_TEAM_DOMAIN','ACCESS_AUD','VAPID_PUBLIC_KEY'])c.vars[key]=env[key]||'';
  return c;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  writeFileSync('wrangler.jsonc',JSON.stringify(configure(JSON.parse(readFileSync('wrangler.jsonc','utf8')),process.env),null,2)+'\n');
  console.log('Configuration de test validée ; envois désactivés, aucun domaine personnalisé.');
}
