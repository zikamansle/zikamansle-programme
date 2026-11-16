#!/usr/bin/env node
// Vérification en lecture seule du service réellement publié.
// Aucune connexion personnelle, inscription push, envoi de message ou écriture D1.
const urls=[
  'https://app.zikamansle.fr',
  'https://zikamansle-app-production.zikamansle.workers.dev'
];
let failures=0;
const report=[];
async function get(base,path){
 const response=await fetch(base+path,{
  headers:{'User-Agent':'ZikaMansle-public-readonly-check/2026-11-16'},
  cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(18000)
 });
 const body=await response.text();
 return {status:response.status,body,contentType:response.headers.get('content-type')||''};
}
async function check(label,handler){
 try{const detail=await handler();report.push({label,ok:true,detail});console.log('PASS',label,detail||'');}
 catch(e){failures++;report.push({label,ok:false,detail:String(e?.message||e)});console.error('FAIL',label,e?.message||e);}
}
function requireStatus(r,status,path){if(r.status!==status)throw Error(path+' : HTTP '+r.status+' (attendu '+status+')');}
for(const base of urls){
 const site=base.includes('workers.dev')?'Cloudflare production':'Domaine officiel';
 await check(site+' : santé du Worker',async()=>{
  const r=await get(base,'/healthz');requireStatus(r,200,'healthz');
  let json;try{json=JSON.parse(r.body)}catch{throw Error('Réponse de santé non JSON');}
  if(json.app!=='ZikaMansle'||json.environment!=='production')throw Error('Environnement inattendu');
  return 'production OK';
 });
 await check(site+' : Firebase Android prêt',async()=>{
  const r=await get(base,'/api/native/config');requireStatus(r,200,'native/config');
  const cfg=JSON.parse(r.body);
  if(cfg.enabled!==true||cfg.deliveryReady!==true)throw Error('Firebase non opérationnel ou désactivé');
  return 'Firebase activé et authentifié';
 });
 await check(site+' : fil des actualités',async()=>{
  const r=await get(base,'/api/push/news');requireStatus(r,200,'api/push/news');
  const news=JSON.parse(r.body);
  if(!Array.isArray(news.items))throw Error('Format des actualités inattendu');
  return 'JSON valide ('+news.items.length+' publications, contenu non consigné)';
 });
 await check(site+' : script notifications',async()=>{
  const r=await get(base,'/notifications.js');requireStatus(r,200,'notifications.js');
  if(!r.body.includes('ZikaPush'))throw Error('Script de notifications incomplet');
  return 'script disponible';
 });
 await check(site+' : actualités sans lien « En savoir plus » redondant',async()=>{
  const r=await get(base,'/notifications.js');requireStatus(r,200,'notifications.js');
  if(r.body.includes('En savoir plus'))throw Error('Un lien « En savoir plus » automatique subsiste dans le fil des notifications');
  return 'aucun lien redondant dans le script';
 });
 await check(site+' : service worker',async()=>{
  const r=await get(base,'/sw.js');requireStatus(r,200,'sw.js');
  if(!r.body.includes('push')||!r.body.includes('notificationclick'))throw Error('Réception/clic de notification absents');
  return 'gestion de réception et des clics présente';
 });
 await check(site+' : espace ZikaTeam',async()=>{
  const r=await get(base,'/zikateam');
  if(![200,301,302,303,307,308,401,403].includes(r.status))throw Error('Page indisponible : '+r.status);
  return 'route accessible, statut '+r.status;
 });
 await check(site+' : API de gestion privée protégée',async()=>{
  const r=await get(base,'/zikateam/api/manage');
  if(![301,302,303,307,308,401,403].includes(r.status))throw Error('Accès anonyme inattendu : '+r.status);
  return 'accès anonyme refusé, HTTP '+r.status;
 });
}
console.log('\nBilan : '+(report.length-failures)+'/'+report.length+' contrôles réussis.');
if(failures)process.exitCode=1;
