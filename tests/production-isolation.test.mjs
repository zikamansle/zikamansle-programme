import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8'));
test('production Cloudflare isolée avec actualités réservées admin et sans changement DNS',()=>{
 assert.equal(config.name,'zikamansle-app-production');
 assert.equal(config.vars.APP_ENV,'production');
 assert.equal(config.d1_databases[0].database_name,'zikamansle-app-production');
 assert.equal(config.d1_databases[0].database_id,'fe7c5010-d6e9-48ed-88aa-ff1402820e02');
 assert.equal(config.r2_buckets[0].bucket_name,'zikamansle-app-production');
 assert.equal(config.vars.PUSH_SEND_ENABLED,'true');
 assert.equal(config.vars.TEAM_PUSH_ENABLED,'true');
 assert.equal(config.workers_dev,true);
 assert.equal(config.routes,undefined);
 assert.equal(config.route,undefined);
 assert.equal(config.env,undefined);
});

test('notifications actualités: l’envoi exige un JWT signé et une identité administrateur',()=>{
 const auth=readFileSync(new URL('../server/admin-auth.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../server/push-api.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../worker/index.mjs',import.meta.url),'utf8');
 assert.match(auth,/jwtVerify\(token,resolver/);
 assert.match(auth,/identity\.email===env\.ADMIN_EMAIL\.trim\(\)\.toLowerCase\(\)/);
 assert.match(worker,/if \(!await isAdmin\(request,env\)\)/);
 assert.match(api,/if\(!await authorize\(req,env\)\)return json\(\{error:'Accès administrateur requis\.'/);
 assert.match(api,/if\(action==='send'\)/);
 assert.equal(config.vars.TEAM_PUSH_ENABLED,'true');
});

test('ZikaTeam : notifications réservées aux membres autorisés et rappels horaires',()=>{
 const team=readFileSync(new URL('../server/zikateam.mjs',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../worker/index.mjs',import.meta.url),'utf8');
 assert.match(team,/export function teamPushRecipientAllowed\(env,memberId\)/);
 assert.match(team,/teamPushRecipientAllowed\(env,job\.member_id\)/);
 assert.match(team,/teamPushRecipientAllowed\(env,recipient\.id\)/);
 assert.match(team,/const intended=a&&m\?\.active&&stillLinked/);
 assert.match(team,/const audience=a\?\.status==='published'/);
 assert.match(team,/prefs\?\.activity_enabled!==0/);
 assert.match(team,/prefs\?\.urgent_enabled!==0/);
 assert.match(team,/export async function scheduleTeamReminders\(env,maximum=40\)/);
 assert.match(team,/export async function drainTeamPush\(env,maximum=40\)/);
 assert.match(worker,/scheduleTeamReminders\(env\), drainTeamPush\(env\)/);
});

test('Migration DNS : le navigateur remplace une ancienne clé VAPID et réessaie un push 403',()=>{
 const client=readFileSync(new URL('../public/notifications.js',import.meta.url),'utf8');
 assert.match(client,/function keyMatches\(sub,key\)/);
 assert.match(client,/sub\?\.options\?\.applicationServerKey/);
 assert.match(client,/if\(!keyMatches\(sub,publicKey\)\)return renewSubscription\(sub\)/);
 assert.match(client,/\[403,404,410\]\.includes\(result\.code\)/);
 assert.match(client,/async function prepareTest\(\)\{return currentSubscription\(\)\}/);
});
