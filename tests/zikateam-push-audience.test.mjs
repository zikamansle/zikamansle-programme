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

import {readFileSync} from 'node:fs';
const serverSource=readFileSync(new URL('../server/zikateam.mjs',import.meta.url),'utf8');
const clientSource=readFileSync(new URL('../public/zikateam.js',import.meta.url),'utf8');
test('les nouveaux messages suivent les appartenances et fonctions, pas une liste manuelle',()=>{
 assert.match(serverSource,/permittedChat\(db,recipientCtx,channel,channelId\)/);
 assert.match(serverSource,/ctx\.memberships\.some\(m=>m\.pole_id===channelId\)/);
 assert.match(serverSource,/ctx\.admin\|\|ctx\.leadPoles\.length>0/);
 assert.match(serverSource,/recipient\.id\)\)continue/);
});
test('un appareil déjà autorisé est lié automatiquement au compte actif',()=>{
 assert.match(clientSource,/async function autoLinkTeamPush\(me\)/);
 assert.match(clientSource,/void autoLinkTeamPush\(me\)/);
 assert.match(clientSource,/Notification\.permission!=='granted'/);
 assert.match(clientSource,/command\('push\.link',\{subscription:sub\.toJSON\(\)\}\)/);
});
test('les réunions destinées aux pôles restent ciblées et la publication avertit les abonnés',()=>{
 assert.match(serverSource,/if\(activity\.audience==='all'\)/);
 assert.match(serverSource,/activity\.audience==='leaders'/);
 assert.match(serverSource,/activity\.audience==='poles'/);
 assert.match(serverSource,/enqueue\(db,result,'created'\)/);
 assert.match(clientSource,/activitySaveFeedback/);
});
