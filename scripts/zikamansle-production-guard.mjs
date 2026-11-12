import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('wrangler.production.jsonc','utf8'));
const fail=msg=>{throw Error('PRODUCTION BLOQUÉE : '+msg)};
if(config.name!=='zikamansle-app-production'||config.vars?.APP_ENV!=='production')fail('Cible incorrecte');
if(config.d1_databases?.[0]?.database_id!=='fe7c5010-d6e9-48ed-88aa-ff1402820e02')fail('Base non dédiée');
if(config.d1_databases?.[0]?.database_name!=='zikamansle-app-production')fail('Nom de base incorrect');
if(config.r2_buckets?.[0]?.bucket_name!=='zikamansle-app-production')fail('Bucket non dédié');
if(config.workers_dev!==true||config.routes||config.route||config.env)fail('DNS ou routage automatique interdit');
if(config.vars.PUSH_SEND_ENABLED!=='true'||config.vars.TEAM_PUSH_ENABLED!=='false')fail('Actualités doivent être activées, notifications ZikaTeam restent bloquées');
const worker=readFileSync('worker/index.mjs','utf8');
const push=readFileSync('server/push-api.mjs','utf8');
const auth=readFileSync('server/admin-auth.mjs','utf8');
if(!worker.includes("if (!await isAdmin(request,env))")||!worker.includes("response = await handle(request,env)"))fail('Accès administrateur serveur absent');
if(!push.includes("if(!await authorize(req,env))return json({error:'Accès administrateur requis.'},403)")||!push.includes("if(action==='send')"))fail('Vérification administrateur obligatoire avant envoi absente');
if(!auth.includes("verifyAdminToken(request.headers.get('Cf-Access-Jwt-Assertion'),env)")||!auth.includes("jwtVerify(token,resolver"))fail('JWT Cloudflare Access non vérifié');

if(config.vars.TEAM_AUTH_PROVIDER!=='supabase')fail('Fournisseur authentification incorrect');
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)fail('Identifiants CI absents');
console.log('Garde production : diffusion des actualités réservée au JWT administrateur; notifications ZikaTeam désactivées; aucun changement DNS.');
