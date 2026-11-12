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
 assert.match(serverSource,/if\(d\.audience==='poles'\)/);
 assert.match(serverSource,/enqueue\(db,result,'created',env\?\.NATIVE_PUSH_ENABLED/);
 assert.match(clientSource,/activitySaveFeedback/);
});

test('un test push réseau ne peut cibler que le membre connecté en staging',()=>{
 assert.match(serverSource,/if\(d\.op==='push\.test'\)/);
 assert.match(serverSource,/env\.APP_ENV!=='staging'/);
 assert.match(serverSource,/teamPushRecipientAllowed\(env,memberId\)/);
 assert.match(serverSource,/WHERE l\.member_id=\? LIMIT 5/);
 assert.match(serverSource,/push\.selftest/);
 assert.match(clientSource,/data-test-server-push/);
 assert.match(clientSource,/command\('push\.test',\{\}\)/);
});

test('son et vibration sont activés par défaut sur toutes les notifications ZikaTeam',()=>{
 assert.match(serverSource,/sound_mode:savedPrefs\?\.sound_mode\|\|'all'/);
 assert.match(serverSource,/quiet_enabled:savedPrefs\?Boolean\(savedPrefs\.quiet_enabled\):false/);
 assert.match(serverSource,/silent:prefs\?\.sound_mode==='none'/);
 assert.match(clientSource,/sound_mode:'all',vibrate:true,activity_enabled:true,urgent_enabled:true,quiet_enabled:false/);
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/icon:'\/assets\/icon-192\.png',badge:'\/assets\/push-badge-z\.png'/);
});

test('application Android : notifications Firebase sans abonnement Chrome',()=>{
 assert.match(clientSource,/window\.ZikaAndroid\?\.linkZikaTeam/);
 assert.match(serverSource,/linkNativeMember\(db,memberId,d\.token\)/);
 assert.match(serverSource,/queueNativeActivity\(db,a,reason,memberIds\)/);
});
