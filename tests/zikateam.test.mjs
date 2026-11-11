import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Real SQL migrations and the real ZikaTeam implementation. Only JWT and network
// push are test doubles: cryptographic Access tests live in admin-auth tests.
test('ZikaTeam : rôles, convocations ciblées, charte, réponses, tâches et pointage',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zika-team-'));
 try{
  writeFileSync(join(dir,'zikateam.mjs'),readFileSync('server/zikateam.mjs'));
  writeFileSync(join(dir,'zikateam-login.mjs'),readFileSync('server/zikateam-login.mjs'));
  writeFileSync(join(dir,'admin-auth.mjs'),"export async function verifyAccessIdentity(token,env){return token&&env.ACCESS_AUD==='team-test'?{email:token.toLowerCase()}:null}");
  writeFileSync(join(dir,'webpush.mjs'),"export const enc=s=>new TextEncoder().encode(s); export const b64=b=>Buffer.from(b).toString('base64url'); export async function sendPush(){return 201}");
  const {handleZikaTeam,drainTeamPush,scheduleTeamReminders}=await import(pathToFileURL(join(dir,'zikateam.mjs')));
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  // Rejouer toutes les migrations, comme le test historique et le Worker D1.
  const {readdirSync}=await import('node:fs');
  for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
   db.exec(readFileSync('drizzle/'+name,'utf8'));
  }
  const DB={prepare(q){const stmt=db.prepare(q);return {bind(...args){return {all:async()=>({results:stmt.all(...args)}),first:async()=>stmt.get(...args),run:async()=>({meta:{changes:stmt.run(...args).changes}})}}}}};
  const env={DB,TEAM_ACCESS_AUD:'team-test',ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ADMIN_EMAIL:'admin@example.org',TEAM_PUSH_ENABLED:'false',BUCKET:{get:async()=>null}};
  async function invoke(email,path,data){
   const req=new Request('https://example.org'+path,{method:data?'POST':'GET',headers:{'Cf-Access-Jwt-Assertion':email,origin:'https://example.org','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
   const r=await handleZikaTeam(req,env);
   let payload;try{payload=await r.json()}catch{payload={}};
   return {status:r.status,payload};
  }
  const api=(email,op)=>invoke(email,'/zikateam/api/command',op);
  async function okay(email,op){const r=await api(email,op);assert.equal(r.status,200,JSON.stringify(r.payload));return r.payload;}
  const A='admin@example.org',L='lead@example.org',B='volunteer@example.org',O='other@example.org',S='secretary@example.org';
  assert.equal((await invoke('', '/zikateam/api/me')).status,403);
  assert.equal((await invoke(B,'/zikateam/api/me')).status,403);
  // L'administrateur crée sa fiche puis publie la charte avant toute gestion.
  await okay(A,{op:'member.save',name:'Administration',email:A});
  await okay(A,{op:'charter.save',version:'1',title:'Charte',content:'Respect et engagement'});
  // La charte est déjà publiée : le bénévole non signataire ne peut pas répondre.
  assert.equal((await invoke(A,'/zikateam/api/manage')).status,403,'gestion verrouillée jusqu’à signature');
  assert.equal((await api(A,{op:'charter.accept',version:'1',agree:true})).status,400,'aucune validation sans les trois réponses Oui/Non');
  assert.equal((await api(A,{op:'charter.accept',version:'1',agree:true,consents:{image:false,phone:false}})).status,400,'le choix e-mail manquant bloque la validation');
  assert.equal((await api(A,{op:'charter.accept',version:'1',agree:true,consents:{image:true,phone:false,email:false}})).status,200,'Oui est permis sans obliger les autres réponses à Oui');
  await okay(A,{op:'charter.accept',version:'1',agree:true,consents:{image:false,phone:false,email:false}});
  // Ajouter le document visuel officiel plus tard ne change pas la version signée.
  const charterPdfId='aaaaaaaa-1111-4111-8111-111111111111';
  db.prepare('INSERT INTO team_documents(id,kind,activity_id,name,mime,size,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(charterPdfId,'charter',null,'charte-officielle.pdf','application/pdf',120000,A,Date.now());
  await okay(A,{op:'charter.save',version:'1',title:'Charte',content:'Respect et engagement',documentId:charterPdfId});
  assert.equal((await invoke(A,'/zikateam/api/me')).payload.charterAccepted,true,'joindre le PDF ne force pas une nouvelle signature');
  const lead=(await okay(A,{op:'member.save',name:'Responsable',email:L})).id;
  const member=(await okay(A,{op:'member.save',name:'Bénévole',email:B})).id;
  const other=(await okay(A,{op:'member.save',name:'Autre bénévole',email:O})).id;
  const secretary=(await okay(A,{op:'member.save',name:'Secrétariat',email:S})).id;
  for(const email of [L,O,S,B])await okay(email,{op:'charter.accept',version:'1',agree:true,consents:{image:false,phone:false,email:false}});
  // Seul l'administrateur peut supprimer définitivement un pôle vide.
  const emptyPole=(await okay(A,{op:'pole.save',name:'Pôle provisoire à supprimer'})).id;
  assert.equal((await api(L,{op:'pole.delete',id:emptyPole})).status,403);
  await okay(A,{op:'pole.save',id:emptyPole,name:'Pôle provisoire renommé'});
  await okay(A,{op:'pole.delete',id:emptyPole});
  assert.equal((await api(A,{op:'pole.delete',id:emptyPole})).status,404);
  const pole=(await okay(A,{op:'pole.save',name:'ZikaVillage'})).id;
  const outsidePole=(await okay(A,{op:'pole.save',name:'Logistique'})).id;
  await okay(A,{op:'assignment.set',memberId:lead,poleId:pole,role:'lead'});
  await okay(A,{op:'assignment.set',memberId:member,poleId:pole,role:'member'});
  assert.equal((await api(A,{op:'pole.delete',id:pole})).status,409,'un pôle avec des bénévoles est protégé contre une suppression');
  assert.equal((await api(S,{op:'pole.delete',id:pole})).status,403,'le secrétariat ne peut supprimer un pôle');

  await okay(A,{op:'assignment.set',memberId:other,poleId:outsidePole,role:'member'});
  // Les conversations et les compteurs restent personnels aux groupes autorisés.
  assert.equal((await api(B,{op:'chat.icon.set',channel:'general',icon:'🎵'})).status,403,'un bénévole ne peut pas changer les icônes');
  await okay(A,{op:'chat.icon.set',channel:'general',icon:'🎵'});
  assert.equal((await invoke(B,'/zikateam/api/chat-summary')).payload.rooms.find(x=>x.channel==='general').icon,'🎵','icône enregistrée visible pour tous les membres');
  assert.equal((await api(A,{op:'chat.icon.set',channel:'general',icon:'<script>'})).status,400,'pas de caractères arbitraires injectés');
  assert.equal((await api(A,{op:'chat.icon.set',channel:'pole',channelId:outsidePole,icon:'🎪'})).status,200);
  assert.equal((await invoke(B,'/zikateam/api/chat-summary')).payload.rooms.some(x=>x.id===outsidePole),false,'icône du groupe extérieur non divulguée');
  const roomsB=(await invoke(B,'/zikateam/api/chat-summary')).payload.rooms;
  assert.ok(roomsB.some(x=>x.channel==='general'));
  assert.ok(roomsB.some(x=>x.channel==='pole'&&x.id===pole));
  assert.equal(roomsB.some(x=>x.channel==='pole'&&x.id===outsidePole),false,'aucun groupe extérieur visible');
  assert.equal((await invoke(B,'/zikateam/api/messages?channel=pole&id='+outsidePole)).status,403,'lecture du groupe extérieur interdite');
  assert.equal((await api(B,{op:'message.send',channel:'pole',channelId:outsidePole,body:'interdit'})).status,403,'écriture du groupe extérieur interdite');
  await okay(A,{op:'message.send',channel:'general',body:'Bonjour les bénévoles'});
  const unreadBefore=(await invoke(B,'/zikateam/api/chat-summary')).payload;
  assert.equal(unreadBefore.rooms.find(x=>x.channel==='general').unread,1,'nouveau message non lu');
  const msgRead=await invoke(B,'/zikateam/api/messages?channel=general');
  assert.equal(msgRead.status,200);
  assert.equal(msgRead.payload.messages.at(-1).author,'Administration');
  assert.equal((await invoke(B,'/zikateam/api/chat-summary')).payload.rooms.find(x=>x.channel==='general').unread,0,'ouverture du salon marque les messages lus');
  // Photo personnelle : elle reste privée sans consentement et devient avatar du groupe après choix Oui.
  const storage=new Map();
  env.BUCKET={
   put:async(key,bytes)=>{storage.set(key,bytes)},
   get:async key=>storage.has(key)?{body:storage.get(key)}:null,
   delete:async key=>{storage.delete(key)}
  };
  const photo=new Uint8Array(40);photo.set([255,216,255],0);
  async function filePost(email,path,bytes,mime,name){
   const res=await handleZikaTeam(new Request('https://example.org'+path,{
    method:'POST',headers:{'Cf-Access-Jwt-Assertion':email,origin:'https://example.org','Content-Type':mime,'X-File-Name':encodeURIComponent(name)},body:bytes
   }),env);
   return {status:res.status,payload:await res.json()};
  }
  assert.equal((await filePost(B,'/zikateam/api/chat-icon?channel=general',photo,'image/jpeg','non.jpg')).status,403,'seul admin modifie les images des groupes');
  const chatIconImage=await filePost(A,'/zikateam/api/chat-icon?channel=general',photo,'image/jpeg','groupe.jpg');
  assert.equal(chatIconImage.status,200,'image de groupe enregistrée');
  assert.equal((await invoke(B,'/zikateam/api/chat-summary')).payload.rooms.find(x=>x.channel==='general').image_id,chatIconImage.payload.id);
  const iconResponse=await handleZikaTeam(new Request('https://example.org/zikateam/chat-icon/'+chatIconImage.payload.id,{headers:{'Cf-Access-Jwt-Assertion':B}}),env);
  assert.equal(iconResponse.status,200,'image de groupe visible par un membre');
  const photoUpload=await filePost(B,'/zikateam/api/photo?member='+member,photo,'image/jpeg','avatar.jpg');
  assert.equal(photoUpload.status,200,'le bénévole ajoute lui-même sa photo');
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.member.has_photo,true);
  const msgPrivate=await invoke(L,'/zikateam/api/messages?channel=general');
  assert.equal(msgPrivate.status,200);
  assert.equal((await handleZikaTeam(new Request('https://example.org/zikateam/photo/'+member,{headers:{'Cf-Access-Jwt-Assertion':L}}),env)).status,403,'aucune photo affichée sans consentement');
  await okay(B,{op:'consents.save',consents:{image:true,phone:false,email:false}});
  await okay(B,{op:'message.send',channel:'pole',channelId:pole,body:'Avec mon avatar'});
  const avatarMessage=(await invoke(L,'/zikateam/api/messages?channel=pole&id='+pole)).payload.messages.at(-1);
  assert.equal(avatarMessage.has_photo,1,'avatar visible dans le groupe autorisé après consentement');
  assert.equal((await handleZikaTeam(new Request('https://example.org/zikateam/photo/'+member,{headers:{'Cf-Access-Jwt-Assertion':L}}),env)).status,200);
  assert.equal((await handleZikaTeam(new Request('https://example.org/zikateam/photo/'+member,{headers:{'Cf-Access-Jwt-Assertion':O}}),env)).status,403,'personne hors du pôle exclue de la photo');
  const mediaUpload=await filePost(B,'/zikateam/api/chat-media?channel=pole&id='+pole,photo,'image/jpeg','souvenir.jpg');
  assert.equal(mediaUpload.status,200,'envoi de média dans son groupe');
  const mediaList=(await invoke(L,'/zikateam/api/messages?channel=pole&id='+pole)).payload.messages;
  assert.equal(mediaList.at(-1).media_id,mediaUpload.payload.id,'pièce jointe liée au message');
  assert.equal((await handleZikaTeam(new Request('https://example.org/zikateam/chat-media/'+mediaUpload.payload.id,{headers:{'Cf-Access-Jwt-Assertion':O}}),env)).status,403,'média interdit hors du groupe');
  assert.equal((await handleZikaTeam(new Request('https://example.org/zikateam/chat-media/'+mediaUpload.payload.id,{headers:{'Cf-Access-Jwt-Assertion':L}}),env)).status,200,'média accessible aux membres du groupe');
  await okay(B,{op:'consents.save',consents:{image:false,phone:false,email:false}});
  const avatarRevoked=(await invoke(L,'/zikateam/api/messages?channel=pole&id='+pole)).payload.messages.find(m=>m.id===avatarMessage.id);
  assert.equal(avatarRevoked.has_photo,0,'retrait du droit à l’image immédiatement respecté');


  // Le partage des coordonnées est choisi par la personne, et ne concerne que son pôle.
  await okay(A,{op:'contact.set',memberId:member,phone:'0600000016',city:'Mansle-les-Fontaines'});
  const noShare=(await invoke(L,'/zikateam/api/manage')).payload.members.find(m=>m.id===member);
  assert.equal(noShare.email,'','l’adresse est masquée tant que le bénévole n’a pas accepté');
  assert.equal(noShare.phone,'','le téléphone est masqué tant que le bénévole n’a pas accepté');
  await okay(B,{op:'consents.save',consents:{image:false,phone:true,email:true}});
  const yesShare=(await invoke(L,'/zikateam/api/manage')).payload.members.find(m=>m.id===member);
  assert.equal(yesShare.email,B);
  assert.equal(yesShare.phone,'0600000016');
  const leadRoster=(await invoke(L,'/zikateam/api/me')).payload.poles.find(p=>p.id===pole).membersDetails.find(m=>m.id===member);
  assert.equal(leadRoster.phone,'0600000016','le responsable consulte les coordonnées autorisées');
  const volunteerRoster=(await invoke(B,'/zikateam/api/me')).payload.poles.find(p=>p.id===pole).membersDetails.find(m=>m.id===lead);
  assert.equal(volunteerRoster.phone,'','un bénévole ne voit pas le téléphone de ses collègues');
  assert.equal(volunteerRoster.email,'','un bénévole ne voit pas leur e-mail');

  assert.equal((await invoke(B,'/zikateam/api/me')).payload.consents.phone,true);
  await okay(B,{op:'consents.save',consents:{image:false,phone:false,email:false}});
  assert.equal((await invoke(L,'/zikateam/api/manage')).payload.members.find(m=>m.id===member).phone,'','le retrait du consentement est immédiat');

  assert.equal((await invoke(L,'/zikateam/api/manage')).payload.poles.length,1);
  assert.equal((await api(L,{op:'assignment.set',memberId:member,poleId:outsidePole,role:'member'})).status,403);
  assert.equal((await api(L,{op:'assignment.set',memberId:member,poleId:pole,role:'lead'})).status,403);
  assert.equal((await api(B,{op:'pole.save',name:'Accès interdit'})).status,403);
  assert.equal((await api(L,{op:'activity.save',kind:'meeting',title:'Tous',audience:'all',starts_at:'2027-04-24T09:00:00.000Z',ends_at:'2027-04-24T10:00:00.000Z',status:'published'})).status,403);
  const act=await okay(L,{op:'activity.save',kind:'meeting',title:'Réunion ZikaVillage',agenda:'Ordre du jour',audience:'poles',poles:[pole],starts_at:'2027-04-24T09:00:00.000Z',ends_at:'2027-04-24T10:00:00.000Z',status:'published'});
  assert.equal(act.invitedMembers,2);
  // Accès Secrétariat transversal : attribution par admin, vue minimale, pointage seul.
  assert.equal((await invoke(S,'/zikateam/api/manage')).status,403);
  assert.equal((await api(L,{op:'secretariat.set',memberId:secretary,enabled:true})).status,403);
  await okay(A,{op:'secretariat.set',memberId:secretary,enabled:true});
  assert.equal((await invoke(S,'/zikateam/api/me')).payload.secretariat,true);
  // Listes privées : accès réservé, sélection ordonnée et colonnes contrôlées.
  assert.equal((await api(B,{op:'list.save',title:'Liste interdite',columns:['name'],memberIds:[member]})).status,403);
  assert.equal((await api(L,{op:'list.save',title:'Liste interdite',columns:['name'],memberIds:[member]})).status,403);
  assert.equal((await api(S,{op:'list.save',title:'Sans colonne',columns:[],memberIds:[member]})).status,400);
  const savedList=(await okay(S,{op:'list.save',title:'Permanence de test',columns:['name','quality','phone'],memberIds:[member,secretary]})).id;
  let savedRows=(await invoke(S,'/zikateam/api/manage')).payload.savedLists;
  assert.equal(savedRows.length,1,'le secrétariat retrouve les listes');
  assert.deepEqual(JSON.parse(savedRows[0].member_ids_json),[member,secretary],'ordre conservé');
  assert.deepEqual(JSON.parse(savedRows[0].columns_json),['name','quality','phone']);
  await okay(A,{op:'list.save',id:savedList,title:'Permanence modifiée',columns:['name','email'],memberIds:[secretary,member]});
  savedRows=(await invoke(S,'/zikateam/api/manage')).payload.savedLists;
  assert.equal(savedRows[0].title,'Permanence modifiée');
  assert.deepEqual(JSON.parse(savedRows[0].member_ids_json),[secretary,member]);
  assert.equal((await api(B,{op:'list.delete',id:savedList})).status,403);
  await okay(S,{op:'list.delete',id:savedList});
  assert.equal((await invoke(S,'/zikateam/api/manage')).payload.savedLists.length,0);

  const secView=await invoke(S,'/zikateam/api/manage');
  assert.equal(secView.status,200);
  assert.equal(secView.payload.activities.length,1);
  assert.equal(secView.payload.activities[0].can_edit,false);
  assert.equal(secView.payload.activities[0].agenda,undefined);
  assert.equal(secView.payload.activities[0].tasks,undefined);
  assert.equal(secView.payload.members[0].email,A,'le secrétariat voit les fiches nécessaires pour désigner responsables et dirigeants');
  assert.equal((await api(S,{op:'member.save',name:'Inconnu',email:'x@example.org'})).status,403);
  assert.equal((await api(S,{op:'pole.save',name:'Pôle non autorisé'})).status,403);
  assert.equal((await api(S,{op:'activity.save',title:'Interdit'})).status,403);
  assert.equal((await api(S,{op:'checkin.set',activityId:act.id,memberId:other,present:true})).status,403);
  await okay(S,{op:'checkin.set',activityId:act.id,memberId:member,present:true});
  assert.equal((await invoke(S,'/zikateam/api/manage')).payload.activities[0].attendance.filter(m=>m.checked_in_at).length,1);
  assert.ok((await invoke(A,'/zikateam/api/manage')).payload.audit.some(x=>x.action==='checkin.set'&&x.actor_email===S));

  // Une vraie feuille indépendante des simples pointages : création puis ajout des présents.
  assert.equal((await api(L,{op:'signing.create',title:'Réunion secrétariat',startsAt:'2027-04-24T15:00:00.000Z',place:'Salle Gautier'})).status,403);
  const signatureSession=(await okay(S,{op:'signing.create',title:'Réunion des bénévoles',startsAt:'2027-04-24T15:00:00.000Z',place:'Salle Gautier Capuçon'})).id;
  assert.equal((await api(B,{op:'signing.add',sessionId:signatureSession,memberIds:[member]})).status,403,'aucune création de présents par un bénévole');
  await okay(S,{op:'signing.add',sessionId:signatureSession,memberIds:[member,lead]});
  const beforeSignature=(await invoke(S,'/zikateam/api/signing')).payload.sessions.find(x=>x.id===signatureSession);
  assert.equal(beforeSignature.attendees.length,2);
  assert.equal(beforeSignature.attendees.filter(x=>x.signed_at).length,0);
  const trace=[[[50,70],[80,120],[150,150],[240,95]],[[310,250],[400,180],[470,130]]];
  assert.equal((await api(L,{op:'signing.sign',sessionId:signatureSession,memberId:member,strokes:trace})).status,403);
  assert.equal((await api(S,{op:'signing.sign',sessionId:signatureSession,memberId:member,strokes:[[[5,6],[5,6]]]})).status,400);
  await okay(S,{op:'signing.sign',sessionId:signatureSession,memberId:member,strokes:trace});
  assert.equal((await api(S,{op:'signing.sign',sessionId:signatureSession,memberId:member,strokes:trace})).status,409,'signature validée non modifiable');
  // Le secrétariat peut ajouter un présent même après une première signature.
  await okay(S,{op:'signing.add',sessionId:signatureSession,memberIds:[other]});
  const signedSession=(await invoke(A,'/zikateam/api/signing')).payload.sessions.find(x=>x.id===signatureSession);
  assert.equal(signedSession.attendees.length,3);
  assert.deepEqual(JSON.parse(signedSession.attendees.find(x=>x.member_id===member).signature_points),trace,'le tracé exact est sauvegardé pour impression PDF');
  assert.equal((await api(S,{op:'signing.remove',sessionId:signatureSession,memberId:member})).status,409);
  await okay(S,{op:'signing.close',sessionId:signatureSession});
  assert.equal((await api(S,{op:'signing.add',sessionId:signatureSession,memberIds:[secretary]})).status,409,'feuille clôturée en lecture seule');
  assert.equal((await api(S,{op:'signing.sign',sessionId:signatureSession,memberId:other,strokes:trace})).status,409);
  // Les feuilles sont conservées et consultables ; suppression auditable et protégée.
  assert.equal((await invoke(A,'/zikateam/api/signing')).payload.sessions.some(x=>x.id===signatureSession),true,'la feuille signée reste sauvegardée');
  assert.equal((await api(B,{op:'signing.delete',sessionId:signatureSession,confirm:true,confirmTitle:'Réunion des bénévoles'})).status,403,'un bénévole ne supprime jamais un émargement');
  assert.equal((await api(S,{op:'signing.delete',sessionId:signatureSession,confirm:true,confirmTitle:'Réunion des bénévoles'})).status,403,'le secrétariat ne détruit pas des signatures validées');
  assert.equal((await api(A,{op:'signing.delete',sessionId:signatureSession,confirm:true})).status,409,'la suppression des signatures demande le titre exact');
  assert.equal((await api(A,{op:'signing.delete',sessionId:signatureSession,confirm:true,confirmTitle:'Titre incorrect'})).status,409);
  await okay(A,{op:'signing.delete',sessionId:signatureSession,confirm:true,confirmTitle:'Réunion des bénévoles'});
  assert.equal((await invoke(A,'/zikateam/api/signing')).payload.sessions.some(x=>x.id===signatureSession),false,'la feuille supprimée disparaît');
  assert.equal((await api(A,{op:'signing.delete',sessionId:signatureSession,confirm:true})).status,404,'une feuille supprimée ne peut pas être supprimée deux fois');
  const unsignedSession=(await okay(S,{op:'signing.create',title:'Feuille brouillon',place:'Salle de réunion',startsAt:'2027-04-24T16:00:00.000Z'})).id;
  await okay(S,{op:'signing.delete',sessionId:unsignedSession,confirm:true});
  assert.equal((await invoke(S,'/zikateam/api/signing')).payload.sessions.some(x=>x.id===unsignedSession),false,'le secrétariat peut supprimer une feuille non signée');
  assert.ok((await invoke(A,'/zikateam/api/manage')).payload.audit.some(x=>x.action==='signing.delete'),'une trace de suppression est conservée');


  // Le secrétariat peut désigner des responsables et des dirigeants depuis la fiche.
  assert.equal((await api(B,{op:'member.functions.set',memberId:member,roles:['director'],poleRoles:[{poleId:pole,role:'lead'}]})).status,403);
  assert.equal((await api(S,{op:'member.save',id:member,name:'Bénévole modifié',email:B,active:false})).status,403,'pas de modification de comptes');
  assert.equal((await api(S,{op:'secretariat.set',memberId:member,enabled:true})).status,403,'pas d’élévation de privilèges secrétariat');
  await okay(S,{op:'member.functions.set',memberId:member,roles:['director','bureau'],poleRoles:[{poleId:pole,role:'lead'}]});
  let rolesAfter=(await invoke(S,'/zikateam/api/manage')).payload;
  assert.ok(rolesAfter.members.find(x=>x.id===member).roles.includes('director'),'dirigeant ajouté');
  assert.ok(rolesAfter.memberships.some(x=>x.member_id===member&&x.pole_id===pole&&x.role==='lead'),'responsable ajouté depuis fiche');
  await okay(S,{op:'assignment.set',memberId:member,poleId:outsidePole,role:'member'});
  rolesAfter=(await invoke(S,'/zikateam/api/manage')).payload;
  assert.ok(rolesAfter.memberships.some(x=>x.member_id===member&&x.pole_id===outsidePole),'autre pôle ajouté sans perdre le précédent');
  await okay(S,{op:'member.functions.set',memberId:member,roles:[],poleRoles:[{poleId:pole,role:'member'}]});
  assert.ok(!(await invoke(S,'/zikateam/api/manage')).payload.members.find(x=>x.id===member).roles.includes('director'),'fonction dirigeant réversible');
  await okay(A,{op:'secretariat.set',memberId:secretary,enabled:false});
  assert.equal((await invoke(S,'/zikateam/api/manage')).status,403);
  assert.equal((await invoke(S,'/zikateam/api/signing')).status,403,'droit révoqué immédiatement');
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities.length,1);
  assert.equal((await invoke(O,'/zikateam/api/me')).payload.activities.length,0);
  assert.equal((await api(O,{op:'activity.rsvp',activityId:act.id,answer:'yes'})).status,403);
  await okay(A,{op:'charter.save',version:'2',title:'Charte',content:'Charte actualisée et acceptation renouvelée'});
  assert.equal((await api(B,{op:'activity.rsvp',activityId:act.id,answer:'yes'})).status,403,'la charte actualisée bloque les actions non acceptées');
  assert.equal((await api(B,{op:'charter.accept',version:'2'})).status,400,'acceptation explicite obligatoire');
  await okay(B,{op:'charter.accept',version:'2',agree:true,consents:{image:false,phone:false,email:false}});
  await okay(L,{op:'charter.accept',version:'2',agree:true,consents:{image:false,phone:false,email:false}});
  await okay(A,{op:'charter.accept',version:'2',agree:true,consents:{image:false,phone:false,email:false}});
  await okay(B,{op:'activity.rsvp',activityId:act.id,answer:'yes'});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities[0].my_response,'yes');
  assert.equal((await api(A,{op:'charter.save',version:'2',title:'Charte',content:'Texte modifié'})).status,409);
  const task=await okay(L,{op:'task.save',activityId:act.id,title:'Installer les barnums',assigned_to:member,status:'todo'});
  assert.equal((await api(O,{op:'task.status',id:task.id,status:'done'})).status,403,'le bénévole hors du pôle ne peut modifier la tâche');
  await okay(B,{op:'task.status',id:task.id,status:'done'});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities[0].tasks[0].status,'done');
  assert.equal((await api(L,{op:'checkin.set',activityId:act.id,memberId:other,present:true})).status,403);
  await okay(L,{op:'checkin.set',activityId:act.id,memberId:member,present:true});
  assert.equal((await invoke(L,'/zikateam/api/manage')).payload.activities[0].attendance.filter(m=>m.checked_in_at).length,1);
  const shift=await okay(L,{op:'shift.save',activityId:act.id,starts_at:'2027-04-24T09:00:00.000Z',ends_at:'2027-04-24T10:00:00.000Z',capacity:1,label:'Montage'});
  await okay(B,{op:'shift.signup',shiftId:shift.id});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities[0].my_shifts.length,1);
  await okay(A,{op:'pole.archive',id:pole});
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities.length,0);

  // Les réunions peuvent cibler les membres du bureau exclusivement.
  await okay(A,{op:'member.save',id:member,name:'Bénévole',email:B,roles:['bureau']});
  const meetingBureau=await okay(A,{op:'activity.save',kind:'meeting',title:'Réunion du bureau',audience:'bureau',starts_at:'2027-04-25T09:00:00.000Z',ends_at:'2027-04-25T10:00:00.000Z',status:'published'});
  assert.equal(meetingBureau.invitedMembers,1,'seul le membre du bureau est concerné');
  assert.equal((await invoke(B,'/zikateam/api/me')).payload.activities.some(x=>x.id===meetingBureau.id),true);
  assert.equal((await invoke(O,'/zikateam/api/me')).payload.activities.some(x=>x.id===meetingBureau.id),false);
  assert.deepEqual(await drainTeamPush(env),{sent:0,disabled:true});
  assert.deepEqual(await scheduleTeamReminders(env),{sent:0,disabled:true});
  const stagingEnv={...env,APP_ENV:'staging',TEAM_PUSH_ENABLED:'true',VAPID_PRIVATE_JWK:'test-private',VAPID_PUBLIC_KEY:'test-public'};
  assert.deepEqual(await drainTeamPush(stagingEnv),{sent:0,disabled:true},'aucune notification collective ne part du staging');
  assert.deepEqual(await scheduleTeamReminders(stagingEnv),{sent:0,disabled:true},'aucun rappel ne part du staging');

  db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
