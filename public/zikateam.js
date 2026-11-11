(()=>{'use strict';
const root=document.getElementById('teamRoot'),$=id=>document.getElementById(id);
const state={me:null,manage:null,tab:'fiche',managementTab:'activites',editMember:null,editPole:null,editActivity:null,editShift:null,chatChannel:'general',chatId:null,chatRooms:[],chatUnread:0,messages:[],chatMobileOpen:false,busy:false,freeLogin:false,loginEmail:'',loginName:'',inviteCode:'',invitationDraft:null,codeSent:false,loginMethod:'password',forcePasswordSetup:false,adhesionFilter:'pending',directorySearch:'',directoryImage:'all',directoryPhone:'all',directoryEmail:'all',signing:null,signingCurrent:null,signingMember:null,signingFilter:'all',signingPole:'',signingStrokes:[],signingSelection:[],signingExpanded:false,signingOrientationLocked:false,listStatus:'all',listRole:'all',listPole:'',listImage:'all',listPhone:'all',listEmail:'all',listSearch:'',listEditor:false,listId:null,listTitle:'',listSelected:[],listColumns:['name','quality','poles','paid','phone','email']};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const dt=s=>s?new Date(s).toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}):'Date à définir';
const shortdt=s=>s?new Date(s).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Paris'}):'—';
const inputDate=s=>s?new Date(s).toLocaleString('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T'):'';
const kindName={meeting:'Réunion',stand:'Stand / permanence',mission:'Mission / animation',setup:'Montage / démontage',other:'Autre activité (objet libre)'};
const statusName={draft:'Brouillon',published:'Publiée',cancelled:'Annulée'};
const responseName={yes:'Présent',no:'Absent',maybe:'À confirmer',pending:'Sans réponse'};
const toast=s=>{
 let el=$('teamToast');
 if(!el){el=document.createElement('div');el.id='teamToast';el.className='team-toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el);}
 el.textContent=s;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,6500);
};
async function api(path,data,options={}){
 const r=await fetch('/zikateam/api/'+path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{}),...options});
 const raw=await r.text();let body;try{body=JSON.parse(raw)}catch{body={error:raw.slice(0,180)||'Connexion indisponible'}};
 if(!r.ok)throw Error(body.error||'L’opération a échoué.');return body;
}
const command=(op,data={})=>api('command',{op,...data});
const pills=arr=>arr.map(t=>'<span class="team-pill">'+esc(t)+'</span>').join('');
function header(){const m=state.me;return '<header class="team-heading"><span>Espace privé · '+(m.pending?'Inscription en attente':m.admin?'Administration et bénévoles':m.leadPoles.length?'Responsable et bénévoles':m.secretariat?'Secrétariat':'Bénévoles')+'</span><h1>Bonjour '+esc(m.member?.name||'ZikaTeam')+' !</h1><p class="team-muted">Vos équipes, vos rendez-vous et vos informations au même endroit.</p>'+(state.freeLogin?'<button type="button" class="team-button light" data-team-logout>Me déconnecter</button>':'')+'</header>';
}
function menu(){return '<nav class="team-tabs" aria-label="Rubriques ZikaTeam">'+(state.me.pending?[['fiche','Mon accueil']]:[
 ['fiche','Ma fiche'],['activites','Mon agenda'],['messages','Discussions'],...((state.me.admin||state.me.leadPoles.length||state.me.secretariat)?[['gestion',state.me.secretariat&&!state.me.admin&&!state.me.leadPoles.length?'Secrétariat':'Gestion des équipes']]:[])
 ]).map(([id,title])=>'<button type="button" data-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+title+(id==='messages'&&state.chatUnread?'<span class="team-unread team-tab-unread" aria-label="'+state.chatUnread+' messages non lus">'+(state.chatUnread>99?'99+':state.chatUnread)+'</span>':'')+'</button>').join('')+'</nav>'}
function consentQuestions(consents={}){
 const items=[
  ['image','Droit à l’image','J’autorise ZikaMansle à utiliser les photos et vidéos sur lesquelles je suis reconnaissable, réalisées lors des activités de l’association, pour communiquer sur ses événements (site, réseaux sociaux, affiches et publications).'],
  ['phone','Partage de mon téléphone','J’autorise les responsables des pôles auxquels j’appartiens à consulter mon numéro de téléphone pour organiser les activités. Les autres bénévoles ne le verront pas.'],
  ['email','Partage de mon e-mail','J’autorise les responsables des pôles auxquels j’appartiens à consulter mon adresse e-mail pour organiser les activités. Les autres bénévoles ne la verront pas.']
 ];
 return '<div class="team-consent-choices">'+items.map(([kind,title,description])=>'<fieldset class="team-consent-choice"><legend>'+title+'</legend><p>'+description+'</p><div class="team-row"><label class="team-check"><input type="radio" name="consent_'+kind+'" value="yes" required '+(consents[kind]===true?'checked':'')+'> Oui, j’autorise</label><label class="team-check"><input type="radio" name="consent_'+kind+'" value="no" required '+(consents[kind]===false?'checked':'')+'> Non, je refuse</label></div></fieldset>').join('')+'</div>';
}
function consentPayload(form){
 const data=new FormData(form),consents={};
 for(const key of ['image','phone','email']){
  const value=data.get('consent_'+key);
  if(!['yes','no'].includes(value))throw Error('Choisis Oui ou Non pour les trois autorisations.');
  consents[key]=value==='yes';
 }
 return consents;
}
function charterBlock(){
 const m=state.me;if(!m.charter)return '<div class="team-notice" role="status">La charte officielle sera disponible ici après publication.</div>';
 const c=m.charter,accepted=m.charterAccepted;
 const content='<div class="team-charter">'+esc(c.content)+'</div>'+(c.document_id?'<p><a class="team-link" href="/zikateam/document/'+esc(c.document_id)+'" target="_blank" rel="noopener">Ouvrir la charte officielle en PDF</a></p>':'');
 const opt='<section class="team-consent-notice"><h3>Mes autorisations personnelles</h3><p>Répondre Oui ou Non est nécessaire, mais <strong>accepter n’est jamais obligatoire</strong>. Tu peux refuser un ou plusieurs usages et changer ton choix par la suite.</p></section>';
 return '<section class="team-card team-charter-card '+(accepted?'team-charter-signed':'team-charter-required')+'"><div class="team-between"><h2>'+esc(c.title)+'</h2><span class="team-pill '+(accepted?'ok':'warn')+'">'+(accepted?'Acceptée':'Lecture obligatoire')+'</span></div>'+
 '<p class="team-muted">Version '+esc(c.version)+(m.charterAcceptedAt?' · Acceptée le '+shortdt(m.charterAcceptedAt):'')+'</p>'+
 (accepted?'<details class="team-charter-details"><summary>Relire la charte des bénévoles</summary>'+content+'</details>'+
 '<div class="team-consents-saved"><h3>Droit à l’image et partage des coordonnées</h3><p class="team-muted">Tes choix sont modifiables à tout moment.</p><form id="consentForm" class="team-form">'+consentQuestions(m.consents)+'<button type="submit" class="team-button orange">Enregistrer mes autorisations</button></form></div>'
 :content+'<p><strong>Pour accéder à ton espace ZikaTeam, tu dois accepter la charte et répondre aux trois questions ci-dessous.</strong></p><form id="charterAccept" class="team-form"><label class="team-consent"><input type="checkbox" name="agree" required> J’ai lu la charte et j’accepte de m’y conformer.</label>'+opt+consentQuestions(m.consents)+'<button type="submit" class="team-button orange">Valider la charte et mes choix</button></form>')+'</section>';
}
function avatar(member){
 const name=member?.name||'Bénévole';
 const initials=name.split(/\s+/).slice(0,2).map(x=>x.charAt(0).toUpperCase()).join('');
 return member?.has_photo?'<img class="team-avatar" src="/zikateam/photo/'+esc(member.id)+'" alt="Photo de '+esc(name)+'" loading="lazy">':'<span class="team-avatar team-avatar-empty" aria-label="Aucune photo">'+esc(initials)+'</span>';
}
function noticeCenter(){
 const notices=(state.me?.notices||[]).filter(n=>!n.seen_at);
 if(!notices.length)return '';
 const reasons={created:'Nouvelle activité',updated:'Activité modifiée',cancelled:'Activité annulée'};
 return '<section class="team-card team-accent-orange team-agenda-alerts" role="region" aria-label="Nouvelles informations"><div class="team-between"><h2>🔔 Informations à consulter</h2><span class="team-unread">'+notices.length+' nouvelle'+(notices.length>1?'s':'')+'</span></div><p>Ces informations concernent tes équipes, rendez-vous ou missions.</p>'+
 notices.slice(0,10).map(n=>'<article class="team-agenda-alert"><div><span class="team-pill '+(n.reason==='cancelled'?'bad':'ok')+'">'+esc(reasons[n.reason]||'Agenda')+'</span><h3>'+esc(n.title)+'</h3><p>'+(n.custom_kind?esc(n.custom_kind)+' · ':'')+esc(shortdt(n.starts_at))+(n.place?' · '+esc(n.place):'')+'</p></div><div class="team-row"><button type="button" class="team-button orange" data-notice-open="'+esc(n.id)+'">Voir dans mon agenda</button><button type="button" class="team-button light" data-notice-dismiss="'+esc(n.id)+'">Marquer comme lu</button></div></article>').join('')+
 (notices.length>10?'<p class="team-small">D’autres informations figurent dans ton agenda.</p>':'')+'</section>';
}
function quickAccess(){
 const actions=[['activites','calendar','Mes rendez-vous','Voir mes réunions, stands et réponses','agenda'],['messages','chat','Messagerie','Écrire à mon équipe','equipe'],...((state.me.admin||state.me.leadPoles.length||state.me.secretariat)?[['gestion','settings','Gérer les équipes','Pôles, bénévoles et missions','admin']]:[])];
 return '<section class="team-shortcuts" aria-label="Accès rapides">'+actions.map(([id,icon,title,desc,color])=>'<button type="button" class="team-shortcut team-shortcut-'+color+'" data-tab="'+id+'"><span class="team-shortcut-symbol" aria-hidden="true">'+(icon==='calendar'?'▣':icon==='chat'?'✉':'⚙')+'</span><span><strong>'+title+'</strong><small>'+desc+'</small></span><span aria-hidden="true">›</span></button>').join('')+'</section>';
}

function teamNotificationSettings(){
 const p=state.me?.notificationPrefs||{chat_mode:'grouped',sound_mode:'all',vibrate:true,activity_enabled:true,urgent_enabled:true,quiet_enabled:false,quiet_start:'22:00',quiet_end:'08:00'};
 const muted=state.me?.mutedChats||[],rooms=state.chatRooms||[];
 const checked=v=>v?' checked':'';
 const select=(key,val,items)=>'<select name="'+key+'">'+items.map(([v,t])=>'<option value="'+v+'"'+(val===v?' selected':'')+'>'+t+'</option>').join('')+'</select>';
 return '<section class="team-card team-accent-purple team-notifications-settings"><h2>🔔 Mes notifications</h2><p>Règle les alertes pour tes propres équipes et activités.</p>'+
 '<p class="team-small"><strong>Par défaut : notifications et son activés pour tes réunions, missions et messages, avec vibration. Aucune plage silencieuse.</strong> Tu peux modifier tes préférences ici. Le son réellement joué et le petit pictogramme dépendent aussi d’Android et du navigateur.</p><form id="teamNotificationsForm" class="team-form"><div class="team-split"><label>Messages des groupes'+select('chat_mode',p.chat_mode,[['grouped','Groupées'],['all','Tous les messages'],['silent','Silencieuses']])+'</label><label>Son'+select('sound_mode',p.sound_mode,[['important','Seulement les alertes importantes'],['none','Aucun son'],['all','Toutes les notifications autorisées']])+'</label></div>'+
 '<label class="team-check"><input type="checkbox" name="vibrate"'+checked(p.vibrate)+'> Autoriser la vibration</label><label class="team-check"><input type="checkbox" name="activity_enabled"'+checked(p.activity_enabled)+'> Réunions et missions</label><label class="team-check"><input type="checkbox" name="urgent_enabled"'+checked(p.urgent_enabled)+'> Alertes urgentes et annulations</label><label class="team-check"><input type="checkbox" name="quiet_enabled"'+checked(p.quiet_enabled)+'> Ne pas déranger</label>'+
 '<div class="team-split"><label>Silencieux à partir de<input type="time" name="quiet_start" value="'+esc(p.quiet_start)+'" required></label><label>Jusqu’à<input type="time" name="quiet_end" value="'+esc(p.quiet_end)+'" required></label></div>'+
 '<button class="team-button orange" type="submit">Enregistrer mes notifications</button></form>'+
 '<h3>Mettre un groupe en sourdine</h3>'+(rooms.length?rooms.map(room=>'<label class="team-check team-notification-group"><input type="checkbox" data-chat-mute="'+esc(room.channel+':'+(room.id||''))+'"'+checked(muted.some(x=>x.channel===room.channel&&(x.channel_id||'')===(room.id||'')))+'> '+esc(room.title)+'</label>').join(''):'<p class="team-small">Les groupes apparaissent une fois chargés.</p>')+
 '<p class="team-small team-muted">Le son et la vibration dépendent des réglages du téléphone. La réception des réunions nécessite une autorisation et un abonnement propre à chaque compte.</p><div class="team-row"><button type="button" class="team-button orange" data-link-push>Autoriser les notifications sur cet appareil</button><button type="button" class="team-button light" data-test-local-push>Tester l’affichage sur cet appareil</button><button type="button" class="team-button orange" data-test-server-push>Envoyer une notification TEST depuis le serveur</button></div><p id="teamPushStatus" role="status" aria-live="polite">Pour recevoir une convocation, autorise les notifications sur ce téléphone.</p><p class="team-small">Le test d’affichage est local : il ne prouve pas encore l’envoi automatique du serveur après publication.</p></section>';
}
function notificationWelcome(){
 if(typeof Notification==='undefined'||!('serviceWorker' in navigator))return '';
 if(Notification.permission==='granted')return '';
 const refused=Notification.permission==='denied';
 return '<section class="team-card team-accent-orange" aria-label="Notifications ZikaTeam"><h2>🔔 Notifications activées dans ZikaTeam</h2><p>Tu recevras par défaut les informations concernant tes réunions, missions et groupes. Pour les voir sur ton téléphone, Android demande une seule autorisation.</p>'+
  (refused?'<p><strong>Notifications bloquées sur cet appareil.</strong> Autorise-les dans les paramètres du navigateur ou du téléphone, puis reviens ici.</p>':'<button type="button" class="team-button orange" data-link-push>Autoriser les notifications sur cet appareil</button>')+'</section>';
}
function fiche(){const m=state.me;if(m.pending)return '<section class="team-card team-accent-orange" role="status"><span class="team-pill warn">Inscription en attente d’approbation</span><h2>Bienvenue dans ZikaTeam !</h2><p><strong>Ton adresse e-mail a bien été vérifiée et ta demande d’inscription est enregistrée.</strong> L’administration doit encore la valider et t’attribuer tes fonctions et tes pôles.</p><div class="team-notice"><strong>Ce que tu peux faire dès maintenant :</strong> relire la charte des bénévoles et vérifier que ta demande est en attente.</div><p><strong>Accès temporairement fermé :</strong> tu ne peux consulter aucune conversation, même générale, ni les pôles, plannings, missions et informations internes.</p><p><strong>Après validation de ton inscription :</strong> tu retrouveras les rubriques, équipes et fonctionnalités correspondant à ton rôle. Il suffira d’actualiser ton espace ou de te reconnecter.</p></section>'+charterBlock();if(!m.member)return '<section class="team-card"><h2>Créer ma fiche personnelle</h2><p>Ton compte administrateur est connecté. Complète simplement ton nom pour disposer aussi d’une fiche bénévole.</p><form id="teamMyProfileForm" class="team-form"><label>Nom et prénom<input name="name" type="text" minlength="2" maxlength="110" autocomplete="name" required placeholder="Nom et prénom"></label><p class="team-small">Adresse de connexion : <strong>'+esc(m.email)+'</strong></p><button type="submit" class="team-button orange">Enregistrer ma fiche</button></form></section>'+charterBlock();
 const identity=m.admin?'<form id="teamMyProfileForm" class="team-form"><label>Nom et prénom<input name="name" type="text" minlength="2" maxlength="110" autocomplete="name" required value="'+esc(m.member.name)+'"></label><button type="submit" class="team-button orange">Enregistrer ma fiche</button></form>':'<strong>'+esc(m.member.name)+'</strong>';
 return notificationWelcome()+noticeCenter()+quickAccess()+'<section class="team-grid"><div class="team-card team-accent-blue"><h2>Mes coordonnées</h2><div class="team-self-photo">'+avatar({id:m.member.id,name:m.member.name,has_photo:m.member.has_photo})+'<div><strong>Ma photo de profil</strong><p class="team-small">Choisis une photo qui apparaîtra dans les discussions des personnes autorisées à la voir.</p><label class="team-button light team-photo-upload">Ajouter ou changer ma photo<input data-photo-member="'+esc(m.member.id)+'" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Ajouter ou modifier ma photo" hidden></label></div></div>'+identity+'<p>'+esc(m.member.email)+'</p><p class="team-muted">L’adresse de connexion ne peut être modifiée que dans l’administration.</p><form id="teamSelfContactForm" class="team-form"><label>Mon téléphone personnel<input type="tel" name="phone" autocomplete="tel" maxlength="40" value="'+esc(m.myContact?.phone||'')+'" placeholder="Mon numéro de téléphone"></label><p class="team-small team-muted">Ce numéro reste privé. Seuls les responsables de tes pôles pourront le consulter si tu as choisi « Oui » pour son partage dans les autorisations ci-dessous. Tu peux laisser le champ vide.</p><button type="submit" class="team-button orange">Enregistrer mon téléphone</button></form></div><div class="team-card team-accent-teal"><h2>Mes pôles</h2>'+(m.poles.length?m.poles.map(p=>'<div class="team-item"><h3>'+esc(p.name)+'</h3><span class="team-pill '+(p.role==='lead'?'ok':'')+'">'+(p.role==='lead'?'Responsable':'Membre de l’équipe')+'</span><p class="team-small">Responsables :</p>'+(p.leadersDetails?.length?'<div class="team-leaders">'+p.leadersDetails.map(x=>'<div class="team-person">'+avatar(x)+'<span>'+esc(x.name)+'</span></div>').join('')+'</div>':'<p>À désigner</p>')+'<details class="team-roster"><summary>Voir les membres et les coordonnées autorisées aux responsables</summary>'+(p.membersDetails||[]).map(person=>'<div class="team-person-contact"><strong>'+esc(person.name)+'</strong><span class="team-small">'+(person.role==='lead'?'Responsable':'Bénévole')+'</span>'+(person.phone?'<a href="tel:'+esc(person.phone)+'">Téléphone : '+esc(person.phone)+'</a>':'')+(person.email?'<a href="mailto:'+esc(person.email)+'">E-mail : '+esc(person.email)+'</a>':'')+(!person.phone&&!person.email?'<span class="team-muted team-small">Coordonnées non partagées</span>':'')+'</div>').join('')+'</details></div>').join(''):'<p>Ton affectation aux pôles sera ajoutée par l’administration ou ton responsable.</p>')+'</div></section>'+charterBlock()+'<section class="team-card"><h2>Mes prochains rendez-vous</h2>'+myActivities(3)+'</section>'+teamNotificationSettings();
}
function tasksBlock(a,manageable){
 if(!a.tasks?.length)return manageable?'<p class="team-small team-muted">Aucune tâche définie pour cette activité.</p>':'';
 const mine=state.me.member?.id;
 return '<details class="team-task-list"><summary><strong>Préparation et tâches ('+a.tasks.length+')</strong></summary>'+a.tasks.map(t=>{
  const person=state.manage?.members?.find(m=>m.id===t.assigned_to);
  const label={todo:'À faire',doing:'En cours',done:'Terminée'}[t.status]||'À faire';
  return '<div class="team-between team-item"><div><strong>'+esc(t.title)+'</strong><div class="team-small">'+esc(t.details||'')+'</div><div class="team-small">'+esc(person?.name||(t.assigned_to===mine?'À moi':'Non attribuée'))+' · '+label+'</div></div><div class="team-row">'+(!manageable&&mine&&t.assigned_to===mine&&t.status!=='done'?'<button class="team-button light" data-task-status="'+t.id+'" data-status="done">Terminer</button>':'')+(manageable?'<button class="team-button danger" data-delete-task="'+t.id+'">Supprimer</button>':'')+'</div></div>';
 }).join('')+'</details>';
}
function attendanceBlock(a){
 if(!a.attendance)return '';
 return '<details class="team-task-list"><summary><strong>Effectifs et pointage ('+a.attendance.length+')</strong></summary><div class="team-table-wrap"><table class="team-table"><thead><tr><th>Bénévole</th><th>Réponse</th><th>Présence sur place</th></tr></thead><tbody>'+a.attendance.map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+esc(responseName[m.answer])+'</td><td><button class="team-button '+(m.checked_in_at?'light':'orange')+'" data-checkin="'+a.id+'" data-member="'+m.member_id+'" data-present="'+(m.checked_in_at?'0':'1')+'" '+(a.status!=='published'?'disabled':'')+'>'+(m.checked_in_at?'Annuler le pointage':'Pointer présent')+'</button></td></tr>').join('')+'</tbody></table></div></details>';
}
function activityCard(a,manageable=false){
 const color=a.status==='cancelled'?'bad':a.status==='published'?'ok':'warn';
 const buttons=(a.status==='published'&&state.me.member&&!manageable)?'<div class="team-row">'+[['yes','Présent'],['no','Absent'],['maybe','À confirmer']].map(([v,l])=>'<button class="team-button '+(a.my_response===v?'':'light')+'" data-rsvp="'+esc(a.id)+'" data-answer="'+v+'" aria-pressed="'+(a.my_response===v)+'">'+l+'</button>').join('')+'</div>':'';
 const poles=(state.manage?.poles||state.me.poles||[]).filter(p=>a.poles?.includes(p.id)).map(p=>p.name);
 const shifts=a.shifts?.length?'<div class="team-item"><h3>Créneaux / postes</h3>'+a.shifts.map(s=>'<div class="team-between" style="padding:9px 0;border-bottom:1px solid #e2ecf3"><div><b>'+esc(s.label)+'</b><div class="team-small">'+shortdt(s.starts_at)+' → '+shortdt(s.ends_at)+'<br>'+s.signed_count+' / '+s.capacity+' inscrit(s)</div></div>'+(!manageable&&a.status==='published'&&state.me.member?'<button class="team-button light" data-shift-sign="'+s.id+'" data-remove="'+(a.my_shifts?.includes(s.id)?'1':'0')+'">'+(a.my_shifts?.includes(s.id)?'Me désinscrire':'M’inscrire')+'</button>':'')+'</div>').join('')+'</div>':'';
 return '<article id="teamActivity-'+esc(a.id)+'" class="team-item"><div class="team-between"><div><span class="team-pill">'+esc(a.custom_kind||kindName[a.kind]||'Activité')+'</span><span class="team-pill '+color+'">'+esc(statusName[a.status])+'</span></div>'+(manageable?'<button class="team-button light" data-edit-activity="'+a.id+'">Modifier</button>':'')+'</div><h3>'+esc(a.title)+'</h3><p><strong>'+esc(dt(a.starts_at))+'</strong><br>Jusqu’au '+esc(shortdt(a.ends_at))+' · '+esc(a.place||'Lieu à préciser')+'</p>'+(poles.length?'<p>'+pills(poles)+'</p>':'')+(a.details?'<p>'+esc(a.details)+'</p>':'')+(a.agenda?'<details><summary><strong>Ordre du jour / consignes</strong></summary><p style="white-space:pre-wrap">'+esc(a.agenda)+'</p></details>':'')+(a.agenda_document_id?'<p><a class="team-link" target="_blank" rel="noopener" href="/zikateam/document/'+esc(a.agenda_document_id)+'">Document joint (PDF) ↗</a></p>':'')+shifts+tasksBlock(a,manageable)+buttons+(manageable?attendanceBlock(a)+'<p class="team-small">'+(a.invitedCount??0)+' personnes concernées · '+(a.responses||[]).filter(x=>x.answer==='yes').length+' présent(s), '+(a.responses||[]).filter(x=>x.answer==='no').length+' absent(s), '+(a.responses||[]).filter(x=>x.answer==='maybe').length+' à confirmer</p>'+(a.responses?.length?'<details><summary>Voir les réponses</summary><ul>'+a.responses.map(r=>'<li>'+esc(r.name)+' : '+esc(responseName[r.answer])+'</li>').join('')+'</ul></details>':''):'')+'</article>';
}
function myActivities(limit=0){const a=[...(state.me.activities||[])].sort((x,y)=>x.starts_at.localeCompare(y.starts_at));const results=limit?a.slice(0,limit):a;return results.length?results.map(x=>activityCard(x)).join(''):'<p class="team-muted">Aucune convocation à venir. Les réunions et missions apparaîtront ici dès leur publication.</p>'}
function activities(){return noticeCenter()+'<div class="team-card"><h2>Mon agenda ZikaTeam</h2><p>Réunions, stands, montage et missions de mes pôles. Choisis ta disponibilité pour chaque activité.</p>'+(!state.me.charterAccepted?'<div class="team-warning">Accepte d’abord la charte pour confirmer ta présence.</div>':'')+myActivities()+'</div>'}
function chatAvatar(m){return avatar({id:m.author_id,name:m.author||'Bénévole',has_photo:Boolean(m.has_photo)});}
function roomIcon(room){return room?.image_id?'<img src="/zikateam/chat-icon/'+esc(room.image_id)+'" alt="Icône du groupe" loading="lazy">':esc(room?.icon||'💬');}
const chatIcons=['💬','⭐','🎨','📅','🎵','🎤','🎪','🎭','📢','🧡','💜','💙','💚','🌟','📸','🤝','🎯','🎟️','🍹','🚗','📍','🛠️','🎉','📚','🎬'];
function messages(){
 if(state.me.pending)return '<section class="team-card team-accent-orange"><h2>Inscription en attente</h2><p>Les discussions seront disponibles après validation.</p></section>';
 const rooms=state.chatRooms||[];
 const active=rooms.find(r=>r.channel===state.chatChannel&&(r.id||null)===(state.chatId||null))||rooms[0]||null;
 const toInitials=name=>String(name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
 const fmtTime=value=>{if(!value)return '';const time=new Date(value);return Number.isNaN(time.valueOf())?'':time.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})};
 const roomsView=rooms.map(room=>{
  const selected=active?.channel===room.channel&&(active?.id||null)===(room.id||null);
  const brief=room.last?.body||'Aucun message pour le moment';
  return '<button class="team-wa-room'+(selected?' selected':'')+'" type="button" data-chat-room="'+esc(room.channel+':'+(room.id||''))+'" aria-current="'+(selected?'true':'false')+'"><span class="team-wa-room-icon">'+roomIcon(room)+'</span><span class="team-wa-room-summary"><strong>'+esc(room.title)+'</strong><small>'+esc(room.last?.author?room.last.author+' : '+brief:brief)+'</small></span><span class="team-wa-room-trailing"><time>'+esc(fmtTime(room.last?.created_at))+'</time>'+(room.unread?'<span class="team-unread">'+Math.min(room.unread,99)+(room.unread>99?'+':'')+'</span>':'')+'</span></button>';
 }).join('');
 const people=active?.responsibles||[];
 const peopleView=people.length?'<div class="team-wa-leaders"><span>Responsable'+(people.length>1?'s':'')+' :</span>'+people.map(person=>'<details class="team-wa-contact"><summary>'+esc(person.name)+'</summary><div class="team-wa-contact-panel"><strong>'+esc(person.name)+'</strong>'+(person.phone?'<a href="tel:'+esc(person.phone)+'">📞 '+esc(person.phone)+'</a>':'')+(person.email?'<a href="mailto:'+esc(person.email)+'">✉️ Envoyer un e-mail</a>':'')+(!person.phone&&!person.email?'<small>Coordonnées non partagées</small>':'')+'</div></details>').join('')+'</div>':'';
 const bubbles=state.messages.map(m=>{
  const mine=m.author_id===state.me.member?.id;
  const media=m.media_id?'<div class="team-wa-media">'+(m.mime?.startsWith('image/')?'<a href="/zikateam/chat-media/'+esc(m.media_id)+'" target="_blank" rel="noopener"><img src="/zikateam/chat-media/'+esc(m.media_id)+'" alt="'+esc(m.filename||'Photo envoyée')+'" loading="lazy"></a>':'<a href="/zikateam/chat-media/'+esc(m.media_id)+'" target="_blank" rel="noopener">📄 '+esc(m.filename||'Document PDF')+'</a>')+'</div>':'';
  const linkText=!m.media_id&&/^https?:\/\/\S+$/i.test(m.body?.trim()||'')?'<a class="team-wa-link" href="'+esc(m.body.trim())+'" target="_blank" rel="noopener noreferrer">'+esc(m.body.trim())+'</a>':'';
  return '<article class="team-wa-message'+(mine?' outgoing':' incoming')+'"><div class="team-wa-person">'+chatAvatar(m)+'</div><div class="team-wa-bubble"><strong class="team-wa-author">'+esc(m.author)+'</strong>'+(m.body&&!m.media_id?'<p>'+ (linkText||esc(m.body))+'</p>':'')+media+'<div class="team-wa-message-foot"><time>'+esc(fmtTime(m.created_at))+'</time>'+(state.me.admin||(state.me.leadPoles.length&&state.chatChannel==='pole')?'<button type="button" title="Masquer ce message" data-delete-message="'+esc(m.id)+'">⋯</button>':'')+'</div></div></article>';
 }).join('');
 const iconEditor=state.me.admin&&active?'<details class="team-wa-icon-editor"><summary title="Changer l’icône">🎨 Icône du groupe</summary><div><p>Choisir l’icône du groupe</p><div class="team-chat-icon-choices">'+chatIcons.map(icon=>'<button type="button" class="team-icon-choice" data-chat-icon="'+esc(icon)+'" aria-label="Icône '+esc(icon)+'">'+icon+'</button>').join('')+'</div><label>Choisir une image<input type="file" id="teamChatIconUpload" accept="image/jpeg,image/png,image/webp"></label></div></details>':'';
 return '<section class="team-wa-app'+(state.chatMobileOpen?' team-wa-open':'')+'" aria-label="Messagerie ZikaTeam">'
 +'<aside class="team-wa-sidebar"><header class="team-wa-sidebar-head"><div><h2>Discussions</h2><p>Mes groupes ZikaTeam</p></div>'+(state.chatUnread?'<span class="team-unread">'+Math.min(state.chatUnread,99)+(state.chatUnread>99?'+':'')+'</span>':'')+'</header><div class="team-wa-roomlist">'+(roomsView||'<p class="team-wa-empty">Aucun groupe accessible.</p>')+'</div></aside>'
 +'<section class="team-wa-thread"><header class="team-wa-thread-head"><button class="team-wa-back" type="button" data-chat-back aria-label="Revenir à la liste des groupes">←</button><span class="team-wa-head-avatar">'+roomIcon(active)+'</span><div class="team-wa-thread-title"><h2>'+esc(active?.title||'Choisir un groupe')+'</h2><p>'+esc(active?'Conversation du groupe':'Sélectionne une conversation')+'</p></div>'+peopleView+iconEditor+'</header>'
 +'<div class="team-wa-timeline" id="teamMessages" role="log" aria-live="polite" aria-label="Messages">'+(active?(bubbles||'<p class="team-wa-empty">Aucun message pour le moment. Écris le premier !</p>'):'<p class="team-wa-empty">Choisis une discussion à gauche pour commencer.</p>')+'</div>'
 +(active?'<form id="messageForm" class="team-wa-composer"><label class="team-wa-file" title="Joindre une photo ou un PDF">📎<input id="teamChatAttachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Joindre une photo ou un PDF" hidden></label><label class="team-wa-input"><span class="team-wa-input-label">Votre message · Entrée pour envoyer, Maj + Entrée pour une nouvelle ligne</span><textarea name="body" rows="2" maxlength="1400" required placeholder="Écrire un message…" aria-label="Écrire un message"></textarea></label><button class="team-wa-send" type="submit">Envoyer <span aria-hidden="true">➤</span></button></form>':'')
 +'</section></section>';
}
function secretaryTestGuide(){
 if(!state.me?.secretariat||state.me.admin)return '';
 const task=(tab,title,info)=>'<li><strong>'+title+'</strong><p>'+info+'</p><button type="button" class="team-button light" data-mtab="'+tab+'">Tester '+title.toLowerCase()+'</button></li>';
 return '<section class="team-card team-accent-purple team-secretary-trial" role="region" aria-label="Parcours de test secrétariat"><span class="team-pill warn">ENVIRONNEMENT DE TEST · AUCUNE VALEUR OFFICIELLE</span><h2>🧪 Test complet du Secrétariat</h2><p>Val, voici un vrai parcours pour vérifier que tes fonctions marchent. Les données restent dans ZikaTeam de test. Aucun règlement fictif ni signature d’un tiers ne doit être enregistré.</p><ol>'+
 task('emargements','Émargements','Ouvre « TEST SECRÉTARIAT — émargement Valentine ». Clique sur Consulter, vérifie ton nom, signe toi-même sur ton écran si tu le souhaites, puis essaie la consultation et l’export PDF. Crée également une nouvelle feuille de test avec date, lieu et objet.')+
 task('adhesions','Adhésions','Vérifie les filtres « En attente », « À jour », « Toutes ». Essaie l’export CSV/PDF. Ne marque aucun paiement imaginaire comme effectué.')+
 task('annuaire','Annuaire','Cherche « Valentine », ouvre la fiche et vérifie les champs. Tu peux tester l’édition de tes propres coordonnées si elles sont exactes, puis l’impression A4 et l’export.')+
 task('listes','Listes & exports','Crée une liste intitulée « TEST — Secrétariat Val », sélectionne ton nom, choisis les colonnes, change leur ordre, enregistre-la, puis vérifie les exports.')+
 task('benevoles','Bénévoles & fonctions','Consulte les fonctions et pôles visibles, sans modifier les responsabilités réelles. Vérifie qu’aucune fonction d’administrateur ne t’est proposée.')+
 '</ol><p class="team-small">Si un bouton ne fonctionne pas ou si un accès manque, indique le nom de la rubrique et le message affiché pour que nous corrigions le problème.</p></section>';
}
function management(){const data=state.manage;if(!data)return '<section class="team-card">Chargement des données de gestion…</section>';
 const tabs=[...((state.me.admin||state.me.leadPoles.length)?[['activites','Réunions & stands'],['poles','Pôles & équipes']]:[]),...((state.me.admin||state.me.secretariat)?[['emargements','Émargements'],['adhesions','Adhésions'],['annuaire','Annuaire'],['listes','Listes & exports']]:[]),...((state.me.admin||state.me.secretariat)?[['benevoles','Bénévoles & fonctions']]:[]),...(state.me.admin?[['charte','Charte'],['journal','Historique']]:[])];
 return secretaryTestGuide()+'<div class="team-card"><h2>'+ (state.me.admin?'Administration générale':state.me.leadPoles.length?'Gestion de mes pôles':'Secrétariat · suivi des présences')+'</h2><p>Les modifications sont tracées. Les responsables gèrent leurs pôles ; le secrétariat suit les présences de toutes les équipes ; l’administration conserve le contrôle général.</p><nav class="team-tabs">'+tabs.map(([id,title])=>'<button data-mtab="'+id+'" aria-current="'+(state.managementTab===id?'page':'false')+'">'+title+'</button>').join('')+'</nav></div>'+({activites:manageActivities,poles:managePoles,emargements:manageAttendance,benevoles:manageMembers,charte:manageCharter,adhesions:manageDues,annuaire:manageDirectory,listes:manageLists,journal:manageAudit}[state.managementTab]||manageActivities)();
}
const opt=(arr,selected)=>arr.map(([v,l])=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(l)+'</option>').join('');
function manageActivities(){const d={...state.manage,activities:state.manage.activities.filter(x=>x.can_edit)},a=d.activities.find(x=>x.id===state.editActivity)||{};const allp=state.me.admin?d.poles.filter(p=>!p.archived):d.poles;
 const audience=state.me.admin?[['','Choisir les destinataires…'],['all','Tous les bénévoles'],['leaders','Responsables uniquement'],['bureau','Bureau uniquement'],['poles','Pôles choisis']]:[['poles','Mes pôles']];
 return '<section class="team-card">'+(a.id?'<button type="button" class="team-button light team-back" data-back-edit="activity">← Retour sans modifier</button>':'')+'<h2>'+(a.id?'Modifier une activité':'Créer une réunion, un stand ou une mission')+'</h2><form id="activityForm" class="team-form"><input type="hidden" name="id" value="'+esc(a.id||'')+'"><div class="team-split"><label>Type<select name="kind">'+opt(Object.entries(kindName),a.custom_kind?'other':a.kind||'meeting')+'</select></label><label>Objet libre (si « Autre activité »)<input name="customKind" maxlength="90" placeholder="Démarchage partenaires, distribution d’affiches…" value="'+esc(a.custom_kind||'')+'"></label><label>Titre<input name="title" maxlength="120" value="'+esc(a.title||'')+'" required></label></div><div class="team-split"><label>Début<input name="starts_at" type="datetime-local" value="'+inputDate(a.starts_at)+'" required></label><label>Fin<input name="ends_at" type="datetime-local" value="'+inputDate(a.ends_at)+'" required></label></div><label>Lieu<input name="place" value="'+esc(a.place||'')+'" placeholder="Salle, place, adresse…"></label><label>Informations utiles<textarea name="details">'+esc(a.details||'')+'</textarea></label><label>Ordre du jour / consignes<textarea name="agenda" rows="5">'+esc(a.agenda||'')+'</textarea></label><label>Joindre un PDF (ordre du jour ou consignes)<input name="pdf" type="file" accept="application/pdf,.pdf"></label>'+(a.agenda_document_id?'<p><a class="team-link" href="/zikateam/document/'+a.agenda_document_id+'" target="_blank" rel="noopener">Pièce jointe actuelle ↗</a></p>':'')+'<label>Destinataires<select name="audience" id="activityAudience">'+opt(audience,a.audience||(state.me.admin?'':'poles'))+'</select></label><fieldset class="team-fieldset"><legend>Choisir les pôles concernés</legend><div class="team-checks">'+(allp.length?allp.map(p=>'<label><input type="checkbox" name="pole" value="'+p.id+'" '+(a.poles?.includes(p.id)||(!a.id&&!state.me.admin)?'checked':'')+'>'+esc(p.name)+'</label>').join(''):'Aucun pôle créé')+'</div><p class="team-small team-muted">Les pôles sont utilisés lorsque « Pôles choisis » est sélectionné.</p></fieldset><div class="team-row team-agenda-publication"><button type="submit" name="publishAction" value="published" class="team-button orange team-publish-action">Publier la réunion</button><button type="submit" name="publishAction" value="draft" class="team-button light">Enregistrer en brouillon</button>'+(a.id&&a.status==='published'?'<button type="submit" name="publishAction" value="cancelled" class="team-button danger">Annuler la réunion</button>':'')+'<button type="button" class="team-button light" data-reset-activity>Nouvelle activité</button></div><p id="activitySaveFeedback" class="team-save-feedback" role="status" aria-live="assertive" hidden></p><p class="team-small team-muted">La publication crée immédiatement une annonce visible dans ZikaTeam pour chaque bénévole concerné. L’envoi sur le téléphone dépend des autorisations et du service push.</p></form></section><section class="team-card"><h2>Créneaux pour une activité</h2>'+shiftForm()+'</section><section class="team-card"><h2>Préparation, matériel et tâches</h2>'+taskForm()+'</section><section class="team-card"><h2>Activités et confirmations</h2>'+(d.activities.length?d.activities.map(a=>activityCard(a,true)).join(''):'<p>Pas encore d’activité.</p>')+'</section>';
}
function shiftForm(){const activities=state.manage.activities.filter(a=>a.can_edit);const s=activities.flatMap(a=>a.shifts||[]).find(s=>s.id===state.editShift)||{};
 return (s.id?'<button type="button" class="team-button light team-back" data-back-edit="shift">← Retour sans modifier</button>':'')+'<form class="team-form" id="shiftForm"><label>Activité<select name="activityId" required><option value="">Choisir une activité</option>'+activities.filter(a=>a.status!=='cancelled').map(a=>'<option value="'+a.id+'" '+(s.activity_id===a.id||(!s.id&&state.editActivity===a.id)?'selected':'')+'>'+esc(a.title)+'</option>').join('')+'</select></label><input type="hidden" name="id" value="'+esc(s.id||'')+'"><label>Nom du créneau<input name="label" value="'+esc(s.label||'')+'" placeholder="Ex. Buvette 14h–17h" required></label><div class="team-split"><label>Début<input name="starts_at" type="datetime-local" value="'+inputDate(s.starts_at)+'" required></label><label>Fin<input name="ends_at" type="datetime-local" value="'+inputDate(s.ends_at)+'" required></label></div><label>Places disponibles<input name="capacity" type="number" min="1" max="500" value="'+(s.capacity||2)+'" required></label><button class="team-button" type="submit">Enregistrer le créneau</button></form>'+(activities.flatMap(a=>(a.shifts||[]).map(s=>'<div class="team-row team-item"><div><strong>'+esc(s.label)+'</strong><div class="team-small">'+esc(a.title)+' · '+shortdt(s.starts_at)+' · '+s.signed_count+'/'+s.capacity+'</div></div><button class="team-button light" data-edit-shift="'+s.id+'">Modifier</button><button class="team-button danger" data-remove-shift="'+s.id+'">Supprimer</button></div>')).join(''));
}
function taskForm(){const a=state.manage.activities.filter(x=>x.can_edit);
 return '<form id="taskForm" class="team-form"><label>Activité<select name="activityId" required><option value="">Choisir une activité</option>'+a.filter(x=>x.status!=='cancelled').map(x=>'<option value="'+x.id+'" '+(state.editActivity===x.id?'selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select></label><label>Tâche / matériel à prévoir<input name="title" maxlength="160" placeholder="Ex. Préparer les tables et les chaises" required></label><label>Consignes<textarea name="details" maxlength="1500"></textarea></label><label>Attribuer à un bénévole (facultatif)<select name="assigned_to"><option value="">Équipe / non attribué</option>'+state.manage.members.filter(m=>m.active).map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label><label>État<select name="status"><option value="todo">À faire</option><option value="doing">En cours</option><option value="done">Terminée</option></select></label><div class="team-row"><button class="team-button orange" type="submit">Ajouter la tâche</button><button class="team-button light" type="reset">Effacer le formulaire</button></div></form>';
}

function printTeam(poleId){
 const d=state.manage,pole=d?.poles.find(p=>p.id===poleId);
 if(!pole)return toast('Ce pôle n’est pas accessible.');
 const members=d.memberships.filter(x=>x.pole_id===poleId).map(x=>({...d.members.find(m=>m.id===x.member_id),role:x.role})).filter(x=>x.id&&x.active);
 const contacts=new Map((d.contacts||[]).map(c=>[c.member_id,c]));
 const rows=members.map(m=>{
  const c=contacts.get(m.id),phone=(state.me.admin||state.me.secretariat)?c?.phone||'':m.phone||'';
  const email=(state.me.admin||state.me.secretariat)?c?.email||m.email||'':m.email||'';
  return '<tr><td>'+esc(m.name)+'</td><td>'+(m.role==='lead'?'Responsable':'Bénévole')+'</td><td>'+esc(phone||'Non partagé')+'</td><td>'+esc(email||'Non partagé')+'</td></tr>';
 }).join('');
 const popup=window.open('','_blank');if(!popup){toast('Autorise les fenêtres supplémentaires pour imprimer.');return;}popup.opener=null;
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Équipe '+esc(pole.name)+'</title><style>@page{size:A4 landscape;margin:14mm}body{font:11px Arial,sans-serif;color:#1b354b}table{border-collapse:collapse;width:100%;margin:15px 0;table-layout:fixed}th,td{border:1px solid #b5c6d0;text-align:left;padding:10px 8px;overflow-wrap:anywhere}th{background:#eff7fb}button{padding:10px}@media print{button{display:none}}</style></head><body><h1>Équipe '+esc(pole.name)+'</h1><p>ZikaMansle · '+members.length+' membres · '+new Date().toLocaleDateString('fr-FR')+'</p><p>Les coordonnées non autorisées au partage ne figurent pas dans cette liste.</p><button onclick="window.print()">Imprimer / enregistrer en PDF</button><table><thead><tr><th>Nom et prénom</th><th>Qualité</th><th>Téléphone</th><th>E-mail</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>';
 popup.document.open();popup.document.write(html);popup.document.close();
}
function managePoles(){
 const d=state.manage,admin=state.me.admin,selected=d.poles.find(x=>x.id===state.editPole)||{};
 const form=admin?'<section class="team-card team-accent-blue">'+(selected.id?'<button type="button" class="team-button light team-back" data-back-edit="pole">← Retour sans modifier</button>':'')+'<h2>'+(selected.id?'Modifier le pôle':'Créer un pôle')+'</h2><form id="poleForm" class="team-form"><input type="hidden" name="id" value="'+esc(selected.id||'')+'"><label>Nom du pôle<input name="name" maxlength="100" value="'+esc(selected.name||'')+'" required></label><label>Présentation et missions<textarea name="description">'+esc(selected.description||'')+'</textarea></label><div class="team-row"><button class="team-button orange">Enregistrer</button><button type="button" class="team-button light" data-reset-pole>Nouveau pôle</button></div></form></section>':'';
 const panels=d.poles.map(p=>{
  const assigned=d.memberships.filter(x=>x.pole_id===p.id);
  const people=assigned.map(x=>({...d.members.find(m=>m.id===x.member_id),role:x.role})).filter(m=>m.id&&m.active);
  const managers=people.filter(x=>x.role==='lead'),members=people.filter(x=>x.role!=='lead');
  const leaders=managers.length?managers.map(m=>'<div class="team-leader-card">'+avatar(m)+'<div class="team-person-info"><strong>'+esc(m.name)+'</strong><small>Responsable de pôle</small>'+(admin?'<label class="team-photo-picker">Photo facultative<input data-photo-member="'+m.id+'" type="file" accept="image/jpeg,image/png,image/webp"></label>':'')+'</div>'+((admin||state.me.secretariat)?'<button class="team-button light" data-remove-member="'+m.id+'" data-from-pole="'+p.id+'">Retirer</button>':'')+'</div>').join(''):'<p class="team-muted">Aucun responsable désigné.</p>';
  const roster=members.length?members.map(m=>'<div class="team-member-row"><span>'+esc(m.name)+'</span>'+((admin||state.me.secretariat)?'<button type="button" class="team-button light" data-remove-member="'+m.id+'" data-from-pole="'+p.id+'">Retirer</button>':'')+'</div>').join(''):'<p class="team-muted">Pas encore de membre.</p>';
  const assignment=(admin||state.me.secretariat)&&!p.archived?'<form class="team-form" data-assignment-form="'+p.id+'"><label>Ajouter un bénévole<select name="memberId" required><option value="">Choisir une personne</option>'+d.members.filter(m=>m.active).map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label><label>Sa fonction<select name="role"><option value="member">Bénévole</option><option value="lead">Responsable du pôle</option></select></label><button class="team-button orange">Ajouter au pôle</button></form>':'';
  return '<article class="team-item team-pole-panel"><div class="team-between"><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'Aucune description renseignée.')+'</p></div><div class="team-row"><button type="button" class="team-button orange" data-print-team="'+p.id+'">Imprimer la liste</button>'+(admin?'<button type="button" class="team-button light" data-edit-pole="'+p.id+'">Modifier</button><button type="button" class="team-button '+(p.archived?'light':'danger')+'" data-archive-pole="'+p.id+'" data-archived="'+p.archived+'">'+(p.archived?'Réactiver':'Archiver')+'</button><button type="button" class="team-button danger" data-delete-pole="'+p.id+'" data-pole-name="'+esc(p.name)+'">Supprimer</button>':'')+'</div></div><h4>Responsables</h4><div class="team-leaders">'+leaders+'</div><details class="team-pole-members"><summary>Membres du pôle ('+members.length+')</summary>'+roster+'</details>'+assignment+'</article>';
 }).join('');
 return form+'<section class="team-card team-accent-teal"><h2>'+ (admin?'Pôles et responsables':'Mes équipes — consulter et imprimer')+'</h2><p class="team-muted">'+(admin?'Gestion des responsables, équipes et affectations.':'Les responsables peuvent consulter et imprimer leur équipe. Seuls les numéros et e-mails dont le partage a été autorisé apparaissent.')+'</p>'+(d.poles.length?panels:'<p>Aucun pôle disponible.</p>')+'</section>';
}

function roleAssignmentFields(member={}){
 const data=state.manage,links=data.memberships.filter(x=>x.member_id===member.id);
 const roles=new Set(member.roles||[]),secretary=(data.secretariatIds||[]).includes(member.id);
 return '<fieldset class="team-role-options"><legend>Fonctions dans ZikaTeam</legend><label class="team-check"><input type="checkbox" name="director" '+(roles.has('director')?'checked':'')+'> Dirigeant de l’association</label><label class="team-check"><input type="checkbox" name="bureau" '+(roles.has('bureau')?'checked':'')+'> Membre du bureau</label>'+(state.me.admin?'<label class="team-check"><input type="checkbox" name="secretariat" '+(secretary?'checked':'')+'> Secrétariat (émargements, adhésions et annuaire)</label>':'')+'<p class="team-small team-muted">Ces fonctions n’accordent pas automatiquement le rôle d’administrateur.</p></fieldset>'+
 '<fieldset class="team-role-options"><legend>Affectation aux pôles</legend><p class="team-small">Une même personne peut être membre ou responsable de plusieurs pôles.</p>'+
 (data.poles.filter(p=>!p.archived).length?data.poles.filter(p=>!p.archived).map(p=>{
  const assigned=links.find(a=>a.pole_id===p.id),role=assigned?.role||'none';
  return '<label class="team-role-line"><strong>'+esc(p.name)+'</strong><select data-role-pole="'+esc(p.id)+'"><option value="none" '+(role==='none'?'selected':'')+'>Non affecté</option><option value="member" '+(role==='member'?'selected':'')+'>Bénévole du pôle</option><option value="lead" '+(role==='lead'?'selected':'')+'>Responsable du pôle</option></select></label>';
 }).join(''):'<p>Crée d’abord les pôles dans « Pôles & équipes ».</p>')+'</fieldset>';
}
function rolePayload(form){
 return {
  roles:[...form.querySelectorAll('input[name="director"]:checked,input[name="bureau"]:checked')].map(x=>x.name),
  secretariat:!!form.querySelector('input[name="secretariat"]:checked'),
  poleRoles:[...form.querySelectorAll('[data-role-pole]')].filter(x=>x.value!=='none').map(x=>({poleId:x.dataset.rolePole,role:x.value}))
 };
}
function manageInvitations(){
 if(!state.me.admin)return '';
 const pending=state.manage?.invitations||[];
 const draft=state.invitationDraft;
 const mailto=draft?'mailto:'+encodeURIComponent(draft.email)+'?subject='+encodeURIComponent('Invitation à rejoindre ZikaTeam — ZikaMansle')+'&body='+encodeURIComponent('Bonjour '+draft.name+',\n\nTu es invité(e) à rejoindre l’espace bénévoles ZikaTeam.\n\nOuvre : https://zikamansle-app-staging.zikamansle.workers.dev/zikateam\nChoisis « Première inscription », indique ton adresse e-mail et saisis le code d’invitation : '+draft.code+'\n\nUne vérification de ton adresse e-mail sera nécessaire. Ton accès aux groupes sera ensuite validé par l’administration.\n\nAttention : cette invitation expire dans 14 jours.\n\nÀ bientôt,\nL’équipe ZikaMansle'):'';
 return '<section class="team-card team-accent-purple"><h2>✉️ Inviter un nouveau bénévole</h2><p>Crée un code personnel valable 14 jours, associé à une seule adresse e-mail. L’invitation ne donne jamais accès directement aux groupes : la vérification e-mail et la validation par l’administration restent obligatoires.</p>'+
 '<form id="teamInviteForm" class="team-form"><div class="team-split"><label>Nom et prénom<input name="name" type="text" required minlength="2" maxlength="110"></label><label>Adresse e-mail<input name="email" type="email" required maxlength="254"></label></div><button type="submit" class="team-button orange">Créer un code d’invitation</button></form>'+
 (draft?'<div class="team-invitation-result" role="status"><strong>Code créé pour '+esc(draft.name)+' ('+esc(draft.email)+')</strong><p>Code à usage unique : <code>'+esc(draft.code)+'</code></p><p>Copie ou envoie le code maintenant : il ne sera plus affiché après avoir quitté cet écran.</p><a class="team-button orange team-invite-mail" href="'+esc(mailto)+'">✉️ Envoyer l’invitation par e-mail</a><button type="button" class="team-button light" data-invite-copy>Copier le message</button></div>':'')+
 '<h3>Invitations créées</h3>'+(pending.length?pending.map(inv=>'<div class="team-member-card"><div><strong>'+esc(inv.name)+'</strong><p>'+esc(inv.email)+'</p><small>'+esc(inv.used_at?'Code utilisé':inv.revoked_at?'Révoquée':inv.expires_at<Date.now()?'Expirée':'En attente')+' · '+esc(shortdt(inv.created_at))+'</small></div>'+(!inv.used_at&&!inv.revoked_at&&inv.expires_at>Date.now()?'<button type="button" class="team-button danger" data-invite-revoke="'+esc(inv.id)+'">Révoquer</button>':'')+'</div>').join(''):'<p>Aucune invitation créée.</p>')+'</section>';
}
function manageMembers(){
 if(!state.me.admin&&!state.me.secretariat)return '';
 const d=state.manage,requests=d.pendingRequests||[],chosen=d.members.find(x=>x.id===state.editMember)||{},members=d.members.filter(x=>x.active);
 const pending=state.me.admin&&requests.length?requests.map(r=>{
  const member=d.members.find(m=>m.email===r.email)||{name:r.name,email:r.email};
  return '<form class="team-card team-accent-orange team-form" data-member-review="'+esc(r.email)+'"><div class="team-between"><h3>Demande de '+esc(member.name||r.email)+'</h3><span class="team-pill warn">À valider</span></div><p class="team-small">'+esc(r.email)+' · Demande du '+esc(shortdt(r.requested_at))+'</p><label>Nom et prénom<input name="name" maxlength="110" required value="'+esc(member.name||r.name)+'"></label>'+roleAssignmentFields(member)+'<div class="team-row"><button class="team-button orange" type="submit">Approuver et enregistrer les fonctions</button><button class="team-button danger" type="button" data-reject-member="'+esc(r.email)+'">Refuser la demande</button></div></form>';
 }).join(''):'<section class="team-card team-accent-teal"><p>Aucune nouvelle demande pour le moment.</p></section>';
 const form='<section class="team-card team-accent-blue">'+(chosen.id?'<button type="button" class="team-button light team-back" data-back-edit="member">← Retour sans modifier</button>':'')+'<h2>'+(chosen.id?'Modifier une fiche':'Ajouter un bénévole')+'</h2><form id="memberForm" class="team-form" novalidate><input type="hidden" name="id" value="'+esc(chosen.id||'')+'"><div class="team-split"><label>Nom et prénom<input name="name" maxlength="110" value="'+esc(chosen.name||'')+'" required></label><label>E-mail de connexion<input name="email" type="email" maxlength="254" value="'+esc(chosen.email||'')+'" required></label></div><label class="team-check"><input type="checkbox" name="active" '+(!chosen.id||chosen.active?'checked':'')+'> Fiche active</label>'+roleAssignmentFields(chosen)+'<div class="team-row"><button type="button" class="team-button orange" data-save-member>Enregistrer la fiche et les fonctions</button><button class="team-button light" type="button" data-reset-member>Nouvelle fiche</button></div></form></section>';
 const secretaryForm=chosen.id?'<section class="team-card team-accent-blue"><button type="button" class="team-button light team-back" data-back-edit="member">← Retour aux bénévoles</button><h2>Fonctions de '+esc(chosen.name)+'</h2><p class="team-small">Tu peux désigner un dirigeant, un membre du bureau ou un responsable de plusieurs pôles. Les accès administrateur et secrétariat restent réservés à l’administration.</p><form id="teamMemberFunctionsForm" class="team-form"><input type="hidden" name="memberId" value="'+esc(chosen.id)+'">'+roleAssignmentFields(chosen)+'<button type="button" class="team-button orange" data-save-member-functions>Enregistrer les fonctions</button></form></section>':'<section class="team-card team-accent-teal"><h2>Désigner un responsable ou un dirigeant</h2><p>Choisis un bénévole ci-dessous puis clique sur « Modifier les fonctions ».</p></section>';
 const cards=members.map(m=>{
  const list=d.memberships.filter(x=>x.member_id===m.id),byPole=list.map(x=>(d.poles.find(p=>p.id===x.pole_id)?.name||'')+(x.role==='lead'?' (responsable)':'')).filter(Boolean);
  const label=[...(m.roles||[]).map(v=>v==='director'?'Dirigeant':'Bureau'),...((d.secretariatIds||[]).includes(m.id)?['Secrétariat']:[]),...byPole];
  return '<article class="team-member-card"><div><strong>'+esc(m.name)+'</strong><p class="team-small">'+esc(m.email)+'</p><p class="team-small">'+(label.length?esc(label.join(' · ')):'Bénévole à répartir')+'</p></div><button type="button" class="team-button light" data-edit-member="'+m.id+'">'+(state.me.admin?'Modifier':'Modifier les fonctions')+'</button></article>';
 }).join('');
 return manageInvitations()+(state.me.admin?'<section class="team-card team-accent-orange"><h2>Bénévoles à valider <span class="team-pill warn">'+requests.length+'</span></h2><p>Ces personnes ont vérifié leur adresse e-mail. Elles n’accèdent à aucune conversation, liste interne ou mission avant ta validation.</p></section>'+pending+form:secretaryForm)+'<section class="team-card"><h2>Fiches bénévoles actives</h2>'+(cards||'<p>Aucune fiche active.</p>')+'</section>';
}
function manageCharter(){const c=state.me.charter||{};return '<section class="team-card"><h2>Charte officielle des bénévoles</h2><p>Publie la charte exacte de l’association. Chaque bénévole accepte la version en cours, avec enregistrement de la date et de son identité.</p><form id="charterForm" class="team-form"><label>Numéro de version<input name="version" maxlength="60" placeholder="Ex. 2026-11" value="'+esc(c.version||'')+'" required></label><label>Intitulé<input name="title" maxlength="140" value="'+esc(c.title||'Charte des bénévoles ZikaMansle')+'" required></label><label>Texte complet<textarea name="content" rows="12" required>'+esc(c.content||'')+'</textarea></label><label>Ajouter le PDF officiel<input name="pdf" type="file" accept="application/pdf,.pdf"></label><div class="team-row"><button type="submit" class="team-button orange">Publier / mettre à jour la charte</button><button type="reset" class="team-button light">Annuler les modifications</button></div></form><p class="team-warning">La charte est déjà publiée. Tu peux joindre le PDF officiel à cette version si son texte est identique, sans faire signer tout le monde à nouveau. Pour changer le contenu, publie une nouvelle version.</p></section>'}

function attendanceRows(a){
 return [['Bénévole','Convocation','Réponse','Présence pointée le','Signature manuscrite'],...(a.attendance||[]).map(m=>[
  m.name,a.title,responseName[m.answer]||'Sans réponse',m.checked_in_at?shortdt(m.checked_in_at):'',''
 ])];
}
function downloadAttendance(a){
 const protect=value=>{const text=String(value??'');return /^[=+\-@\t\r]/.test(text)?"'"+text:text;};
 const csv='\uFEFF'+attendanceRows(a).map(row=>row.map(v=>'"'+protect(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const link=document.createElement('a');link.href=url;link.download='emargement-zikateam-'+a.starts_at.slice(0,10)+'.csv';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printAttendance(a){
 const popup=window.open('','_blank');
 if(!popup){toast('Autorisez les fenêtres supplémentaires pour imprimer la feuille.');return;}
 popup.opener=null;
 const content=attendanceRows(a).slice(1).map(row=>'<tr>'+row.map((v,i)=>'<td>'+esc(i===4?'':v)+'</td>').join('')+'</tr>').join('');
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Émargement · '+esc(a.title)+'</title><style>body{font:12px Arial,sans-serif;color:#111;padding:15px}h1{font-size:20px}p{font-size:13px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #666;padding:12px 7px;text-align:left}td:last-child{width:140px}@media print{button{display:none}body{padding:0}}</style></head><body><h1>Feuille d’émargement — '+esc(a.title)+'</h1><p>ZikaMansle · '+esc(dt(a.starts_at))+' · '+esc(a.place||'Lieu non précisé')+'</p><p>Le pointage numérique est une indication de présence et ne remplace pas la signature manuscrite.</p><button onclick="window.print()">Imprimer cette feuille</button><table><thead><tr>'+attendanceRows(a)[0].map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+content+'</tbody></table></body></html>';
 popup.document.open();popup.document.write(html);popup.document.close();
}

function signingMembers(){
 const data=state.signing||{people:[],memberships:[]};
 return data.people.filter(m=>state.signingFilter==='all'||state.signingFilter==='leaders'&&m.leader||
 state.signingFilter==='bureau'&&m.bureau||state.signingFilter==='poles'&&data.memberships.some(x=>x.member_id===m.id&&x.pole_id===state.signingPole));
}
function signingSVG(points){
 if(!points)return '';
 let strokes;
 try{strokes=JSON.parse(points)}catch{return ''}
 if(!Array.isArray(strokes))return '';
 const lines=strokes.filter(x=>Array.isArray(x)&&x.length>=2).map(line=>'<polyline points="'+line.filter(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=1000)).map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#152a44" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>').join('');
 return '<svg viewBox="0 0 1000 400" role="img" aria-label="Signature manuscrite numérisée" style="width:170px;max-width:100%;height:62px">'+lines+'</svg>';
}
function exportSigningCSV(session){
 const columns=['Nom et prénom','Qualité','Date de signature','État'];
 const rows=[columns,...session.attendees.map(m=>[m.display_name,m.quality,m.signed_at?shortdt(m.signed_at):'',m.signed_at?'Signé':'Non signé'])];
 const protect=x=>{const t=String(x??'');return /^[=+\-@\t\r]/.test(t)?"'"+t:t;};
 const csv='\uFEFF'+rows.map(row=>row.map(x=>'"'+protect(x).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
 a.href=url;a.download='zikamansle-emargement-'+session.starts_at.slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function printSigningSession(session,mode){
 const popup=window.open('','_blank');
 if(!popup){toast('Autorise les fenêtres supplémentaires pour créer le document.');return;}
 popup.opener=null;
 const rows=session.attendees.map(m=>'<tr><td>'+esc(m.display_name)+'</td><td>'+esc(m.quality)+'</td><td>'+(m.signed_at?shortdt(m.signed_at):'Non signé')+'</td><td>'+(m.signature_points?signingSVG(m.signature_points):'<span style="color:#777">—</span>')+'</td></tr>').join('');
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ZikaMansle — Émargement '+esc(session.title)+'</title><style>@page{size:A4 landscape;margin:14mm}body{font:11px Arial,sans-serif;color:#162a40}h1{font-size:21px;margin:0 0 10px}p{font-size:13px;margin:5px 0}table{border-collapse:collapse;width:100%;table-layout:fixed;margin-top:20px}th,td{border:1px solid #8a9dab;padding:9px 7px;vertical-align:middle;overflow-wrap:anywhere}th{background:#edf5fa;text-align:left}th:first-child{width:25%}th:nth-child(2){width:25%}th:nth-child(3){width:19%}th:last-child{width:31%}tr{break-inside:avoid}button{padding:10px 16px;margin:12px 0}@media print{button,.hint{display:none}} </style></head><body><h1>ZikaMansle — Feuille d’émargement</h1><p><strong>Objet :</strong> '+esc(session.title)+'</p><p><strong>Date et heure :</strong> '+esc(dt(session.starts_at))+'</p><p><strong>Lieu :</strong> '+esc(session.place)+'</p><p><strong>Participants :</strong> '+session.attendees.length+' · <strong>Signatures :</strong> '+session.attendees.filter(x=>x.signed_at).length+' · <strong>État :</strong> '+(session.closed_at?'Clôturé':'En cours')+'</p><p class="hint">'+(mode==='pdf'?'Choisis « Enregistrer au format PDF » dans l’impression.':'Choisis ton imprimante pour éditer la feuille.')+'</p><button onclick="window.print()">Imprimer / enregistrer en PDF</button><table><thead><tr><th>Nom et prénom</th><th>Qualité</th><th>Signé le</th><th>Signature effectuée sur l’écran</th></tr></thead><tbody>'+rows+'</tbody></table><p style="margin-top:14px;font-size:10px;color:#596b7a">Émargement interne ZikaMansle · Signature manuscrite tracée sur écran, enregistrée avec date et heure de validation.</p></body></html>';
 popup.document.open();popup.document.write(html);popup.document.close();
}
async function openSigning(memberId){
 const session=state.signing?.sessions.find(x=>x.id===state.signingCurrent);
 if(!session||session.closed_at||!session.attendees.some(x=>x.member_id===memberId&&!x.signed_at))return toast('Signature indisponible.');
 state.signingMember=memberId;state.signingStrokes=[];
 render();
 const overlay=document.querySelector('.team-signing-overlay');
 try{if(overlay?.requestFullscreen){await overlay.requestFullscreen();state.signingExpanded=true;}}catch{}
 try{if(screen.orientation?.lock){await screen.orientation.lock('landscape');state.signingOrientationLocked=true;}}catch{}
 if(!state.signingOrientationLocked)overlay?.classList.add('team-signing-fallback');
 overlay?.querySelector('[data-signing-clear]')?.focus();
}
async function closeSigning(){
 state.signingMember=null;state.signingStrokes=[];
 if(state.signingOrientationLocked){try{screen.orientation.unlock?.();}catch{}state.signingOrientationLocked=false;}
 if(state.signingExpanded&&document.fullscreenElement?.classList.contains('team-signing-overlay')){try{await document.exitFullscreen();}catch{}}
 state.signingExpanded=false;render();
}
function signingScreen(){
 const session=state.signing?.sessions.find(x=>x.id===state.signingCurrent);
 const member=session?.attendees.find(m=>m.member_id===state.signingMember&&!m.signed_at);
 if(!session||!member)return '';
 return '<section class="team-signing-overlay" role="dialog" aria-modal="true" aria-label="Signature de présence"><div class="team-signing-panel"><p class="team-signing-eyebrow">ZikaMansle · Signature de présence</p><h2>'+esc(member.display_name)+'</h2><p><strong>'+esc(member.quality)+'</strong> · '+esc(session.title)+'</p><p class="team-signing-hint">Je confirme ma présence en signant ci-dessous.</p><div class="team-signing-pad"><canvas id="teamSigningCanvas" width="1000" height="400" aria-label="Tracer votre signature avec le doigt ou la souris"></canvas></div><p class="team-small">Signez avec votre doigt sur le téléphone ou avec la souris sur ordinateur.</p><div class="team-row"><button class="team-button light" type="button" data-signing-clear>Recommencer</button><button class="team-button orange" type="button" data-signing-confirm>Valider la signature</button><button class="team-button light" type="button" data-signing-return>Retour sans enregistrer</button></div></div></section>';
}
function setupSigningCanvas(){
 const canvas=document.getElementById('teamSigningCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d');
 const draw=()=>{ctx.clearRect(0,0,1000,400);ctx.strokeStyle='#132d49';ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';for(const stroke of state.signingStrokes){if(!stroke.length)continue;ctx.beginPath();ctx.moveTo(...stroke[0]);for(const p of stroke.slice(1))ctx.lineTo(...p);ctx.stroke();}};
 draw();
 let active=null;
 const loc=e=>{const r=canvas.getBoundingClientRect(),rotated=document.querySelector('.team-signing-overlay')?.classList.contains('team-signing-fallback')&&matchMedia('(orientation: portrait)').matches;
 const x=rotated?(e.clientY-r.top)/r.height:(e.clientX-r.left)/r.width;
 const y=rotated?(r.right-e.clientX)/r.width:(e.clientY-r.top)/r.height;
 return [Math.max(0,Math.min(1000,Math.round(x*1000))),Math.max(0,Math.min(400,Math.round(y*400)))];};
 canvas.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();active=[];state.signingStrokes.push(active);canvas.setPointerCapture(e.pointerId);active.push(loc(e));draw()});
 canvas.addEventListener('pointermove',e=>{if(!active)return;e.preventDefault();if(active.length>=1800)return;const pt=loc(e),prior=active.at(-1);if(!prior||Math.hypot(pt[0]-prior[0],pt[1]-prior[1])>=2)active.push(pt);draw()});
 const release=e=>{if(!active)return;e.preventDefault();if(active.length===1)active.push([Math.min(1000,active[0][0]+1),active[0][1]]);active=null;draw()};
 canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
}
function manageAttendance(){
 const data=state.signing||{sessions:[],people:[],memberships:[],poles:[]};
 const selected=data.sessions.find(s=>s.id===state.signingCurrent);
 const people=signingMembers();
 const pending=selected?.attendees.filter(a=>!a.signed_at)||[];
 const signed=selected?.attendees.filter(a=>a.signed_at)||[];
 const create='<section class="team-card team-accent-blue"><h2>Créer une nouvelle feuille d’émargement</h2><p>La séance peut être créée puis complétée avec les participants réellement présents, avant de leur faire signer le téléphone.</p><form id="signingCreateForm" class="team-form"><label>Objet de la réunion<input name="title" maxlength="180" required placeholder="Ex. Réunion des responsables ZikaMansle"></label><div class="team-split"><label>Date et heure<input name="startsAt" type="datetime-local" required></label><label>Lieu<input name="place" maxlength="180" required placeholder="Ex. Salle Gautier Capuçon"></label></div><button class="team-button orange" type="submit">Créer la feuille d’émargement</button></form></section>';
 const sessionList='<section class="team-card team-accent-teal"><h2>Feuilles d’émargement enregistrées</h2>'+(data.sessions.length?data.sessions.map(s=>'<div class="team-member-card"><div><strong>'+esc(s.title)+'</strong><p class="team-small">'+esc(dt(s.starts_at))+' · '+esc(s.place)+'</p><span class="team-pill '+(s.closed_at?'ok':'warn')+'">'+s.attendees.filter(m=>m.signed_at).length+'/'+s.attendees.length+' signatures'+(s.closed_at?' · Clôturée':' · En cours')+'</span></div><button class="team-button light" type="button" data-signing-open="'+s.id+'">Consulter</button><button class="team-button danger" type="button" data-signing-delete="'+s.id+'" title="Supprimer la feuille">Supprimer</button></div>').join(''):'<p>Aucune feuille créée pour le moment.</p>')+'</section>';
 let current='';
 if(selected){
  current='<section class="team-card team-accent-purple"><button type="button" class="team-button light team-back" data-signing-back>← Retour aux feuilles</button><div class="team-between"><div><h2>'+esc(selected.title)+'</h2><p>'+esc(dt(selected.starts_at))+' · '+esc(selected.place)+'</p><p><strong>'+signed.length+'</strong> signatures enregistrées · '+pending.length+' personnes à signer</p></div><span class="team-pill '+(selected.closed_at?'ok':'warn')+'">'+(selected.closed_at?'Clôturée':'En cours')+'</span></div><div class="team-export-tools"><button type="button" class="team-button light" data-signing-export="csv">CSV</button><button type="button" class="team-button light" data-signing-export="print">Imprimer</button><button type="button" class="team-button orange" data-signing-export="pdf">Sauvegarder en PDF avec signatures</button>'+(selected.closed_at?'':'<button type="button" class="team-button danger" data-signing-close>Clôturer la feuille</button>')+'</div></section>';
  if(!selected.closed_at){
   current+='<section class="team-card team-accent-blue"><h2>Ajouter les participants présents</h2><p>Sélectionne les personnes présentes, y compris après la création de la feuille. Elles pourront ensuite signer une par une sur ce téléphone.</p><form id="signingAddForm" class="team-form"><label>Afficher les bénévoles<select id="teamSigningFilter"><option value="all" '+(state.signingFilter==='all'?'selected':'')+'>Tous les bénévoles</option><option value="leaders" '+(state.signingFilter==='leaders'?'selected':'')+'>Responsables uniquement</option><option value="bureau" '+(state.signingFilter==='bureau'?'selected':'')+'>Bureau uniquement</option><option value="poles" '+(state.signingFilter==='poles'?'selected':'')+'>Par pôle</option></select></label>'+(state.signingFilter==='poles'?'<label>Choisir un pôle<select id="teamSigningPole"><option value="">Choisir un pôle</option>'+data.poles.map(p=>'<option value="'+p.id+'" '+(state.signingPole===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>':'')+'<div class="team-row"><button type="button" class="team-button light" data-signing-all>Tout sélectionner</button><button type="button" class="team-button light" data-signing-none>Tout désélectionner</button></div><div class="team-signing-choices">'+people.map(m=>'<label class="team-check"><input type="checkbox" name="member" value="'+esc(m.id)+'" '+(state.signingSelection.includes(m.id)?'checked':'')+' '+(selected.attendees.some(x=>x.member_id===m.id)?'disabled':'')+'><span>'+esc(m.name)+'</span><small>'+esc(m.quality)+'</small></label>').join('')+'</div><button class="team-button orange" type="submit">Ajouter les personnes sélectionnées</button></form></section>';
  }
  current+='<section class="team-card"><h2>Personnes présentes et signatures</h2>'+(selected.attendees.length?'<div class="team-signing-rows">'+selected.attendees.map(m=>'<div class="team-member-card"><div><strong>'+esc(m.display_name)+'</strong><p class="team-small">'+esc(m.quality)+'</p>'+(m.signed_at?'<span class="team-pill ok">Signé le '+esc(shortdt(m.signed_at))+'</span>':'<span class="team-pill warn">Signature en attente</span>')+'</div><div class="team-row">'+(m.signature_points?signingSVG(m.signature_points):'')+(!m.signed_at&&!selected.closed_at?'<button class="team-button orange" type="button" data-signing-member="'+m.member_id+'">Faire signer</button><button class="team-button light" type="button" data-signing-remove="'+m.member_id+'">Retirer</button>':'')+'</div></div>').join('')+'</div>':'<p>Ajoute les participants pour commencer à recueillir leurs signatures.</p>')+'</section>';
 }
 return selected?current+(state.signingMember?signingScreen():''):create+sessionList;
}


const paymentLabels={cash:'Espèces',card:'Carte bancaire',check:'Chèque',transfer:'Virement',other:'Autre'};
function adhesionRows(){
 const contacts=new Map((state.manage?.contacts||[]).map(c=>[c.member_id,c]));
 return (state.manage?.dues||[]).filter(d=>state.adhesionFilter==='all'||(state.adhesionFilter==='paid'?Boolean(d.paid):!d.paid)).map(d=>({...d,contact:contacts.get(d.member_id)||{}}));
}
function adhesionExportRows(){
 return [['Nom et prénom','E-mail','Téléphone','Adresse','Code postal','Ville','Adhésion','Règlement le','Moyen de paiement'],...adhesionRows().map(d=>[
 d.name,d.contact.email||'',d.contact.phone||'',d.contact.address||'',d.contact.postal_code||'',d.contact.city||'',
 d.paid?'À jour':'En attente',d.paid_on||'',paymentLabels[d.payment_method]||''
 ])];
}
function exportAdhesionsCSV(){
 const safe=x=>{const s=String(x??'');return /^[=+\-@\t\r]/.test(s)?"'"+s:s;};
 const csv='\uFEFF'+adhesionExportRows().map(row=>row.map(v=>'"'+safe(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='zikamansle-adhesions-'+state.adhesionFilter+'.csv';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function printAdhesions(mode){
 const rows=adhesionExportRows(),popup=window.open('','_blank');
 if(!popup){toast('Autorise les fenêtres supplémentaires pour créer cette liste.');return;}
 popup.opener=null;
 const title='ZikaMansle · Adhésions '+({pending:'en attente',paid:'à jour',all:'— toutes'}[state.adhesionFilter]);
 const head=rows[0].map(x=>'<th>'+esc(x)+'</th>').join('');
 const body=rows.slice(1).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v||'—')+'</td>').join('')+'</tr>').join('');
 const hint=mode==='pdf'?'Clique sur « Imprimer », puis choisis « Enregistrer au format PDF ».':'Clique sur « Imprimer », puis choisis ton imprimante.';
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 landscape;margin:12mm}body{font:10px Arial,sans-serif;color:#172337}h1{font-size:20px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bdc9d5;padding:5px 4px;text-align:left;overflow-wrap:anywhere}th{background:#eff4f8}tr{break-inside:avoid}button{padding:10px;margin-bottom:12px}@media print{button,.hint{display:none}}</style></head><body><h1>'+esc(title)+'</h1><p>'+rows.slice(1).length+' personnes · '+new Date().toLocaleDateString('fr-FR')+' · Confidentiel : administration et secrétariat</p><p class="hint">'+esc(hint)+'</p><button onclick="window.print()">Imprimer / enregistrer en PDF</button><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></body></html>';
 popup.document.open();popup.document.write(html);popup.document.close();
}
function manageDues(){
 if(!state.me.admin&&!state.me.secretariat)return '<section class="team-card">Accès réservé au secrétariat.</section>';
 const all=state.manage.dues||[],paid=all.filter(d=>Boolean(d.paid)).length,rows=adhesionRows();
 return '<section class="team-card team-accent-teal"><h2>Suivi des adhésions</h2><p>Statut « En attente » ou « À jour ». La date du règlement et le moyen de paiement sont facultatifs.</p><div class="team-dues-summary"><span><strong>'+paid+'</strong> à jour</span><span><strong>'+(all.length-paid)+'</strong> en attente</span></div>'+
 '<div class="team-export-tools"><label>Liste à afficher<select id="teamAdhesionFilter"><option value="pending" '+(state.adhesionFilter==='pending'?'selected':'')+'>Adhésions en attente</option><option value="paid" '+(state.adhesionFilter==='paid'?'selected':'')+'>Adhésions à jour</option><option value="all" '+(state.adhesionFilter==='all'?'selected':'')+'>Toutes les adhésions</option></select></label><button type="button" class="team-button light" data-export-adhesions="csv">Export CSV</button><button type="button" class="team-button light" data-export-adhesions="print">Imprimer</button><button type="button" class="team-button orange" data-export-adhesions="pdf">Créer un PDF</button></div>'+
 '<p class="team-small team-muted">'+rows.length+' personne(s) dans la liste. Les coordonnées complètes sont incluses dans les exports.</p>'+
 (rows.length?rows.map(d=>'<form class="team-dues-item team-form" data-dues-form="'+esc(d.member_id)+'"><div class="team-between"><div><strong>'+esc(d.name)+'</strong><p class="team-small">'+esc(d.contact.email||'')+' · '+esc(d.contact.phone||'Téléphone non renseigné')+'</p></div><span class="team-pill '+(d.paid?'ok':'warn')+'">'+(d.paid?'À jour':'En attente')+'</span></div><div class="team-split"><label>Statut<select name="paid"><option value="0" '+(!d.paid?'selected':'')+'>En attente</option><option value="1" '+(d.paid?'selected':'')+'>À jour</option></select></label><label>Règlement le (facultatif)<input type="date" name="paidOn" value="'+esc(d.paid_on||'')+'"></label><label>Moyen de paiement (facultatif)<select name="paymentMethod"><option value="">Non renseigné</option>'+Object.entries(paymentLabels).map(([k,v])=>'<option value="'+k+'" '+(d.payment_method===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><div class="team-row"><button class="team-button orange" type="submit">Enregistrer l’adhésion</button><button class="team-button light" type="reset">Annuler les modifications</button></div>'+(d.updated_at?'<p class="team-small team-muted">Modifiée le '+esc(shortdt(d.updated_at))+' par '+esc(d.updated_by)+'</p>':'')+'</form>').join(''):'<p>Aucune adhésion pour ce filtre.</p>')+'</section>';
}

const consentValue=(m,k)=>{const c=(state.manage?.consentsAdmin||[]).find(v=>v.member_id===m.member_id&&v.kind===k);return !c?'unset':Number(c.granted)===1?'yes':'no';};
const consentLabel=v=>({yes:'Oui',no:'Non',unset:'Non renseigné'})[v]||'Non renseigné';
const consentMatches=(m,k,v)=>v==='all'||consentValue(m,k)===v;
const consentPicker=(id,title,value)=>'<label>'+title+'<select id="'+id+'">'+[['all','Tous'],['yes','Oui'],['no','Non'],['unset','Non renseigné']].map(([v,t])=>'<option value="'+v+'"'+(value===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>';
function directoryFiltered(){
 const q=(state.directorySearch||'').toLocaleLowerCase('fr-FR').trim();
 return (state.manage?.contacts||[]).filter(m=>consentMatches(m,'image',state.directoryImage)&&consentMatches(m,'phone',state.directoryPhone)&&consentMatches(m,'email',state.directoryEmail)&&(!q||[m.name,m.email,m.phone,m.address,m.postal_code,m.city].some(x=>String(x||'').toLocaleLowerCase('fr-FR').includes(q))));
}
function directoryRows(){
 return [['Nom et prénom','E-mail','Téléphone','Adresse','Code postal','Ville','Droit à l’image','Communication téléphone','Communication e-mail'],...directoryFiltered().map(m=>[m.name,m.email,m.phone,m.address,m.postal_code,m.city,consentLabel(consentValue(m,'image')),consentLabel(consentValue(m,'phone')),consentLabel(consentValue(m,'email'))])];
}
function exportDirectoryCSV(){
 const safe=x=>{const s=String(x??'');return /^[=+\-@\t\r]/.test(s)?"'"+s:s;};
 const csv='\uFEFF'+directoryRows().map(row=>row.map(x=>'"'+safe(x).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='zikamansle-annuaire-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function printDirectory(mode){
 const rows=directoryRows(),popup=window.open('','_blank');if(!popup){toast('Autorise les fenêtres supplémentaires pour créer la liste.');return;}
 popup.opener=null;
 const head=rows[0].map(x=>'<th>'+esc(x)+'</th>').join('');
 const body=rows.slice(1).map(r=>'<tr>'+r.map(x=>'<td>'+esc(x||'—')+'</td>').join('')+'</tr>').join('');
 const hint=mode==='pdf'?'Choisis « Enregistrer au format PDF » dans la fenêtre d’impression.':'Choisis ton imprimante dans la fenêtre d’impression.';
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ZikaMansle · Annuaire bénévoles</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#142c41}h1{font-size:20px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #c6d4de;text-align:left;padding:6px 5px;overflow-wrap:anywhere}th{background:#edf5f9}tr{break-inside:avoid}button{padding:10px 16px}@media print{button,.hint{display:none}}</style></head><body><h1>ZikaMansle · Annuaire bénévoles</h1><p>Document confidentiel réservé à l’administration et au secrétariat · '+new Date().toLocaleDateString('fr-FR')+' · '+rows.slice(1).length+' personne(s)</p><p class="hint">'+esc(hint)+'</p><button onclick="window.print()">Imprimer / enregistrer en PDF</button><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></body></html>';
 popup.document.open();popup.document.write(html);popup.document.close();
}
function manageDirectory(){
 if(!state.me.admin&&!state.me.secretariat)return '<section class="team-card">Annuaire privé réservé au secrétariat et à l’administration.</section>';
 const all=state.manage.contacts||[];
 const search=state.directorySearch||'';
 const rows=directoryFiltered();
 return '<section class="team-card team-accent-blue"><h2>Annuaire des bénévoles</h2><p>Coordonnées complètes réservées à l’administration et au secrétariat. Tu peux corriger chaque fiche, puis imprimer, créer un PDF ou exporter un tableau.</p>'+
 '<label class="team-directory-search">Rechercher un bénévole<input id="teamDirectorySearch" type="search" autocomplete="off" placeholder="Nom, e-mail, ville, téléphone…" value="'+esc(search)+'"></label>'+'<div class="team-consent-filters">'+consentPicker('teamDirectoryImage','Droit à l’image',state.directoryImage)+consentPicker('teamDirectoryPhone','Communication du téléphone',state.directoryPhone)+consentPicker('teamDirectoryEmail','Communication de l’e-mail',state.directoryEmail)+'</div><p class="team-small team-muted">Non renseigné signifie qu’aucune réponse n’est enregistrée. Les exports reprennent les personnes filtrées.</p>'+
 '<div class="team-export-tools"><span class="team-pill">'+rows.length+' / '+all.length+' bénévoles</span><button type="button" class="team-button light" data-export-directory="csv">Exporter CSV</button><button type="button" class="team-button light" data-export-directory="print">Imprimer A4</button><button type="button" class="team-button orange" data-export-directory="pdf">Créer un PDF</button></div>'+
 (rows.length?rows.map(m=>'<form class="team-form team-directory-card" data-directory-form="'+esc(m.member_id)+'"><div class="team-between"><div><label>Nom et prénom<input name="name" value="'+esc(m.name)+'" required minlength="2" maxlength="110"></label><p class="team-small">'+esc(m.email)+'</p></div><span class="team-pill ok">Bénévole</span></div><div class="team-split"><label>Téléphone<input name="phone" type="tel" maxlength="40" value="'+esc(m.phone)+'" placeholder="06…"></label><label>Adresse<input name="address" maxlength="280" value="'+esc(m.address)+'" placeholder="Rue, numéro…"></label><label>Code postal<input name="postalCode" maxlength="16" value="'+esc(m.postal_code)+'" placeholder="16230"></label><label>Ville<input name="city" maxlength="120" value="'+esc(m.city)+'" placeholder="Mansle-les-Fontaines"></label></div><div class="team-row"><button class="team-button orange" type="submit">Enregistrer les coordonnées</button><button class="team-button light" type="reset">Annuler les modifications</button></div>'+(m.updated_at?'<p class="team-small team-muted">Modifié le '+shortdt(m.updated_at)+' par '+esc(m.updated_by)+'</p>':'')+'</form>').join(''):'<p>Aucun bénévole ne correspond à cette recherche.</p>')+
 '</section>';
}


function listsData(){
 const d=state.manage||{},dues=new Map((d.dues||[]).map(x=>[x.member_id,x])),memberships=d.listMemberships||[],roles=d.listRoles||[];
 return (d.contacts||[]).map(m=>{
  const mine=memberships.filter(x=>x.member_id===m.member_id);
  const labels=roles.filter(x=>x.member_id===m.member_id).map(x=>x.role);
  const poleNames=mine.map(x=>d.poles.find(p=>p.id===x.pole_id)?.name).filter(Boolean);
  const quality=[...(labels.includes('director')?['Dirigeant']:[]),...(mine.some(x=>x.role==='lead')?['Responsable']:[]),...(labels.includes('bureau')?['Bureau']:[])];
  const due=dues.get(m.member_id)||{};
  return {...m,paid:Boolean(due.paid),paid_on:due.paid_on||'',quality:quality.length?quality.join(' · '):'Bénévole',poles:poleNames,memberships:mine,roles:labels};
 }).filter(m=>{
  if(state.listStatus==='paid'&&!m.paid||state.listStatus==='pending'&&m.paid)return false;
  if(state.listRole==='leaders'&&!m.memberships.some(x=>x.role==='lead'))return false;
  if(state.listRole==='director'&&!m.roles.includes('director'))return false;
  if(state.listRole==='bureau'&&!m.roles.includes('bureau'))return false;
  if(state.listRole==='volunteer'&&(m.roles.includes('director')||m.roles.includes('bureau')||m.memberships.some(x=>x.role==='lead')))return false;
  if(state.listPole&&state.listPole!=='all'&&!m.memberships.some(x=>x.pole_id===state.listPole))return false;
  if(!consentMatches(m,'image',state.listImage)||!consentMatches(m,'phone',state.listPhone)||!consentMatches(m,'email',state.listEmail))return false;
  const q=state.listSearch.toLocaleLowerCase('fr-FR').trim();
  return !q||[m.name,m.email,m.phone,m.address,m.postal_code,m.city,m.quality,...m.poles].some(x=>String(x||'').toLocaleLowerCase('fr-FR').includes(q));
 });
}
const listColumnLabels={name:'Nom et prénom',quality:'Qualité',poles:'Pôle(s)',paid:'Adhésion',phone:'Téléphone',email:'E-mail',address:'Adresse',postal_code:'CP',city:'Ville',paid_on:'Règlement le',image_consent:'Droit à l’image',phone_consent:'Communication téléphone',email_consent:'Communication e-mail'};
function listValue(m,key){if(key==='image_consent')return consentLabel(consentValue(m,'image'));if(key==='phone_consent')return consentLabel(consentValue(m,'phone'));if(key==='email_consent')return consentLabel(consentValue(m,'email'));return key==='poles'?m.poles.join(', '):key==='paid'?(m.paid?'À jour':'En attente'):m[key]||'';}
function listOutputPeople(){
 if(!state.listEditor)return listsData();
 const all=state.manage?.contacts||[],order=new Map(state.listSelected.map((id,i)=>[id,i]));
 const previous={status:state.listStatus,role:state.listRole,pole:state.listPole,image:state.listImage,phone:state.listPhone,email:state.listEmail,search:state.listSearch};
 state.listStatus='all';state.listRole='all';state.listPole='';state.listImage='all';state.listPhone='all';state.listEmail='all';state.listSearch='';
 try{return listsData().filter(m=>order.has(m.member_id)).sort((a,b)=>order.get(a.member_id)-order.get(b.member_id));}
 finally{state.listStatus=previous.status;state.listRole=previous.role;state.listPole=previous.pole;state.listImage=previous.image;state.listPhone=previous.phone;state.listEmail=previous.email;state.listSearch=previous.search;}
}
function listsRows(){
 const columns=state.listEditor?state.listColumns:Object.keys(listColumnLabels);
 return [columns.map(k=>listColumnLabels[k]),...listOutputPeople().map(m=>columns.map(k=>listValue(m,k)))];
}
function openSavedList(id){
 const found=state.manage?.savedLists?.find(x=>x.id===id);if(!found)return toast('Liste introuvable.');
 try{
  const columns=JSON.parse(found.columns_json),ids=JSON.parse(found.member_ids_json);
  if(!Array.isArray(columns)||!Array.isArray(ids)||!columns.length)return toast('Cette liste est invalide.');
  state.listEditor=true;state.listId=found.id;state.listTitle=found.title;state.listColumns=columns.filter(x=>Object.hasOwn(listColumnLabels,x));state.listSelected=ids;
  state.listStatus='all';state.listRole='all';state.listPole='';state.listImage='all';state.listPhone='all';state.listEmail='all';state.listSearch='';render();
 }catch{toast('Impossible de lire cette liste.')}
}
function exportListsCSV(){
 const guard=s=>{const v=String(s??'');return /^[=+\-@\t\r]/.test(v)?"'"+v:v;};
 const csv='\uFEFF'+listsRows().map(row=>row.map(x=>'"'+guard(x).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='zikamansle-listes-benevoles-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function printLists(mode){
 const rows=listsRows(),popup=window.open('','_blank');if(!popup)return toast('Autorise les fenêtres supplémentaires.');
 popup.opener=null;
 const headings=rows[0].map(v=>'<th>'+esc(v)+'</th>').join('');
 const body=rows.slice(1).map(row=>'<tr>'+row.map(v=>'<td>'+esc(v||'—')+'</td>').join('')+'</tr>').join('');
 const title='ZikaMansle — '+esc(state.listEditor?(state.listTitle||'Liste personnalisée'):'Liste des bénévoles');
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'+title+'</title><style>@page{size:A4 landscape;margin:9mm}body{font:9px Arial,sans-serif;color:#19374c}h1{font-size:18px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #b6c6d1;text-align:left;padding:5px 3px;overflow-wrap:anywhere}th{background:#eaf3f9}tr{break-inside:avoid}button{padding:10px;margin:10px 0}@media print{button,.hint{display:none}}</style></head><body><h1>'+title+'</h1><p>Liste interne confidentielle — Administration / Secrétariat · '+rows.slice(1).length+' personnes · '+new Date().toLocaleDateString('fr-FR')+'</p><p class="hint">'+(mode==='pdf'?'Choisis « Enregistrer au format PDF » dans l’impression.':'Choisis ton imprimante.')+'</p><button onclick="window.print()">Imprimer / enregistrer en PDF</button><table><thead><tr>'+headings+'</tr></thead><tbody>'+body+'</tbody></table></body></html>';
 popup.document.open();popup.document.write(html);popup.document.close();
}
function manageLists(){
 if(!state.me.admin&&!state.me.secretariat)return '<section class="team-card">Accès réservé à l’administration et au secrétariat.</section>';
 const d=state.manage,rows=listsData();
 const saved=d.savedLists||[];
 const selection=state.listEditor?'<section class="team-card team-accent-purple"><button type="button" class="team-button light team-back" data-list-exit>← Retour aux listes</button><h3>Éditer une liste personnalisée</h3><p>Choisis les participants, les colonnes et leur ordre. Les listes sont enregistrées pour l’administration et le secrétariat.</p><form id="teamCustomListForm" class="team-form"><label>Titre de la liste<input name="title" maxlength="110" minlength="2" required value="'+esc(state.listTitle)+'" placeholder="Ex. Permanence Super U"></label><fieldset><legend>Colonnes de la liste (dans l’ordre choisi)</legend><div class="team-column-picks">'+Object.entries(listColumnLabels).map(([key,label])=>'<label class="team-check"><input type="checkbox" name="column" value="'+key+'" '+(state.listColumns.includes(key)?'checked':'')+'>'+esc(label)+'</label>').join('')+'</div></fieldset><div class="team-column-order">'+state.listColumns.map((key,i)=>'<div class="team-order-item"><span>'+esc(listColumnLabels[key])+'</span><div class="team-row"><button type="button" class="team-button light" data-list-column-move="up" data-column="'+key+'" '+(i===0?'disabled':'')+' aria-label="Monter '+esc(listColumnLabels[key])+'">↑</button><button type="button" class="team-button light" data-list-column-move="down" data-column="'+key+'" '+(i===state.listColumns.length-1?'disabled':'')+' aria-label="Descendre '+esc(listColumnLabels[key])+'">↓</button></div></div>').join('')+'</div><div class="team-row"><button type="submit" class="team-button orange">Enregistrer cette liste</button><button type="button" class="team-button light" data-list-exit>Annuler et revenir</button></div></form><h3>Participants sélectionnés ('+state.listSelected.length+')</h3><p class="team-small">Les flèches permettent de changer l’ordre des personnes.</p><div class="team-list-order">'+listOutputPeople().map((m,i)=>'<div class="team-order-item"><span>'+esc(m.name)+'</span><div class="team-row"><button type="button" class="team-button light" data-list-move="up" data-member="'+m.member_id+'" '+(i===0?'disabled':'')+' aria-label="Monter '+esc(m.name)+'">↑</button><button type="button" class="team-button light" data-list-move="down" data-member="'+m.member_id+'" '+(i===state.listSelected.length-1?'disabled':'')+' aria-label="Descendre '+esc(m.name)+'">↓</button><button type="button" class="team-button light" data-list-toggle="'+m.member_id+'">Retirer</button></div></div>').join('')+'</div></section>':'';
 const saveControls='<section class="team-card team-accent-teal"><h2>Mes listes enregistrées</h2><button type="button" class="team-button orange" data-list-new>+ Créer une liste personnalisée</button>'+(saved.length?saved.map(x=>'<div class="team-member-card"><div><strong>'+esc(x.title)+'</strong><p class="team-small">Modifiée le '+esc(shortdt(x.updated_at))+'</p></div><div class="team-row"><button class="team-button light" type="button" data-list-open="'+x.id+'">Ouvrir / modifier</button><button class="team-button danger" type="button" data-list-delete="'+x.id+'">Supprimer</button></div></div>').join(''):'<p>Pas encore de liste enregistrée.</p>')+'</section>';
 return saveControls+selection+'<section class="team-card team-accent-blue"><h2>Listes et exports</h2><p>Combine les filtres pour préparer une liste des bénévoles. Les coordonnées complètes sont réservées à l’administration et au secrétariat.</p>'+
 '<div class="team-split"><label>Adhésions<select id="teamListStatus"><option value="all" '+(state.listStatus==='all'?'selected':'')+'>Toutes</option><option value="paid" '+(state.listStatus==='paid'?'selected':'')+'>À jour</option><option value="pending" '+(state.listStatus==='pending'?'selected':'')+'>Non à jour</option></select></label>'+
 '<label>Qualité / fonction<select id="teamListRole"><option value="all" '+(state.listRole==='all'?'selected':'')+'>Tous les bénévoles</option><option value="leaders" '+(state.listRole==='leaders'?'selected':'')+'>Responsables uniquement</option><option value="director" '+(state.listRole==='director'?'selected':'')+'>Dirigeants uniquement</option><option value="bureau" '+(state.listRole==='bureau'?'selected':'')+'>Bureau uniquement</option><option value="volunteer" '+(state.listRole==='volunteer'?'selected':'')+'>Bénévoles sans fonction</option></select></label>'+
 '<label>Par pôle<select id="teamListPole"><option value="all">Tous les pôles</option>'+(d.poles||[]).filter(p=>!p.archived).map(p=>'<option value="'+p.id+'" '+(state.listPole===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>'+
 '<label>Recherche<input id="teamListSearch" type="search" placeholder="Nom, ville, coordonnées…" value="'+esc(state.listSearch)+'"></label></div>'+'<div class="team-consent-filters">'+consentPicker('teamListImage','Droit à l’image',state.listImage)+consentPicker('teamListPhone','Communication du téléphone',state.listPhone)+consentPicker('teamListEmail','Communication de l’e-mail',state.listEmail)+'</div>'+
 '<div class="team-export-tools"><button class="team-button light" type="button" data-list-apply>Appliquer les filtres</button><button class="team-button light" type="button" data-list-reset>Afficher tous</button><button class="team-button light" type="button" data-list-export="csv">Exporter CSV</button><button class="team-button light" type="button" data-list-export="print">Imprimer A4</button><button class="team-button orange" type="button" data-list-export="pdf">Créer un PDF</button></div><p><strong>'+rows.length+'</strong> personne(s) correspondent aux critères.</p>'+
 '<div class="team-table-wrap"><table class="team-table"><thead><tr>'+(state.listEditor?'<th>Choisir</th>':'')+'<th>Nom et prénom</th><th>Qualité</th><th>Pôle(s)</th><th>Adhésion</th><th>Téléphone</th><th>E-mail</th></tr></thead><tbody>'+
 (rows.map(m=>'<tr>'+(state.listEditor?'<td><label class="team-check"><input type="checkbox" data-list-check="'+m.member_id+'" '+(state.listSelected.includes(m.member_id)?'checked':'')+' aria-label="Ajouter '+esc(m.name)+'"></label></td>':'')+'<td>'+esc(m.name)+'</td><td>'+esc(m.quality)+'</td><td>'+esc(m.poles.join(', ')||'—')+'</td><td><span class="team-pill '+(m.paid?'ok':'warn')+'">'+(m.paid?'À jour':'Non à jour')+'</span></td><td>'+esc(m.phone||'—')+'</td><td>'+esc(m.email||'—')+'</td></tr>').join('')||'<tr><td colspan="'+(state.listEditor?'7':'6')+'">Aucun résultat.</td></tr>')+'</tbody></table></div></section>';
}
function manageAudit(){return '<section class="team-card"><h2>Journal d’administration</h2><p>Les principales modifications des bénévoles, pôles, activités et documents sont tracées.</p><div class="team-table-wrap"><table class="team-table"><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr></thead><tbody>'+state.manage.audit.map(x=>'<tr><td>'+shortdt(x.created_at)+'</td><td>'+esc(x.actor_email)+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.detail)+'</td></tr>').join('')+'</tbody></table></div></section>'}


function loginScreen(error=''){
 const first=state.loginMethod==='code';
 const mail='<label>Adresse e-mail<input type="email" name="email" maxlength="254" autocomplete="email" required placeholder="prenom@example.fr" value="'+esc(state.loginEmail)+'"></label>';
 const choices='<div class="team-login-choices" role="group" aria-label="Choisir mon accès">'+
 '<button type="button" class="team-button '+(!first?'orange':'light')+'" data-team-password-login aria-pressed="'+(!first)+'">Déjà membre</button>'+
 '<button type="button" class="team-button '+(first?'orange':'light')+'" data-team-code-login aria-pressed="'+first+'">Première inscription</button></div>';
 const body=!first
 ?'<h2>Connexion des membres</h2><p>Tu as déjà créé ton mot de passe ? Connecte-toi directement.</p><form id="teamLoginPassword" class="team-form">'+mail+'<label>Mot de passe<span class="team-password-field"><input type="password" name="password" autocomplete="current-password" required><button type="button" class="team-password-toggle" data-password-toggle aria-label="Afficher le mot de passe" aria-pressed="false">👁 Afficher</button></span></label><button class="team-button orange" type="submit">Me connecter</button></form><button type="button" class="team-button light" data-team-code-login>Première connexion ou mot de passe oublié ? Recevoir un code</button>'
 :(!state.codeSent?
 '<h2>Première inscription</h2><p>Indique ton adresse e-mail pour recevoir un code de vérification à 6 ou 8 chiffres. Ce code permet de confirmer ton identité et de créer ton mot de passe. Ton inscription sera ensuite soumise à la validation de l’administration.</p><form id="teamLoginRequest" class="team-form"><label>Nom et prénom<input type="text" name="name" minlength="2" maxlength="110" autocomplete="name" required value="'+esc(state.loginName)+'" placeholder="Votre nom et prénom"></label>'+mail+'<label>Code d’invitation ZikaTeam (si reçu de l’association)<input name="inviteCode" type="text" maxlength="16" pattern="[0-9A-Fa-f]{16}" autocomplete="off" placeholder="Code fourni par ZikaMansle" value="'+esc(state.inviteCode||'')+'"></label><button class="team-button orange" type="submit">Recevoir mon code de vérification</button></form>'
 :'<h2>Vérifier mon adresse e-mail</h2><p>Code envoyé à <strong>'+esc(state.loginEmail)+'</strong>. Vérifie aussi les courriers indésirables.</p><form id="teamLoginVerify" class="team-form"><label>Code reçu par e-mail<input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}|[0-9]{8}" minlength="6" maxlength="8" required placeholder="6 ou 8 chiffres"></label><button class="team-button orange" type="submit">Valider mon code</button></form><button class="team-button light" type="button" data-team-reset>Changer d’adresse e-mail</button>');
 root.innerHTML='<section class="team-card team-login-card team-accent-blue"><h1>Bienvenue dans ZikaTeam</h1><p>Ton espace bénévole ZikaMansle.</p>'+choices+body+(error?'<p class="team-warning" role="alert">'+esc(error)+'</p>':'')+'<p class="team-small team-muted">Un code reçu par e-mail n’est jamais un code d’accès collectif. Chaque bénévole vérifie sa propre adresse. Les nouveaux comptes restent limités jusqu’à validation par l’administration.</p></section>';
}
function passwordSetupScreen(error=''){
 root.innerHTML='<section class="team-card team-login-card team-accent-orange"><span class="team-pill warn">Dernière étape de sécurisation</span><h1>'+ (state.forcePasswordSetup?'Créer un nouveau mot de passe':'Choisis ton mot de passe')+'</h1><p>Ton adresse e-mail est vérifiée. Choisis un mot de passe personnel pour te connecter ensuite directement, sans redemander de code par e-mail.</p><form id="teamSetPassword" class="team-form"><label>Nouveau mot de passe<span class="team-password-field"><input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required><button type="button" class="team-password-toggle" data-password-toggle aria-label="Afficher le mot de passe" aria-pressed="false">👁 Afficher</button></span></label><label>Confirmer le mot de passe<span class="team-password-field"><input type="password" name="confirmation" autocomplete="new-password" minlength="12" maxlength="128" required><button type="button" class="team-password-toggle" data-password-toggle aria-label="Afficher la confirmation du mot de passe" aria-pressed="false">👁 Afficher</button></span></label><p class="team-small team-muted">12 caractères minimum avec des lettres et des chiffres. Utilise de préférence une phrase de passe facile à retenir.</p><button class="team-button orange" type="submit">Enregistrer mon mot de passe</button></form>'+(error?'<div class="team-warning" role="alert">'+esc(error)+'</div>':'')+'<p class="team-small">Les bénévoles en attente d’approbation pourront définir leur mot de passe dès maintenant ; leurs autres accès resteront limités jusqu’à validation.</p><button type="button" class="team-button light" data-team-logout>Me déconnecter</button></section>';
}
async function freeLoginRequest(email,name,inviteCode=''){
 state.inviteCode=String(inviteCode||'').replace(/\s/g,'').toUpperCase();
 const label=name.trim();if(label.length<2)throw Error('Indique ton nom et ton prénom.');
 await api('auth/request',{email});
 state.loginName=label;state.loginEmail=email.trim().toLowerCase();state.codeSent=true;loginScreen();
 toast('Un code de vérification a été demandé par e-mail.');
}
async function freeLoginVerify(code){
 await api('auth/verify',{email:state.loginEmail,name:state.loginName,code:code.trim(),inviteCode:state.inviteCode});
 state.inviteCode='';
 state.forcePasswordSetup=true;
 state.codeSent=false;
 await refresh();
 toast('Adresse vérifiée. Choisis maintenant ton mot de passe personnel.');
}
async function freeLoginPassword(email,password){
 await api('auth/password',{email,password});
 state.forcePasswordSetup=false;
 state.loginMethod='password';
 state.loginEmail=email.trim().toLowerCase();
 await refresh();toast('Connexion réussie.');
}
async function saveNewPassword(password,confirmation){
 if(password!==confirmation)throw Error('Les deux mots de passe ne sont pas identiques.');
 if(password.length<12||!/[A-Za-zÀ-ÿ]/.test(password)||!/[0-9]/.test(password))throw Error('Choisis au moins 12 caractères avec des lettres et des chiffres.');
 await api('auth/set-password',{password});
 state.forcePasswordSetup=false;
 state.loginMethod='password';
 state.codeSent=false;
 await refresh();toast('Ton mot de passe est enregistré. La prochaine connexion se fera sans code e-mail.');
}

function render(){
 if(!state.me)return;
 if(state.me.passwordRequired||state.forcePasswordSetup){passwordSetupScreen();return;}
 if(!state.me.charterAccepted){
  state.tab='fiche';
  const adminSetup=state.me.admin&&!state.me.charter;
  const profileSetup=state.me.admin&&!state.me.member;
  root.innerHTML=header()+'<div class="team-gate"><div class="team-card team-accent-orange"><span class="team-step">Étape obligatoire avant l’accès aux équipes</span><h2>'+(adminSetup?'Mettre en place la charte officielle':'Bienvenue dans ZikaTeam')+'</h2><p>'+(adminSetup?'L’administration doit d’abord publier la charte officielle. Les bénévoles ne pourront pas accéder à leur espace avant sa publication et leur acceptation.':'Lis et accepte la charte pour ouvrir ton espace personnel. Elle restera disponible ensuite dans « Ma fiche ».')+'</p></div>'+
   (profileSetup?fiche().split('</section>')[0]+'</section>':'')+
   (adminSetup?manageCharter():state.me.charter?charterBlock():'<section class="team-card team-accent-orange"><h2>Accès en préparation</h2><p>La charte officielle doit être publiée par l’administration avant ta première connexion.</p></section>')+'</div>';
  return;
 }
 if(state.me.pending&&state.tab!=='fiche')state.tab='fiche';
 root.innerHTML=header()+menu()+({fiche,activites:activities,messages,gestion:management}[state.tab]||fiche)();
 if(state.tab==='messages'){const pane=$('teamMessages');if(pane)pane.scrollTop=pane.scrollHeight;}
 if(state.signingMember)setupSigningCanvas();
}
// L'association à un pôle ou à une fonction suffit pour cibler les alertes.
// Si ce navigateur possède déjà un abonnement push autorisé, on le rattache
// automatiquement au compte connecté sans demander d'activation groupe par groupe.
let linkedPushMember=null,linkingPush=false;
async function autoLinkTeamPush(me){
 if(!me?.member?.id||me.pending||me.passwordRequired||!me.charterAccepted||typeof Notification==='undefined'||Notification.permission!=='granted'||linkedPushMember===me.member.id||linkingPush)return;
 if(!window.ZikaPush?.subscription)return;
 linkingPush=true;
 try{
  const sub=(await window.ZikaPush.subscription())||(await window.ZikaPush.enable());
  if(sub){await command('push.link',{subscription:sub.toJSON()});linkedPushMember=me.member.id;}
 }catch{}finally{linkingPush=false;}
}
async function refresh(){
 // Priorité à l’affichage : les modules de gestion et les salons sont chargés
 // ensuite, et ne doivent jamais bloquer la fiche ni l'écran de connexion.
 state.me=await api('me');
 const me=state.me;
 void autoLinkTeamPush(me);
 if(me.secretariat&&!me.admin&&!me.leadPoles.length&&state.managementTab==='activites')state.managementTab='emargements';
 if(me.passwordRequired||!me.charterAccepted){state.manage=null;state.signing=null;state.chatRooms=[];state.chatUnread=0;render();return;}
 render();
 const tasks=[];
 if(me.admin||me.leadPoles.length||me.secretariat){
  tasks.push(api('manage').then(data=>{if(state.me===me){state.manage=data;if(state.tab==='gestion')render();}}).catch(e=>toast('Gestion : '+e.message)));
 }else state.manage=null;
 if(me.admin||me.secretariat){
  tasks.push(api('signing').then(data=>{if(state.me===me){state.signing=data;if(state.tab==='gestion')render();}}).catch(e=>toast('Émargements : '+e.message)));
 }else state.signing=null;
 if(!me.pending&&me.member){
  tasks.push(refreshChatSummary().then(()=>{if(state.me===me&&state.tab==='messages')render();}).catch(()=>{}));
 }
 // Ne pas bloquer la navigation sur les données secondaires. Elles s'affichent à leur arrivée.
 void Promise.allSettled(tasks);
}
async function refreshChatSummary(){
 if(!state.me?.charterAccepted||state.me.pending||!state.me.member){state.chatRooms=[];state.chatUnread=0;return;}
 const data=await api('chat-summary');state.chatRooms=data.rooms||[];state.chatUnread=data.total||0;
 const allowed=state.chatRooms.some(x=>x.channel===state.chatChannel&&(x.id||null)===(state.chatId||null));
 if(!allowed){state.chatChannel=state.chatRooms[0]?.channel||'general';state.chatId=state.chatRooms[0]?.id||null;state.messages=[];}
}
async function refreshMessages(){
 if(state.me?.pending){state.messages=[];return;}
 const channel=state.chatChannel,id=state.chatId;
 const params=new URLSearchParams({channel});if(id)params.set('id',id);
 const response=await api('messages?'+params);
 if(state.chatChannel!==channel||state.chatId!==id)return;
 state.messages=response.messages||[];
 if(state.tab==='messages'){render();const pane=$('teamMessages');if(pane)pane.scrollTop=pane.scrollHeight;}
 // Le compteur n'empêche plus l'ouverture du tchat ni l'apparition du champ.
 void refreshChatSummary().then(()=>{if(state.tab==='messages'){const active=state.chatRooms.find(x=>x.channel===channel&&(x.id||null)===(id||null));if(active?.unread){active.unread=0;}}}).catch(()=>{});
}
const fromForm=f=>Object.fromEntries(new FormData(f).entries());
async function uploadTeamPhoto(memberId,file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Sélectionne une photo JPEG, PNG ou WebP.');
 if(file.size>15*1024*1024)throw Error('Choisis une photo de moins de 15 Mo.');
 const picture=await createImageBitmap(file);
 try{
  const factor=Math.min(1,600/Math.max(picture.width,picture.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(picture.width*factor));canvas.height=Math.max(1,Math.round(picture.height*factor));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(picture,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.84));
  if(!blob||blob.size>4*1024*1024)throw Error('Impossible de préparer cette photo.');
  const response=await fetch('/zikateam/api/photo?'+new URLSearchParams({member:memberId}),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'image/jpeg'},body:blob});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Erreur d’envoi de la photo.');
 }finally{picture.close()}
}
async function upload(file,kind,activityId){if(!file||!file.size)return null;if(file.type!=='application/pdf'||file.size>8*1024*1024)throw Error('Choisissez un PDF de moins de 8 Mo.');
 const query=new URLSearchParams({kind});if(activityId)query.set('activity',activityId);
 const response=await fetch('/zikateam/api/upload?'+query,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file});const r=await response.json();if(!response.ok)throw Error(r.error||'Erreur lors de l’envoi du PDF.');return r.id;
}
async function perform(fn){if(state.busy)return;state.busy=true;try{await fn();await refresh();toast('Modifications enregistrées.')}catch(e){toast(e.message||'Erreur de service.')}finally{state.busy=false}}
// Sauvegarde déclenchée directement par le bouton, sans dépendre d'un événement submit.
async function saveVolunteerForm(f){
 if(state.busy){toast('Une opération est déjà en cours.');return;}
 try{

  const button=f.querySelector('[data-save-member]');
  let feedback=f.querySelector('[data-member-save-feedback]');
  if(!feedback){feedback=document.createElement('p');feedback.dataset.memberSaveFeedback='';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');f.append(feedback);}
  const d=fromForm(f),name=String(d.name||'').trim(),email=String(d.email||'').trim().toLowerCase();
  const report=(message,ok=false)=>{
   feedback.textContent=(ok?'✅ ':'❌ ')+message;
   feedback.style.color=ok?'#116b49':'#ad2034';feedback.style.fontWeight='700';
   feedback.scrollIntoView({block:'center',behavior:'smooth'});
  };
  if(name.length<2)return report('Indique le nom et le prénom du bénévole.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return report('Vérifie l’adresse e-mail de connexion.');
  const active=f.querySelector('input[name="active"]');
  if(!active)return report('Champ fiche active introuvable. Recharge ZikaTeam.');
  const changes=rolePayload(f);
  if(!state.me?.admin)return report('Seul l’administrateur peut enregistrer une fiche complète. Le secrétariat utilise « Modifier les fonctions ».');
  state.busy=true;if(button){button.disabled=true;button.textContent='Enregistrement en cours…';}
  feedback.textContent='Enregistrement de la fiche et des fonctions…';
  try{
   const saved=await command('member.save',{id:d.id||undefined,name,email,active:active.checked,...changes});
   if(!saved.ok||!saved.id)throw Error('Le serveur n’a pas confirmé la sauvegarde de cette fiche.');
   if(saved.rolesSaved!==changes.roles.length||saved.polesSaved!==changes.poleRoles.length)throw Error('Le serveur n’a pas confirmé toutes les fonctions et affectations.');
   state.editMember=null;
   report('Fiche, fonctions et pôles enregistrés dans la base.',true);
   toast('✅ Fiche, fonctions et pôles enregistrés pour '+name+'.');
   try{const data=await api('manage');state.manage=data;render();}
   catch(error){toast('Enregistrement réussi. Actualise la liste pour afficher les modifications.');}
  }catch(error){report('Enregistrement non confirmé : '+(error.message||'Erreur de service.'));}
  finally{state.busy=false;if(button?.isConnected){button.disabled=false;button.textContent='Enregistrer la fiche et les fonctions';}}
  return;
 }catch(error){
  const feedback=f.querySelector('[data-member-save-feedback]');
  if(feedback)feedback.textContent='❌ Erreur du formulaire : '+(error?.message||String(error));
  toast('Erreur du formulaire : '+(error?.message||String(error)));
  state.busy=false;
 }
}
async function saveFunctionsForm(f){
 if(state.busy){toast('Une opération est déjà en cours.');return;}
 try{

  const button=f.querySelector('[data-save-member-functions]');
  let feedback=f.querySelector('[data-functions-save-feedback]');
  if(!feedback){feedback=document.createElement('p');feedback.dataset.functionsSaveFeedback='';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','assertive');f.append(feedback);}
  state.busy=true;if(button){button.disabled=true;button.textContent='Enregistrement en cours…';}
  feedback.textContent='⏳ Vérification des pôles et fonctions…';
  try{
   const d=fromForm(f),changes=rolePayload(f);
   const memberId=String(d.memberId||f.querySelector('input[name="memberId"]')?.value||state.editMember||'').trim();
   if(!/^[0-9a-f-]{36}$/i.test(memberId))throw Error('Identifiant de bénévole absent. Retourne à la liste et rouvre sa fiche.');
   const saved=await command('member.functions.set',{memberId,roles:changes.roles,poleRoles:changes.poleRoles});
   if(!saved.ok)throw Error('Le serveur n’a pas confirmé la sauvegarde.');
   if(saved.rolesSaved!==changes.roles.length||saved.polesSaved!==changes.poleRoles.length)throw Error('Le serveur n’a pas confirmé toutes les fonctions et affectations.');
   state.editMember=null;
   feedback.textContent='✅ Fonctions et pôles enregistrés dans la base.';
   feedback.style.color='#116b49';feedback.style.fontWeight='800';
   toast('✅ Fonctions et pôles enregistrés.');
   try{const data=await api('manage');state.manage=data;render();}catch(error){
    toast('Enregistrement réussi. Actualise la liste pour afficher les modifications.');
   }
  }catch(error){
   feedback.textContent='❌ '+(error.message||'Échec de sauvegarde.');
   feedback.style.color='#ad2034';feedback.style.fontWeight='700';
   feedback.scrollIntoView({block:'center'});
  }finally{state.busy=false;if(button?.isConnected){button.disabled=false;button.textContent='Enregistrer les fonctions';}}
  return;
 }catch(error){
  const feedback=f.querySelector('[data-functions-save-feedback]');
  if(feedback)feedback.textContent='❌ Erreur du formulaire : '+(error?.message||String(error));
  toast('Erreur du formulaire : '+(error?.message||String(error)));
  state.busy=false;
 }
}
// Gestion prioritaire des boutons de sauvegarde : un appui doit déclencher
// le formulaire avant les autres écouteurs, même sur un navigateur mobile.
document.addEventListener('click',e=>{
 const button=e.target.closest?.('#teamRoot button[data-save-member], #teamRoot button[data-save-member-functions]');
 if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 const form=button.closest('form');
 if(!form){toast('Formulaire introuvable.');return;}
 let feedback=form.querySelector('[data-member-save-feedback], [data-functions-save-feedback]');
 if(!feedback){feedback=document.createElement('p');feedback.dataset.memberSaveFeedback='';feedback.setAttribute('role','status');feedback.style.cssText='font-size:16px;font-weight:800;color:#17364a;padding:12px;background:#fff4d8;border:2px solid #e8932a;border-radius:10px';button.closest('.team-row')?.after(feedback)||form.append(feedback);}
 feedback.textContent='⏳ Clic reçu. Transmission de la fiche au serveur…';
 if(state.busy){feedback.textContent='⌛ Une autre opération est en cours. Réessaie.';return;}
 const isFullSave=button.hasAttribute('data-save-member');
 if(isFullSave&&form.id!=='memberForm'){feedback.textContent='❌ Fiche non reconnue : ouvre à nouveau ce bénévole.';return;}
 if(!isFullSave&&form.id!=='teamMemberFunctionsForm'){feedback.textContent='❌ Formulaire de fonctions non reconnu : ouvre à nouveau ce bénévole.';return;}
 (isFullSave?saveVolunteerForm(form):saveFunctionsForm(form)).catch(error=>{feedback.textContent='❌ '+(error?.message||'Erreur de traitement.');state.busy=false;});
},true);
root.addEventListener('click',async e=>{const b=e.target.closest('button[data-save-member],button[data-save-member-functions],button[data-password-toggle],button[data-invite-revoke],button[data-invite-copy],button[data-notice-open],button[data-notice-dismiss],button[data-chat-back],button[data-chat-icon],button[data-chat-room],button[data-team-logout],button[data-team-reset],button[data-team-code-login],button[data-team-password-login],button[data-delete-message],button[data-export-attendance],button[data-print-attendance],button[data-secretariat],button[data-list-apply],button[data-list-reset],button[data-list-export],button[data-list-new],button[data-list-open],button[data-list-exit],button[data-list-delete],button[data-list-toggle],button[data-list-move],button[data-list-column-move],button[data-print-team],button[data-signing-delete],button[data-signing-open],button[data-signing-member],button[data-signing-remove],button[data-signing-all],button[data-signing-none],button[data-signing-clear],button[data-signing-confirm],button[data-signing-return],button[data-signing-export],button[data-signing-close],button[data-reject-member],button[data-export-adhesions],button[data-export-directory],button[data-tab],button[data-mtab],button[data-rsvp],button[data-shift-sign],button[data-link-push],button[data-test-local-push],button[data-test-server-push],button[data-edit-activity],button[data-edit-pole],button[data-edit-member],button[data-edit-shift],button[data-archive-pole],button[data-delete-pole],button[data-remove-member],button[data-remove-shift],button[data-reset-activity],button[data-reset-pole],button[data-reset-member],button[data-back-edit],button[data-signing-back],button[data-checkin],button[data-delete-task],button[data-task-status]');if(!b)return;
 if(b.matches('[data-save-member], [data-save-member-functions]')){
  e.preventDefault();
  const f=b.closest('form'),field=f?.querySelector('[data-member-save-feedback], [data-functions-save-feedback]');
  if(!f){toast('Erreur : formulaire introuvable. Recharge cette page.');return;}
  if(state.busy){toast('Un enregistrement est déjà en cours.');return;}
  if(field)field.textContent='⏳ Enregistrement demandé…';
  // Explicitly dispatch submit even on mobile browsers that suppress native form submit.
  f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  return;
 }

 if(b.hasAttribute('data-password-toggle')){
  const input=b.closest('.team-password-field')?.querySelector('input');
  if(!input)return;
  const show=input.type==='password';
  input.type=show?'text':'password';
  b.setAttribute('aria-pressed',String(show));
  b.setAttribute('aria-label',(show?'Masquer':'Afficher')+(input.name==='confirmation'?' la confirmation du mot de passe':' le mot de passe'));
  b.textContent=show?'🙈 Masquer':'👁 Afficher';
  input.focus({preventScroll:true});
  return;
 }
 if(b.dataset.noticeOpen||b.dataset.noticeDismiss){
  const id=b.dataset.noticeOpen||b.dataset.noticeDismiss;
  const notice=state.me?.notices?.find(n=>n.id===id);
  if(!notice)return;
  try{
   await command('notice.read',{id});notice.seen_at=Date.now();
   if(b.dataset.noticeOpen){state.tab='activites';render();document.getElementById('teamActivity-'+notice.activity_id)?.scrollIntoView({block:'center',behavior:'smooth'});}
   else render();
  }catch(err){toast(err.message||'Impossible de marquer la notification comme lue.')}
  return;
 }
 if(b.hasAttribute('data-team-password-login')){state.loginMethod='password';state.codeSent=false;loginScreen();return;}
 if(b.hasAttribute('data-team-code-login')){state.loginMethod='code';state.codeSent=false;loginScreen();return;}
 if(b.hasAttribute('data-team-reset')){state.codeSent=false;state.loginMethod='code';loginScreen();return;}
 if(b.hasAttribute('data-team-logout')){try{await api('auth/logout',{});}catch(e){toast(e.message)}state.me=null;state.manage=null;state.codeSent=false;state.forcePasswordSetup=false;state.loginMethod='password';loginScreen();return;}

 if(b.hasAttribute('data-list-new')){state.listEditor=true;state.listId=null;state.listTitle='';state.listSelected=[];state.listColumns=['name','quality','poles','paid','phone','email'];render();return;}
 if(b.dataset.listOpen){openSavedList(b.dataset.listOpen);return;}
 if(b.hasAttribute('data-list-exit')){state.listEditor=false;state.listId=null;state.listTitle='';state.listSelected=[];render();return;}
 if(b.dataset.listDelete){if(!confirm('Supprimer définitivement cette liste enregistrée ?'))return;await perform(async()=>{await command('list.delete',{id:b.dataset.listDelete});if(state.listId===b.dataset.listDelete){state.listEditor=false;state.listId=null;}});return;}
 if(b.dataset.listToggle){state.listSelected=state.listSelected.filter(id=>id!==b.dataset.listToggle);render();return;}
 if(b.dataset.listColumnMove){const i=state.listColumns.indexOf(b.dataset.column),j=i+(b.dataset.listColumnMove==='up'?-1:1);if(i>=0&&j>=0&&j<state.listColumns.length){[state.listColumns[i],state.listColumns[j]]=[state.listColumns[j],state.listColumns[i]];render();}return;}
 if(b.dataset.listMove){const i=state.listSelected.indexOf(b.dataset.member);const next=i+(b.dataset.listMove==='up'?-1:1);if(i>=0&&next>=0&&next<state.listSelected.length){[state.listSelected[i],state.listSelected[next]]=[state.listSelected[next],state.listSelected[i]];render();}return;}
 if(b.hasAttribute('data-list-apply')){state.listSearch=document.getElementById('teamListSearch')?.value||'';render();return;}
 if(b.hasAttribute('data-list-reset')){state.listStatus='all';state.listRole='all';state.listPole='';state.listImage='all';state.listPhone='all';state.listEmail='all';state.listSearch='';render();return;}
 if(b.dataset.listExport){if(!state.me.admin&&!state.me.secretariat)return;b.dataset.listExport==='csv'?exportListsCSV():printLists(b.dataset.listExport);return;}
 if(b.dataset.printTeam){printTeam(b.dataset.printTeam);return;}
 if(b.hasAttribute('data-back-edit')){const type=b.dataset.backEdit;if(type==='activity')state.editActivity=null;if(type==='pole')state.editPole=null;if(type==='member')state.editMember=null;if(type==='shift')state.editShift=null;render();return;}
 if(b.hasAttribute('data-signing-back')){state.signingCurrent=null;state.signingSelection=[];render();return;}
 if(b.dataset.signingDelete){
  const session=state.signing?.sessions.find(x=>x.id===b.dataset.signingDelete);if(!session)return;
  const count=session.attendees.filter(x=>x.signed_at).length;
  if(count&&!state.me.admin){toast('Seul un administrateur peut supprimer une feuille déjà signée.');return;}
  if(!confirm('Supprimer définitivement la feuille « '+session.title+' » ?'+(count?'\nATTENTION : '+count+' signature(s) seront aussi supprimées.':'')+'\nCette action est irréversible.'))return;
  const title=count?prompt('Pour confirmer la suppression de signatures, recopie exactement le titre : '+session.title):'';
  if(count&&title!==session.title){toast('Suppression annulée : titre non confirmé.');return;}
  await perform(async()=>{await command('signing.delete',{sessionId:session.id,confirm:true,confirmTitle:count?title:''});if(state.signingCurrent===session.id)state.signingCurrent=null;});return;
 }
 if(b.dataset.signingOpen){
  state.signingCurrent=b.dataset.signingOpen;state.signingMember=null;state.signingSelection=[];state.managementTab='emargements';render();const section=root.querySelector('.team-card.team-accent-purple');section?.scrollIntoView({block:'start'});return;
 }
 if(b.dataset.signingAll){state.signingSelection=signingMembers().map(m=>m.id).filter(id=>!state.signing.sessions.find(s=>s.id===state.signingCurrent)?.attendees.some(a=>a.member_id===id));render();return;}
 if(b.dataset.signingNone){state.signingSelection=[];render();return;}
 if(b.dataset.signingMember){await openSigning(b.dataset.signingMember);return;}
 if(b.dataset.signingReturn!==undefined){await closeSigning();return;}
 if(b.dataset.signingClear!==undefined){state.signingStrokes=[];const canvas=$('teamSigningCanvas');canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);return;}
 if(b.dataset.signingConfirm!==undefined){
  if(!state.signingStrokes.length){toast('Trace ta signature avant de valider.');return;}
  await perform(async()=>{
   await command('signing.sign',{sessionId:state.signingCurrent,memberId:state.signingMember,strokes:state.signingStrokes});
   await closeSigning();
  });return;
 }
 if(b.dataset.signingRemove){
  if(!confirm('Retirer ce participant non signé de la feuille ?'))return;
  await perform(async()=>command('signing.remove',{sessionId:state.signingCurrent,memberId:b.dataset.signingRemove}));return;
 }
 if(b.dataset.signingClose!==undefined){
  if(!confirm('Clôturer définitivement cette feuille ? Vous ne pourrez plus ajouter de participant ni recueillir de nouvelles signatures.'))return;
  await perform(async()=>command('signing.close',{sessionId:state.signingCurrent}));return;
 }
 if(b.dataset.signingExport){
  const session=state.signing?.sessions.find(x=>x.id===state.signingCurrent);
  if(!session)return;
  b.dataset.signingExport==='csv'?exportSigningCSV(session):printSigningSession(session,b.dataset.signingExport);
  return;
 }
 if(b.hasAttribute('data-invite-copy')){
  const d=state.invitationDraft;if(!d)return;
  const text='Invitation ZikaTeam pour '+d.name+'\nAdresse : '+d.email+'\nLien : https://zikamansle-app-staging.zikamansle.workers.dev/zikateam\nCode : '+d.code+'\nPremière inscription → vérification e-mail → validation par l’administration.';
  try{await navigator.clipboard.writeText(text);toast('Invitation copiée.')}catch{toast('Copie indisponible : utilise le bouton e-mail.')}return;
 }
 if(b.dataset.inviteRevoke){if(!confirm('Révoquer ce code d’invitation ?'))return;await perform(async()=>{await command('invite.revoke',{id:b.dataset.inviteRevoke});});return;}
 if(b.dataset.rejectMember){
  if(!confirm('Refuser définitivement cette demande d’accès ZikaTeam ?'))return;
  await perform(async()=>command('member.review',{email:b.dataset.rejectMember,approve:false}));
  return;
 }
 if(b.dataset.secretariat){
  const enabled=b.dataset.enabled==='1';
  if(!confirm(enabled?'Confirmer la nomination au secrétariat ? Cette personne pourra consulter les présences de toutes les équipes.':'Retirer les droits du secrétariat à cette personne ?'))return;
  await perform(async()=>command('secretariat.set',{memberId:b.dataset.secretariat,enabled}));return;
 }
 if(b.dataset.exportDirectory){
  if(!state.me.admin&&!state.me.secretariat)return;
  b.dataset.exportDirectory==='csv'?exportDirectoryCSV():printDirectory(b.dataset.exportDirectory);
  return;
 }
 if(b.dataset.exportAdhesions){
  if(!state.me.admin&&!state.me.secretariat)return;
  b.dataset.exportAdhesions==='csv'?exportAdhesionsCSV():printAdhesions(b.dataset.exportAdhesions);
  return;
 }
 if(b.dataset.exportAttendance){const a=state.manage?.activities.find(a=>a.id===b.dataset.exportAttendance);if(a)downloadAttendance(a);return;}
 if(b.dataset.printAttendance){const a=state.manage?.activities.find(a=>a.id===b.dataset.printAttendance);if(a)printAttendance(a);return;}
 if(b.dataset.tab){state.tab=b.dataset.tab;if(state.tab==='messages')state.chatMobileOpen=false;render();if(state.tab==='messages')try{await refreshMessages()}catch(e){toast(e.message)}return;}
 if(b.dataset.mtab){state.managementTab=b.dataset.mtab;render();return;}
 if(b.dataset.editActivity){state.editActivity=b.dataset.editActivity;state.managementTab='activites';render();window.scrollTo({top:0,behavior:'smooth'});return;}
 if(b.dataset.editPole){state.editPole=b.dataset.editPole;state.managementTab='poles';render();window.scrollTo({top:0,behavior:'smooth'});return;}
 if(b.dataset.editMember){state.editMember=b.dataset.editMember;state.managementTab='benevoles';render();window.scrollTo({top:0,behavior:'smooth'});return;}
 if(b.dataset.editShift){state.editShift=b.dataset.editShift;render();return;}
 if(b.hasAttribute('data-reset-activity')){state.editActivity=null;render();return;}
 if(b.hasAttribute('data-reset-pole')){state.editPole=null;render();return;}
 if(b.hasAttribute('data-reset-member')){state.editMember=null;render();return;}
 if(b.dataset.chatIcon){
  if(!state.me?.admin||state.busy)return;
  const channel=state.chatChannel,channelId=state.chatId,icon=b.dataset.chatIcon;
  state.busy=true;b.disabled=true;
  try{
   await command('chat.icon.set',{channel,channelId,icon});
   // Conserver le salon ouvert et actualiser immédiatement l'icône,
   // même si les autres données de gestion prennent du temps à charger.
   const room=state.chatRooms.find(x=>x.channel===channel&&(x.id||null)===(channelId||null));
   if(room){room.icon=icon;room.image_id=null;}
   render();
   toast('Icône du groupe enregistrée.');
   try{await refreshChatSummary();render();}catch{}
  }catch(err){toast('Changement d’icône impossible : '+(err.message||'erreur de connexion'))}
  finally{state.busy=false}
  return;
 }
 if(b.hasAttribute('data-chat-back')){state.chatMobileOpen=false;render();return;}
 if(b.dataset.chatRoom){const [channel,id]=b.dataset.chatRoom.split(':');state.chatChannel=channel;state.chatId=id||null;state.chatMobileOpen=true;try{await refreshMessages()}catch(err){toast(err.message)}return;}
 if(b.dataset.deleteMessage){if(!confirm('Masquer ce message de la conversation ?'))return;await perform(async()=>command('message.delete',{id:b.dataset.deleteMessage}));try{await refreshMessages()}catch{}return;}
 if(b.dataset.checkin){await perform(async()=>command('checkin.set',{activityId:b.dataset.checkin,memberId:b.dataset.member,present:b.dataset.present==='1'}));return;}
 if(b.dataset.deleteTask){if(!confirm('Supprimer cette tâche ?'))return;await perform(async()=>command('task.delete',{id:b.dataset.deleteTask}));return;}
 if(b.dataset.taskStatus){await perform(async()=>command('task.status',{id:b.dataset.taskStatus,status:b.dataset.status}));return;}
 if(b.dataset.rsvp){await perform(async()=>{await command('activity.rsvp',{activityId:b.dataset.rsvp,answer:b.dataset.answer})});return;}
 if(b.dataset.shiftSign){await perform(async()=>{await command('shift.signup',{shiftId:b.dataset.shiftSign,remove:b.dataset.remove==='1'})});return;}
 if(b.hasAttribute('data-test-server-push')){
  const status=document.getElementById('teamPushStatus');b.disabled=true;
  if(status)status.textContent='Envoi d’une notification TEST depuis le serveur…';
  try{
   const result=await command('push.test',{});
   if(status)status.textContent='✅ '+result.message+' ('+result.accepted+' appareil(s) accepté(s)).';
   toast('Notification TEST envoyée : vérifie le téléphone.');
  }catch(error){if(status)status.textContent='❌ '+(error.message||'Échec du test serveur.');toast(error.message||'Échec du test serveur.');}
  finally{b.disabled=false;}
  return;
 }
 if(b.hasAttribute('data-test-local-push')){
  const status=document.getElementById('teamPushStatus');b.disabled=true;
  try{
   if(!window.ZikaPush?.localTest)throw Error('Service de test indisponible.');
   const message=await window.ZikaPush.localTest();
   if(status)status.textContent=message;
   toast('Test local demandé : consulte les notifications du téléphone.');
  }catch(error){if(status)status.textContent='❌ '+error.message;toast(error.message);}
  finally{b.disabled=false;}return;
 }
 if(b.hasAttribute('data-link-push')){
  const status=document.getElementById('teamPushStatus');b.disabled=true;
  try{
   if(!window.ZikaPush)throw Error('Notifications indisponibles.');
   const sub=await window.ZikaPush.enable();
   await command('push.link',{subscription:sub.toJSON()});linkedPushMember=state.me?.member?.id||null;
   if(status)status.textContent='✅ Appareil associé à ton compte ZikaTeam. Les alertes de tes réunions et missions pourront être reçues après activation du service d’envoi.';
   toast('Appareil associé à ZikaTeam.');
  }catch(error){if(status)status.textContent='❌ '+(error.message||'Activation impossible.');toast(error.message||'Activation impossible.');}
  finally{b.disabled=false;}return;
 }
 if(b.dataset.deletePole){
  if(!state.me.admin)return;
  const name=b.dataset.poleName||'ce pôle';
  if(!confirm('Supprimer définitivement « '+name+' » ?\n\nCette action est irréversible. Si des bénévoles, réunions ou messages y sont associés, la suppression sera refusée et tu pourras archiver le pôle à la place.'))return;
  await perform(async()=>{await command('pole.delete',{id:b.dataset.deletePole});if(state.editPole===b.dataset.deletePole)state.editPole=null;});
  return;
 }
 if(b.dataset.archivePole){if(!confirm(b.dataset.archived==='1'?'Réactiver ce pôle ?':'Archiver ce pôle ? Les affectations sont conservées, mais le pôle disparaît des activités courantes.'))return;await perform(async()=>command('pole.archive',{id:b.dataset.archivePole,archived:b.dataset.archived==='1'?false:true}));return;}
 if(b.dataset.removeMember){if(!confirm('Retirer ce bénévole du pôle ?'))return;await perform(async()=>command('assignment.set',{memberId:b.dataset.removeMember,poleId:b.dataset.fromPole,remove:true}));return;}
 if(b.dataset.removeShift){if(!confirm('Supprimer ce créneau et ses inscriptions ?'))return;await perform(async()=>command('shift.delete',{id:b.dataset.removeShift}));return;}
});
root.addEventListener('change',async e=>{
 if(e.target.matches('[data-dues-form] select[name="paid"]'))return;
 if(e.target.id==='teamChatIconUpload'){
  if(!state.me?.admin)return;
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024)return toast('Image JPEG, PNG ou WebP de moins de 2 Mo nécessaire.');
  const query=new URLSearchParams({channel:state.chatChannel});if(state.chatId)query.set('id',state.chatId);
  if(state.busy)return;state.busy=true;
  try{
   const response=await fetch('/zikateam/api/chat-icon?'+query,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Impossible de changer l’icône.');
   const room=state.chatRooms.find(x=>x.channel===state.chatChannel&&(x.id||null)===(state.chatId||null));
   if(room){room.image_id=data.id;room.icon='💬';}
   render();toast('Image du groupe enregistrée.');
   try{await refreshChatSummary();render();}catch{}
  }catch(err){toast(err.message||'Impossible de changer l’icône.')}
  finally{state.busy=false}
  return;
 }
 if(e.target.id==='teamChatAttachment'){
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)||file.size>8*1024*1024)return toast('Choisis une image ou un PDF de moins de 8 Mo.');
  await perform(async()=>{const query=new URLSearchParams({channel:state.chatChannel});if(state.chatId)query.set('id',state.chatId);const response=await fetch('/zikateam/api/chat-media?'+query,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name)},body:file});const data=await response.json();if(!response.ok)throw Error(data.error||'Impossible d’envoyer le média.');await refreshMessages()});return;
 }
 if(e.target.matches('input[data-photo-member]')){
  const file=e.target.files?.[0];if(!file)return;
  await perform(async()=>uploadTeamPhoto(e.target.dataset.photoMember,file));
  return;
 }
 if(e.target.matches('#teamCustomListForm input[name="column"]')){const key=e.target.value;if(e.target.checked){if(!state.listColumns.includes(key))state.listColumns.push(key);}else state.listColumns=state.listColumns.filter(x=>x!==key);render();return;}
 if(e.target.matches('[data-list-check]')){if(e.target.checked){if(!state.listSelected.includes(e.target.dataset.listCheck))state.listSelected.push(e.target.dataset.listCheck);}else state.listSelected=state.listSelected.filter(x=>x!==e.target.dataset.listCheck);render();return;}
 if(e.target.id==='teamListStatus'){state.listStatus=e.target.value;render();return;}
 if(e.target.id==='teamListRole'){state.listRole=e.target.value;render();return;}
 if(e.target.id==='teamListPole'){state.listPole=e.target.value;render();return;}
 const cf={teamDirectoryImage:'directoryImage',teamDirectoryPhone:'directoryPhone',teamDirectoryEmail:'directoryEmail',teamListImage:'listImage',teamListPhone:'listPhone',teamListEmail:'listEmail'};
 if(Object.hasOwn(cf,e.target.id)){state[cf[e.target.id]]=e.target.value;render();return;}
 if(e.target.id==='teamSigningFilter'){state.signingFilter=e.target.value;state.signingSelection=[];render();return;}
 if(e.target.id==='teamSigningPole'){state.signingPole=e.target.value;state.signingSelection=[];render();return;}
 if(e.target.matches('#signingAddForm input[name="member"]')){state.signingSelection=[...e.target.form.querySelectorAll('input[name="member"]:checked:not(:disabled)')].map(x=>x.value);return;}
 if(e.target.id==='teamAdhesionFilter'){state.adhesionFilter=e.target.value;render();return;}
 if(e.target.id==='teamChannel'){const [channel,id]=e.target.value.split(':');state.chatChannel=channel;state.chatId=id||null;try{await refreshMessages()}catch(err){toast(err.message)}}});
root.addEventListener('input',e=>{if(e.target.id==='teamDirectorySearch')state.directorySearch=e.target.value;if(e.target.matches('#teamCustomListForm input[name="title"]'))state.listTitle=e.target.value;});
// Entrée envoie le message ; Maj + Entrée ajoute une nouvelle ligne.
// Respecter les compositions de texte (claviers mobiles, accents et IME).
root.addEventListener('keydown',e=>{
 const field=e.target;
 if(!field.matches?.('#messageForm textarea[name="body"]')||e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229||e.ctrlKey||e.altKey||e.metaKey)return;
 e.preventDefault();
 if(state.busy||!field.value.trim())return;
 const form=field.closest('form');
 if(form?.requestSubmit)form.requestSubmit();
});
root.addEventListener('change',async e=>{
 const input=e.target;if(!input.matches?.('input[data-chat-mute]')||state.busy)return;
 const raw=input.dataset.chatMute,idx=raw.indexOf(':'),channel=raw.slice(0,idx),channelId=raw.slice(idx+1)||null;
 input.disabled=true;
 try{
  await command('notification.chat.mute',{channel,channelId,muted:input.checked});
  const old=state.me.mutedChats||[];
  state.me.mutedChats=input.checked?[...old.filter(x=>x.channel!==channel||(x.channel_id||'')!==(channelId||'')),{channel,channel_id:channelId||''}]:old.filter(x=>x.channel!==channel||(x.channel_id||'')!==(channelId||''));
  toast(input.checked?'Groupe mis en sourdine.':'Groupe réactivé.');
 }catch(err){input.checked=!input.checked;toast(err.message||'Impossible de modifier ce groupe.')}
 finally{input.disabled=false;}
});
root.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(state.busy){if(f.id==='memberForm'||f.id==='teamMemberFunctionsForm')toast('Enregistrement déjà en cours.');return;}
 if(f.id==='teamLoginPassword'){
  state.busy=true;try{await freeLoginPassword(f.elements.email.value,f.elements.password.value)}catch(err){state.loginEmail=f.elements.email.value;loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='teamSetPassword'){
  state.busy=true;try{await saveNewPassword(f.elements.password.value,f.elements.confirmation.value)}catch(err){passwordSetupScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='teamLoginRequest'){
  state.busy=true;try{await freeLoginRequest(f.elements.email.value,f.elements.name.value,f.elements.inviteCode?.value)}catch(err){loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='teamLoginVerify'){
  state.busy=true;try{await freeLoginVerify(f.elements.code.value)}catch(err){loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='charterAccept')return perform(async()=>command('charter.accept',{version:state.me.charter.version,agree:f.elements.agree.checked,consents:consentPayload(f)}));
 if(f.id==='consentForm')return perform(async()=>command('consents.save',{consents:consentPayload(f)}));
 if(f.id==='teamNotificationsForm')return perform(async()=>{
 const d=fromForm(f);
 await command('notification.settings',{preferences:{chat_mode:d.chat_mode,sound_mode:d.sound_mode,vibrate:f.elements.vibrate.checked,activity_enabled:f.elements.activity_enabled.checked,urgent_enabled:f.elements.urgent_enabled.checked,quiet_enabled:f.elements.quiet_enabled.checked,quiet_start:d.quiet_start,quiet_end:d.quiet_end}});
 });
 if(f.id==='teamSelfContactForm')return perform(async()=>{const d=fromForm(f);await command('contact.self',{phone:d.phone});});
 if(f.id==='messageForm'){
  const body=fromForm(f).body?.trim();if(!body)return;
  const send=f.querySelector('button[type="submit"]');if(send){send.disabled=true;send.textContent='Envoi…';}
  state.busy=true;
  try{await command('message.send',{channel:state.chatChannel,channelId:state.chatId,body});await refreshMessages();}
  catch(error){toast('Message non envoyé : '+(error.message||'Connexion indisponible'));if(send){send.disabled=false;send.textContent='Envoyer ➤';}}
  finally{state.busy=false}
  return;
 }
 if(f.hasAttribute('data-assignment-form'))return perform(async()=>{const d=fromForm(f);await command('assignment.set',{poleId:f.dataset.assignmentForm,memberId:d.memberId,role:d.role||'member'})});
 if(f.id==='poleForm')return perform(async()=>{const d=fromForm(f);await command('pole.save',{id:d.id||undefined,name:d.name,description:d.description});state.editPole=null});
 if(f.id==='teamMyProfileForm')return perform(async()=>{if(!state.me.admin)throw Error('Action réservée à l’administration.');const d=fromForm(f);await command('member.save',{id:state.me.member?.id||undefined,name:d.name,email:state.me.email,active:true});state.tab='fiche';});
 if(f.hasAttribute('data-directory-form'))return perform(async()=>{
  const data=fromForm(f);
  await command('member.name.set',{memberId:f.dataset.directoryForm,name:data.name});
  await command('contact.set',{memberId:f.dataset.directoryForm,phone:data.phone,address:data.address,postalCode:data.postalCode,city:data.city});
 });
 if(f.hasAttribute('data-dues-form'))return perform(async()=>{
  const d=fromForm(f);
  await command('dues.set',{memberId:f.dataset.duesForm,paid:d.paid==='1',paidOn:d.paidOn||null,paymentMethod:d.paymentMethod||null});
 });
 if(f.hasAttribute('data-member-review'))return perform(async()=>{
  const roles=rolePayload(f);
  await command('member.review',{email:f.dataset.memberReview,approve:true,name:f.elements.name.value,...roles});
 });
 if(f.id==='signingCreateForm')return perform(async()=>{
  const d=fromForm(f);
  const saved=await command('signing.create',{title:d.title,place:d.place,startsAt:new Date(d.startsAt).toISOString()});
  state.signingCurrent=saved.id;state.signingSelection=[];state.managementTab='emargements';
 });
 if(f.id==='signingAddForm')return perform(async()=>{
  const ids=[...f.querySelectorAll('input[name="member"]:checked:not(:disabled)')].map(x=>x.value);
  await command('signing.add',{sessionId:state.signingCurrent,memberIds:ids});
  state.signingSelection=[];
 });
 if(f.id==='teamCustomListForm')return perform(async()=>{const d=fromForm(f);const columns=state.listColumns;if(!columns.length)throw Error('Choisis au moins une colonne.');const saved=await command('list.save',{id:state.listId||undefined,title:d.title,columns,memberIds:state.listSelected});state.listId=saved.id;state.listTitle=d.title;state.listColumns=columns;});
 if(f.id==='teamMemberFunctionsForm')return saveFunctionsForm(f);
 if(f.id==='teamInviteForm')return perform(async()=>{
  const d=fromForm(f),created=await command('invite.create',{name:d.name,email:d.email});
  state.invitationDraft={name:created.name,email:created.email,code:created.code,expiresAt:created.expiresAt};
 });
 if(f.id==='memberForm')return saveVolunteerForm(f);
 if(f.id==='taskForm')return perform(async()=>{const d=fromForm(f);await command('task.save',{activityId:d.activityId,title:d.title,details:d.details,assigned_to:d.assigned_to||null,status:d.status})});
 if(f.id==='shiftForm')return perform(async()=>{const d=fromForm(f);await command('shift.save',{id:d.id||undefined,activityId:d.activityId,label:d.label,starts_at:new Date(d.starts_at).toISOString(),ends_at:new Date(d.ends_at).toISOString(),capacity:Number(d.capacity)});state.editShift=null});
 if(f.id==='charterForm')return perform(async()=>{const d=fromForm(f),pdf=f.elements.pdf.files[0];let documentId=state.me.charter?.document_id||null;if(pdf)documentId=await upload(pdf,'charter');await command('charter.save',{version:d.version,title:d.title,content:d.content,documentId})});
 if(f.id==='activityForm'){
  const d=fromForm(f),action=e.submitter?.value||'published';
  const feedback=f.querySelector('#activitySaveFeedback');
  const showError=(message,field)=>{
   if(feedback){feedback.hidden=false;feedback.textContent='❌ '+message;feedback.scrollIntoView({block:'center',behavior:'smooth'});}
   toast(message);if(field)f.querySelector(field)?.focus({preventScroll:true});
  };
  if(feedback){feedback.hidden=true;feedback.textContent='';}
  if(!['published','draft','cancelled'].includes(action))return showError('Action inconnue.');
  const poles=[...f.querySelectorAll('input[name="pole"]:checked')].map(x=>x.value);
  const pdf=f.elements.namedItem('pdf')?.files?.[0]||null;
  if(!d.audience)return showError('Choisis les destinataires de cette réunion.','select[name="audience"]');
  if(d.audience==='poles'&&!poles.length)return showError('Coche au moins un pôle concerné ou choisis un autre public.','input[name="pole"]');
  if(d.kind==='other'&&String(d.customKind||'').trim().length<3)return showError('Indique l’objet libre de cette activité.','input[name="customKind"]');
  const starts=new Date(d.starts_at),ends=new Date(d.ends_at);
  if(!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||ends<=starts)return showError('Vérifie les dates : la fin doit être après le début.','input[name="starts_at"]');
  const submit=e.submitter;
  state.busy=true;if(submit){submit.disabled=true;submit.textContent='Enregistrement…';}
  try{
   const current=state.manage?.activities?.find(a=>a.id===d.id);
   const body={id:d.id||undefined,kind:d.kind,customKind:d.kind==='other'?d.customKind:'',title:d.title,starts_at:starts.toISOString(),ends_at:ends.toISOString(),place:d.place,details:d.details,agenda:d.agenda,audience:d.audience,poles,status:pdf&&action==='published'?'draft':action,agenda_document_id:current?.agenda_document_id||null};
   const saved=await command('activity.save',body);
   if(pdf){
    const documentId=await upload(pdf,'agenda',saved.id);
    await command('activity.save',{...body,id:saved.id,status:action,agenda_document_id:documentId});
   }
   if(!saved.ok)throw Error('La publication n’a pas été confirmée par le serveur.');
   state.editActivity=null;
   toast(action==='published'?'Réunion publiée. Les bénévoles concernés sont informés automatiquement dans ZikaTeam.':action==='draft'?'Brouillon enregistré.':'Réunion annulée : les personnes concernées seront informées.');
   await refresh();
  }catch(error){showError('Impossible d’enregistrer : '+(error.message||'erreur de connexion'));if(submit){submit.disabled=false;submit.textContent=action==='published'?'Publier la réunion':action==='draft'?'Enregistrer en brouillon':'Annuler la réunion';}}
  finally{state.busy=false;}
  return;
 }
});
async function init(){
 try{
  const status=await fetch('/zikateam/api/auth/status',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(3500)});
  if(status.ok){state.freeLogin=true;}
  else if(status.status===503){root.innerHTML='<section class="team-card"><h2>Connexion ZikaTeam en cours de configuration</h2><p>Le service de connexion gratuit doit être configuré par l’administration.</p></section>';return;}
 }catch{}
 try{
  await refresh();
  if(state.tab==='messages')await refreshMessages();
 }catch(e){
  if(state.freeLogin){loginScreen();return;}
  root.innerHTML='<section class="team-card"><h1>Connexion ZikaTeam</h1><p>'+esc(e.message)+'</p><p>Utilise l’adresse e-mail autorisée par l’association. Si ton compte n’est pas encore créé, contacte ton responsable de pôle ou l’administration.</p><a class="team-button" href="/index.html#plus">Retour à l’application</a></section>';
 }
}
init();
// Actualiser discrètement les badges sans effacer le texte en cours de saisie.
// Une lecture de la conversation est enregistrée seulement quand elle est ouverte.
setInterval(async()=>{
 if(!state.me?.charterAccepted||state.me.pending||state.busy||document.visibilityState!=='visible')return;
 try{
  const previous=state.chatUnread;
  const current=state.chatRooms.find(r=>r.channel===state.chatChannel&&(r.id||null)===(state.chatId||null));
  const displayed=state.messages.at(-1)?.created_at||0;
  const draft=$('messageText')?.value||document.querySelector('#messageForm textarea[name="body"]')?.value||'';
  await refreshChatSummary();
  const next=state.chatRooms.find(r=>r.channel===state.chatChannel&&(r.id||null)===(state.chatId||null));
  const newer=state.tab==='messages'&&next?.last?.created_at>displayed;
  if(newer){
   await refreshMessages();
   const field=document.querySelector('#messageForm textarea[name="body"]');if(field)field.value=draft;
   const pane=$('teamMessages');if(pane)pane.scrollTop=pane.scrollHeight;
  }else if(state.tab==='messages'&&state.chatUnread!==previous){
   render();
   const field=document.querySelector('#messageForm textarea[name="body"]');if(field)field.value=draft;
  }else if(state.chatUnread!==previous){
   const tab=root.querySelector('button[data-tab="messages"]');
   if(tab){tab.textContent='Discussions';if(state.chatUnread){const badge=document.createElement('span');badge.className='team-unread team-tab-unread';badge.setAttribute('aria-label',state.chatUnread+' messages non lus');badge.textContent=state.chatUnread>99?'99+':String(state.chatUnread);tab.append(badge);}}
  }
 }catch{}
},20000);
})();