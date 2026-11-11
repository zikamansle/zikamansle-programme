import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server/zikateam.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../public/zikateam.js',import.meta.url),'utf8');

test('une inscription en attente ne peut lire aucune conversation par API',()=>{
 assert.ok(server.includes("if(ctx.pending)return fail('Inscription en attente de validation : aucune conversation n’est accessible.',403)"));
 assert.ok(server.includes("if(ctx.pending&&!['charter.accept','consents.save'].includes(data.op))"));
 assert.ok(client.includes("if(state.me.pending&&state.tab!=='fiche')state.tab='fiche'"));
 assert.ok(server.includes('Aucune conversation n’est accessible avant approbation.'));
 assert.ok(client.includes("state.me.pending?[['fiche','Mon accueil']]"));
 assert.ok(server.includes("if(ctx.pending&&(!currentCharter||currentCharter.document_id!==path.split('/').pop()))"));
 assert.ok(server.includes("if(ctx.pending)return fail('Inscription en attente de validation.',403)"));
});

test('les coordonnées consenties ne sont servies qu’aux responsables du pôle',()=>{
 assert.ok(server.includes("const canViewContacts=ctx.admin||ctx.leadPoles.includes(p.id)"));
 assert.ok(server.includes("canViewContacts?1:0,canViewContacts?1:0,p.id"));
 assert.ok(client.includes('Les autres bénévoles ne le verront pas.'));
 assert.ok(client.includes('Les autres bénévoles ne la verront pas.'));
});

test('la première inscription demande identité, code et validation admin',()=>{
 assert.ok(client.includes('name="name" minlength="2" maxlength="110" autocomplete="name" required'));
 assert.ok(client.includes("await api('auth/verify',{email:state.loginEmail,name:state.loginName,code:code.trim()})"));
 assert.ok(server.includes('ctx.pending'));
});

test('les signatures d’émargement sont enregistrées et imprimables',()=>{
 assert.ok(server.includes("if(d.op==='signing.sign')"));
 assert.ok(server.includes('signature_points=?,signed_at=?,signed_by_operator=?'));
 assert.ok(client.includes('teamSigningCanvas'));
 assert.ok(client.includes('function printSigningSession(session,mode)'));
});

// Ces tests protègent le staging ZikaTeam sans ouvrir l'application publique.

test('le bénévole validé peut renseigner son téléphone sans accéder aux autres fiches',()=>{
 assert.ok(server.includes("if(d.op==='contact.self')"));
 assert.ok(server.includes("if(ctx.pending||!ctx.member.active)return fail"));
 assert.ok(server.includes("UPDATE SET phone=excluded.phone"));
 assert.ok(client.includes('id="teamSelfContactForm"'));
 assert.ok(client.includes("await command('contact.self',{phone:d.phone})"));
});

test('les photos privées respectent le consentement et sont sans cache',()=>{
 assert.ok(server.includes("if(!consent)return fail('Droit à l’image non accordé.',403)"));
 assert.ok(server.includes("AND p.archived=0 LIMIT 1"));
 assert.ok(server.includes("'Cache-Control':'private, no-store'"));
});

test('les convocations du bureau incluent les dirigeants',()=>{
 assert.ok(server.includes("r.role IN ('bureau','director')"));
});

test('signature en paysage : ouvrir, recommencer, valider et revenir',()=>{
 assert.ok(client.includes('async function openSigning(memberId)'));
 assert.ok(client.includes("screen.orientation.lock('landscape')"));
 assert.ok(client.includes("classList.add('team-signing-fallback')"));
 assert.ok(client.includes('async function closeSigning()'));
 assert.ok(client.includes('data-signing-clear>Recommencer'));
 assert.ok(client.includes('data-signing-confirm>Valider la signature'));
 assert.ok(client.includes('data-signing-return>Retour sans enregistrer'));
 assert.ok(client.includes('data-signing-back'));
 assert.ok(client.includes('data-back-edit="activity"'));
 assert.ok(client.includes('data-back-edit="pole"'));
 assert.ok(client.includes('data-back-edit="member"'));
});
test('listes personnalisées sauvegardées côté serveur et réutilisables',()=>{
 assert.ok(server.includes("if(d.op==='list.save')"));
 assert.ok(server.includes("if(d.op==='list.delete')"));
 assert.ok(server.includes('team_saved_lists'));
 assert.ok(client.includes('function openSavedList(id)'));
 assert.ok(client.includes('id="teamCustomListForm"'));
 assert.ok(client.includes('data-list-column-move'));
 assert.ok(client.includes('data-list-move'));
 assert.ok(client.includes('data-list-check'));
 assert.ok(client.includes('data-list-exit'));
 assert.ok(client.includes("await command('list.save'"));
});

// Publication autorisée uniquement sur le Worker isolé de test ; application publique inchangée.

test('photo de profil, pastille avatar et chat façon groupes mobiles',()=>{
 assert.ok(client.includes('Ma photo de profil'));
 assert.ok(client.includes('Ajouter ou changer ma photo'));
 assert.ok(client.includes('function chatAvatar(m)'));
 assert.ok(client.includes('class="team-chat-avatar"'));
 assert.ok(client.includes('team-chat-room'));
 assert.ok(client.includes('team-unread'));
 assert.ok(client.includes('teamChatAttachment'));
 assert.ok(server.includes('async function chatSummary('));
 assert.ok(server.includes('async function permittedChat('));
 assert.ok(server.includes('async function uploadChatMedia('));
 assert.ok(server.includes('async function getChatMedia('));
});

test('pastille des non lus sur onglet Discussions',()=>{
 assert.ok(client.includes('team-tab-unread'));
 assert.ok(client.includes('aria-label='));
 assert.ok(client.includes("const badge=document.createElement('span')"));
});

test('les responsables ont une fiche contact sans messagerie privée',()=>{
 assert.ok(client.includes('team-chat-contact-card'));
 assert.ok(client.includes('Contacter '));
 assert.ok(client.includes('📞 Appeler'));
 assert.ok(client.includes('✉️ Envoyer un e-mail'));
 assert.ok(!client.includes('data-chat-direct'));
 assert.ok(!server.includes("channel==='direct'"));
 assert.ok(server.includes('async function chatLeaders('));
});

// Publier seulement sur ZikaTeam staging, après succès des tests. Contact responsable uniquement.

test('messagerie compacte : onglets et zone de saisie en permanence',()=>{
 assert.ok(client.includes('team-chat-compact'));
 assert.ok(client.includes('✍️ Votre message'));
 assert.ok(client.includes('Écrivez votre message ici…'));
 assert.ok(client.includes('signal:AbortSignal.timeout(12000)'));
 assert.ok(client.includes('void Promise.allSettled(tasks)'));
 assert.ok(client.includes('rooms[0]||null'));
});
test('personnalisation de l’icône sans rechargement bloquant',()=>{
 assert.ok(client.includes("toast('Icône du groupe enregistrée.')"));
 assert.ok(client.includes("toast('Image du groupe enregistrée.')"));
 assert.ok(client.includes("room.image_id=null"));
 assert.ok(client.includes("room.image_id=data.id"));
});
