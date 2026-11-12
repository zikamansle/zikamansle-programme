import {readFileSync,writeFileSync} from 'node:fs';
const configPath='wrangler.jsonc';
const c=JSON.parse(readFileSync(configPath,'utf8'));
const env=process.env;
const TARGET='zikamansle-app-staging';
const DB_ID='32687c2b-b845-4d29-aa1e-34dea804ea34';
const assert=(ok,msg)=>{if(!ok)throw Error('Arrêt de sécurité : '+msg)};
assert(env.CLOUDFLARE_API_TOKEN,'jeton Cloudflare GitHub Actions manquant');
assert(/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||''),'compte Cloudflare manquant ou invalide');
assert(env.ZIKA_D1_DATABASE_ID===DB_ID,'mauvaise base D1 de test');
assert(c.name===TARGET && c.workers_dev===true && c.vars?.APP_ENV==='staging','Worker non-staging');
assert(!c.routes&&!c.route&&!c.env,'route ou environnement inattendu');
assert(c.vars.PUSH_SEND_ENABLED==='false'&&['false','true'].includes(c.vars.TEAM_PUSH_ENABLED),'diffusion générale des notifications non désactivée');
if(c.vars.TEAM_PUSH_ENABLED==='true'){
 const source=readFileSync('server/zikateam.mjs','utf8');
 assert(source.includes("env.APP_ENV!=='staging'||Boolean(String(env.TEAM_PUSH_TEST_MEMBER_IDS||'').trim())"),'liste blanche obligatoire manquante en staging');
 assert(source.includes('teamPushRecipientAllowed(env,job.member_id)'),'garde anti-diffusion absente sur les réunions');
 assert(source.includes('teamPushRecipientAllowed(env,recipient.id)'),'garde anti-diffusion absente sur les messages');
}

assert(c.vars.TEAM_AUTH_PROVIDER==='supabase','authentification de test non configurée');
assert(c.d1_databases?.length===1&&c.d1_databases[0].binding==='DB'&&c.d1_databases[0].database_name===TARGET,'base D1 inattendue');
assert(c.r2_buckets?.length===1&&c.r2_buckets[0].binding==='BUCKET'&&c.r2_buckets[0].bucket_name===TARGET,'bucket R2 inattendu');
assert(c.assets?.binding==='ASSETS','assets non configurés');
c.account_id=env.CLOUDFLARE_ACCOUNT_ID;
c.d1_databases[0].database_id=DB_ID;
c.keep_vars=true;
for(const name of ['ACCESS_TEAM_DOMAIN','ACCESS_AUD','TEAM_ACCESS_AUD'])delete c.vars[name];
writeFileSync(configPath,JSON.stringify(c,null,2)+'\n');
console.log('Validation de sécurité OK : staging Firebase relay protégé, variables distantes préservées, DNS et application publique inchangés.');
