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
console.log('ZikaTeam en ligne, API privée protégée, application publique conservée.');
