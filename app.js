(()=>{
 'use strict';
 if(new URLSearchParams(location.search).get('studio')==='1'||window.top!==window.self)return;
 let installPrompt,registration;

 // Push facultatif : activé seulement lorsque le serveur et la clé VAPID publique sont configurés.
 const toApplicationServerKey=value=>{
  const b64=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);
  const raw=atob(b64);
  return Uint8Array.from(raw,character=>character.charCodeAt(0));
 };
 async function prepareZikaPush(reg){
  const cfg=window.ZIKA_PUSH_CONFIG||window.ZIKA_CONFIG?.push;
  if(!cfg?.vapidPublicKey||!cfg?.subscribeUrl||!('PushManager' in window)||!('Notification' in window))return;
  let target;
  try{target=new URL(cfg.subscribeUrl,location.href);if(target.protocol!=='https:')return}
  catch(_){return}
  const action=document.createElement('button');
  action.type='button';action.className='secondary';action.id='zikaPush';
  action.textContent='Activer les notifications';
  bar.append(action);
  try{if(await reg.pushManager.getSubscription())action.textContent='Notifications activées'}catch(_){}
  action.onclick=async()=>{
   if(Notification.permission==='denied'){
    show('Notifications désactivées','<p>Vous avez bloqué les notifications. Autorisez-les dans les réglages du navigateur ou du téléphone.</p>');
    return;
   }
   action.disabled=true;
   try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw Error('Autorisation non accordée');
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription)subscription=await reg.pushManager.subscribe({
     userVisibleOnly:true,applicationServerKey:toApplicationServerKey(cfg.vapidPublicKey)
    });
    const response=await fetch(target.href,{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({subscription:subscription.toJSON()})
    });
    if(!response.ok)throw Error('Enregistrement indisponible');
    action.textContent='Notifications activées';
    show('Notifications activées','<p>Vous pourrez recevoir les actualités du Festival ZikaMansle. Vous pouvez retirer cette autorisation dans les réglages du téléphone.</p>');
   }catch(error){
    show('Notifications non activées','<p>Activation impossible pour le moment. Vérifiez votre connexion et réessayez ultérieurement.</p>');
   }finally{action.disabled=false}
  };
 }
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 const bar=document.createElement('section');bar.className='zika-app-bar';bar.setAttribute('aria-label','Application ZikaMansle');
 bar.innerHTML='<span>Le festival dans votre poche</span><button type="button" id="zikaInstall">Installer l’application</button><button type="button" class="secondary" id="zikaAppInfos">Infos pratiques</button>';
 document.body.prepend(bar);
 const status=document.createElement('div');status.id='zikaConnection';status.setAttribute('role','status');status.hidden=true;bar.after(status);
 const dialog=document.createElement('dialog');dialog.className='zika-app-dialog';dialog.setAttribute('aria-labelledby','zikaAppDialogTitle');document.body.append(dialog);
 const show=(title,body)=>{dialog.innerHTML='<h2 id="zikaAppDialogTitle"></h2><div></div><button type="button">Fermer</button>';dialog.querySelector('h2').textContent=title;dialog.querySelector('div').innerHTML=body;dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal()};
 const install=document.getElementById('zikaInstall');
 const sync=()=>{install.hidden=!!standalone();bar.querySelector('span').textContent=standalone()?'Festival ZikaMansle · Mon application':'Le festival dans votre poche'};sync();
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;sync()});
 window.addEventListener('appinstalled',()=>{installPrompt=null;install.hidden=true;bar.querySelector('span').textContent='Application installée'});
 install.onclick=async()=>{if(installPrompt){try{await installPrompt.prompt();await installPrompt.userChoice}finally{installPrompt=null}}else show('Installer ZikaMansle','<p>Retrouvez le programme et vos favoris depuis l’écran d’accueil de votre téléphone.</p><ul><li><strong>Android :</strong> ouvrez ce lien dans Chrome, puis le menu ⋮ → <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</li><li><strong>iPhone :</strong> ouvrez ce lien dans Safari, puis <strong>Partager → Sur l’écran d’accueil → Ajouter</strong>.</li></ul><p>L’installation est gratuite. Ouvrez d’abord le programme avec une connexion Internet.</p>')};
 document.getElementById('zikaAppInfos').onclick=()=>show('Préparer votre venue','<p><strong>24 &amp; 25 avril 2027</strong><br>Mansle-les-Fontaines · Charente</p><p>Retrouvez aussi les animations en amont dans <strong>Avant le festival</strong>.</p><p>Le programme précise les lieux, horaires et conditions d’accès de chaque rendez-vous. Utilisez <strong>Plan du festival</strong> pour vous repérer et les cœurs pour composer votre sélection.</p><p><a href="https://www.helloasso.com/associations/zikamansle/evenements/festival-zikamansle-2027-prevente" target="_blank" rel="noopener">Billetterie des concerts ↗</a></p><p><a href="https://www.zikamansle.fr/" target="_blank" rel="noopener">Site officiel et informations actualisées ↗</a><br><a href="tel:+33782364030">07 82 36 40 30</a></p><p>Les favoris sont enregistrés sur cet appareil. Hors connexion, le dernier programme consulté reste disponible ; la billetterie, les vidéos et certaines images nécessitent Internet.</p>');
 function connection(){const cached=window.zikaOfflineDate;status.hidden=navigator.onLine&&!cached;if(!status.hidden)status.textContent=cached?'Programme enregistré le '+new Date(cached).toLocaleString('fr-FR')+' · connexion indisponible. Les horaires peuvent avoir changé.':'Vous êtes hors connexion. Les services en ligne sont indisponibles.'}
 window.addEventListener('offline',connection);window.addEventListener('online',()=>{connection();if(window.zikaOfflineDate){status.hidden=false;status.replaceChildren(document.createTextNode('Connexion rétablie. '));const b=document.createElement('button');b.textContent='Actualiser le programme';b.onclick=()=>location.reload();status.append(b)}});window.addEventListener('zika-public-ready',connection);connection();
 if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{registration=reg;prepareZikaPush(reg).catch(()=>{});const update=()=>{if(!reg.waiting)return;let b=document.getElementById('zikaUpdate');if(b)return;b=document.createElement('button');b.id='zikaUpdate';b.textContent='Nouvelle version disponible';b.onclick=()=>{navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});reg.waiting?.postMessage('ACTIVATE_UPDATE')};bar.append(b)};update();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',update)})}).catch(()=>{bar.querySelector('span').textContent='Installation indisponible · programme accessible en ligne'});document.addEventListener('visibilitychange',()=>{if(!document.hidden)registration?.update().catch(()=>{})})}
})();
