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
await check('/zikateam.js',200);
await check('/zikateam.css',200);
await check('/api/push/config',200);
console.log('ZikaTeam en ligne, API privée protégée, application publique conservée.');
