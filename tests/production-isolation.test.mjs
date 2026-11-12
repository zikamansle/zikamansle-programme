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
 assert.equal(config.vars.TEAM_PUSH_ENABLED,'false');
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
 assert.equal(config.vars.TEAM_PUSH_ENABLED,'false');
});
