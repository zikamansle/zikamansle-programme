import test from 'node:test';
import assert from 'node:assert/strict';
import {teamPushConfigured,teamPushRecipientAllowed} from '../server/zikateam.mjs';

const base={DB:{},VAPID_PRIVATE_JWK:'test-private',VAPID_PUBLIC_KEY:'test-public',TEAM_PUSH_ENABLED:'true'};

test('push reste désactivé par défaut',()=>{
 assert.equal(teamPushConfigured({...base,TEAM_PUSH_ENABLED:'false'}),false);
 assert.equal(teamPushRecipientAllowed({...base,TEAM_PUSH_ENABLED:'false'},'a'),false);
});
test('staging interdit toute diffusion sans liste explicite',()=>{
 const env={...base,APP_ENV:'staging'};
 assert.equal(teamPushConfigured(env),false);
 assert.equal(teamPushRecipientAllowed(env,'a'),false);
});
test('staging cible seulement les membres volontaires',()=>{
 const env={...base,APP_ENV:'staging',TEAM_PUSH_TEST_MEMBER_IDS:'membre-a,membre-b'};
 assert.equal(teamPushConfigured(env),true);
 assert.equal(teamPushRecipientAllowed(env,'membre-a'),true);
 assert.equal(teamPushRecipientAllowed(env,'membre-c'),false);
 assert.equal(teamPushRecipientAllowed(env,'membre-b'),true);
});
test('production notifie tout membre abonné éligible quand activé',()=>{
 const env={...base,APP_ENV:'production'};
 assert.equal(teamPushRecipientAllowed(env,'benevole'),true);
 assert.equal(teamPushRecipientAllowed(env,''),false);
});
test('absence de clé VAPID coupe les envois',()=>{
 assert.equal(teamPushConfigured({...base,VAPID_PRIVATE_JWK:''}),false);
});
