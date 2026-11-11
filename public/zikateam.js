(()=>{'use strict';
const root=document.getElementById('teamRoot'),$=id=>document.getElementById(id);
const state={me:null,manage:null,tab:'fiche',managementTab:'activites',editMember:null,editPole:null,editActivity:null,editShift:null,chatChannel:'general',chatId:null,messages:[],busy:false,freeLogin:false,loginEmail:'',codeSent:false,adhesionFilter:'pending',directorySearch:'',signing:null,signingCurrent:null,signingMember:null,signingFilter:'all',signingPole:'',signingStrokes:[],signingSelection:[]};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const dt=s=>s?new Date(s).toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Paris'}):'Date à définir';
const shortdt=s=>s?new Date(s).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Paris'}):'—';
const inputDate=s=>s?new Date(s).toLocaleString('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T'):'';
const kindName={meeting:'Réunion',stand:'Stand / permanence',mission:'Mission / animation',setup:'Montage / démontage'};
const statusName={draft:'Brouillon',published:'Publiée',cancelled:'Annulée'};
const responseName={yes:'Présent',no:'Absent',maybe:'À confirmer',pending:'Sans réponse'};
const toast=s=>{const el=$('teamToast');el.textContent=s;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,4500)};
async function api(path,data,options={}){
 const r=await fetch('/zikateam/api/'+path,{credentials:'same-origin',cache:'no-store',...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{}),...options});
 const raw=await r.text();let body;try{body=JSON.parse(raw)}catch{body={error:raw.slice(0,180)||'Connexion indisponible'}};
 if(!r.ok)throw Error(body.error||'L’opération a échoué.');return body;
}
const command=(op,data={})=>api('command',{op,...data});
const pills=arr=>arr.map(t=>'<span class="team-pill">'+esc(t)+'</span>').join('');
function header(){const m=state.me;return '<header class="team-heading"><span>Espace privé · '+(m.pending?'Inscription en attente':m.admin?'Administration et bénévoles':m.leadPoles.length?'Responsable et bénévoles':m.secretariat?'Secrétariat':'Bénévoles')+'</span><h1>Bonjour '+esc(m.member?.name||'ZikaTeam')+' !</h1><p class="team-muted">Vos équipes, vos rendez-vous et vos informations au même endroit.</p>'+(state.freeLogin?'<button type="button" class="team-button light" data-team-logout>Me déconnecter</button>':'')+'</header>';
}
function menu(){return '<nav class="team-tabs" aria-label="Rubriques ZikaTeam">'+(state.me.pending?[['fiche','Mon accueil'],['messages','Discussion générale']]:[
 ['fiche','Ma fiche'],['activites','Mon agenda'],['messages','Discussions'],...((state.me.admin||state.me.leadPoles.length||state.me.secretariat)?[['gestion',state.me.secretariat&&!state.me.admin&&!state.me.leadPoles.length?'Secrétariat':'Gestion des équipes']]:[])
 ]).map(([id,title])=>'<button type="button" data-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+title+'</button>').join('')+'</nav>'}
function consentQuestions(consents={}){
 const items=[
  ['image','Droit à l’image','J’autorise ZikaMansle à utiliser les photos et vidéos sur lesquelles je suis reconnaissable, réalisées lors des activités de l’association, pour communiquer sur ses événements (site, réseaux sociaux, affiches et publications).'],
  ['phone','Partage de mon téléphone','J’autorise les autres membres de mes pôles et leurs responsables à consulter mon numéro de téléphone pour l’organisation des activités.'],
  ['email','Partage de mon e-mail','J’autorise les autres membres de mes pôles et leurs responsables à consulter mon adresse e-mail pour l’organisation des activités.']
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
function quickAccess(){
 const actions=[['activites','calendar','Mes rendez-vous','Voir mes réunions, stands et réponses','agenda'],['messages','chat','Messagerie','Écrire à mon équipe','equipe'],...((state.me.admin||state.me.leadPoles.length||state.me.secretariat)?[['gestion','settings','Gérer les équipes','Pôles, bénévoles et missions','admin']]:[])];
 return '<section class="team-shortcuts" aria-label="Accès rapides">'+actions.map(([id,icon,title,desc,color])=>'<button type="button" class="team-shortcut team-shortcut-'+color+'" data-tab="'+id+'"><span class="team-shortcut-symbol" aria-hidden="true">'+(icon==='calendar'?'▣':icon==='chat'?'✉':'⚙')+'</span><span><strong>'+title+'</strong><small>'+desc+'</small></span><span aria-hidden="true">›</span></button>').join('')+'</section>';
}

function fiche(){const m=state.me;if(m.pending)return '<section class="team-card team-accent-orange" role="status"><span class="team-pill warn">Inscription en attente d’approbation</span><h2>Bienvenue dans ZikaTeam !</h2><p><strong>Ton adresse e-mail a bien été vérifiée et ta demande d’inscription est enregistrée.</strong> L’administration doit encore la valider et t’attribuer tes fonctions et tes pôles.</p><div class="team-notice"><strong>Ce que tu peux faire dès maintenant :</strong> relire la charte des bénévoles et consulter les messages de la discussion générale.</div><p><strong>Accès temporairement restreint :</strong> tu ne peux pas encore écrire dans les discussions, consulter les pôles privés, accéder aux plannings ni participer aux missions.</p><p><strong>Après validation de ton inscription :</strong> tu retrouveras les rubriques, équipes et fonctionnalités correspondant à ton rôle. Il suffira d’actualiser ton espace ou de te reconnecter.</p><button type="button" class="team-button orange" data-tab="messages">Lire la discussion générale</button></section>'+charterBlock();if(!m.member)return '<section class="team-card"><h2>Créer ma fiche personnelle</h2><p>Ton compte administrateur est connecté. Complète simplement ton nom pour disposer aussi d’une fiche bénévole.</p><form id="teamMyProfileForm" class="team-form"><label>Nom et prénom<input name="name" type="text" minlength="2" maxlength="110" autocomplete="name" required placeholder="Nom et prénom"></label><p class="team-small">Adresse de connexion : <strong>'+esc(m.email)+'</strong></p><button type="submit" class="team-button orange">Enregistrer ma fiche</button></form></section>'+charterBlock();
 const identity=m.admin?'<form id="teamMyProfileForm" class="team-form"><label>Nom et prénom<input name="name" type="text" minlength="2" maxlength="110" autocomplete="name" required value="'+esc(m.member.name)+'"></label><button type="submit" class="team-button orange">Enregistrer ma fiche</button></form>':'<strong>'+esc(m.member.name)+'</strong>';
 return quickAccess()+'<section class="team-grid"><div class="team-card team-accent-blue"><h2>Mes coordonnées</h2>'+identity+'<p>'+esc(m.member.email)+'</p><p class="team-muted">L’adresse de connexion ne peut être modifiée que dans l’administration.</p></div><div class="team-card team-accent-teal"><h2>Mes pôles</h2>'+(m.poles.length?m.poles.map(p=>'<div class="team-item"><h3>'+esc(p.name)+'</h3><span class="team-pill '+(p.role==='lead'?'ok':'')+'">'+(p.role==='lead'?'Responsable':'Membre de l’équipe')+'</span><p class="team-small">Responsables :</p>'+(p.leadersDetails?.length?'<div class="team-leaders">'+p.leadersDetails.map(x=>'<div class="team-person">'+avatar(x)+'<span>'+esc(x.name)+'</span></div>').join('')+'</div>':'<p>À désigner</p>')+'</div>').join(''):'<p>Ton affectation aux pôles sera ajoutée par l’administration ou ton responsable.</p>')+'</div></section>'+charterBlock()+'<section class="team-card"><h2>Mes prochains rendez-vous</h2>'+myActivities(3)+'</section><section class="team-card"><h2>Notifications de mon équipe</h2><p>Recevez les nouvelles convocations qui concernent tes pôles, sans être notifié pour les autres équipes.</p><button class="team-button light" data-link-push>Activer ou relier mes notifications</button><p class="team-small team-muted">Les notifications dépendent aussi des autorisations de ton téléphone et de la configuration du serveur.</p></section>';
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
 return '<article class="team-item"><div class="team-between"><div><span class="team-pill">'+esc(kindName[a.kind])+'</span><span class="team-pill '+color+'">'+esc(statusName[a.status])+'</span></div>'+(manageable?'<button class="team-button light" data-edit-activity="'+a.id+'">Modifier</button>':'')+'</div><h3>'+esc(a.title)+'</h3><p><strong>'+esc(dt(a.starts_at))+'</strong><br>Jusqu’au '+esc(shortdt(a.ends_at))+' · '+esc(a.place||'Lieu à préciser')+'</p>'+(poles.length?'<p>'+pills(poles)+'</p>':'')+(a.details?'<p>'+esc(a.details)+'</p>':'')+(a.agenda?'<details><summary><strong>Ordre du jour / consignes</strong></summary><p style="white-space:pre-wrap">'+esc(a.agenda)+'</p></details>':'')+(a.agenda_document_id?'<p><a class="team-link" target="_blank" rel="noopener" href="/zikateam/document/'+esc(a.agenda_document_id)+'">Document joint (PDF) ↗</a></p>':'')+shifts+tasksBlock(a,manageable)+buttons+(manageable?attendanceBlock(a)+'<p class="team-small">'+(a.invitedCount??0)+' personnes concernées · '+(a.responses||[]).filter(x=>x.answer==='yes').length+' présent(s), '+(a.responses||[]).filter(x=>x.answer==='no').length+' absent(s), '+(a.responses||[]).filter(x=>x.answer==='maybe').length+' à confirmer</p>'+(a.responses?.length?'<details><summary>Voir les réponses</summary><ul>'+a.responses.map(r=>'<li>'+esc(r.name)+' : '+esc(responseName[r.answer])+'</li>').join('')+'</ul></details>':''):'')+'</article>';
}
function myActivities(limit=0){const a=[...(state.me.activities||[])].sort((x,y)=>x.starts_at.localeCompare(y.starts_at));const results=limit?a.slice(0,limit):a;return results.length?results.map(x=>activityCard(x)).join(''):'<p class="team-muted">Aucune convocation à venir. Les réunions et missions apparaîtront ici dès leur publication.</p>'}
function activities(){return '<div class="team-card"><h2>Mon agenda ZikaTeam</h2><p>Réunions, stands, montage et missions de mes pôles. Choisis ta disponibilité pour chaque activité.</p>'+(!state.me.charterAccepted?'<div class="team-warning">Accepte d’abord la charte pour confirmer ta présence.</div>':'')+myActivities()+'</div>'}
function messages(){if(!state.me.member&&!state.me.admin)return '<div class="team-card">Connecte-toi avec une fiche bénévole pour participer aux discussions.</div>';
 let choices=state.me.pending?[['general','','Discussion générale']]:[['general','','Discussion générale'],...((state.me.admin||state.me.leadPoles.length)?[['leaders','','Entre responsables']]:[]),...(state.me.admin?(state.manage?.poles||[]):state.me.poles).filter(p=>!p.archived).map(p=>['pole',p.id,p.name]),...(state.me.admin?(state.manage?.activities||[]):state.me.activities).filter(a=>a.status==='published').slice(0,100).map(a=>['activity',a.id,a.title])];
 return '<div class="team-card team-accent-purple"><h2>Messagerie ZikaTeam</h2><p>Choisis une discussion : générale, celle de ton pôle, une activité ou, si tu es responsable, le salon réservé aux référents.</p><label class="team-form">Conversation <select id="teamChannel">'+choices.map(([c,id,label])=>'<option value="'+esc(c+':'+id)+'" '+(state.chatChannel===c&&state.chatId===(id||null)?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label><div id="teamMessages" aria-live="polite">'+(state.messages.length?state.messages.map(m=>'<article class="team-message"><strong>'+esc(m.author)+'</strong><time>'+shortdt(m.created_at)+'</time><p>'+esc(m.body)+'</p>'+(state.me.admin||(state.me.leadPoles.length&&state.chatChannel==='pole')?'<button class="team-button danger" data-delete-message="'+m.id+'">Modérer / retirer</button>':'')+'</article>').join(''):'<p>Aucun message dans cette conversation.</p>')+'</div>'+(state.me.pending?'<div class="team-warning" role="status"><strong>Inscription en attente d’approbation.</strong> Tu peux lire la conversation générale, mais pas encore y répondre. Dès que l’administration aura validé ta fiche et attribué tes fonctions, les discussions et espaces autorisés pour ton rôle seront accessibles.</div>':'<form id="messageForm" class="team-composer"><label for="messageText">Votre message</label><textarea id="messageText" name="body" maxlength="1400" rows="3" required placeholder="Écrire à l’équipe…"></textarea><button class="team-button" type="submit">Envoyer le message</button></form>')+'</div>';
}
function management(){const data=state.manage;if(!data)return '<section class="team-card">Chargement des données de gestion…</section>';
 const tabs=[...((state.me.admin||state.me.leadPoles.length)?[['activites','Réunions & stands'],['poles','Pôles & équipes']]:[]),...((state.me.admin||state.me.secretariat)?[['emargements','Émargements'],['adhesions','Adhésions'],['annuaire','Annuaire']]:[]),...(state.me.admin?[['benevoles','Bénévoles'],['charte','Charte'],['journal','Historique']]:[])];
 return '<div class="team-card"><h2>'+ (state.me.admin?'Administration générale':state.me.leadPoles.length?'Gestion de mes pôles':'Secrétariat · suivi des présences')+'</h2><p>Les modifications sont tracées. Les responsables gèrent leurs pôles ; le secrétariat suit les présences de toutes les équipes ; l’administration conserve le contrôle général.</p><nav class="team-tabs">'+tabs.map(([id,title])=>'<button data-mtab="'+id+'" aria-current="'+(state.managementTab===id?'page':'false')+'">'+title+'</button>').join('')+'</nav></div>'+({activites:manageActivities,poles:managePoles,emargements:manageAttendance,benevoles:manageMembers,charte:manageCharter,adhesions:manageDues,annuaire:manageDirectory,journal:manageAudit}[state.managementTab]||manageActivities)();
}
const opt=(arr,selected)=>arr.map(([v,l])=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(l)+'</option>').join('');
function manageActivities(){const d={...state.manage,activities:state.manage.activities.filter(x=>x.can_edit)},a=d.activities.find(x=>x.id===state.editActivity)||{};const allp=state.me.admin?d.poles.filter(p=>!p.archived):d.poles;
 const audience=state.me.admin?[['all','Tous les bénévoles'],['leaders','Responsables uniquement'],['bureau','Bureau uniquement'],['poles','Pôles choisis']]:[['poles','Mes pôles']];
 return '<section class="team-card"><h2>'+(a.id?'Modifier une activité':'Créer une réunion, un stand ou une mission')+'</h2><form id="activityForm" class="team-form"><input type="hidden" name="id" value="'+esc(a.id||'')+'"><div class="team-split"><label>Type<select name="kind">'+opt(Object.entries(kindName),a.kind||'meeting')+'</select></label><label>Titre<input name="title" maxlength="120" value="'+esc(a.title||'')+'" required></label></div><div class="team-split"><label>Début<input name="starts_at" type="datetime-local" value="'+inputDate(a.starts_at)+'" required></label><label>Fin<input name="ends_at" type="datetime-local" value="'+inputDate(a.ends_at)+'" required></label></div><label>Lieu<input name="place" value="'+esc(a.place||'')+'" placeholder="Salle, place, adresse…"></label><label>Informations utiles<textarea name="details">'+esc(a.details||'')+'</textarea></label><label>Ordre du jour / consignes<textarea name="agenda" rows="5">'+esc(a.agenda||'')+'</textarea></label><label>Joindre un PDF (ordre du jour ou consignes)<input name="pdf" type="file" accept="application/pdf,.pdf"></label>'+(a.agenda_document_id?'<p><a class="team-link" href="/zikateam/document/'+a.agenda_document_id+'" target="_blank" rel="noopener">Pièce jointe actuelle ↗</a></p>':'')+'<label>Destinataires<select name="audience" id="activityAudience">'+opt(audience,a.audience||'poles')+'</select></label><fieldset class="team-fieldset"><legend>Choisir les pôles concernés</legend><div class="team-checks">'+(allp.length?allp.map(p=>'<label><input type="checkbox" name="pole" value="'+p.id+'" '+(a.poles?.includes(p.id)||(!a.id&&!state.me.admin)?'checked':'')+'>'+esc(p.name)+'</label>').join(''):'Aucun pôle créé')+'</div><p class="team-small team-muted">Les pôles sont utilisés lorsque « Pôles choisis » est sélectionné.</p></fieldset><label>État<select name="status">'+opt(Object.entries(statusName),a.status||'draft')+'</select></label><div class="team-row"><button type="submit" class="team-button orange">Enregistrer l’activité</button><button type="button" class="team-button light" data-reset-activity>Nouvelle activité</button></div><p class="team-small team-muted">La première publication prépare les convocations ciblées. Leur émission dépend de l’activation du service de notifications sur le serveur.</p></form></section><section class="team-card"><h2>Créneaux pour une activité</h2>'+shiftForm()+'</section><section class="team-card"><h2>Préparation, matériel et tâches</h2>'+taskForm()+'</section><section class="team-card"><h2>Activités et confirmations</h2>'+(d.activities.length?d.activities.map(a=>activityCard(a,true)).join(''):'<p>Pas encore d’activité.</p>')+'</section>';
}
function shiftForm(){const activities=state.manage.activities.filter(a=>a.can_edit);const s=activities.flatMap(a=>a.shifts||[]).find(s=>s.id===state.editShift)||{};
 return '<form class="team-form" id="shiftForm"><label>Activité<select name="activityId" required><option value="">Choisir une activité</option>'+activities.filter(a=>a.status!=='cancelled').map(a=>'<option value="'+a.id+'" '+(s.activity_id===a.id||(!s.id&&state.editActivity===a.id)?'selected':'')+'>'+esc(a.title)+'</option>').join('')+'</select></label><input type="hidden" name="id" value="'+esc(s.id||'')+'"><label>Nom du créneau<input name="label" value="'+esc(s.label||'')+'" placeholder="Ex. Buvette 14h–17h" required></label><div class="team-split"><label>Début<input name="starts_at" type="datetime-local" value="'+inputDate(s.starts_at)+'" required></label><label>Fin<input name="ends_at" type="datetime-local" value="'+inputDate(s.ends_at)+'" required></label></div><label>Places disponibles<input name="capacity" type="number" min="1" max="500" value="'+(s.capacity||2)+'" required></label><button class="team-button" type="submit">Enregistrer le créneau</button></form>'+(activities.flatMap(a=>(a.shifts||[]).map(s=>'<div class="team-row team-item"><div><strong>'+esc(s.label)+'</strong><div class="team-small">'+esc(a.title)+' · '+shortdt(s.starts_at)+' · '+s.signed_count+'/'+s.capacity+'</div></div><button class="team-button light" data-edit-shift="'+s.id+'">Modifier</button><button class="team-button danger" data-remove-shift="'+s.id+'">Supprimer</button></div>')).join(''));
}
function taskForm(){const a=state.manage.activities.filter(x=>x.can_edit);
 return '<form id="taskForm" class="team-form"><label>Activité<select name="activityId" required><option value="">Choisir une activité</option>'+a.filter(x=>x.status!=='cancelled').map(x=>'<option value="'+x.id+'" '+(state.editActivity===x.id?'selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select></label><label>Tâche / matériel à prévoir<input name="title" maxlength="160" placeholder="Ex. Préparer les tables et les chaises" required></label><label>Consignes<textarea name="details" maxlength="1500"></textarea></label><label>Attribuer à un bénévole (facultatif)<select name="assigned_to"><option value="">Équipe / non attribué</option>'+state.manage.members.filter(m=>m.active).map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label><label>État<select name="status"><option value="todo">À faire</option><option value="doing">En cours</option><option value="done">Terminée</option></select></label><button class="team-button orange" type="submit">Ajouter la tâche</button></form>';
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
 const form=admin?'<section class="team-card team-accent-blue"><h2>'+(selected.id?'Modifier le pôle':'Créer un pôle')+'</h2><form id="poleForm" class="team-form"><input type="hidden" name="id" value="'+esc(selected.id||'')+'"><label>Nom du pôle<input name="name" maxlength="100" value="'+esc(selected.name||'')+'" required></label><label>Présentation et missions<textarea name="description">'+esc(selected.description||'')+'</textarea></label><div class="team-row"><button class="team-button orange">Enregistrer</button><button type="button" class="team-button light" data-reset-pole>Nouveau pôle</button></div></form></section>':'';
 const panels=d.poles.map(p=>{
  const assigned=d.memberships.filter(x=>x.pole_id===p.id);
  const people=assigned.map(x=>({...d.members.find(m=>m.id===x.member_id),role:x.role})).filter(m=>m.id&&m.active);
  const managers=people.filter(x=>x.role==='lead'),members=people.filter(x=>x.role!=='lead');
  const leaders=managers.length?managers.map(m=>'<div class="team-leader-card">'+avatar(m)+'<div class="team-person-info"><strong>'+esc(m.name)+'</strong><small>Responsable de pôle</small>'+(admin?'<label class="team-photo-picker">Photo facultative<input data-photo-member="'+m.id+'" type="file" accept="image/jpeg,image/png,image/webp"></label>':'')+'</div>'+(admin?'<button class="team-button light" data-remove-member="'+m.id+'" data-from-pole="'+p.id+'">Retirer</button>':'')+'</div>').join(''):'<p class="team-muted">Aucun responsable désigné.</p>';
  const roster=members.length?members.map(m=>'<div class="team-member-row"><span>'+esc(m.name)+'</span>'+(admin?'<button type="button" class="team-button light" data-remove-member="'+m.id+'" data-from-pole="'+p.id+'">Retirer</button>':'')+'</div>').join(''):'<p class="team-muted">Pas encore de membre.</p>';
  const assignment=admin&&!p.archived?'<form class="team-form" data-assignment-form="'+p.id+'"><label>Ajouter un bénévole<select name="memberId" required><option value="">Choisir une personne</option>'+d.members.filter(m=>m.active).map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label><label>Sa fonction<select name="role"><option value="member">Bénévole</option><option value="lead">Responsable du pôle</option></select></label><button class="team-button orange">Ajouter au pôle</button></form>':'';
  return '<article class="team-item team-pole-panel"><div class="team-between"><div><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'Aucune description renseignée.')+'</p></div><div class="team-row"><button type="button" class="team-button orange" data-print-team="'+p.id+'">Imprimer la liste</button>'+(admin?'<button type="button" class="team-button light" data-edit-pole="'+p.id+'">Modifier</button><button type="button" class="team-button '+(p.archived?'light':'danger')+'" data-archive-pole="'+p.id+'" data-archived="'+p.archived+'">'+(p.archived?'Réactiver':'Archiver')+'</button>':'')+'</div></div><h4>Responsables</h4><div class="team-leaders">'+leaders+'</div><details class="team-pole-members"><summary>Membres du pôle ('+members.length+')</summary>'+roster+'</details>'+assignment+'</article>';
 }).join('');
 return form+'<section class="team-card team-accent-teal"><h2>'+ (admin?'Pôles et responsables':'Mes équipes — consulter et imprimer')+'</h2><p class="team-muted">'+(admin?'Gestion des responsables, équipes et affectations.':'Les responsables peuvent consulter et imprimer leur équipe. Seuls les numéros et e-mails dont le partage a été autorisé apparaissent.')+'</p>'+(d.poles.length?panels:'<p>Aucun pôle disponible.</p>')+'</section>';
}

function roleAssignmentFields(member={}){
 const data=state.manage,links=data.memberships.filter(x=>x.member_id===member.id);
 const roles=new Set(member.roles||[]),secretary=(data.secretariatIds||[]).includes(member.id);
 return '<fieldset class="team-role-options"><legend>Fonctions dans ZikaTeam</legend><label class="team-check"><input type="checkbox" name="director" '+(roles.has('director')?'checked':'')+'> Dirigeant de l’association</label><label class="team-check"><input type="checkbox" name="bureau" '+(roles.has('bureau')?'checked':'')+'> Membre du bureau</label><label class="team-check"><input type="checkbox" name="secretariat" '+(secretary?'checked':'')+'> Secrétariat (émargements, adhésions et annuaire)</label><p class="team-small team-muted">Ces fonctions n’accordent pas automatiquement le rôle d’administrateur.</p></fieldset>'+
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
function manageMembers(){
 if(!state.me.admin)return '';
 const d=state.manage,requests=d.pendingRequests||[],chosen=d.members.find(x=>x.id===state.editMember)||{},members=d.members.filter(x=>x.active);
 const pending=requests.length?requests.map(r=>{
  const member=d.members.find(m=>m.email===r.email)||{name:r.name,email:r.email};
  return '<form class="team-card team-accent-orange team-form" data-member-review="'+esc(r.email)+'"><div class="team-between"><h3>Demande de '+esc(member.name||r.email)+'</h3><span class="team-pill warn">À valider</span></div><p class="team-small">'+esc(r.email)+' · Demande du '+esc(shortdt(r.requested_at))+'</p><label>Nom et prénom<input name="name" maxlength="110" required value="'+esc(member.name||r.name)+'"></label>'+roleAssignmentFields(member)+'<div class="team-row"><button class="team-button orange" type="submit">Approuver et enregistrer les fonctions</button><button class="team-button danger" type="button" data-reject-member="'+esc(r.email)+'">Refuser la demande</button></div></form>';
 }).join(''):'<section class="team-card team-accent-teal"><p>Aucune nouvelle demande pour le moment.</p></section>';
 const form='<section class="team-card team-accent-blue"><h2>'+(chosen.id?'Modifier une fiche':'Ajouter un bénévole')+'</h2><form id="memberForm" class="team-form"><input type="hidden" name="id" value="'+esc(chosen.id||'')+'"><div class="team-split"><label>Nom et prénom<input name="name" maxlength="110" value="'+esc(chosen.name||'')+'" required></label><label>E-mail de connexion<input name="email" type="email" maxlength="254" value="'+esc(chosen.email||'')+'" required></label></div><label class="team-check"><input type="checkbox" name="active" '+(!chosen.id||chosen.active?'checked':'')+'> Fiche active</label>'+roleAssignmentFields(chosen)+'<div class="team-row"><button class="team-button orange">Enregistrer la fiche et les fonctions</button><button class="team-button light" type="button" data-reset-member>Nouvelle fiche</button></div></form></section>';
 const cards=members.map(m=>{
  const list=d.memberships.filter(x=>x.member_id===m.id),byPole=list.map(x=>(d.poles.find(p=>p.id===x.pole_id)?.name||'')+(x.role==='lead'?' (responsable)':'')).filter(Boolean);
  const label=[...(m.roles||[]).map(v=>v==='director'?'Dirigeant':'Bureau'),...((d.secretariatIds||[]).includes(m.id)?['Secrétariat']:[]),...byPole];
  return '<article class="team-member-card"><div><strong>'+esc(m.name)+'</strong><p class="team-small">'+esc(m.email)+'</p><p class="team-small">'+(label.length?esc(label.join(' · ')):'Bénévole à répartir')+'</p></div><button type="button" class="team-button light" data-edit-member="'+m.id+'">Modifier</button></article>';
 }).join('');
 return '<section class="team-card team-accent-orange"><h2>Bénévoles à valider <span class="team-pill warn">'+requests.length+'</span></h2><p>Ces personnes ont vérifié leur adresse e-mail. Elles peuvent seulement lire les informations générales après acceptation de la charte. Leur accès complet attend ta validation.</p></section>'+pending+form+'<section class="team-card"><h2>Fiches bénévoles actives</h2>'+(cards||'<p>Aucune fiche active.</p>')+'</section>';
}
function manageCharter(){const c=state.me.charter||{};return '<section class="team-card"><h2>Charte officielle des bénévoles</h2><p>Publie la charte exacte de l’association. Chaque bénévole accepte la version en cours, avec enregistrement de la date et de son identité.</p><form id="charterForm" class="team-form"><label>Numéro de version<input name="version" maxlength="60" placeholder="Ex. 2026-11" value="'+esc(c.version||'')+'" required></label><label>Intitulé<input name="title" maxlength="140" value="'+esc(c.title||'Charte des bénévoles ZikaMansle')+'" required></label><label>Texte complet<textarea name="content" rows="12" required>'+esc(c.content||'')+'</textarea></label><label>Ajouter le PDF officiel<input name="pdf" type="file" accept="application/pdf,.pdf"></label><button type="submit" class="team-button orange">Publier / mettre à jour la charte</button></form><p class="team-warning">La charte est déjà publiée. Tu peux joindre le PDF officiel à cette version si son texte est identique, sans faire signer tout le monde à nouveau. Pour changer le contenu, publie une nouvelle version.</p></section>'}

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
function signingScreen(){
 const session=state.signing?.sessions.find(x=>x.id===state.signingCurrent);
 const member=session?.attendees.find(m=>m.member_id===state.signingMember&&!m.signed_at);
 if(!session||!member)return '';
 return '<section class="team-signing-overlay" aria-label="Signature de présence"><div class="team-signing-panel"><p class="team-signing-eyebrow">ZikaMansle · Signature de présence</p><h2>'+esc(member.display_name)+'</h2><p><strong>'+esc(member.quality)+'</strong> · '+esc(session.title)+'</p><p>Je confirme ma présence à cette réunion en traçant ma signature ci-dessous.</p><div class="team-signing-pad"><canvas id="teamSigningCanvas" width="1000" height="400" aria-label="Tracer votre signature avec le doigt ou la souris"></canvas></div><p class="team-small">Signez avec votre doigt sur le téléphone ou avec la souris sur ordinateur.</p><div class="team-row"><button class="team-button light" type="button" data-signing-clear>Effacer et recommencer</button><button class="team-button orange" type="button" data-signing-confirm>Valider ma signature</button><button class="team-button light" type="button" data-signing-return>Retour à la feuille</button></div></div></section>';
}
function setupSigningCanvas(){
 const canvas=document.getElementById('teamSigningCanvas');if(!canvas)return;
 const ctx=canvas.getContext('2d');
 const draw=()=>{ctx.clearRect(0,0,1000,400);ctx.strokeStyle='#132d49';ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';for(const stroke of state.signingStrokes){if(!stroke.length)continue;ctx.beginPath();ctx.moveTo(...stroke[0]);for(const p of stroke.slice(1))ctx.lineTo(...p);ctx.stroke();}};
 draw();
 let active=null;
 const loc=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1000,Math.round((e.clientX-r.left)*1000/r.width))),Math.max(0,Math.min(400,Math.round((e.clientY-r.top)*400/r.height)))];};
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
 const sessionList='<section class="team-card team-accent-teal"><h2>Feuilles d’émargement enregistrées</h2>'+(data.sessions.length?data.sessions.map(s=>'<div class="team-member-card"><div><strong>'+esc(s.title)+'</strong><p class="team-small">'+esc(dt(s.starts_at))+' · '+esc(s.place)+'</p><span class="team-pill '+(s.closed_at?'ok':'warn')+'">'+s.attendees.filter(m=>m.signed_at).length+'/'+s.attendees.length+' signatures'+(s.closed_at?' · Clôturée':' · En cours')+'</span></div><button class="team-button light" type="button" data-signing-open="'+s.id+'">Consulter</button></div>').join(''):'<p>Aucune feuille créée pour le moment.</p>')+'</section>';
 let current='';
 if(selected){
  current='<section class="team-card team-accent-purple"><div class="team-between"><div><h2>'+esc(selected.title)+'</h2><p>'+esc(dt(selected.starts_at))+' · '+esc(selected.place)+'</p><p><strong>'+signed.length+'</strong> signatures enregistrées · '+pending.length+' personnes à signer</p></div><span class="team-pill '+(selected.closed_at?'ok':'warn')+'">'+(selected.closed_at?'Clôturée':'En cours')+'</span></div><div class="team-export-tools"><button type="button" class="team-button light" data-signing-export="csv">CSV</button><button type="button" class="team-button light" data-signing-export="print">Imprimer</button><button type="button" class="team-button orange" data-signing-export="pdf">Créer un PDF avec signatures</button>'+(selected.closed_at?'':'<button type="button" class="team-button danger" data-signing-close>Clôturer la feuille</button>')+'</div></section>';
  if(!selected.closed_at){
   current+='<section class="team-card team-accent-blue"><h2>Ajouter les participants présents</h2><p>Sélectionne les personnes présentes, y compris après la création de la feuille. Elles pourront ensuite signer une par une sur ce téléphone.</p><form id="signingAddForm" class="team-form"><label>Afficher les bénévoles<select id="teamSigningFilter"><option value="all" '+(state.signingFilter==='all'?'selected':'')+'>Tous les bénévoles</option><option value="leaders" '+(state.signingFilter==='leaders'?'selected':'')+'>Responsables uniquement</option><option value="bureau" '+(state.signingFilter==='bureau'?'selected':'')+'>Bureau uniquement</option><option value="poles" '+(state.signingFilter==='poles'?'selected':'')+'>Par pôle</option></select></label>'+(state.signingFilter==='poles'?'<label>Choisir un pôle<select id="teamSigningPole"><option value="">Choisir un pôle</option>'+data.poles.map(p=>'<option value="'+p.id+'" '+(state.signingPole===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>':'')+'<div class="team-row"><button type="button" class="team-button light" data-signing-all>Tout sélectionner</button><button type="button" class="team-button light" data-signing-none>Tout désélectionner</button></div><div class="team-signing-choices">'+people.map(m=>'<label class="team-check"><input type="checkbox" name="member" value="'+esc(m.id)+'" '+(state.signingSelection.includes(m.id)?'checked':'')+' '+(selected.attendees.some(x=>x.member_id===m.id)?'disabled':'')+'><span>'+esc(m.name)+'</span><small>'+esc(m.quality)+'</small></label>').join('')+'</div><button class="team-button orange" type="submit">Ajouter les personnes sélectionnées</button></form></section>';
  }
  current+='<section class="team-card"><h2>Personnes présentes et signatures</h2>'+(selected.attendees.length?'<div class="team-signing-rows">'+selected.attendees.map(m=>'<div class="team-member-card"><div><strong>'+esc(m.display_name)+'</strong><p class="team-small">'+esc(m.quality)+'</p>'+(m.signed_at?'<span class="team-pill ok">Signé le '+esc(shortdt(m.signed_at))+'</span>':'<span class="team-pill warn">Signature en attente</span>')+'</div><div class="team-row">'+(m.signature_points?signingSVG(m.signature_points):'')+(!m.signed_at&&!selected.closed_at?'<button class="team-button orange" type="button" data-signing-member="'+m.member_id+'">Faire signer</button><button class="team-button light" type="button" data-signing-remove="'+m.member_id+'">Retirer</button>':'')+'</div></div>').join('')+'</div>':'<p>Ajoute les participants pour commencer à recueillir leurs signatures.</p>')+'</section>';
 }
 return create+sessionList+current+(state.signingMember?signingScreen():'');
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
 (rows.length?rows.map(d=>'<form class="team-dues-item team-form" data-dues-form="'+esc(d.member_id)+'"><div class="team-between"><div><strong>'+esc(d.name)+'</strong><p class="team-small">'+esc(d.contact.email||'')+' · '+esc(d.contact.phone||'Téléphone non renseigné')+'</p></div><span class="team-pill '+(d.paid?'ok':'warn')+'">'+(d.paid?'À jour':'En attente')+'</span></div><div class="team-split"><label>Statut<select name="paid"><option value="0" '+(!d.paid?'selected':'')+'>En attente</option><option value="1" '+(d.paid?'selected':'')+'>À jour</option></select></label><label>Règlement le (facultatif)<input type="date" name="paidOn" value="'+esc(d.paid_on||'')+'"></label><label>Moyen de paiement (facultatif)<select name="paymentMethod"><option value="">Non renseigné</option>'+Object.entries(paymentLabels).map(([k,v])=>'<option value="'+k+'" '+(d.payment_method===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><button class="team-button orange" type="submit">Enregistrer l’adhésion</button>'+(d.updated_at?'<p class="team-small team-muted">Modifiée le '+esc(shortdt(d.updated_at))+' par '+esc(d.updated_by)+'</p>':'')+'</form>').join(''):'<p>Aucune adhésion pour ce filtre.</p>')+'</section>';
}

function directoryFiltered(){
 const q=(state.directorySearch||'').toLocaleLowerCase('fr-FR').trim();
 return (state.manage?.contacts||[]).filter(m=>!q||[m.name,m.email,m.phone,m.address,m.postal_code,m.city].some(x=>String(x||'').toLocaleLowerCase('fr-FR').includes(q)));
}
function directoryRows(){
 return [['Nom et prénom','E-mail','Téléphone','Adresse','Code postal','Ville'],...directoryFiltered().map(m=>[m.name,m.email,m.phone,m.address,m.postal_code,m.city])];
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
 '<label class="team-directory-search">Rechercher un bénévole<input id="teamDirectorySearch" type="search" autocomplete="off" placeholder="Nom, e-mail, ville, téléphone…" value="'+esc(search)+'"></label>'+
 '<div class="team-export-tools"><span class="team-pill">'+rows.length+' / '+all.length+' bénévoles</span><button type="button" class="team-button light" data-export-directory="csv">Exporter CSV</button><button type="button" class="team-button light" data-export-directory="print">Imprimer A4</button><button type="button" class="team-button orange" data-export-directory="pdf">Créer un PDF</button></div>'+
 (rows.length?rows.map(m=>'<form class="team-form team-directory-card" data-directory-form="'+esc(m.member_id)+'"><div class="team-between"><div><strong>'+esc(m.name)+'</strong><p class="team-small">'+esc(m.email)+'</p></div><span class="team-pill ok">Bénévole</span></div><div class="team-split"><label>Téléphone<input name="phone" type="tel" maxlength="40" value="'+esc(m.phone)+'" placeholder="06…"></label><label>Adresse<input name="address" maxlength="280" value="'+esc(m.address)+'" placeholder="Rue, numéro…"></label><label>Code postal<input name="postalCode" maxlength="16" value="'+esc(m.postal_code)+'" placeholder="16230"></label><label>Ville<input name="city" maxlength="120" value="'+esc(m.city)+'" placeholder="Mansle-les-Fontaines"></label></div><button class="team-button orange" type="submit">Enregistrer les coordonnées</button>'+(m.updated_at?'<p class="team-small team-muted">Modifié le '+shortdt(m.updated_at)+' par '+esc(m.updated_by)+'</p>':'')+'</form>').join(''):'<p>Aucun bénévole ne correspond à cette recherche.</p>')+
 '</section>';
}

function manageAudit(){return '<section class="team-card"><h2>Journal d’administration</h2><p>Les principales modifications des bénévoles, pôles, activités et documents sont tracées.</p><div class="team-table-wrap"><table class="team-table"><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr></thead><tbody>'+state.manage.audit.map(x=>'<tr><td>'+shortdt(x.created_at)+'</td><td>'+esc(x.actor_email)+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.detail)+'</td></tr>').join('')+'</tbody></table></div></section>'}

function loginScreen(error=''){
 root.innerHTML='<section class="team-card" style="max-width:520px;margin:auto"><h1>Connexion gratuite à ZikaTeam</h1><p>Utilise l’adresse e-mail enregistrée par l’association. Tu recevras un code numérique par e-mail, sans compte Cloudflare.</p>'+
 (error?'<p class="team-warning" role="alert">'+esc(error)+'</p>':'')+
 (!state.codeSent?'<form id="teamLoginRequest" class="team-form"><label>Adresse e-mail<input type="email" name="email" maxlength="254" autocomplete="email" required placeholder="prenom@example.fr" value="'+esc(state.loginEmail)+'"></label><button class="team-button orange" type="submit">Recevoir mon code</button></form>':
 '<p>Code demandé pour <strong>'+esc(state.loginEmail)+'</strong>. Regarde aussi les courriers indésirables.</p><form id="teamLoginVerify" class="team-form"><label>Code reçu<input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}|[0-9]{8}" minlength="6" maxlength="8" required placeholder="Code à 8 chiffres"></label><button class="team-button orange" type="submit">Me connecter</button></form><button class="team-button light" type="button" data-team-reset>Changer d’adresse</button>')+
 '<p class="team-small team-muted">L’accès est réservé aux bénévoles préalablement inscrits dans ZikaTeam. En cas de difficulté, contacte l’administration.</p></section>';
}
async function freeLoginRequest(email){
 await api('auth/request',{email});
 state.loginEmail=email.trim().toLowerCase();state.codeSent=true;loginScreen();
 toast('Si ton adresse est autorisée, un code vient d’être demandé.');
}
async function freeLoginVerify(code){
 await api('auth/verify',{email:state.loginEmail,code:code.trim()});
 await refresh();state.codeSent=false;toast('Connexion réussie.');
}

function render(){
 if(!state.me)return;
 if(!state.me.charterAccepted){
  state.tab='fiche';
  const adminSetup=state.me.admin&&!state.me.charter;
  const profileSetup=state.me.admin&&!state.me.member;
  root.innerHTML=header()+'<div class="team-gate"><div class="team-card team-accent-orange"><span class="team-step">Étape obligatoire avant l’accès aux équipes</span><h2>'+(adminSetup?'Mettre en place la charte officielle':'Bienvenue dans ZikaTeam')+'</h2><p>'+(adminSetup?'L’administration doit d’abord publier la charte officielle. Les bénévoles ne pourront pas accéder à leur espace avant sa publication et leur acceptation.':'Lis et accepte la charte pour ouvrir ton espace personnel. Elle restera disponible ensuite dans « Ma fiche ».')+'</p></div>'+
   (profileSetup?fiche().split('</section>')[0]+'</section>':'')+
   (adminSetup?manageCharter():state.me.charter?charterBlock():'<section class="team-card team-accent-orange"><h2>Accès en préparation</h2><p>La charte officielle doit être publiée par l’administration avant ta première connexion.</p></section>')+'</div>';
  return;
 }
 if(state.me.pending&&state.tab!=='fiche'&&state.tab!=='messages')state.tab='fiche';
 root.innerHTML=header()+menu()+({fiche,activites:activities,messages,gestion:management}[state.tab]||fiche)();
 if(state.signingMember)setupSigningCanvas();
}
async function refresh(){
 state.me=await api('me');
 if(state.me.charterAccepted&&(state.me.admin||state.me.leadPoles.length||state.me.secretariat))state.manage=await api('manage');else state.manage=null;
 if(state.me.charterAccepted&&(state.me.admin||state.me.secretariat))state.signing=await api('signing');else state.signing=null;
 if(state.me.secretariat&&!state.me.admin&&!state.me.leadPoles.length&&state.managementTab==='activites')state.managementTab='emargements';
 render();
}
async function refreshMessages(){if(state.me?.pending){state.chatChannel='general';state.chatId=null;}const params=new URLSearchParams({channel:state.chatChannel});if(state.chatId)params.set('id',state.chatId);const response=await api('messages?'+params);state.messages=response.messages||[];if(state.tab==='messages')render();}
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
root.addEventListener('click',async e=>{const b=e.target.closest('button[data-team-logout],button[data-team-reset],button[data-delete-message],button[data-export-attendance],button[data-print-attendance],button[data-secretariat],button[data-print-team],button[data-signing-open],button[data-signing-member],button[data-signing-remove],button[data-signing-all],button[data-signing-none],button[data-signing-clear],button[data-signing-confirm],button[data-signing-return],button[data-signing-export],button[data-signing-close],button[data-reject-member],button[data-export-adhesions],button[data-export-directory],button[data-tab],button[data-mtab],button[data-rsvp],button[data-shift-sign],button[data-link-push],button[data-edit-activity],button[data-edit-pole],button[data-edit-member],button[data-edit-shift],button[data-archive-pole],button[data-remove-member],button[data-remove-shift],button[data-reset-activity],button[data-reset-pole],button[data-reset-member],button[data-checkin],button[data-delete-task],button[data-task-status]');if(!b)return;
 if(b.hasAttribute('data-team-reset')){state.codeSent=false;loginScreen();return;}
 if(b.hasAttribute('data-team-logout')){try{await api('auth/logout',{});}catch(e){toast(e.message)}state.me=null;state.manage=null;state.codeSent=false;loginScreen();return;}

 if(b.dataset.printTeam){printTeam(b.dataset.printTeam);return;}
 if(b.dataset.signingOpen){
  state.signingCurrent=b.dataset.signingOpen;state.signingMember=null;state.signingSelection=[];state.managementTab='emargements';render();return;
 }
 if(b.dataset.signingAll){state.signingSelection=signingMembers().map(m=>m.id).filter(id=>!state.signing.sessions.find(s=>s.id===state.signingCurrent)?.attendees.some(a=>a.member_id===id));render();return;}
 if(b.dataset.signingNone){state.signingSelection=[];render();return;}
 if(b.dataset.signingMember){state.signingMember=b.dataset.signingMember;state.signingStrokes=[];render();return;}
 if(b.dataset.signingReturn!==undefined){state.signingMember=null;state.signingStrokes=[];render();return;}
 if(b.dataset.signingClear!==undefined){state.signingStrokes=[];setupSigningCanvas();render();return;}
 if(b.dataset.signingConfirm!==undefined){
  if(!state.signingStrokes.length){toast('Trace ta signature avant de valider.');return;}
  await perform(async()=>{
   await command('signing.sign',{sessionId:state.signingCurrent,memberId:state.signingMember,strokes:state.signingStrokes});
   state.signingMember=null;state.signingStrokes=[];
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
 if(b.dataset.tab){state.tab=b.dataset.tab;render();if(state.tab==='messages')try{await refreshMessages()}catch(e){toast(e.message)}return;}
 if(b.dataset.mtab){state.managementTab=b.dataset.mtab;render();return;}
 if(b.dataset.editActivity){state.editActivity=b.dataset.editActivity;state.managementTab='activites';render();window.scrollTo({top:0,behavior:'smooth'});return;}
 if(b.dataset.editPole){state.editPole=b.dataset.editPole;state.managementTab='poles';render();window.scrollTo({top:0,behavior:'smooth'});return;}
 if(b.dataset.editMember){state.editMember=b.dataset.editMember;state.managementTab='benevoles';render();window.scrollTo({top:0,behavior:'smooth'});return;}
 if(b.dataset.editShift){state.editShift=b.dataset.editShift;render();return;}
 if(b.hasAttribute('data-reset-activity')){state.editActivity=null;render();return;}
 if(b.hasAttribute('data-reset-pole')){state.editPole=null;render();return;}
 if(b.hasAttribute('data-reset-member')){state.editMember=null;render();return;}
 if(b.dataset.deleteMessage){if(!confirm('Masquer ce message de la conversation ?'))return;await perform(async()=>command('message.delete',{id:b.dataset.deleteMessage}));try{await refreshMessages()}catch{}return;}
 if(b.dataset.checkin){await perform(async()=>command('checkin.set',{activityId:b.dataset.checkin,memberId:b.dataset.member,present:b.dataset.present==='1'}));return;}
 if(b.dataset.deleteTask){if(!confirm('Supprimer cette tâche ?'))return;await perform(async()=>command('task.delete',{id:b.dataset.deleteTask}));return;}
 if(b.dataset.taskStatus){await perform(async()=>command('task.status',{id:b.dataset.taskStatus,status:b.dataset.status}));return;}
 if(b.dataset.rsvp){await perform(async()=>{await command('activity.rsvp',{activityId:b.dataset.rsvp,answer:b.dataset.answer})});return;}
 if(b.dataset.shiftSign){await perform(async()=>{await command('shift.signup',{shiftId:b.dataset.shiftSign,remove:b.dataset.remove==='1'})});return;}
 if(b.hasAttribute('data-link-push')){await perform(async()=>{if(!window.ZikaPush)throw Error('Notifications indisponibles.');const sub=await window.ZikaPush.enable();await command('push.link',{subscription:sub.toJSON()});toast('Ton appareil est associé à ton espace ZikaTeam.')});return;}
 if(b.dataset.archivePole){if(!confirm(b.dataset.archived==='1'?'Réactiver ce pôle ?':'Archiver ce pôle ? Les affectations sont conservées, mais le pôle disparaît des activités courantes.'))return;await perform(async()=>command('pole.archive',{id:b.dataset.archivePole,archived:b.dataset.archived==='1'?false:true}));return;}
 if(b.dataset.removeMember){if(!confirm('Retirer ce bénévole du pôle ?'))return;await perform(async()=>command('assignment.set',{memberId:b.dataset.removeMember,poleId:b.dataset.fromPole,remove:true}));return;}
 if(b.dataset.removeShift){if(!confirm('Supprimer ce créneau et ses inscriptions ?'))return;await perform(async()=>command('shift.delete',{id:b.dataset.removeShift}));return;}
});
root.addEventListener('change',async e=>{
 if(e.target.matches('[data-dues-form] select[name="paid"]'))return;
 if(e.target.matches('input[data-photo-member]')){
  const file=e.target.files?.[0];if(!file)return;
  await perform(async()=>uploadTeamPhoto(e.target.dataset.photoMember,file));
  return;
 }
 if(e.target.id==='teamSigningFilter'){state.signingFilter=e.target.value;state.signingSelection=[];render();return;}
 if(e.target.id==='teamSigningPole'){state.signingPole=e.target.value;state.signingSelection=[];render();return;}
 if(e.target.matches('#signingAddForm input[name="member"]')){state.signingSelection=[...e.target.form.querySelectorAll('input[name="member"]:checked:not(:disabled)')].map(x=>x.value);return;}
 if(e.target.id==='teamAdhesionFilter'){state.adhesionFilter=e.target.value;render();return;}
 if(e.target.id==='teamChannel'){const [channel,id]=e.target.value.split(':');state.chatChannel=channel;state.chatId=id||null;try{await refreshMessages()}catch(err){toast(err.message)}}});
root.addEventListener('input',e=>{if(e.target.id==='teamDirectorySearch')state.directorySearch=e.target.value;});
root.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(state.busy)return;
 if(f.id==='teamLoginRequest'){
  state.busy=true;try{await freeLoginRequest(f.elements.email.value)}catch(err){loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='teamLoginVerify'){
  state.busy=true;try{await freeLoginVerify(f.elements.code.value)}catch(err){loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='charterAccept')return perform(async()=>command('charter.accept',{version:state.me.charter.version,agree:f.elements.agree.checked,consents:consentPayload(f)}));
 if(f.id==='consentForm')return perform(async()=>command('consents.save',{consents:consentPayload(f)}));
 if(f.id==='messageForm')return perform(async()=>{await command('message.send',{channel:state.chatChannel,channelId:state.chatId,body:fromForm(f).body});await refreshMessages()});
 if(f.hasAttribute('data-assignment-form'))return perform(async()=>{const d=fromForm(f);await command('assignment.set',{poleId:f.dataset.assignmentForm,memberId:d.memberId,role:d.role||'member'})});
 if(f.id==='poleForm')return perform(async()=>{const d=fromForm(f);await command('pole.save',{id:d.id||undefined,name:d.name,description:d.description});state.editPole=null});
 if(f.id==='teamMyProfileForm')return perform(async()=>{if(!state.me.admin)throw Error('Action réservée à l’administration.');const d=fromForm(f);await command('member.save',{id:state.me.member?.id||undefined,name:d.name,email:state.me.email,active:true});state.tab='fiche';});
 if(f.hasAttribute('data-directory-form'))return perform(async()=>{
  const data=fromForm(f);
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
 if(f.id==='memberForm')return perform(async()=>{const d=fromForm(f);await command('member.save',{id:d.id||undefined,name:d.name,email:d.email,active:f.elements.active.checked,...rolePayload(f)});state.editMember=null});
 if(f.id==='taskForm')return perform(async()=>{const d=fromForm(f);await command('task.save',{activityId:d.activityId,title:d.title,details:d.details,assigned_to:d.assigned_to||null,status:d.status})});
 if(f.id==='shiftForm')return perform(async()=>{const d=fromForm(f);await command('shift.save',{id:d.id||undefined,activityId:d.activityId,label:d.label,starts_at:new Date(d.starts_at).toISOString(),ends_at:new Date(d.ends_at).toISOString(),capacity:Number(d.capacity)});state.editShift=null});
 if(f.id==='charterForm')return perform(async()=>{const d=fromForm(f),pdf=f.elements.pdf.files[0];let documentId=state.me.charter?.document_id||null;if(pdf)documentId=await upload(pdf,'charter');await command('charter.save',{version:d.version,title:d.title,content:d.content,documentId})});
 if(f.id==='activityForm')return perform(async()=>{
  const d=fromForm(f),poles=[...f.querySelectorAll('input[name="pole"]:checked')].map(x=>x.value),pdf=f.elements.pdf.files[0];
  const current=state.manage.activities.find(x=>x.id===d.id);const body={id:d.id||undefined,kind:d.kind,title:d.title,starts_at:new Date(d.starts_at).toISOString(),ends_at:new Date(d.ends_at).toISOString(),place:d.place,details:d.details,agenda:d.agenda,audience:d.audience,poles,status:pdf&&(!current||current.status==='draft')?'draft':d.status,agenda_document_id:current?.agenda_document_id||null};
  const saved=await command('activity.save',body);if(pdf){const documentId=await upload(pdf,'agenda',saved.id);await command('activity.save',{...body,id:saved.id,status:d.status,agenda_document_id:documentId});}state.editActivity=null;
 });
});
async function init(){
 try{
  const status=await fetch('/zikateam/api/auth/status',{cache:'no-store',credentials:'same-origin'});
  if(status.ok){state.freeLogin=true;}
  else if(status.status===503){root.innerHTML='<section class="team-card"><h2>Connexion ZikaTeam en cours de configuration</h2><p>Le service de connexion gratuit doit être configuré par l’administration.</p></section>';return;}
 }catch{}
 try{
  await refresh();
  if(state.me.member&&state.me.charterAccepted){
   try{const sub=await window.ZikaPush?.subscription?.();if(sub)await command('push.link',{subscription:sub.toJSON()});}catch{}
  }
  if(state.tab==='messages')await refreshMessages();
 }catch(e){
  if(state.freeLogin){loginScreen();return;}
  root.innerHTML='<section class="team-card"><h1>Connexion ZikaTeam</h1><p>'+esc(e.message)+'</p><p>Utilise l’adresse e-mail autorisée par l’association. Si ton compte n’est pas encore créé, contacte ton responsable de pôle ou l’administration.</p><a class="team-button" href="/index.html#plus">Retour à l’application</a></section>';
 }
}
init();
})();