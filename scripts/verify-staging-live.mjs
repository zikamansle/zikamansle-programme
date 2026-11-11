// Public-only smoke test against the isolated Cloudflare staging Worker.
const BASE='https://zikamansle-app-staging.zikamansle.workers.dev';
async function check(path,init={}){
 const response=await fetch(BASE+path,{redirect:'manual',signal:AbortSignal.timeout(12000),...init});
 return {response,body:await response.text()};
}
function ensure(ok,message){if(!ok)throw Error(message)}
try{
 const home=await check('/');
 ensure(home.response.status===200,'Accueil de test indisponible');
 const health=await check('/healthz');
 ensure(health.response.status===200,'Service de test indisponible');
 const status=JSON.parse(health.body);
 ensure(status.app==='ZikaMansle'&&status.environment==='staging','Environnement incorrect');
 const cfg=await check('/api/push/config');
 ensure(cfg.response.status===200,'Clé push publique non disponible');
 const {publicKey}=JSON.parse(cfg.body);
 ensure(typeof publicKey==='string'&&Buffer.from(publicKey,'base64url').length===65,'Clé VAPID publique invalide');
 const news=await check('/api/push/news');
 ensure(news.response.status===200&&Array.isArray(JSON.parse(news.body).items),'Flux d’actualités indisponible');
 const limited=await check('/api/push/selftest',{method:'POST',headers:{Origin:BASE,'Content-Type':'application/json'},body:JSON.stringify({subscription:{}})});
 ensure(limited.response.status===400,'Tests push non disponibles, ou contrôle de souscription inattendu');
 const androidInvalid=await check('/api/native/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'invalid',platform:'android'})});
 ensure(androidInvalid.response.status===400,'Inscription native Android indisponible');
 const nativeStatus=await check('/administration/api/native-status');
 ensure([302,303,401,403].includes(nativeStatus.response.status),'Suivi Android accessible sans authentification');
 const admin=await check('/api/push/admin');
 ensure(admin.response.status===403,'Ancienne API privée non protégée');
 const protectedPage=await check('/administration/notifications');
 ensure([302,303,401,403].includes(protectedPage.response.status),'Page administrateur accessible sans authentification');
 console.log('Contrôle en ligne OK : application, actualités, notifications web et inscription native Android disponibles ; accès privé protégé.');
 console.log('Aucun appareil contacté et aucune notification envoyée.');
}catch(e){console.error('Contrôle de test échoué : '+e.message);process.exitCode=1;}
