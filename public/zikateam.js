(()=>{'use strict';
const root=document.getElementById('teamRoot'),$=id=>document.getElementById(id);
const state={me:null,manage:null,tab:'fiche',managementTab:'activites',editMember:null,editPole:null,editActivity:null,editShift:null,chatChannel:'general',chatId:null,messages:[],busy:false,freeLogin:false,loginEmail:'',codeSent:false};
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
function header(){const m=state.me;return '<header class="team-heading"><span>Espace privé · '+(m.admin?'Administration et bénévoles':m.leadPoles.length?'Responsable et bénévoles':m.secretariat?'Secrétariat':'Bénévoles')+'</span><h1>Bonjour '+esc(m.member?.name||'ZikaTeam')+' !</h1><p class="team-muted">Vos équipes, vos rendez-vous et vos informations au même endroit.</p>'+(state.freeLogin?'<button type="button" class="team-button light" data-team-logout>Me déconnecter</button>':'')+'</header>';
}
function menu(){return '<nav class="team-tabs" aria-label="Rubriques ZikaTeam">'+[
 ['fiche','Ma fiche'],['activites','Mon agenda'],['messages','Discussions'],...((state.me.admin||state.me.leadPoles.length||state.me.secretariat)?[['gestion',state.me.secretariat&&!state.me.admin&&!state.me.leadPoles.length?'Secrétariat':'Gestion des équipes']]:[])
 ].map(([id,title])=>'<button type="button" data-tab="'+id+'" aria-current="'+(state.tab===id?'page':'false')+'">'+title+'</button>').join('')+'</nav>'}
function charterBlock(){
 const m=state.me;if(!m.charter)return '<div class="team-notice" role="status">La charte officielle sera disponible ici après publication.</div>';
 const c=m.charter,accepted=m.charterAccepted;
 const content='<div class="team-charter">'+esc(c.content)+'</div>'+(c.document_id?'<p><a class="team-link" href="/zikateam/document/'+esc(c.document_id)+'" target="_blank" rel="noopener">Ouvrir la charte officielle en PDF</a></p>':'');
 return '<section class="team-card team-charter-card '+(accepted?'team-charter-signed':'team-charter-required')+'"><div class="team-between"><h2>'+esc(c.title)+'</h2><span class="team-pill '+(accepted?'ok':'warn')+'">'+(accepted?'Acceptée':'Lecture obligatoire')+'</span></div>'+
 '<p class="team-muted">Version '+esc(c.version)+(m.charterAcceptedAt?' · Acceptée le '+shortdt(m.charterAcceptedAt):'')+'</p>'+
 (accepted?'<details class="team-charter-details"><summary>Relire la charte des bénévoles</summary>'+content+'</details>':content+
 '<p><strong>Pour accéder à ton espace ZikaTeam, tu dois avoir lu et accepté cette charte.</strong></p><form id="charterAccept" class="team-form"><label class="team-consent"><input type="checkbox" name="agree" required> J’ai lu la charte et j’accepte de m’y conformer.</label><button type="submit" class="team-button orange">J’accepte la charte et j’accède à ZikaTeam</button></form>')+
 '</section>';
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

function fiche(){const m=state.me;if(!m.member)return '<section class="team-card"><h2>Créer ma fiche personnelle</h2><p>Ton compte administrateur est connecté. Complète simplement ton nom pour disposer aussi d’une fiche bénévole.</p><form id="teamMyProfileForm" class="team-form"><label>Nom et prénom<input name="name" type="text" minlength="2" maxlength="110" autocomplete="name" required placeholder="Nom et prénom"></label><p class="team-small">Adresse de connexion : <strong>'+esc(m.email)+'</strong></p><button type="submit" class="team-button orange">Enregistrer ma fiche</button></form></section>'+charterBlock();
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
 let choices=[['general','','Discussion générale'],...((state.me.admin||state.me.leadPoles.length)?[['leaders','','Entre responsables']]:[]),...(state.me.admin?(state.manage?.poles||[]):state.me.poles).filter(p=>!p.archived).map(p=>['pole',p.id,p.name]),...(state.me.admin?(state.manage?.activities||[]):state.me.activities).filter(a=>a.status==='published').slice(0,100).map(a=>['activity',a.id,a.title])];
 return '<div class="team-card team-accent-purple"><h2>Messagerie ZikaTeam</h2><p>Choisis une discussion : générale, celle de ton pôle, une activité ou, si tu es responsable, le salon réservé aux référents.</p><label class="team-form">Conversation <select id="teamChannel">'+choices.map(([c,id,label])=>'<option value="'+esc(c+':'+id)+'" '+(state.chatChannel===c&&state.chatId===(id||null)?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label><div id="teamMessages" aria-live="polite">'+(state.messages.length?state.messages.map(m=>'<article class="team-message"><strong>'+esc(m.author)+'</strong><time>'+shortdt(m.created_at)+'</time><p>'+esc(m.body)+'</p>'+(state.me.admin||(state.me.leadPoles.length&&state.chatChannel==='pole')?'<button class="team-button danger" data-delete-message="'+m.id+'">Modérer / retirer</button>':'')+'</article>').join(''):'<p>Aucun message dans cette conversation.</p>')+'</div><form id="messageForm" class="team-composer"><label for="messageText">Votre message</label><textarea id="messageText" name="body" maxlength="1400" rows="3" required placeholder="Écrire à l’équipe…"></textarea><button class="team-button" type="submit">Envoyer le message</button></form></div>';
}
function management(){const data=state.manage;if(!data)return '<section class="team-card">Chargement des données de gestion…</section>';
 const tabs=[...((state.me.admin||state.me.leadPoles.length)?[['activites','Réunions & stands'],['poles','Pôles & équipes']]:[]),...((state.me.admin||state.me.secretariat)?[['emargements','Émargements'],['cotisations','Cotisations']]:[]),...(state.me.admin?[['benevoles','Bénévoles'],['charte','Charte'],['journal','Historique']]:[])];
 return '<div class="team-card"><h2>'+ (state.me.admin?'Administration générale':state.me.leadPoles.length?'Gestion de mes pôles':'Secrétariat · suivi des présences')+'</h2><p>Les modifications sont tracées. Les responsables gèrent leurs pôles ; le secrétariat suit les présences de toutes les équipes ; l’administration conserve le contrôle général.</p><nav class="team-tabs">'+tabs.map(([id,title])=>'<button data-mtab="'+id+'" aria-current="'+(state.managementTab===id?'page':'false')+'">'+title+'</button>').join('')+'</nav></div>'+({activites:manageActivities,poles:managePoles,emargements:manageAttendance,benevoles:manageMembers,charte:manageCharter,cotisations:manageDues,journal:manageAudit}[state.managementTab]||manageActivities)();
}
const opt=(arr,selected)=>arr.map(([v,l])=>'<option value="'+esc(v)+'" '+(v===selected?'selected':'')+'>'+esc(l)+'</option>').join('');
function manageActivities(){const d={...state.manage,activities:state.manage.activities.filter(x=>x.can_edit)},a=d.activities.find(x=>x.id===state.editActivity)||{};const allp=state.me.admin?d.poles.filter(p=>!p.archived):d.poles;
 const audience=state.me.admin?[['all','Tous les bénévoles'],['leaders','Uniquement les responsables'],['poles','Pôles choisis']]:[['poles','Mes pôles']];
 return '<section class="team-card"><h2>'+(a.id?'Modifier une activité':'Créer une réunion, un stand ou une mission')+'</h2><form id="activityForm" class="team-form"><input type="hidden" name="id" value="'+esc(a.id||'')+'"><div class="team-split"><label>Type<select name="kind">'+opt(Object.entries(kindName),a.kind||'meeting')+'</select></label><label>Titre<input name="title" maxlength="120" value="'+esc(a.title||'')+'" required></label></div><div class="team-split"><label>Début<input name="starts_at" type="datetime-local" value="'+inputDate(a.starts_at)+'" required></label><label>Fin<input name="ends_at" type="datetime-local" value="'+inputDate(a.ends_at)+'" required></label></div><label>Lieu<input name="place" value="'+esc(a.place||'')+'" placeholder="Salle, place, adresse…"></label><label>Informations utiles<textarea name="details">'+esc(a.details||'')+'</textarea></label><label>Ordre du jour / consignes<textarea name="agenda" rows="5">'+esc(a.agenda||'')+'</textarea></label><label>Joindre un PDF (ordre du jour ou consignes)<input name="pdf" type="file" accept="application/pdf,.pdf"></label>'+(a.agenda_document_id?'<p><a class="team-link" href="/zikateam/document/'+a.agenda_document_id+'" target="_blank" rel="noopener">Pièce jointe actuelle ↗</a></p>':'')+'<label>Destinataires<select name="audience" id="activityAudience">'+opt(audience,a.audience||'poles')+'</select></label><fieldset class="team-fieldset"><legend>Choisir les pôles concernés</legend><div class="team-checks">'+(allp.length?allp.map(p=>'<label><input type="checkbox" name="pole" value="'+p.id+'" '+(a.poles?.includes(p.id)||(!a.id&&!state.me.admin)?'checked':'')+'>'+esc(p.name)+'</label>').join(''):'Aucun pôle créé')+'</div><p class="team-small team-muted">Les pôles sont utilisés lorsque « Pôles choisis » est sélectionné.</p></fieldset><label>État<select name="status">'+opt(Object.entries(statusName),a.status||'draft')+'</select></label><div class="team-row"><button type="submit" class="team-button orange">Enregistrer l’activité</button><button type="button" class="team-button light" data-reset-activity>Nouvelle activité</button></div><p class="team-small team-muted">La première publication prépare les convocations ciblées. Leur émission dépend de l’activation du service de notifications sur le serveur.</p></form></section><section class="team-card"><h2>Créneaux pour une activité</h2>'+shiftForm()+'</section><section class="team-card"><h2>Préparation, matériel et tâches</h2>'+taskForm()+'</section><section class="team-card"><h2>Activités et confirmations</h2>'+(d.activities.length?d.activities.map(a=>activityCard(a,true)).join(''):'<p>Pas encore d’activité.</p>')+'</section>';
}
function shiftForm(){const activities=state.manage.activities.filter(a=>a.can_edit);const s=activities.flatMap(a=>a.shifts||[]).find(s=>s.id===state.editShift)||{};
 return '<form class="team-form" id="shiftForm"><label>Activité<select name="activityId" required><option value="">Choisir une activité</option>'+activities.filter(a=>a.status!=='cancelled').map(a=>'<option value="'+a.id+'" '+(s.activity_id===a.id||(!s.id&&state.editActivity===a.id)?'selected':'')+'>'+esc(a.title)+'</option>').join('')+'</select></label><input type="hidden" name="id" value="'+esc(s.id||'')+'"><label>Nom du créneau<input name="label" value="'+esc(s.label||'')+'" placeholder="Ex. Buvette 14h–17h" required></label><div class="team-split"><label>Début<input name="starts_at" type="datetime-local" value="'+inputDate(s.starts_at)+'" required></label><label>Fin<input name="ends_at" type="datetime-local" value="'+inputDate(s.ends_at)+'" required></label></div><label>Places disponibles<input name="capacity" type="number" min="1" max="500" value="'+(s.capacity||2)+'" required></label><button class="team-button" type="submit">Enregistrer le créneau</button></form>'+(activities.flatMap(a=>(a.shifts||[]).map(s=>'<div class="team-row team-item"><div><strong>'+esc(s.label)+'</strong><div class="team-small">'+esc(a.title)+' · '+shortdt(s.starts_at)+' · '+s.signed_count+'/'+s.capacity+'</div></div><button class="team-button light" data-edit-shift="'+s.id+'">Modifier</button><button class="team-button danger" data-remove-shift="'+s.id+'">Supprimer</button></div>')).join(''));
}
function taskForm(){const a=state.manage.activities.filter(x=>x.can_edit);
 return '<form id="taskForm" class="team-form"><label>Activité<select name="activityId" required><option value="">Choisir une activité</option>'+a.filter(x=>x.status!=='cancelled').map(x=>'<option value="'+x.id+'" '+(state.editActivity===x.id?'selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select></label><label>Tâche / matériel à prévoir<input name="title" maxlength="160" placeholder="Ex. Préparer les tables et les chaises" required></label><label>Consignes<textarea name="details" maxlength="1500"></textarea></label><label>Attribuer à un bénévole (facultatif)<select name="assigned_to"><option value="">Équipe / non attribué</option>'+state.manage.members.filter(m=>m.active).map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label><label>État<select name="status"><option value="todo">À faire</option><option value="doing">En cours</option><option value="done">Terminée</option></select></label><button class="team-button orange" type="submit">Ajouter la tâche</button></form>';
}
function managePoles(){
 const d=state.manage,selected=d.poles.find(x=>x.id===state.editPole)||{};
 const form='<section class="team-card team-accent-blue"><h2>'+(selected.id?'Modifier le pôle':'Créer un pôle')+'</h2><form id="poleForm" class="team-form"><input type="hidden" name="id" value="'+esc(selected.id||'')+'"><label>Nom du pôle<input name="name" maxlength="100" value="'+esc(selected.name||'')+'" required placeholder="Ex. ZikaVillage"></label><label>Présentation et missions<textarea name="description" placeholder="Rôle de l’équipe, consignes utiles…">'+esc(selected.description||'')+'</textarea></label><div class="team-row"><button class="team-button orange" type="submit">Enregistrer le pôle</button><button class="team-button light" type="button" data-reset-pole>Nouveau pôle</button></div></form></section>';
 const panels=d.poles.map(p=>{
  const assigned=d.memberships.filter(x=>x.pole_id===p.id);
  const managers=assigned.filter(x=>x.role==='lead').map(x=>d.members.find(m=>m.id===x.member_id)).filter(Boolean);
  const members=assigned.filter(x=>x.role!=='lead').map(x=>d.members.find(m=>m.id===x.member_id)).filter(Boolean);
  const leaders=managers.length?managers.map(m=>'<div class="team-leader-card">'+avatar(m)+'<div class="team-person-info"><strong>'+esc(m.name)+'</strong><small>Responsable de pôle</small>'+(state.me.admin?'<label class="team-photo-picker">'+(m.has_photo?'Changer la photo':'Ajouter une photo')+'<input data-photo-member="'+m.id+'" type="file" accept="image/jpeg,image/png,image/webp"></label>':'')+'</div>'+(state.me.admin?'<button class="team-button light" data-remove-member="'+m.id+'" data-from-pole="'+p.id+'">Retirer</button>':'')+'</div>').join(''):'<p class="team-muted">Aucun responsable désigné.</p>';
  const roster=members.length?members.map(m=>'<div class="team-member-row"><span>'+esc(m.name)+'</span><button type="button" class="team-button light" data-remove-member="'+m.id+'" data-from-pole="'+p.id+'">Retirer</button></div>').join(''):'<p class="team-muted">Pas encore de membre.</p>';
  const available=d.members.filter(m=>m.active);
  const assignment=!p.archived?'<form class="team-form team-assign-form" data-assignment-form="'+p.id+'"><label>Ajouter une personne<select name="memberId" required><option value="">Choisir un bénévole</option>'+available.map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label>'+(state.me.admin?'<label>Sa fonction<select name="role"><option value="member">Membre de l’équipe</option><option value="lead">Responsable du pôle</option></select></label>':'')+'<button class="team-button orange" type="submit">Ajouter au pôle</button></form>':'';
  return '<article class="team-item team-pole-panel"><div class="team-between"><div><h3>'+esc(p.name)+'</h3>'+(p.archived?'<span class="team-pill warn">Archivé</span>':'')+'<p>'+esc(p.description||'Aucune description renseignée.')+'</p></div><div class="team-row"><button type="button" class="team-button light" data-edit-pole="'+p.id+'">Modifier</button>'+(state.me.admin?'<button type="button" class="team-button '+(p.archived?'light':'danger')+'" data-archive-pole="'+p.id+'" data-archived="'+p.archived+'">'+(p.archived?'Réactiver':'Archiver')+'</button>':'')+'</div></div><h4>Responsables</h4><div class="team-leaders">'+leaders+'</div><details class="team-pole-members"><summary>Membres du pôle ('+members.length+')</summary>'+roster+'</details>'+assignment+'</article>';
 }).join('');
 return form+'<section class="team-card team-accent-teal"><h2>Pôles et responsables</h2><p class="team-muted">Choisis les responsables de chaque pôle, ajoute leur photo si tu le souhaites, puis affecte les bénévoles. Une personne peut faire partie de plusieurs pôles.</p>'+(d.poles.length?panels:'<p>Aucun pôle. Crée le premier avec le formulaire ci-dessus.</p>')+'</section>';
}
function manageMembers(){if(!state.me.admin)return '';const d=state.manage,m=d.members.find(x=>x.id===state.editMember)||{};const secretaryIds=new Set(d.secretariatIds||[]);return '<section class="team-card"><h2>'+(m.id?'Modifier le bénévole':'Ajouter un bénévole')+'</h2><form id="memberForm" class="team-form"><input type="hidden" name="id" value="'+esc(m.id||'')+'"><label>Nom et prénom<input name="name" maxlength="110" value="'+esc(m.name||'')+'" required></label><label>Adresse e-mail de connexion<input name="email" type="email" value="'+esc(m.email||'')+'" required></label><label class="team-row"><input type="checkbox" name="active" '+(!m.id||m.active?'checked':'')+'> Compte autorisé</label><div class="team-row"><button class="team-button orange">Enregistrer</button><button class="team-button light" type="button" data-reset-member>Nouveau bénévole</button></div><p class="team-small">Les bénévoles se connectent avec leur adresse enregistrée ici. L’adresse administrateur reste autorisée séparément.</p></form></section><section class="team-card"><h2>Liste des bénévoles</h2><div class="team-table-wrap"><table class="team-table"><thead><tr><th>Nom</th><th>E-mail</th><th>État</th><th>Fonction</th><th>Action</th></tr></thead><tbody>'+d.members.map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+esc(m.email)+'</td><td>'+(m.active?'Actif':'Désactivé')+'</td><td>'+(secretaryIds.has(m.id)?'Secrétariat':'Bénévole / responsable')+'</td><td><div class="team-row"><button class="team-button light" data-edit-member="'+m.id+'">Modifier</button><button class="team-button '+(secretaryIds.has(m.id)?'danger':'light')+'" data-secretariat="'+m.id+'" data-enabled="'+(secretaryIds.has(m.id)?'0':'1')+'" '+(!m.active?'disabled':'')+'>'+(secretaryIds.has(m.id)?'Retirer du secrétariat':'Nommer au secrétariat')+'</button></div></td></tr>').join('')+'</tbody></table></div></section>';
}
function manageCharter(){const c=state.me.charter||{};return '<section class="team-card"><h2>Charte officielle des bénévoles</h2><p>Publie la charte exacte de l’association. Chaque bénévole accepte la version en cours, avec enregistrement de la date et de son identité.</p><form id="charterForm" class="team-form"><label>Numéro de version<input name="version" maxlength="60" placeholder="Ex. 2026-11" value="'+esc(c.version||'')+'" required></label><label>Intitulé<input name="title" maxlength="140" value="'+esc(c.title||'Charte des bénévoles ZikaMansle')+'" required></label><label>Texte complet<textarea name="content" rows="12" required>'+esc(c.content||'')+'</textarea></label><label>Ajouter le PDF officiel<input name="pdf" type="file" accept="application/pdf,.pdf"></label><button type="submit" class="team-button orange">Publier / mettre à jour la charte</button></form><p class="team-warning">Après toute modification du contenu, utilise une nouvelle version pour demander une nouvelle acceptation.</p></section>'}

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
function manageAttendance(){
 const acts=state.manage.activities.filter(a=>a.status==='published');
 return '<section class="team-card"><h2>Secrétariat · feuilles d’émargement</h2><p class="team-muted">Pointage des présences sur place, téléchargement CSV et feuilles à imprimer pour recueillir les signatures. Les opérations sont tracées et restent visibles par l’administration.</p></section>'+
 (acts.length?acts.map(a=>'<section class="team-card"><div class="team-between"><div><h3>'+esc(a.title)+'</h3><p>'+esc(dt(a.starts_at))+' · '+esc(a.place||'Lieu à préciser')+'</p><p class="team-small">'+(a.invitedCount||0)+' bénévoles concernés · '+(a.attendance||[]).filter(m=>m.checked_in_at).length+' pointés présents</p></div><div class="team-row"><button class="team-button light" type="button" data-export-attendance="'+a.id+'">Exporter CSV</button><button class="team-button orange" type="button" data-print-attendance="'+a.id+'">Imprimer</button></div></div>'+attendanceBlock(a)+'</section>').join(''):'<section class="team-card"><p>Aucune activité publiée à émarger.</p></section>');
}

function manageDues(){
 if(!state.me.admin&&!state.me.secretariat)return '<section class="team-card">Accès réservé au secrétariat.</section>';
 const rows=state.manage.dues||[];
 const paid=rows.filter(x=>Boolean(x.paid)).length;
 return '<section class="team-card team-accent-teal"><h2>Suivi des cotisations</h2><p>Pour chaque bénévole, indique si l’adhésion est à jour et sa date. Ces informations sont réservées au secrétariat et à l’administration.</p><div class="team-dues-summary"><span><strong>'+paid+'</strong> à jour</span><span><strong>'+(rows.length-paid)+'</strong> à vérifier</span></div>'+
 (rows.length?rows.map(d=>'<form class="team-dues-item team-form" data-dues-form="'+esc(d.member_id)+'"><div class="team-between"><strong>'+esc(d.name)+'</strong><span class="team-pill '+(d.paid?'ok':'warn')+'">'+(d.paid?'À jour':'Non à jour')+'</span></div><div class="team-split"><label>Adhésion à jour<select name="paid"><option value="0" '+(!d.paid?'selected':'')+'>Non</option><option value="1" '+(d.paid?'selected':'')+'>Oui</option></select></label><label>Date de la cotisation<input type="date" name="paidOn" value="'+esc(d.paid_on||'')+'" '+(d.paid?'required':'')+'></label></div><button class="team-button orange" type="submit">Enregistrer la cotisation</button>'+(d.updated_at?'<p class="team-small team-muted">Dernière mise à jour le '+esc(shortdt(d.updated_at))+' par '+esc(d.updated_by)+'</p>':'')+'</form>').join(''):'<p>Aucun bénévole actif pour le moment.</p>')+'</section>';
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
 root.innerHTML=header()+menu()+({fiche,activites:activities,messages,gestion:management}[state.tab]||fiche)();
}
async function refresh(){state.me=await api('me');if(state.me.charterAccepted&&(state.me.admin||state.me.leadPoles.length||state.me.secretariat))state.manage=await api('manage');else state.manage=null;if(state.me.secretariat&&!state.me.admin&&!state.me.leadPoles.length)state.managementTab='cotisations';render();}
async function refreshMessages(){const params=new URLSearchParams({channel:state.chatChannel});if(state.chatId)params.set('id',state.chatId);const response=await api('messages?'+params);state.messages=response.messages||[];if(state.tab==='messages')render();}
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
root.addEventListener('click',async e=>{const b=e.target.closest('button[data-team-logout],button[data-team-reset],button[data-delete-message],button[data-export-attendance],button[data-print-attendance],button[data-secretariat],button[data-tab],button[data-mtab],button[data-rsvp],button[data-shift-sign],button[data-link-push],button[data-edit-activity],button[data-edit-pole],button[data-edit-member],button[data-edit-shift],button[data-archive-pole],button[data-remove-member],button[data-remove-shift],button[data-reset-activity],button[data-reset-pole],button[data-reset-member],button[data-checkin],button[data-delete-task],button[data-task-status]');if(!b)return;
 if(b.hasAttribute('data-team-reset')){state.codeSent=false;loginScreen();return;}
 if(b.hasAttribute('data-team-logout')){try{await api('auth/logout',{});}catch(e){toast(e.message)}state.me=null;state.manage=null;state.codeSent=false;loginScreen();return;}
 if(b.dataset.secretariat){
  const enabled=b.dataset.enabled==='1';
  if(!confirm(enabled?'Confirmer la nomination au secrétariat ? Cette personne pourra consulter les présences de toutes les équipes.':'Retirer les droits du secrétariat à cette personne ?'))return;
  await perform(async()=>command('secretariat.set',{memberId:b.dataset.secretariat,enabled}));return;
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
 if(e.target.matches('[data-dues-form] select[name="paid"]')){
  const f=e.target.closest('form'),input=f.querySelector('input[name="paidOn"]');
  input.required=e.target.value==='1';
  return;
 }
 if(e.target.matches('input[data-photo-member]')){
  const file=e.target.files?.[0];if(!file)return;
  await perform(async()=>uploadTeamPhoto(e.target.dataset.photoMember,file));
  return;
 }
 if(e.target.id==='teamChannel'{const [channel,id]=e.target.value.split(':');state.chatChannel=channel;state.chatId=id||null;try{await refreshMessages()}catch(err){toast(err.message)}}});
root.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(state.busy)return;
 if(f.id==='teamLoginRequest'){
  state.busy=true;try{await freeLoginRequest(f.elements.email.value)}catch(err){loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='teamLoginVerify'){
  state.busy=true;try{await freeLoginVerify(f.elements.code.value)}catch(err){loginScreen(err.message)}finally{state.busy=false}return;
 }
 if(f.id==='charterAccept')return perform(async()=>command('charter.accept',{version:state.me.charter.version,agree:f.elements.agree.checked}));
 if(f.id==='messageForm')return perform(async()=>{await command('message.send',{channel:state.chatChannel,channelId:state.chatId,body:fromForm(f).body});await refreshMessages()});
 if(f.hasAttribute('data-assignment-form'))return perform(async()=>{const d=fromForm(f);await command('assignment.set',{poleId:f.dataset.assignmentForm,memberId:d.memberId,role:d.role||'member'})});
 if(f.id==='poleForm')return perform(async()=>{const d=fromForm(f);await command('pole.save',{id:d.id||undefined,name:d.name,description:d.description});state.editPole=null});
 if(f.id==='teamMyProfileForm')return perform(async()=>{if(!state.me.admin)throw Error('Action réservée à l’administration.');const d=fromForm(f);await command('member.save',{id:state.me.member?.id||undefined,name:d.name,email:state.me.email,active:true});state.tab='fiche';});
 if(f.hasAttribute('data-dues-form'))return perform(async()=>{
  const d=fromForm(f);
  await command('dues.set',{memberId:f.dataset.duesForm,paid:d.paid==='1',paidOn:d.paidOn||null});
 });
 if(f.id==='memberForm')return perform(async()=>{const d=fromForm(f);await command('member.save',{id:d.id||undefined,name:d.name,email:d.email,active:f.elements.active.checked});state.editMember=null});
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