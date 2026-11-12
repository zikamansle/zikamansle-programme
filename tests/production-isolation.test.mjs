import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8'));
test('production Cloudflare isolée sans diffusion générale ni changement DNS',()=>{
 assert.equal(config.name,'zikamansle-app-production');
 assert.equal(config.vars.APP_ENV,'production');
 assert.equal(config.d1_databases[0].database_name,'zikamansle-app-production');
 assert.equal(config.d1_databases[0].database_id,'fe7c5010-d6e9-48ed-88aa-ff1402820e02');
 assert.equal(config.r2_buckets[0].bucket_name,'zikamansle-app-production');
 assert.equal(config.vars.PUSH_SEND_ENABLED,'false');
 assert.equal(config.vars.TEAM_PUSH_ENABLED,'false');
 assert.equal(config.workers_dev,true);
 assert.equal(config.routes,undefined);
 assert.equal(config.route,undefined);
 assert.equal(config.env,undefined);
});
