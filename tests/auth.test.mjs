import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, SignJWT} from 'jose';
import {verifyAdminToken,isAdmin} from '../server/admin-auth.mjs';
import worker, {adminAssetRequest} from '../worker/index.mjs';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const env={ACCESS_TEAM_DOMAIN:'zika-test.cloudflareaccess.com',ACCESS_AUD:'test-audience',ADMIN_EMAIL:'owner@example.test'};
async function token(changes={}) {
  return new SignJWT({email:'owner@example.test',sub:'test-user',iss:'https://zika-test.cloudflareaccess.com',aud:'test-audience',exp:Math.floor(Date.now()/1000)+60,...changes}).setProtectedHeader({alg:'RS256'}).sign(privateKey);
}
test('Access verifies signature, owner, issuer, audience and expiry',async()=>{
 assert(await verifyAdminToken(await token(),env,publicKey));
 for(const changes of [{email:'intruder@example.test'},{iss:'https://other.cloudflareaccess.com'},{aud:'other'},{exp:1},{nbf:Math.floor(Date.now()/1000)+600}])assert.equal(await verifyAdminToken(await token(changes),env,publicKey),false);
 const wrong=await generateKeyPair('RS256');assert.equal(await verifyAdminToken(await token(),env,wrong.publicKey),false);
 assert.equal(await verifyAdminToken('unsigned',env,publicKey),false);
});
test('missing configuration and spoofed identity headers fail closed',async()=>{
 assert.equal(await verifyAdminToken(await token(),{},publicKey),false);
 assert.equal(await isAdmin(new Request('https://test/',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test','Cf-Access-Authenticated-User-Email':'owner@example.test'}}),env),false);
});
test('admin is only exposed under the guarded prefix; old links redirect',async()=>{
 let assets=0;
 const site={...env,DB:{},ASSETS:{fetch(){assets++;return new Response('private')}}};
 for(const path of ['/admin-notifications.html','/admin-notifications','/admin-notifications/','/administration','/administration/']){
  const r=await worker.fetch(new Request('https://test'+path),site);
  assert.equal(r.status,302,path);
  assert.equal(r.headers.get('location'),'https://test/administration/notifications');
 }
 for(const path of ['/administration/notifications','/administration/notifications/']){
  const r=await worker.fetch(new Request('https://test'+path),site);
  assert.equal(r.status,403,path);
 }
 for(const action of ['admin','upload','create','clear-history']){
  const r=await worker.fetch(new Request('https://test/administration/api/'+action,{
   method:action==='admin'?'GET':'POST',
   ...(action==='admin'?{}:{headers:{Origin:'https://test','Content-Type':'application/json'},body:JSON.stringify({})})
  }),site);
  assert.equal(r.status,403,action);
 }
 assert.equal(assets,0);
});
test('admin HTML is read at the canonical asset path to prevent redirect loops',()=>{
 const original=new Request('https://test/administration/notifications?source=menu',{headers:{'Cf-Access-Jwt-Assertion':'signed-jwt'}});
 const asset=adminAssetRequest(original);
 assert.equal(new URL(asset.url).pathname,'/admin-notifications');
 assert.equal(new URL(asset.url).search,'?source=menu');
 assert.equal(asset.headers.get('Cf-Access-Jwt-Assertion'),'signed-jwt');
 assert.notEqual(new URL(asset.url).pathname,'/admin-notifications.html');
});
test('staging never sends even if a production subscription is imported',async()=>{
 const r=await worker.fetch(new Request('https://test/api/push/send',{method:'POST'}),{DB:{},PUSH_SEND_ENABLED:'false'});assert.equal(r.status,503);
});
