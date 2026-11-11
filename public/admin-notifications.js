(async()=>{
 const $=id=>document.getElementById(id),P=window.ZikaPush;
 let busy=false,draftId=null,media=null;
 async function adminApi(action,data){
  const r=await fetch('/administration/api/'+action,{cache:'no-store',...(data!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
  let result;try{result=await r.json()}catch{throw Error('Connexion administrateur requise. Rechargez cette page pour vous identifier.')}
  if(!r.ok)throw Error(result.error||'Accès administrateur refusé.');return result;
 }
 async function loadNative(){
  const button=$('nativeTest'),status=$('nativeStatus');
  button.disabled=true;
  try {
   const data=await adminApi('native-status');
   $('nativeSubscribers').textContent=data.devices;
   status.textContent=!data.sendingConfigured
    ?'Envoi impossible : la clé Firebase du serveur n’est pas disponible.'
    :data.devices===0?'Aucun téléphone Android inscrit. Lancez ZikaMansle Test sur le Redmi, acceptez les notifications puis actualisez ici.'
    :data.devices===1?'Un appareil Android inscrit : le test ciblé est prêt.'
    :'Test bloqué : plusieurs appareils Android sont inscrits. Le test est réservé à un seul appareil.';
   button.disabled=busy||data.devices!==1||!data.sendingConfigured;
  }catch(e){status.textContent='Impossible de vérifier les appareils : '+e.message;button.disabled=true;}
 }
 async function load(){try{const d=await adminApi('admin');$('workspace').hidden=false;$('login').hidden=true;$('subscribers').textContent=d.subscribers;$('history').replaceChildren();
 for(const n of d.history){const a=document.createElement('article');a.className='news-card';const t=document.createElement('h3');t.textContent=(n.test?'TEST · ':'')+n.title;const date=document.createElement('time');date.textContent=new Date(n.created).toLocaleString('fr-FR');const p=document.createElement('p');p.textContent=n.body;const stats=document.createElement('p');stats.textContent=`${n.accepted} accepté(s) par le service · ${n.received||0} reçu(s) par le navigateur · ${n.displayed||0} affichage(s) demandé(s) au téléphone · ${n.pending} à envoyer · ${n.failed} en échec ou à vérifier`;a.append(date,t,p,stats);if(n.media){const m=document.createElement("div");m.innerHTML=window.zikaMediaHTML(n.media);a.append(m)}if(n.pending){const b=document.createElement('button');b.className='button light';b.textContent='Poursuivre cet envoi';b.onclick=()=>run(()=>deliver(n.id));a.append(b)}$('history').append(a)}return true
 }catch(e){$('status').textContent=e.message;$('login').hidden=false;return false}}
 function lock(value){busy=value;document.querySelectorAll('#workspace button,#compose input,#compose textarea,#compose select').forEach(b=>b.disabled=value)}
 async function run(fn){if(busy)return;lock(true);try{await fn();await load()}catch(e){$('status').textContent=e.message+' Vous pouvez reprendre l’envoi depuis l’historique.';await load()}finally{lock(false);await loadNative()}}
 async function deliver(id){let remaining;do{$('status').textContent='Envoi en cours… Gardez cette page ouverte.';remaining=(await adminApi('send',{id})).pending}while(remaining>0);$('status').textContent='Traitement terminé. Consultez le bilan dans l’historique.'}
 async function send(test){if(!$('compose').reportValidity())return;
 let sub;if(test){sub=await P.prepareTest();if(!sub)throw Error('Activez les notifications sur cet appareil avant de lancer le test.')}
 if(!test&&!confirm('Publier cette actualité et envoyer la notification à tous les appareils abonnés ?'))return;
 const id=test?crypto.randomUUID():(draftId||=crypto.randomUUID());
 await adminApi('create',{id,title:$('title').value,body:$('body').value,url:$('url').value,test,media,subscription:sub?.toJSON()});
 await deliver(id);if(!test){draftId=null;media=null;$('compose').reset();preview()}
 }
 function preview(){draftId=null;$('previewMedia').innerHTML=window.zikaMediaHTML(media);$('removeMedia').hidden=!media;$('previewTitle').textContent=$('title').value||'Le titre de votre message';$('previewBody').textContent=$('body').value||'Le texte apparaîtra ici.'}
 async function sendNativeTest(){
  if(busy)return;
  const button=$('nativeTest'),status=$('nativeStatus');
  busy=true;button.disabled=true;
  status.textContent='Envoi du test Android à Firebase en cours…';
  try{
   const sent=await adminApi('native-test',{});
   status.textContent=sent.accepted
    ?'Notification acceptée par Firebase (code '+sent.code+'). Vérifiez le Redmi, même avec l’application fermée. Cela ne prouve pas encore sa réception.'
    :'Notification refusée par Firebase (code '+sent.code+'). Vérifiez la configuration FCM.';
  }catch(e){
   status.textContent='Échec du test Android : '+e.message;
  }finally{
   busy=false;
   // Do not refresh native-status here: doing so used to erase the test result.
   // Keep disabled on errors until the user explicitly refreshes device status.
  }
 }
 $('nativeTest').onclick=sendNativeTest;
 $('nativeRefresh').onclick=loadNative;
 $('media').onchange=()=>run(async()=>{const file=$('media').files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Le média doit peser moins de 8 Mo.');$('status').textContent='Import du média…';const r=await fetch('/administration/api/upload',{method:'POST',headers:{'Content-Type':file.type},body:file});const result=await r.json();if(!r.ok)throw Error(result.error);media=result;preview();$('status').textContent='Média prêt à joindre.'});
 $('removeMedia').onclick=()=>{media=null;$('media').value='';preview()};
 $('clearHistory').onclick=()=>run(async()=>{if(!confirm('Effacer l’historique et retirer les anciennes actualités ? Les abonnements seront conservés.'))return;await adminApi('clear-history',{});$('status').textContent='Historique effacé. Abonnements conservés.'});
 $('localTest').onclick=()=>run(async()=>{$('status').textContent=await P.localTest()});$('refreshHistory').onclick=()=>run(async()=>{await load();$('status').textContent='Bilan actualisé. Les anciens tests ne disposent pas d’accusé de réception.'});
 $('compose').oninput=preview;$('compose').onsubmit=e=>{e.preventDefault();run(()=>send(false))};$('test').onclick=()=>run(()=>send(true));$('activate').onclick=()=>run(async()=>{await P.enable();$('status').textContent='Notifications activées. Vous pouvez tester un message sur cet appareil.'});
 if(await load())$('status').textContent='Accès administrateur confirmé. Préparez votre message ci-dessous.';
 await loadNative();
})();
