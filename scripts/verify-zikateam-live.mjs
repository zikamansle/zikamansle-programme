// Validation publique du Worker de test : aucune connexion, aucun envoi OTP.
// Les tests de droits des personnes sont réalisés localement dans npm test.
const origin='https://zikamansle-app-staging.zikamansle.workers.dev';
const check=async(path,status,expect)=>{
 const response=await fetch(origin+path,{redirect:'manual',headers:{Accept:'text/html,application/json;q=0.9'}});
 const body=await response.text();
 if(response.status!==status ||(expect&&!body.includes(expect)))throw new Error(path+': réponse '+response.status+' inattendue (attendu '+status+')');
 console.log('OK',path,response.status);
 return {status:response.status,body};
};
await check('/healthz',200,'"environment":"staging"');
await check('/zikateam/api/auth/status',200,'"ready":true');
await check('/zikateam/api/me',403);
await check('/zikateam/api/manage',403);
await check('/zikateam',200,'ZikaTeam');
const liveUI=await check('/zikateam.js',200,'Code à 8 chiffres');
if(!liveUI.body.includes('pattern="[0-9]{6}|[0-9]{8}"'))throw new Error('Le formulaire publié refuse toujours 8 chiffres.');
if(liveUI.body.includes('code à six chiffres'))throw new Error('Ancien écran de connexion encore publié.');
if(!liveUI.body.includes('Créer ma fiche personnelle')||!liveUI.body.includes('teamMyProfileForm')||!liveUI.body.includes('Enregistrer ma fiche'))throw new Error('Le formulaire de fiche personnelle n est pas encore publié.');
console.log('OK champs de la fiche personnelle publiés.');
console.log('OK interface de saisie à 8 chiffres déployée.');
await check('/zikateam.css',200);
await check('/api/push/config',200);
const home=await check('/index.html',200,'ZikaMansle');
if(home.body.includes('id="installBanner"'))throw new Error('Bannière installer obsolète toujours publiée.');
const mobile=await check('/mobile.js',200,'function installPanel(){return \'\'}');
if((mobile.body.match(/menuLink\('\/zikateam','ZikaTeam'/g)||[]).length!==1)throw new Error('Entrée ZikaTeam absente ou dupliquée dans le menu.');
if(mobile.body.includes('Installer l’application<small>Sur Android ou iPhone'))throw new Error('Ancien bouton installer présent dans Plus.');
const push=await check('/notifications.js',200,'pushEnable');
if(!push.body.includes('pushDisable')||push.body.includes('pushToggle'))throw new Error('Boutons activer / désactiver manquants ou obsolètes.');
const sw=await check('/sw.js',200,'zika-mobile-v19-team-notification-controls');
console.log('OK interface de notifications, ZikaTeam unique et cache mis à jour.');
console.log('ZikaTeam en ligne, API privée protégée, application publique conservée.');
