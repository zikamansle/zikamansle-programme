import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrap} from '../scripts/github-bootstrap.mjs';
const account='a'.repeat(32),id='12345678-1234-1234-1234-123456789abc',name='zikamansle-app-staging';
const response=(result,status=200)=>Response.json({success:status===200,result,errors:status===200?[]:[{code:10042}]},{status});
test('provision only named staging resources; secret stays in authorization',async()=>{
 const calls=[];
 const out=await bootstrap({CLOUDFLARE_API_TOKEN:'TEST_SECRET'},async(url,options)=>{
  calls.push({url,...options});assert.equal(options.headers.Authorization,'Bearer TEST_SECRET');
  if(url.endsWith('/accounts?per_page=50'))return response([{id:account}]);
  if(url.endsWith('/r2/buckets/'+name))return response(null,404);
  if(url.endsWith('/r2/buckets')){assert.equal(JSON.parse(options.body).name,name);return response({name});}
  if(url.includes('/d1/database?'))return response([]);
  if(url.endsWith('/d1/database'))return response({name,uuid:id});
  throw Error('Unexpected API');
 });
 assert.deepEqual(out,{CLOUDFLARE_ACCOUNT_ID:account,ZIKA_D1_DATABASE_ID:id});
 assert.equal(calls.filter(x=>x.method==='POST').length,2);
 assert(!JSON.stringify(out).includes('TEST_SECRET'));
 assert(!calls.some(x=>/dns|subscription|token/.test(x.url)));
});
test('existing resources are reused without writes',async()=>{
 await bootstrap({CLOUDFLARE_API_TOKEN:'TEST',CLOUDFLARE_ACCOUNT_ID:account},async(url,o)=>{
  assert.equal(o.method,'GET');return response(url.includes('/r2/')?{name}:[{name,uuid:id}]);
 });
});
test('missing secret, ambiguous account, and R2 not enabled stop safely',async()=>{
 await assert.rejects(bootstrap({},()=>{throw Error('should not fetch')}),/absent/);
 await assert.rejects(bootstrap({CLOUDFLARE_API_TOKEN:'TEST'},async()=>response([{id:account},{id:'b'.repeat(32)}])),/ambigu/);
 let calls=0;await assert.rejects(bootstrap({CLOUDFLARE_API_TOKEN:'TEST',CLOUDFLARE_ACCOUNT_ID:account},async()=>{calls++;return response(null,403)}),/HTTP 403/);assert.equal(calls,1);
});
