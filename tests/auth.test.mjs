import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, SignJWT} from 'jose';
import {verifyAdminToken,isAdmin} from '../server/admin-auth.mjs';
import worker from '../worker/index.mjs';
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
test('admin document and clean URL cannot bypass worker authorization',async()=>{
 let assets=0;
 for(const path of ['/admin-notifications.html','/admin-notifications','/admin-notifications/']){
  const r=await worker.fetch(new Request('https://test'+path),{...env,ASSETS:{fetch(){assets++;return new Response('private')}}});assert.equal(r.status,403);
 }assert.equal(assets,0);
});
test('staging never sends even if a production subscription is imported',async()=>{
 const r=await worker.fetch(new Request('https://test/api/push/send',{method:'POST'}),{DB:{},PUSH_SEND_ENABLED:'false'});assert.equal(r.status,503);
});
