(()=>{
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(action,data){const r=await fetch('/api/push/'+action,{cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const result=await r.json();if(!r.ok)throw Error(result.error||'Service indisponible');return result}
const supported=()=>('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window);
async function registration(update=false){
 const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
 if(update){await reg.update();const worker=reg.installing||reg.waiting;
  if(worker){await new Promise((resolve,reject)=>{
   const t=setTimeout(()=>{worker.removeEventListener('statechange',check);reject(Error('Mise à jour encore en cours. Fermez puis rouvrez ZikaMansle.'))},15000);
   function check(){if(worker.state==='installed')worker.postMessage('ACTIVATE_UPDATE');if(worker.state==='activated'){clearTimeout(t);worker.removeEventListener('statechange',check);resolve()}else if(worker.state==='redundant'){clearTimeout(t);worker.removeEventListener('statechange',check);reject(Error('Mise à jour impossible. Rechargez la page avec Internet.'))}}
   worker.addEventListener('statechange',check);check();
  })}
 }
 return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Le service de notifications ne démarre pas. Rechargez la page avec Internet.')),15000))]);
}
async function localTest(){
 if(!supported()||Notification.permission!=='granted')throw Error('Autorisez les notifications avant ce test.');
 const reg=await registration(true);
 await reg.showNotification('Test ZikaMansle',{body:'Les notifications peuvent être affichées par ce navigateur.',icon:'/assets/icon-192.png',badge:'/assets/push-badge-z.png',tag:'zika-local-test',renotify:true,silent:false,vibrate:[120,70,120],data:{url:location.origin+'/#actualites'}});
 return 'Test demandé au téléphone. Vérifiez aussi le volet de notifications en haut de l’écran. Si rien ne s’affiche : Paramètres du téléphone → Applications → Samsung Internet (ou Chrome) → Notifications. Vérifiez également le mode Ne pas déranger.';
}
async function renewSubscription(previous){
 const config=await api('config');
 const reg=await registration(true);
 const existing=previous||await reg.pushManager.getSubscription();
 if(existing){try{await api('unsubscribe',{subscription:existing.toJSON()})}catch{}const cleared=await existing.unsubscribe();if(!cleared)throw Error('Impossible de réinitialiser cet abonnement. Fermez et rouvrez ZikaMansle.')}
 const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const replacement=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await api('subscribe',{subscription:replacement.toJSON()});
 return replacement;
}
async function prepareTest(){const reg=await registration(true),sub=await reg.pushManager.getSubscription();if(sub)await api('subscribe',{subscription:sub.toJSON()});return sub}
async function remoteTest(report){
 if(!supported()||Notification.permission!=='granted')throw Error('Activez les notifications sur ce téléphone avant le test.');
 report('Mise à jour de la réception des notifications…');
 const sub=await prepareTest();if(!sub)throw Error('Activez les notifications sur ce téléphone avant le test.');
 let subscription=sub.toJSON();report('Envoi du push depuis le serveur…');
 let result=await api('selftest',{subscription});
 if(!result.accepted&&(result.code===404||result.code===410)){
  report('Abonnement expiré (code '+result.code+'). Réinscription de ce téléphone…');
  const replacement=await renewSubscription(sub);
  subscription=replacement.toJSON();
  report('Nouvel abonnement créé. Nouvel envoi du test…');
  result=await api('selftest',{subscription});
 }
 if(!result.accepted){
  if(result.code===0){const stages={encryption:'préparation du message',signature:'signature du message',network:'connexion au service push',endpoint:'adresse du service push'};throw Error('Échec côté serveur : '+(stages[result.failure?.stage]||'envoi du message')+'. Référence : '+(result.failure?.stage||'unknown')+'/'+(result.failure?.kind||'Error')+'.')}
  throw Error('Le service push a refusé le message (code '+result.code+').');
 }
 report('Push accepté par le service. Attente de la réception sur ce téléphone…');
 for(let i=0;i<15;i++){
  await new Promise(resolve=>setTimeout(resolve,2000));
  const state=await api('test-status',{id:result.id,subscription});
  if(state.received){report(state.displayed?'Push reçu par ce navigateur. Le téléphone a accepté la demande d’affichage : vérifiez aussi son volet de notifications.':'Push reçu, mais le navigateur n’a pas pu afficher la notification. Vérifiez les autorisations du téléphone.');return}
 }
 report('Push accepté, mais aucune réception confirmée après 30 secondes. La réception peut être retardée. Le problème se situe avant la confirmation du navigateur ; ce test n’est pas considéré comme réussi.');
}
async function subscription(){return supported()?(await registration()).pushManager.getSubscription():null}
async function enable(){
 if(!supported())throw Error('Sur iPhone, ajoutez d’abord l’application à l’écran d’accueil depuis Safari, puis ouvrez-la. Sinon, utilisez un navigateur compatible.');
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications non autorisées. Vous pouvez changer ce choix dans les réglages du navigateur ou du téléphone.');
 const reg=await registration(true);let sub=await reg.pushManager.getSubscription();
 if(!sub)return renewSubscription();
 try{await api('subscribe',{subscription:sub.toJSON()})}catch(err){throw Error('Impossible d’enregistrer cet appareil : '+err.message)}return sub;
}
async function disable(){const sub=await subscription();if(sub){await api('unsubscribe',{subscription:sub.toJSON()});await sub.unsubscribe()}}
function mediaHTML(raw){try{const m=typeof raw==='string'?JSON.parse(raw):raw;if(!m||!/^\/api\/push\/media\?id=[a-f0-9-]{36}$/.test(m.url))return '';const url=escape(m.url);if(m.type?.startsWith('image/'))return '<img class="news-media" src="'+url+'" alt="Visuel de l’annonce" loading="lazy">';if(m.type==='video/mp4')return '<video class="news-media" src="'+url+'" controls preload="metadata"></video>';if(m.type==='application/pdf')return '<a class="small-link" href="'+url+'" target="_blank" rel="noopener">Ouvrir le document PDF →</a>';return ''}catch{return ''}}
window.zikaMediaHTML=mediaHTML;
window.ZikaPush={api,enable,subscription,prepareTest,localTest,remoteTest};
window.zikaNewsHTML=()=>'<div class="page"><header class="page-head"><span class="eyebrow">Festival ZikaMansle</span><h1>Actualités & notifications</h1><p>Les nouvelles du festival, au bon moment.</p></header><section class="push-panel"><h2>Gardons le contact</h2><p>Recevez les annonces et les informations pratiques, même lorsque l’application est fermée.</p><p id="pushStatus" role="status">Vérification…</p><div class="push-actions"><button id="pushEnable" type="button" class="button orange">Activer les notifications</button> <button id="pushDisable" type="button" class="button light">Désactiver les notifications</button></div><div class="push-actions"><button id="pushRemoteTest" type="button" class="button blue">Envoyer une notification de test sur ce téléphone</button></div><p id="pushTestStatus" role="status" aria-live="polite"></p><p class="map-help">Sur iPhone : ouvrez l’application ajoutée à l’écran d’accueil. L’autorisation reste votre choix.</p><details><summary>Vos données</summary><p>Nous conservons l’abonnement technique de cet appareil pour lui envoyer les messages du festival. Aucun nom, e-mail ou numéro de téléphone n’est demandé. Désactiver les notifications ici supprime cet abonnement. Association ZikaMansle : 07 82 36 40 30.</p></details></section><section id="newsList" aria-live="polite">Chargement des actualités…</section></div>';
window.zikaLoadNews=async()=>{
 const status=$('pushStatus'),yes=$('pushEnable'),no=$('pushDisable'),testButton=$('pushRemoteTest'),testStatus=$('pushTestStatus');
 if(!status||!yes||!no)return;
 async function state(){
  try{
   if(!supported()){yes.disabled=true;no.disabled=true;if(testButton)testButton.disabled=true;status.textContent='Notifications non prises en charge sur ce navigateur.';return}
   const on=!!(await subscription());
   yes.disabled=on;no.disabled=!on;if(testButton)testButton.disabled=!on;
   status.textContent=on?'Notifications activées sur cet appareil.':'Notifications désactivées sur cet appareil.';
  }catch(e){status.textContent='Impossible de vérifier les notifications : '+(e.message||String(e));yes.disabled=false;no.disabled=true}
 }
 async function change(action){
  yes.disabled=true;no.disabled=true;status.textContent='Mise à jour des notifications…';
  try{if(action==='enable')await enable();else await disable();await state()}
  catch(e){status.textContent=e.message||'Impossible de modifier les notifications.';await state();status.textContent=e.message||'Impossible de modifier les notifications.'}
 }
 yes.onclick=()=>change('enable');no.onclick=()=>change('disable');
 if(testButton)testButton.onclick=async()=>{
  testButton.disabled=true;
  testStatus.textContent='Préparation du test…';
  try{await remoteTest(message=>{if(testStatus.isConnected)testStatus.textContent=message})}
  catch(error){if(testStatus.isConnected)testStatus.textContent='Test impossible : '+(error.message||String(error))}
  finally{await state()}
 };
 await state();
 try{
  const {items}=await api('news');
  if(!$('newsList'))return;
  $('newsList').innerHTML='<h2>Le fil du festival</h2>'+(items.length?items.map(n=>'<article class="news-card"><time>'+new Date(n.created).toLocaleString('fr-FR')+'</time><h3>'+escape(n.title)+'</h3><p>'+escape(n.body)+'</p>'+mediaHTML(n.media)+'<a class="small-link" href="'+escape(n.url)+'">En savoir plus →</a></article>').join(''):'<p>Les prochaines annonces du festival apparaîtront ici.</p>');
 }catch(e){if($('newsList'))$('newsList').textContent='Actualités indisponibles. Vérifiez votre connexion Internet.'}
};
})();
